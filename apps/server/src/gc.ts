import { sweepAbandonedSessions } from './repo/testSessions.ts';
import { deleteExpiredSessions } from './repo/sessions.ts';
import { deleteExpiredPasswordResetTokens } from './repo/passwordResets.ts';
import { deleteExpiredEmailVerifications } from './repo/emailVerifications.ts';
import { sweepStaleDispatches } from './repo/dispatches.ts';
import { hub } from './ws/hub.ts';
import { nowIso } from './util.ts';
import { jobLogger } from './log.ts';

const log = jobLogger('gc');

/**
 * Background sweep for test sessions a tester never finished.
 *
 * A tester can close the tab mid-session; the `sendBeacon` abandon endpoint
 * usually catches that, but beacons get dropped (sleep, network, crash). This
 * interval is the safety net: any session stuck in `started`/`recording` for
 * longer than `ABANDON_AFTER_MS` is marked `abandoned` so it stops counting
 * as "someone is testing now" and the creator's session list stays honest.
 *
 * The integrator calls `startSessionGc()` once from `index.ts` after the
 * server is up.
 */
const SWEEP_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes
const ABANDON_AFTER_MS = 30 * 60 * 1000; // sessions idle > 30 min
// Dispatches stuck non-terminal this long are dead: the MCP's own claude
// timeout is 5 min, so 15 min covers retries + queue flushes with margin.
const DISPATCH_TIMEOUT_MS = 15 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;

export function startSessionGc(): void {
  if (timer) return; // idempotent — never start two sweeps
  timer = setInterval(() => {
    void sweepAbandonedSessions(ABANDON_AFTER_MS)
      .then((swept) => {
        if (swept > 0) log.info({ swept }, 'marked stale test sessions abandoned');
      })
      .catch((err) => log.error({ err }, 'session sweep failed'));
    void deleteExpiredSessions()
      .then((removed) => {
        if (removed > 0) log.info({ removed }, 'removed expired auth sessions');
      })
      .catch((err) => log.error({ err }, 'expired-session sweep failed'));
    void deleteExpiredPasswordResetTokens()
      .then((removed) => {
        if (removed > 0) log.info({ removed }, 'removed expired password-reset tokens');
      })
      .catch((err) => log.error({ err }, 'pw-reset-token sweep failed'));
    void deleteExpiredEmailVerifications()
      .then((removed) => {
        if (removed > 0) log.info({ removed }, 'removed expired email-verification tokens');
      })
      .catch((err) => log.error({ err }, 'email-verification sweep failed'));
    void sweepStaleDispatches(
      new Date(Date.now() - DISPATCH_TIMEOUT_MS).toISOString(),
    )
      .then((stale) => {
        if (stale.length === 0) return;
        log.warn(
          { count: stale.length, ids: stale.map((d) => d.id) },
          'timed out stale dispatches',
        );
        for (const d of stale) {
          hub.broadcast(d.boardId, {
            type: 'dispatch.status',
            dispatchId: d.id,
            status: 'error',
            event: {
              ts: nowIso(),
              level: 'error',
              message: 'Dispatch timed out waiting for the agent.',
            },
          });
        }
      })
      .catch((err) => log.error({ err }, 'stale-dispatch sweep failed'));
  }, SWEEP_INTERVAL_MS);
  // Don't keep the process alive just for the sweep.
  timer.unref?.();
}

/** Stop the sweep — used in tests / graceful shutdown if ever needed. */
export function stopSessionGc(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
