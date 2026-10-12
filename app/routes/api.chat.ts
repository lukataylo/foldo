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
  eventMode,
  fallbackFor,
  harness,
  maxSegments,
  maxUserStreams,
  pauseState,
  resolveProvider,
  type Provider,
} from '~/lib/.server/config';
import { CONTINUE_PROMPT, getSystemPrompt } from '~/lib/.server/llm/prompts';
import { TEMPLATE_REMINDER, templateGuide } from '~/lib/.server/templates';
import { streamText, type Messages, type StreamingOptions } from '~/lib/.server/llm/stream-text';
import { compactHistory, continuationRepairer, holdFinishParts, withIdleTimeout } from '~/lib/.server/llm/stream-repair';
import SwitchableStream from '~/lib/.server/llm/switchable-stream';
import { recordProviderError, recordRequest } from '~/lib/.server/metrics';

// Every request resends the whole conversation, so cap it: this is what keeps one team from burning the token budget.
const MAX_MESSAGES = 120;
const MAX_CHARS = 200_000;
// Reasoning models can think for a long time before the first visible word. With a reserve model configured we give up on
// the main one after this long and retry; the reserve (no further fallback) gets the longer allowance.
const FIRST_TOKEN_MS = Number(process.env.FIRST_TOKEN_TIMEOUT_MS || 40_000);
const LAST_RESORT_MS = 120_000;
// once a reply has started, this long without a single chunk means the provider has stalled
const IDLE_MS = Number(process.env.STREAM_IDLE_TIMEOUT_MS || 90_000);

// a provider call; a finish that arrives before the call is "live" waits in `parked`
type Attempt = { live: boolean; parked?: () => void };

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
  // event wording ("team", "organizer", "tonight") only while event mode is on
  const ev = eventMode();

  if (pause.paused) {
    return text(pause.message || `${ev ? 'The organizers have' : 'Foldo has'} paused new builds for a moment. Hang tight and try again soon.`, 503);
  }

  let body: { messages?: Messages; provider?: string; template?: string };

  try {
    body = ((await request.json()) ?? {}) as typeof body;
  } catch {
    return text('Something went wrong sending that. Please press send again.', 400);
  }

  // UI-only messages (the template intro with idea chips) never reach the model
  let messages = Array.isArray(body.messages) ? body.messages.filter((m) => !String((m as { id?: string })?.id ?? '').startsWith('tpl-')) : body.messages;
  const rewritten = new Set(
    (Array.isArray(messages) ? messages : [])
      .filter((m) => m?.role === 'assistant' && typeof m.content === 'string')
      .flatMap((m) => [...m.content.matchAll(/<boltAction[^>]*filePath="([^"]+)"/g)].map((match) => match[1].replace(/^\.?\//, ''))),
  );
  const guide = body.template ? templateGuide(body.template, rewritten) : undefined;
  const system = guide ? getSystemPrompt() + guide + TEMPLATE_REMINDER : undefined;
  const tooLong = 'This chat has got very long. Click New project and paste your last prompt to keep going.';

  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > MAX_MESSAGES ||
    messages.some((m) => !m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') ||
    messages[messages.length - 1].role !== 'user'
  ) {
    return text(tooLong, 413);
  }

  // old copies of rewritten files are dead weight: drop them before measuring
  messages = compactHistory(messages);

  if (messages.reduce((n, m) => n + m.content.length, 0) > MAX_CHARS) {
    return text(tooLong, 413);
  }

  const history = messages;

  const primary = resolveProvider(body.provider);

  if (!primary) {
    return text(ev ? "Foldo's AI isn't switched on yet. Please tell an organizer." : "Foldo's AI isn't switched on yet. Please try again later.", 503);
  }

  const limit = maxUserStreams();
  const release = acquireStream(user.id, limit);

  if (release === 'user') {
    return text(
      limit > 1
        ? `${ev ? 'Your team already has' : 'You already have'} ${limit} builds running. Wait for one to finish, then press send again.`
        : 'Foldo is still working on your last message. Wait for it to finish, then try again.',
      429,
    );
  }

  if (release === 'busy') {
    return text(`Lots of ${ev ? 'teams' : 'people'} are building right now. Wait ten seconds, then press send again.`, 503);
  }

  const spent = spendQuota(user.id, primary.id);

  if (spent !== 'ok') {
    release();

    if (spent === 'global') {
      return text(
        ev ? "The event's AI budget for today is used up. Ask an organizer if you need more." : "Foldo's AI budget for today is used up. Please try again tomorrow.",
        429,
      );
    }

    const out = ev ? 'for tonight. Ask an organizer if you need more.' : 'for today. They reset at midnight UTC.';

    // the header lets the studio swap the composer for the quota card straight away
    return new Response(`You've used all ${dailyLimit()} messages ${out}`, {
      status: 429,
      headers: { 'X-Foldo-Remaining': '0' },
    });
  }

  let served = primary;
  const stream = new SwitchableStream();

  // Stop in the browser (or a closed tab) ends the provider call too, instead of paying for a reply nobody reads
  const upstream = new AbortController();
  request.signal.addEventListener('abort', () => {
    upstream.abort();
    stream.close();
  });

  // the attempt that is answering; a short reply may have finished (and parked its finish) before we got here
  let started: Attempt | undefined;

  // what the team has received so far, so a continuation can be stitched onto it
  let transcript = '';

  // every segment but the last loses its finish parts, so the browser sees one message
  let segments = 0;
  let continued = 0;
  const segment = (source: ReadableStream<Uint8Array>) => {
    const index = segments++;
    return source.pipeThrough(holdFinishParts(() => continued > index));
  };

  // one shot against a provider; gives up if it hasn't started answering within the timeout
  const attempt = async (p: Provider, firstTokenMs: number): Promise<ReadableStream<Uint8Array>> => {
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ac.abort();
        reject(new Error(`no first token after ${Math.round(firstTokenMs / 1000)}s`));
      }, firstTokenMs);
    });

    try {
      const served: Attempt = { live: false };
      const result = await Promise.race([
        streamText(history, p, { ...options(p, served), abortSignal: AbortSignal.any([ac.signal, upstream.signal]) }),
        timeout,
      ]);
      const reader = result.toAIStream().getReader();
      // wait for the first text part ("0:..."); finish-only parts mean the model said nothing (e.g. a reasoning model that
      // spent its whole budget thinking), which must fail over or be refunded rather than reach the team as an empty reply
      const peeked: Uint8Array[] = [];
      const decoder = new TextDecoder();
      let seen = '';

      for (;;) {
        const part = await Promise.race([reader.read(), timeout]);

        if (part.done) {
          throw new Error('empty reply');
        }

        peeked.push(part.value);
        seen += decoder.decode(part.value, { stream: true });

        if (/(^|\n)0:/.test(seen)) {
          break;
        }
      }

      served.live = true;
      started = served;

      // hand back a stream that replays the chunks we peeked at, then the rest
      const replayed = new ReadableStream<Uint8Array>({
        start(controller) {
          peeked.forEach((chunk) => controller.enqueue(chunk));
        },
        async pull(controller) {
          const { done, value } = await reader.read();

          if (done) {
            controller.close();
          } else {
            controller.enqueue(value);
          }
        },
        cancel: (reason) => reader.cancel(reason),
      });

      return withIdleTimeout(replayed, IDLE_MS, IDLE_MS, () => idled(p));
    } finally {
      clearTimeout(timer);
      timeout.catch(() => undefined); // a late rejection after success must not become unhandled
    }
  };

  const idled = (p: Provider) => {
    console.warn(`[chat] ${p.id} went quiet for ${IDLE_MS / 1000}s mid-reply; ending it`);
    recordProviderError(p.id);
    upstream.abort();
    stream.close();
  };

  // `attempt.live` is false for an attempt we gave up on (timeout, empty reply): its end must not touch the conversation
  const options = (p: Provider, attempt: Attempt = { live: true }, raw?: { head: string; fixed: string }): StreamingOptions => ({
    toolChoice: 'none',
    ...(system && { system }),
    onFinish: (result) => {
      if (!attempt.live) {
        // not ours yet (still peeking) or never (gave up on it): park it; it runs only if the attempt goes live
        attempt.parked = () => void finished(p, raw, result);
        return undefined;
      }

      return finished(p, raw, result);
    },
  });

  const finished = async (
    p: Provider,
    raw: { head: string; fixed: string } | undefined,
    { text: content, finishReason }: { text: string; finishReason: string },
  ) => {
    // a continuation's first characters may have been repaired before the team saw them
    transcript += raw && content.startsWith(raw.head) ? raw.fixed + content.slice(raw.head.length) : content;

    if (upstream.signal.aborted) {
      return stream.close();
    }

    /*
     * Not awaited: this runs inside the provider stream's flush, and finish/switch wait for that stream to drain, so
     * awaiting here would deadlock. They end or extend the response once the last chunks are through.
     */
    if (finishReason !== 'length' || stream.switches >= maxSegments()) {
      // at the segment cap we cannot extend any further: end cleanly so the app keeps what it has
      void stream.finish();
      return undefined;
    }

    console.log(`Reached max token limit (${p.maxTokens ?? defaultMaxTokens()}): continuing (${stream.switches + 1}/${maxSegments()})`);

    continued++;
    history.push({ role: 'assistant', content });
    history.push({ role: 'user', content: CONTINUE_PROMPT });

    const head = { head: '', fixed: '' };
    const result = await streamText(history, p, { ...options(p, undefined, head), abortSignal: upstream.signal });
    const repaired = result.toAIStream().pipeThrough(
      continuationRepairer(transcript, (rawHead, fixed) => Object.assign(head, { head: rawHead, fixed })),
    );

    // a reasoning model may think for a while before continuing, so the first chunk gets the long allowance
    void stream.switchSource(segment(withIdleTimeout(repaired, LAST_RESORT_MS, IDLE_MS, () => idled(p))));

    return undefined;
  };

  try {
    let aiStream: ReadableStream<Uint8Array>;
    const fallback = fallbackFor(primary.id);

    try {
      // a high-reasoning harness thinks before its first word: don't fail it over for being thoughtful
      const patience = primary.model === harness().main ? Math.max(FIRST_TOKEN_MS, harness().firstTokenMs) : FIRST_TOKEN_MS;
      aiStream = await attempt(primary, fallback ? patience : Math.max(patience, LAST_RESORT_MS));
    } catch (error) {
      // the team pressed Stop before the first word: not the provider's fault, and nothing to fail over to
      if (upstream.signal.aborted) {
        throw error;
      }

      recordProviderError(primary.id);

      if (!fallback) {
        throw error;
      }

      console.warn(`[chat] ${primary.id} failed (${(error as Error)?.message}); retrying on ${fallback.id}`);

      aiStream = await attempt(fallback, LAST_RESORT_MS);
      served = fallback;
      moveProviderUsage(primary.id, fallback.id); // charged once, attributed to who actually answered
    }

    stream.switchSource(segment(aiStream));
    started?.parked?.(); // after the first segment is queued, so a continuation lands behind it
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
    const stopped = upstream.signal.aborted;

    if (!stopped) {
      console.error(`[chat] ${served.id} failed:`, (error as Error)?.message);
      recordProviderError(served.id);
    }

    recordRequest({ user: user.id.slice(0, 8), primary: primary.id, ok: false, ms: Date.now() - t0, failover: false });

    release();
    refundQuota(user.id, served.id);

    return text("The AI is having a moment. That message wasn't counted. Press send to try again.", 502);
  }
}
