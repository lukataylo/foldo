import { type ActionFunctionArgs } from '@remix-run/node';
import {
  acquireStream,
  dailyLimit,
  getUser,
  moveProviderUsage,
  refundQuota,
  remainingQuota,
  spendQuota,
} from '~/lib/.server/auth';
import {
  defaultMaxTokens,
  fallbackFor,
  maxSegments,
  maxUserStreams,
  pauseState,
  resolveProvider,
  type Provider,
} from '~/lib/.server/config';
import { CONTINUE_PROMPT } from '~/lib/.server/llm/prompts';
import { streamText, type Messages, type StreamingOptions } from '~/lib/.server/llm/stream-text';
import SwitchableStream from '~/lib/.server/llm/switchable-stream';
import { recordProviderError, recordRequest } from '~/lib/.server/metrics';

// Every request resends the whole conversation, so cap it: this is what keeps one team from burning the token budget.
const MAX_MESSAGES = 120;
const MAX_CHARS = 200_000;
const FIRST_BYTE_TIMEOUT_MS = 25_000;

// Every message below is read by someone who may never have coded: calm, plain, and one next step.
const text = (message: string, status: number) => new Response(message, { status });

export async function action(args: ActionFunctionArgs) {
  return chatAction(args);
}

async function chatAction({ request }: ActionFunctionArgs) {
  const t0 = Date.now();
  const user = await getUser(request);

  if (!user) {
    return text('Please sign in again to keep building. Your work is saved.', 401);
  }

  const pause = pauseState();

  if (pause.paused) {
    return text(pause.message || 'The organizers have paused new builds for a moment. Hang tight and try again soon.', 503);
  }

  let body: { messages?: Messages; provider?: string };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return text('Something went wrong sending that. Please press send again.', 400);
  }

  const messages = body.messages;
  const tooLong = 'This chat has got very long. Click New project and paste your last prompt to keep going.';

  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > MAX_MESSAGES ||
    messages.some((m) => !m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') ||
    messages[messages.length - 1].role !== 'user' ||
    messages.reduce((n, m) => n + m.content.length, 0) > MAX_CHARS
  ) {
    return text(tooLong, 413);
  }

  const primary = resolveProvider(body.provider);

  if (!primary) {
    return text("Foldo's AI isn't switched on yet. Please tell an organizer.", 503);
  }

  const limit = maxUserStreams();
  const release = acquireStream(user.id, limit);

  if (release === 'user') {
    return text(
      limit > 1
        ? `Your team already has ${limit} builds running. Wait for one to finish, then press send again.`
        : 'Foldo is still working on your last message. Wait for it to finish, then try again.',
      429,
    );
  }

  if (release === 'busy') {
    return text('Lots of teams are building right now. Wait ten seconds, then press send again.', 503);
  }

  const spent = spendQuota(user.id, primary.id);

  if (spent !== 'ok') {
    release();

    return text(
      spent === 'global'
        ? "The event's AI budget for today is used up. Ask an organizer if you need more."
        : `You've used all ${dailyLimit()} messages for tonight. Ask an organizer if you need more.`,
      429,
    );
  }

  let served = primary;
  const stream = new SwitchableStream();

  // one shot against a provider; gives up if it hasn't started answering within the timeout
  const attempt = async (p: Provider) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new Error('timeout')), FIRST_BYTE_TIMEOUT_MS);

    try {
      return await streamText(messages, p, { ...options(p), abortSignal: ac.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  const options = (p: Provider): StreamingOptions => ({
    toolChoice: 'none',
    onFinish: async ({ text: content, finishReason }) => {
      if (finishReason !== 'length') {
        return stream.close();
      }

      if (stream.switches >= maxSegments()) {
        // we cannot extend any further: end the stream cleanly so the app keeps what it has
        return stream.close();
      }

      console.log(`Reached max token limit (${p.maxTokens ?? defaultMaxTokens()}): continuing (${stream.switches + 1}/${maxSegments()})`);

      messages.push({ role: 'assistant', content });
      messages.push({ role: 'user', content: CONTINUE_PROMPT });

      const result = await streamText(messages, p, options(p));

      return stream.switchSource(result.toAIStream());
    },
  });

  try {
    let result;

    try {
      result = await attempt(primary);
    } catch (error) {
      recordProviderError(primary.id);

      const fallback = fallbackFor(primary.id);

      if (!fallback) {
        throw error;
      }

      console.warn(`[chat] ${primary.id} failed (${(error as Error)?.message}); retrying on ${fallback.id}`);

      result = await attempt(fallback);
      served = fallback;
      moveProviderUsage(primary.id, fallback.id); // charged once, attributed to who actually answered
    }

    stream.switchSource(result.toAIStream());
    request.signal.addEventListener('abort', release);
    recordRequest({ user: user.id.slice(0, 8), primary: primary.id, served: served.id, ok: true, ms: Date.now() - t0, failover: served !== primary });

    return new Response(stream.readable.pipeThrough(new TransformStream({ flush: release })), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Foldo-Remaining': String(remainingQuota(user.id)),
        'X-Foldo-Model': served.label,
      },
    });
  } catch (error) {
    console.error(`[chat] ${served.id} failed:`, (error as Error)?.message);
    recordProviderError(served.id);
    recordRequest({ user: user.id.slice(0, 8), primary: primary.id, ok: false, ms: Date.now() - t0, failover: false });

    release();
    refundQuota(user.id, served.id);

    return text("The AI is having a moment. That message wasn't counted. Press send to try again.", 502);
  }
}
