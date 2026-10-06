import { type ActionFunctionArgs } from '@remix-run/node';
import { acquireStream, dailyLimit, getUser, refundQuota, spendQuota, remainingQuota } from '~/lib/.server/auth';
import { resolveProvider } from '~/lib/.server/config';
import { MAX_RESPONSE_SEGMENTS, MAX_TOKENS } from '~/lib/.server/llm/constants';
import { CONTINUE_PROMPT } from '~/lib/.server/llm/prompts';
import { streamText, type Messages, type StreamingOptions } from '~/lib/.server/llm/stream-text';
import SwitchableStream from '~/lib/.server/llm/switchable-stream';

// Every request resends the whole conversation, so cap it: this is what keeps one team from burning the token budget.
const MAX_MESSAGES = 120;
const MAX_CHARS = 200_000;

const text = (message: string, status: number) => new Response(message, { status });

export async function action(args: ActionFunctionArgs) {
  return chatAction(args);
}

async function chatAction({ request }: ActionFunctionArgs) {
  const user = await getUser(request);

  if (!user) {
    return text('Sign in to keep building.', 401);
  }

  let body: { messages?: Messages; provider?: string };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return text('Bad request.', 400);
  }

  const messages = body.messages;

  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > MAX_MESSAGES ||
    messages.some((m) => !m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') ||
    messages[messages.length - 1].role !== 'user'
  ) {
    return text('This conversation is too long. Start a new project to keep building.', 413);
  }

  if (messages.reduce((n, m) => n + m.content.length, 0) > MAX_CHARS) {
    return text('This conversation is too long. Start a new project to keep building.', 413);
  }

  const provider = resolveProvider(body.provider);

  if (!provider) {
    return text('No AI model is configured yet. Ask an organizer to add one.', 503);
  }

  const release = acquireStream(user.id);

  if (release === 'user') {
    return text('Foldo is still working on your last message. Hold on a moment.', 429);
  }

  if (release === 'busy') {
    return text('Foldo is very busy right now. Try again in a few seconds.', 503);
  }

  const spent = spendQuota(user.id, provider.id);

  if (spent !== 'ok') {
    release();

    return text(
      spent === 'global'
        ? "The platform's daily AI budget is used up. It resets tomorrow."
        : `You've used all ${dailyLimit()} messages for today. Come back tomorrow!`,
      429,
    );
  }

  const stream = new SwitchableStream();

  try {
    const options: StreamingOptions = {
      toolChoice: 'none',
      onFinish: async ({ text: content, finishReason }) => {
        if (finishReason !== 'length') {
          return stream.close();
        }

        if (stream.switches >= MAX_RESPONSE_SEGMENTS) {
          throw Error('Cannot continue message: Maximum segments reached');
        }

        const switchesLeft = MAX_RESPONSE_SEGMENTS - stream.switches;

        console.log(`Reached max token limit (${MAX_TOKENS}): Continuing message (${switchesLeft} switches left)`);

        messages.push({ role: 'assistant', content });
        messages.push({ role: 'user', content: CONTINUE_PROMPT });

        const result = await streamText(messages, provider, options);

        return stream.switchSource(result.toAIStream());
      },
    };

    const result = await streamText(messages, provider, options);

    stream.switchSource(result.toAIStream());
    request.signal.addEventListener('abort', release);

    return new Response(stream.readable.pipeThrough(new TransformStream({ flush: release })), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Foldo-Remaining': String(remainingQuota(user.id)),
        'X-Foldo-Model': provider.label,
      },
    });
  } catch (error) {
    console.error(`[chat] ${provider.id} failed:`, (error as Error)?.message);

    release();
    refundQuota(user.id, provider.id);

    return text(`${provider.label} didn't respond. Your message wasn't counted, please try again.`, 502);
  }
}
