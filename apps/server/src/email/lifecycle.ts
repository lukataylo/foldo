// Lifecycle email sweep — drives the onboarding sequence in templates.ts.
//
// An hourly background job (same pattern as gc.ts) finds `kind = 'human'`
// users with an email whose `created_at` has crossed each stage's day
// threshold, checks the stage's condition (funnel events / subscription
// status), dedups against the `lifecycle_emails` table, sends via the
// configured EmailSender, and records the send. Every stage has an upper
// bound on account age too, so deploying this feature doesn't blast the
// whole historical user base with day-2 emails.
//
// The `welcome` stage is NOT swept — it's sent inline at signup via
// `sendWelcomeEmail()` (called from routes/auth.ts) so it lands immediately.
//
// Errors are logged and skipped, never thrown: a bad address or a transient
// provider outage must not take the sweep (or the server) down. Because we
// record the row only AFTER a successful send, a failed send is simply
// retried on the next sweep.
//
// Full sequence copy + operating notes: docs/EMAILS.md.

import { query, exec } from '../db.ts';
import { getEmailSender } from './index.ts';
import { jobLogger } from '../log.ts';
import {
  welcomeEmail,
  day2NoWalkthroughEmail,
  day5WalkthroughMadeEmail,
  day11TrialEndingEmail,
  day14TrialEndedEmail,
  type LifecycleEmailContent,
} from './templates.ts';

const log = jobLogger('lifecycle-emails');

const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly

function webOrigin(): string {
  return process.env.FOLDO_PUBLIC_WEB_ORIGIN ?? 'http://localhost:5173';
}

interface CandidateRow {
  id: string;
  name: string;
  email: string;
}

interface LifecycleStage {
  /** Dedup key stored in lifecycle_emails.kind. */
  kind: string;
  /** EmailMessage.kind — the log/outbox tag (kebab-cased like other kinds). */
  tag: string;
  /** Send once created_at is at least this many days old… */
  minDays: number;
  /** …but never if it's older than this (launch-safety window). */
  maxDays: number;
  /**
   * Extra WHERE fragment evaluated against `u` (the users row). Static SQL
   * only — no user input is ever interpolated here.
   */
  conditionSql: string;
  template: (name: string, origin: string) => LifecycleEmailContent;
}

const STAGES: LifecycleStage[] = [
  {
    kind: 'day2_no_walkthrough',
    tag: 'lifecycle-day2-no-walkthrough',
    minDays: 2,
    maxDays: 4,
    conditionSql: `NOT EXISTS (
      SELECT 1 FROM analytics_events e
       WHERE e.user_id = u.id AND e.name = 'first_walkthrough'
    )`,
    template: day2NoWalkthroughEmail,
  },
  {
    kind: 'day5_walkthrough_made',
    tag: 'lifecycle-day5-walkthrough-made',
    minDays: 5,
    maxDays: 8,
    conditionSql: `EXISTS (
      SELECT 1 FROM analytics_events e
       WHERE e.user_id = u.id AND e.name = 'first_walkthrough'
    )`,
    template: day5WalkthroughMadeEmail,
  },
  {
    kind: 'day11_trial_ending',
    tag: 'lifecycle-day11-trial-ending',
    minDays: 11,
    // Must land before the day-14 trial end — "ends in 3 days" is stale
    // after that, so the window closes at day 13.
    maxDays: 13,
    conditionSql: `EXISTS (
      SELECT 1 FROM subscriptions s
       WHERE s.user_id = u.id AND s.status = 'trialing'
    )`,
    template: day11TrialEndingEmail,
  },
  {
    kind: 'day14_trial_ended',
    tag: 'lifecycle-day14-trial-ended',
    minDays: 14,
    maxDays: 17,
    // Lapsed without conversion: no subscription row at all, or a row whose
    // status is no longer trialing and never became active.
    conditionSql: `NOT EXISTS (
      SELECT 1 FROM subscriptions s
       WHERE s.user_id = u.id AND s.status IN ('trialing', 'active')
    )`,
    template: day14TrialEndedEmail,
  },
];

async function candidatesFor(stage: LifecycleStage): Promise<CandidateRow[]> {
  // users.created_at is a TEXT ISO-8601 timestamp — cast for comparison.
  return query<CandidateRow>(
    `SELECT u.id, u.name, u.email
       FROM users u
      WHERE u.kind = 'human'
        AND u.email IS NOT NULL
        AND u.created_at::timestamptz <= now() - make_interval(days => $1)
        AND u.created_at::timestamptz >  now() - make_interval(days => $2)
        AND NOT EXISTS (
          SELECT 1 FROM lifecycle_emails le
           WHERE le.user_id = u.id AND le.kind = $3
        )
        AND ${stage.conditionSql}`,
    [stage.minDays, stage.maxDays, stage.kind],
  );
}

async function recordSent(userId: string, kind: string): Promise<void> {
  await exec(
    `INSERT INTO lifecycle_emails (user_id, kind) VALUES ($1, $2)
     ON CONFLICT (user_id, kind) DO NOTHING`,
    [userId, kind],
  );
}

/**
 * One pass over all stages. Exported so tests (and ops, in a pinch) can run
 * it directly without waiting for the interval. Returns how many emails were
 * sent. Never throws — every failure is logged and skipped.
 */
export async function runLifecycleSweep(): Promise<number> {
  const origin = webOrigin();
  let sent = 0;
  for (const stage of STAGES) {
    let rows: CandidateRow[];
    try {
      rows = await candidatesFor(stage);
    } catch (err) {
      log.error({ err, kind: stage.kind }, 'lifecycle candidate query failed');
      continue;
    }
    for (const u of rows) {
      try {
        const { subject, text } = stage.template(u.name, origin);
        await getEmailSender().send({
          to: u.email,
          subject,
          text,
          kind: stage.tag,
        });
        await recordSent(u.id, stage.kind);
        sent += 1;
        log.info({ userId: u.id, kind: stage.kind }, 'lifecycle email sent');
      } catch (err) {
        // Send OR record failed. If the send succeeded but the record write
        // failed we might double-send once on the next sweep — acceptable;
        // the reverse (record-then-send) would silently drop emails instead.
        log.error(
          { err, userId: u.id, kind: stage.kind },
          'lifecycle email failed; will retry next sweep',
        );
      }
    }
  }
  if (sent > 0) log.info({ sent }, 'lifecycle sweep complete');
  return sent;
}

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the hourly sweep. Called once from index.ts next to
 * `startSessionGc()`. Also runs one sweep right away so a frequently
 * restarting process still delivers on time — the dedup table makes the
 * eager pass safe.
 */
export function startLifecycleEmails(): void {
  if (timer) return; // idempotent — never start two sweeps
  void runLifecycleSweep().catch((err) =>
    log.error({ err }, 'initial lifecycle sweep failed'),
  );
  timer = setInterval(() => {
    void runLifecycleSweep().catch((err) =>
      log.error({ err }, 'lifecycle sweep failed'),
    );
  }, SWEEP_INTERVAL_MS);
  // Don't keep the process alive just for the sweep.
  timer.unref?.();
}

/** Stop the sweep — used in tests / graceful shutdown if ever needed. */
export function stopLifecycleEmails(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * The `welcome` stage, sent inline at signup (routes/auth.ts) rather than by
 * the sweep so it lands immediately. Non-blocking-friendly: handles its own
 * errors and records the lifecycle_emails row on success, so a transient
 * send failure never breaks the signup response.
 */
export async function sendWelcomeEmail(
  user: { id: string; name: string },
  email: string,
): Promise<void> {
  try {
    const { subject, text } = welcomeEmail(user.name, webOrigin());
    await getEmailSender().send({
      to: email,
      subject,
      text,
      kind: 'lifecycle-welcome',
    });
    await recordSent(user.id, 'welcome');
    log.info({ userId: user.id }, 'welcome email sent');
  } catch (err) {
    log.error({ err, userId: user.id }, 'welcome email send failed');
  }
}
