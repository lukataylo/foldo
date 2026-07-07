// Billing (Stripe) REST client.
// POST /api/billing/checkout → Stripe-hosted checkout URL (auth required;
// 503 with code BILLING_UNCONFIGURED when Stripe env isn't set).
// GET  /api/billing/status   → current subscription status.

import type {
  BillingStatusResponse,
  CreateCheckoutSessionRequest,
  CreateCheckoutSessionResponse,
} from '@foldo/protocol';
import { api, getAuth } from './client';

/**
 * The marketing surface never calls `setAuth(...)` (that happens in the
 * canvas boot path), so the shared client's module-level token is usually
 * empty when the pricing page runs. Fall back to the persisted auth token
 * (`foldo:token`, written by marketing/auth.ts on login/signup) so the
 * Bearer header is present either way.
 */
function authHeaders(): Record<string, string> | undefined {
  if (getAuth().token) return undefined; // api() adds the header itself
  try {
    const token = localStorage.getItem('foldo:token');
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  } catch {
    return undefined;
  }
}

export function createCheckoutSession(
  req: CreateCheckoutSessionRequest = {},
): Promise<CreateCheckoutSessionResponse> {
  return api<CreateCheckoutSessionResponse>('/api/billing/checkout', {
    method: 'POST',
    body: req,
    headers: authHeaders(),
  });
}

export function getBillingStatus(): Promise<BillingStatusResponse> {
  return api<BillingStatusResponse>('/api/billing/status', {
    headers: authHeaders(),
  });
}
