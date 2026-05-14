import { sweepAbandonedSessions } from './repo/testSessions.ts';

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
      .then((n) => {
        if (n > 0) {
          // eslint-disable-next-line no-console
          console.log(`[gc] marked ${n} stale test session(s) abandoned`);
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[gc] session sweep failed:', err);
      });
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
