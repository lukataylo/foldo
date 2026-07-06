// Stripe billing: £79/month per product, 14-day trial, hosted Checkout.
//
// Deliberately SDK-free — two fetch calls and an HMAC verify are the whole
// integration, and it keeps the supply-chain surface flat. Configure:
//   STRIPE_SECRET_KEY       sk_live_… / sk_test_…
//   STRIPE_PRICE_ID         price_… for the £79/mo per-product price
//   STRIPE_WEBHOOK_SECRET   whsec_… for POST /api/webhooks/stripe
// Without STRIPE_SECRET_KEY the checkout endpoint answers 503 with a clear
// message (dev environments), and billing status reports 'none'.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type {
  BillingStatusResponse,
  CreateCheckoutSessionRequest,
  CreateCheckoutSessionResponse,
  FunnelSnapshotResponse,
  SubscriptionStatus,
} from '@foldo/protocol';
import { requireUser } from '../auth.ts';
import { getSubscriptionForUser, upsertSubscription } from '../repo/billing.ts';
import { funnelSnapshot, trackFunnelEvent } from '../repo/analytics.ts';

const TRIAL_DAYS = 14;

function webOrigin(): string {
  return (
    (process.env.FOLDO_WEB_ORIGIN ?? '').split(',')[0]?.trim() ||
    'http://localhost:5173'
  );
}

/** Verify Stripe's `Stripe-Signature: t=…,v1=…` header (HMAC-SHA256 of
 * `${t}.${rawBody}` with the webhook secret). Dev bypass when unset. */
function verifyStripeSignature(
  header: string | undefined,
  rawBody: string,
  secret: string | undefined,
): boolean {
  if (!secret) return true;
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => p.split('=', 2) as [string, string]),
  );
  const t = parts['t'];
  const v1 = parts['v1'];
  if (!t || !v1) return false;
  // Reject stale timestamps (5 min tolerance) to blunt replay.
  const ageS = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(ageS) || ageS > 300) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(v1, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

interface StripeEvent {
  type: string;
  data: {
    object: {
      id: string;
      object: string;
      client_reference_id?: string | null;
      customer?: string | null;
      subscription?: string | null;
      status?: string;
      trial_end?: number | null;
      quantity?: number;
      metadata?: Record<string, string>;
      items?: { data?: Array<{ quantity?: number }> };
    };
  };
}

function mapStripeStatus(s: string | undefined): SubscriptionStatus {
  switch (s) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return 'none';
  }
}

export async function registerBillingRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateCheckoutSessionRequest }>(
    '/api/billing/checkout',
    async (req, reply) => {
      const user = requireUser(req);
      const secretKey = process.env.STRIPE_SECRET_KEY;
      const priceId = process.env.STRIPE_PRICE_ID;
      if (!secretKey || !priceId) {
        return reply.code(503).send({
          error:
            'Billing is not configured on this deployment (set STRIPE_SECRET_KEY and STRIPE_PRICE_ID).',
          code: 'BILLING_UNCONFIGURED',
        });
      }
      const origin = webOrigin();
      const params = new URLSearchParams({
        mode: 'subscription',
        client_reference_id: user.id,
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        'subscription_data[trial_period_days]': String(TRIAL_DAYS),
        'subscription_data[metadata][foldo_user_id]': user.id,
        success_url:
          req.body?.successUrl ?? `${origin}/home?billing=success`,
        cancel_url: req.body?.cancelUrl ?? `${origin}/pricing?billing=cancelled`,
        allow_promotion_codes: 'true',
      });
      if (user.email) params.set('customer_email', user.email);

      const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secretKey}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        req.log.error({ detail }, 'stripe checkout session failed');
        return reply
          .code(502)
          .send({ error: 'Stripe checkout could not be created', code: 'STRIPE_ERROR' });
      }
      const session = (await res.json()) as { url?: string };
      if (!session.url) {
        return reply
          .code(502)
          .send({ error: 'Stripe returned no checkout URL', code: 'STRIPE_ERROR' });
      }
      const out: CreateCheckoutSessionResponse = { url: session.url };
      return reply.send(out);
    },
  );

  app.get('/api/billing/status', async (req, reply) => {
    const user = requireUser(req);
    const sub = await getSubscriptionForUser(user.id);
    const res: BillingStatusResponse = {
      status: sub?.status ?? 'none',
      trialEndsAt: sub?.trial_ends_at ?? undefined,
      quantity: sub?.quantity ?? undefined,
    };
    return reply.send(res);
  });

  // Funnel snapshot — good enough for the first ten customers; move behind a
  // proper admin role before the first hundred.
  app.get('/api/funnel', async (req, reply) => {
    requireUser(req);
    const counts = await funnelSnapshot();
    return reply.send({ counts } as FunnelSnapshotResponse);
  });

  // Stripe webhook: raw-body scope for signature verification, mirroring the
  // GitHub webhook's pattern.
  await app.register(async (scope) => {
    const defaultJsonParser = scope.getDefaultJsonParser('error', 'error');
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      (req, body, done) => {
        (req as unknown as { rawBody?: string }).rawBody = body as string;
        defaultJsonParser(req, body as string, done);
      },
    );

    scope.post('/api/webhooks/stripe', async (req: FastifyRequest, reply) => {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      const raw = (req as unknown as { rawBody?: string }).rawBody ?? '';
      const sigHeader = req.headers['stripe-signature'];
      const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
      if (!verifyStripeSignature(sig, raw, secret)) {
        return reply
          .code(401)
          .send({ error: 'Invalid webhook signature', code: 'UNAUTHORIZED' });
      }
      const event = req.body as StripeEvent;
      if (!event?.type || !event?.data?.object) {
        return reply.code(400).send({ error: 'Invalid event', code: 'BAD_REQUEST' });
      }
      const obj = event.data.object;

      switch (event.type) {
        case 'checkout.session.completed': {
          const userId = obj.client_reference_id;
          if (userId) {
            await upsertSubscription({
              userId,
              stripeCustomerId: obj.customer ?? undefined,
              stripeSubscriptionId: obj.subscription ?? undefined,
              status: 'trialing',
              trialEndsAt: new Date(
                Date.now() + TRIAL_DAYS * 24 * 3600 * 1000,
              ).toISOString(),
            });
            await trackFunnelEvent('conversion', {
              userId,
              metadata: { via: 'checkout.session.completed' },
            }).catch(() => {});
          }
          break;
        }
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const userId = obj.metadata?.foldo_user_id;
          if (userId) {
            await upsertSubscription({
              userId,
              stripeCustomerId: obj.customer ?? undefined,
              stripeSubscriptionId: obj.id,
              status:
                event.type === 'customer.subscription.deleted'
                  ? 'canceled'
                  : mapStripeStatus(obj.status),
              trialEndsAt: obj.trial_end
                ? new Date(obj.trial_end * 1000).toISOString()
                : undefined,
              quantity: obj.items?.data?.[0]?.quantity,
            });
          }
          break;
        }
        default:
          break; // ack everything else
      }
      return reply.send({ received: true });
    });
  });
}
