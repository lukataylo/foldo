import type { SubscriptionStatus } from '@foldo/protocol';
import { queryOne, exec } from '../db.ts';

export interface SubscriptionRow {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  quantity: number;
}

export async function getSubscriptionForUser(
  userId: string,
): Promise<SubscriptionRow | null> {
  return queryOne<SubscriptionRow>(`SELECT * FROM subscriptions WHERE user_id = $1`, [
    userId,
  ]);
}

export async function upsertSubscription(sub: {
  userId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  status: SubscriptionStatus;
  trialEndsAt?: string | null;
  quantity?: number;
}): Promise<void> {
  await exec(
    `INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status, trial_ends_at, quantity, updated_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, 1), now())
     ON CONFLICT (user_id) DO UPDATE SET
       stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, subscriptions.stripe_customer_id),
       stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, subscriptions.stripe_subscription_id),
       status = EXCLUDED.status,
       trial_ends_at = COALESCE(EXCLUDED.trial_ends_at, subscriptions.trial_ends_at),
       quantity = COALESCE($6, subscriptions.quantity),
       updated_at = now()`,
    [
      sub.userId,
      sub.stripeCustomerId ?? null,
      sub.stripeSubscriptionId ?? null,
      sub.status,
      sub.trialEndsAt ?? null,
      sub.quantity ?? null,
    ],
  );
}

export async function getUserIdForStripeSubscription(
  stripeSubscriptionId: string,
): Promise<string | null> {
  const row = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1`,
    [stripeSubscriptionId],
  );
  return row?.user_id ?? null;
}
