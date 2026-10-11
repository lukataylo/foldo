import type { Messages } from './stream-text';

/*
 * Helpers that keep long builds intact: continuing a reply cut off at the token limit, resending history without every
 * old copy of every file, and giving up on a provider that stops sending mid-reply.
 */

const lastIndex = (text: string, needle: string) => text.lastIndexOf(needle);

/** where the reply stopped: inside an artifact, and inside an action (whose body is file content or a command) */
export function tagState(text: string) {
  const insideArtifact = lastIndex(text, '<boltArtifact') > lastIndex(text, '</boltArtifact>');
  const insideAction = insideArtifact && lastIndex(text, '<boltAction') > lastIndex(text, '</boltAction>');

  return { insideArtifact, insideAction };
}

const LEADING_FENCE = /^\s*```[\w-]*[^\S\n]*\n(?=\s*<bolt)/;
const ARTIFACT_OPEN = /^\s*<boltArtifact\b[^>]*>/;
const ACTION_OPEN = /^\s*<boltAction\b[^>]*>/;
const MIN_OVERLAP = 20;
const MAX_OVERLAP = 2000;

/**
 * Fix the start of a continuation so it reads as one reply with what came before. Non-Claude models often restart with
 * the artifact or action tag, or repeat the last lines, despite being told not to; inside a file action that text was
 * written straight into the file.
 */
export function repairContinuation(before: string, head: string) {
  const { insideArtifact, insideAction } = tagState(before);

  if (!insideArtifact) {
    return head;
  }

  let next = head.replace(LEADING_FENCE, '');
  const restartedArtifact = ARTIFACT_OPEN.exec(next);

  if (restartedArtifact) {
    next = next.slice(restartedArtifact[0].length);
  }

  if (insideAction) {
    if (ACTION_OPEN.test(next)) {
      // it started the action over: close the partial one so the complete copy that follows replaces it
      return `</boltAction>${next.replace(/^\s*/, '\n')}`;
    }

    if (restartedArtifact) {
      // dropped tags but no new action tag: the text continues the open action, so keep its exact whitespace
      next = next.replace(/^\s*\n/, '');
    }

    // it repeated the tail of what it already wrote: keep only what's new
    for (let k = Math.min(MAX_OVERLAP, before.length, next.length); k >= MIN_OVERLAP; k--) {
      if (before.endsWith(next.slice(0, k))) {
        return next.slice(k);
      }
    }

    return next;
  }

  return restartedArtifact ? next.replace(/^\s*/, '\n') : next;
}

const HEAD_CHARS = 400;

/**
 * Applies repairContinuation to an AI SDK data stream (`0:"text"\n` lines): holds back the first few hundred characters
 * of text, repairs them, then passes everything through untouched. `onHead` reports the raw and repaired head.
 */
export function continuationRepairer(before: string, onHead?: (raw: string, fixed: string) => void) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let pending = '';
  let head = '';
  let held: string[] = [];
  let done = false;

  const release = (controller: TransformStreamDefaultController<Uint8Array>) => {
    done = true;

    const fixed = repairContinuation(before, head);
    onHead?.(head, fixed);

    const out = (fixed ? `0:${JSON.stringify(fixed)}\n` : '') + held.join('');
    held = [];

    if (out) {
      controller.enqueue(encoder.encode(out));
    }
  };

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (done) {
        controller.enqueue(chunk);
        return;
      }

      pending += decoder.decode(chunk, { stream: true });

      let newline = pending.indexOf('\n');

      while (newline !== -1 && !done) {
        const line = pending.slice(0, newline + 1);
        pending = pending.slice(newline + 1);

        if (line.startsWith('0:')) {
          head += JSON.parse(line.slice(2)) as string;
        } else {
          held.push(line);
        }

        if (head.length >= HEAD_CHARS || (held.length > 0 && !line.startsWith('0:'))) {
          release(controller);
        }

        newline = pending.indexOf('\n');
      }

      if (done && pending) {
        controller.enqueue(encoder.encode(pending));
        pending = '';
      }
    },
    flush(controller) {
      if (!done) {
        release(controller);
      }

      if (pending) {
        controller.enqueue(encoder.encode(pending));
      }
    },
  });
}

/**
 * Each segment ends with finish parts (`e:`, `d:`). The browser takes `d:` as the end of the message, so a continuation
 * after it became a second chat message and the build split in two. Hold them until the segment ends, then drop them
 * if another segment follows.
 */
export function holdFinishParts(continues: () => boolean) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let pending = '';
  let held = '';

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true });

      const end = pending.lastIndexOf('\n') + 1;
      let out = '';

      for (const line of pending.slice(0, end).split(/(?<=\n)/)) {
        if (/^[ed]:/.test(line)) {
          held += line;
        } else {
          out += line;
        }
      }

      pending = pending.slice(end);

      if (out) {
        controller.enqueue(encoder.encode(out));
      }
    },
    flush(controller) {
      const rest = pending + (continues() ? '' : held);

      if (rest) {
        controller.enqueue(encoder.encode(rest));
      }
    },
  });
}

/**
 * Ends a stream cleanly if the provider goes quiet: the team keeps what arrived (and gets the "continue" nudge) instead
 * of a spinner that never stops, and the stream slot is freed.
 */
export function withIdleTimeout(source: ReadableStream<Uint8Array>, firstMs: number, idleMs: number, onIdle?: () => void) {
  const reader = source.getReader();
  let first = true;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const idle = new Promise<'idle'>((resolve) => (timer = setTimeout(() => resolve('idle'), first ? firstMs : idleMs)));

      try {
        const result = await Promise.race([reader.read(), idle]);

        if (result === 'idle') {
          controller.close();
          reader.cancel('idle').catch(() => undefined);
          onIdle?.();

          return;
        }

        if (result.done) {
          controller.close();
        } else {
          first = false;
          controller.enqueue(result.value);
        }
      } finally {
        clearTimeout(timer);
      }
    },
    cancel: (reason) => reader.cancel(reason),
  });
}

const FILE_ACTION = /<boltAction\b[^>]*\bfilePath=(["'])([^"']+)\1[^>]*>[\s\S]*?<\/boltAction>/g;
const normalise = (path: string) => path.replace(/^\.?\//, '');

/**
 * Every reply that rewrites a file resends its whole body on every later request, so long template chats hit the size
 * cap and cost more each turn. Only the latest copy of each file matters: older copies become a one-line note (outside
 * any action tag, so the model doesn't learn to write placeholder files).
 */
export function compactHistory(messages: Messages): Messages {
  const latest = new Map<string, string>();

  messages.forEach((message, index) => {
    if (message.role === 'assistant') {
      for (const match of message.content.matchAll(FILE_ACTION)) {
        latest.set(normalise(match[2]), `${index}:${match.index}`);
      }
    }
  });

  return messages.map((message, index) => {
    if (message.role !== 'assistant') {
      return message;
    }

    const content = message.content.replace(FILE_ACTION, (action, _quote, path: string, offset: number) =>
      latest.get(normalise(path)) === `${index}:${offset}` ? action : `(wrote ${path}; a later reply replaced it)`,
    );

    return content === message.content ? message : { ...message, content };
  });
}
