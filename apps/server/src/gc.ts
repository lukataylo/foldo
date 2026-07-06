import { deleteExpiredSessions } from './repo/sessions.ts';
import { deleteExpiredPasswordResetTokens } from './repo/passwordResets.ts';
import { deleteExpiredEmailVerifications } from './repo/emailVerifications.ts';
import { jobLogger } from './log.ts';

const log = jobLogger('gc');

/**
 * Background sweep for expired auth artefacts: sessions past their sliding
 * expiry, password-reset tokens past their TTL, and stale email-verification
 * tokens. Keeps the auth tables honest without a request having to pay the
 * cleanup cost inline.
 *
 * The integrator calls `startSessionGc()` once from `index.ts` after the
 * server is up.
 */
const SWEEP_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes

let timer: ReturnType<typeof setInterval> | null = null;

export function startSessionGc(): void {
  if (timer) return; // idempotent — never start two sweeps
  timer = setInterval(() => {
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
