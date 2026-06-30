// Retry/DLQ wrapper around the dispatch executors (`simulateDispatch` and
// `routeDispatchToMcp`). The dispatch routes used to do `void
// simulateDispatch(...)` — fire-and-forget. If the inner promise rejected
// (transient network error, killed MCP socket, etc.) the dispatch row just
// stayed in `queued` forever and nobody got told. This module wraps the call
// so a failure either retries with exponential backoff OR — once all retries
// are exhausted — flips the row to `error` with an `error_message` set, fans
// out a `dispatch.status` broadcast, and bumps a Prometheus counter so the
// failure is visible in metrics.
//
// We intentionally don't introduce a new `dispatch_dlq` table: the
// `dispatches` row IS the durable record (status + error_message + events),
// and queries over "DLQ" just become `WHERE status = 'error'`. Simpler than a
// second table for the same data.

import type { Dispatch } from '@foldo/protocol';
import { jobLogger } from '../log.ts';
import { jobOutcomes } from '../metrics.ts';
import { failDispatch } from '../repo/dispatches.ts';
import { hub } from '../ws/hub.ts';
import { nowIso } from '../util.ts';

const log = jobLogger('dispatch-retry');

/** Sleep that's safe to `await` (`setTimeout` won't keep the process alive). */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    // Don't pin the event loop open just because a retry is sleeping — graceful
    // shutdown should still be able to finish.
    if (typeof t.unref === 'function') t.unref();
  });
}

/**
 * Default backoff schedule: 1s, 4s, 16s. Total worst-case latency is 21s
 * before the dispatch is marked failed. Tuned for a small set of transient
 * failure modes (network blip, MCP socket flap) — anything that takes longer
 * than 16s to recover is a real outage, not transient, and we should DLQ.
 */
const DEFAULT_BACKOFF_MS = [1_000, 4_000, 16_000] as const;

export interface RunDispatchOptions {
  /** Override the backoff schedule. Length = total attempts - 1. */
  backoffMs?: readonly number[];
  /**
   * Classify whether an error is worth retrying. By default everything
   * thrown by the executor is retried (the executor itself owns its
   * is-this-a-permanent-failure decisions and either resolves or rejects
   * accordingly). Pass `() => false` to disable retries entirely.
   */
  isTransient?: (err: unknown) => boolean;
  /**
   * Hook for tests to swap out sleep. Defaults to the real timer-based one.
   */
  sleepFn?: (ms: number) => Promise<void>;
}

/**
 * Run `runner(dispatch)` and retry on rejection with exponential backoff.
 * On final failure marks the dispatch as `error` (writing `error_message`)
 * and broadcasts a `dispatch.status` so connected UIs surface the failure.
 *
 * Resolves once the dispatch reaches a terminal state (either the runner
 * resolved successfully, or every retry was exhausted and the row was
 * flipped to `error`). Never rejects — the caller is the bg promise and
 * shouldn't crash the event loop on its own failure.
 */
export async function runDispatchWithRetry(
  dispatch: Dispatch,
  runner: (d: Dispatch) => Promise<void>,
  opts: RunDispatchOptions = {},
): Promise<void> {
  const backoff = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  const isTransient = opts.isTransient ?? (() => true);
  const sleepFn = opts.sleepFn ?? sleep;
  const maxAttempts = backoff.length + 1;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await runner(dispatch);
      jobOutcomes.inc({ job: 'dispatch', outcome: 'ok' });
      return;
    } catch (err) {
      lastErr = err;
      log.warn(
        { dispatchId: dispatch.id, boardId: dispatch.boardId, attempt, err },
        'dispatch runner threw — will retry if attempts remain',
      );
      if (!isTransient(err) || attempt === maxAttempts) break;
      await sleepFn(backoff[attempt - 1] ?? 0);
    }
  }

  // Exhausted retries — DLQ the dispatch.
  const message =
    lastErr instanceof Error
      ? lastErr.message
      : typeof lastErr === 'string'
        ? lastErr
        : 'dispatch failed after retries';
  try {
    const failed = await failDispatch(dispatch.id, `retry exhausted: ${message}`);
    if (failed) {
      hub.broadcast(failed.boardId, {
        type: 'dispatch.status',
        dispatchId: failed.id,
        status: 'error',
        event: {
          ts: nowIso(),
          level: 'error',
          message: `Dispatch failed after ${maxAttempts} attempts: ${message}`,
        },
      });
    }
  } catch (writeErr) {
    // If we couldn't even WRITE the failure to the DB, our only recourse is
    // to log loudly. The Prometheus counter still captures the failure.
    log.error(
      { dispatchId: dispatch.id, writeErr, originalErr: lastErr },
      'failed to mark dispatch as error after retries — data may be stale',
    );
  }
  jobOutcomes.inc({ job: 'dispatch', outcome: 'failed' });
}
