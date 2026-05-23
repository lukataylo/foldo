import { sweepAbandonedSessions } from './repo/testSessions.ts';
import { deleteExpiredSessions } from './repo/sessions.ts';
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
