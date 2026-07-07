import { useState } from 'react';
import { ApiClientError } from '../api/client';
import { createCheckoutSession } from '../api/billing';
import { readToken } from './auth';
import {
  CheckCircle,
  INK,
  MarketingLayout,
  PILLOW,
  PromptCaret,
  SOFT_GREY,
  YELLOW,
} from './shared';

const FEATURES = [
  'GitHub App install-only onboarding — nothing in your repo or CI',
  'Walkthrough re-rendered on every merge',
  'Only-what-changed incremental renders (unchanged takes reused byte-for-byte)',
  'Comments dispatch change requests to your coding agent',
  'Public share links for stakeholders',
  'Unlimited walkthroughs, takes, viewers and commenters',
  'Email support',
];

const FAQ = [
  {
    q: 'What counts as a product?',
    a: 'One repo plus its board. That includes unlimited walkthroughs, takes, viewers, and commenters — we never charge per seat. If you have three repos you want documented, that’s three products.',
  },
  {
    q: 'What happens after the 14-day trial?',
    a: 'Checkout collects a card when the trial starts, and billing begins on day 15 at £79/month per product. Cancel before then and you pay nothing.',
  },
  {
    q: 'Can I cancel?',
    a: 'Anytime, from settings. Your board stays readable until the end of the billing period; you can export everything before it winds down.',
  },
  {
    q: 'Do you need access to my source code?',
    a: 'No. The GitHub App reads PR diffs and metadata of merged PRs only — it cannot clone your repository or read your full source tree. Walkthroughs are filmed against your deployed preview URL, not your code. See /security for the full list of what it can and cannot read.',
  },
  {
    q: 'Does my team need Foldo accounts to watch?',
    a: 'No. Public share links let anyone watch walkthroughs and leave comments without a seat. Only the person managing the product needs an account.',
  },
];

/**
 * The checkout CTA. Logged-out visitors go to signup (and come back here);
 * logged-in users get a Stripe-hosted checkout session. When the server has
 * no Stripe configured (503 BILLING_UNCONFIGURED) we say so inline instead
 * of failing silently.
 */
function CheckoutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = readToken();

  if (!token) {
    return (
      <a
        data-testid="foldo-pricing-checkout"
        href="/signup?next=pricing"
        className="btn-yellow"
        style={{ justifyContent: 'center', width: '100%' }}
      >
        <PromptCaret /> Start your 14-day free trial
      </a>
    );
  }

  async function onClick(): Promise<void> {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const origin = window.location.origin;
      const { url } = await createCheckoutSession({
        successUrl: `${origin}/home?checkout=success`,
        cancelUrl: `${origin}/pricing`,
      });
      window.location.href = url;
    } catch (err) {
      if (
        err instanceof ApiClientError &&
        err.status === 503 &&
        err.code === 'BILLING_UNCONFIGURED'
      ) {
        setError("Checkout isn't configured in this environment");
      } else {
        setError(
          err instanceof Error ? err.message : 'Checkout failed — try again',
        );
      }
      setBusy(false);
    }
  }

  return (
    <div style={{ width: '100%' }}>
      <button
        type="button"
        data-testid="foldo-pricing-checkout"
        className="btn-yellow"
        onClick={onClick}
        disabled={busy}
        style={{
          justifyContent: 'center',
          width: '100%',
          opacity: busy ? 0.6 : 1,
        }}
      >
        <PromptCaret /> {busy ? 'Opening checkout…' : 'Start your 14-day free trial'}
      </button>
      {error && (
        <p
          data-testid="foldo-pricing-checkout-error"
          role="alert"
          style={{
            margin: '10px 0 0',
            fontSize: 13.5,
            lineHeight: 1.5,
            color: '#a02020',
            textAlign: 'center',
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

export default function Pricing() {
  return (
    <MarketingLayout title="Pricing · Foldo" navCurrent="pricing">
      <section
        style={{
          maxWidth: 1240,
          margin: '0 auto',
          padding: '40px 32px 0',
          textAlign: 'center',
        }}
      >
        <span className="chip">
          <span style={{ fontSize: 14 }}>£</span> Pricing
        </span>
        <h1
          className="display h-display"
          style={{
            fontSize: 64,
            lineHeight: 1.04,
            margin: '20px 0 14px',
            color: INK,
          }}
        >
          One plan.<br />
          Per <span style={{ color: YELLOW }}>product.</span>
        </h1>
        <p
          style={{
            fontSize: 17,
            lineHeight: 1.55,
            color: '#3b3b3b',
            maxWidth: 580,
            margin: '0 auto 36px',
          }}
        >
          No seats, no tiers, no sales call. A product is one repo, one board,
          and every walkthrough Foldo films for it.
        </p>
      </section>

      <section style={{ maxWidth: 560, margin: '0 auto', padding: '0 32px 40px' }}>
        <div className="price-card featured">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="display price-name" style={{ fontSize: 28 }}>
              Product
            </div>
            <span
              className="chip"
              style={{ background: YELLOW, color: INK, fontSize: 10.5 }}
            >
              14-day free trial
            </span>
          </div>
          <p
            className="price-note"
            style={{
              fontSize: 14,
              lineHeight: 1.5,
              margin: '6px 0 22px',
              color: '#ddd',
            }}
          >
            One repo + its board + unlimited walkthroughs, takes, viewers and
            commenters.
          </p>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 6,
              marginBottom: 18,
            }}
          >
            <span className="display price-amount" style={{ fontSize: 48 }}>
              £79
            </span>
            <span className="price-note" style={{ fontSize: 13, color: '#ccc' }}>
              / month per product
            </span>
          </div>
          <CheckoutButton />
          <hr
            style={{
              margin: '24px 0',
              border: 'none',
              borderTop: '1px solid #333',
            }}
          />
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gap: 10,
            }}
          >
            {FEATURES.map((f) => (
              <li
                key={f}
                className="price-feature"
                style={{ display: 'flex', gap: 10, fontSize: 14, color: '#ddd' }}
              >
                <span style={{ marginTop: 1, flex: 'none' }}>
                  <CheckCircle color="#fff" />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>
        <p
          style={{
            textAlign: 'center',
            fontSize: 13.5,
            color: '#666',
            margin: '16px 0 0',
            lineHeight: 1.55,
          }}
        >
          Want to see it before you trial it?{' '}
          <a
            href="/s/demo"
            style={{
              color: INK,
              fontWeight: 600,
              textDecorationColor: YELLOW,
              textDecorationThickness: 2,
              textUnderlineOffset: 3,
            }}
          >
            Explore a live board — no signup
          </a>
          .
        </p>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 880, margin: '0 auto', padding: '48px 32px 40px' }}>
        <div className="section-label" style={{ marginBottom: 22 }}>
          QUESTIONS WE GET A LOT
        </div>
        <h2
          className="display"
          style={{
            fontSize: 44,
            lineHeight: 1.05,
            margin: '0 0 32px',
            textAlign: 'center',
          }}
        >
          The fine print, in plain English.
        </h2>
        <div style={{ display: 'grid', gap: 14 }}>
          {FAQ.map((f) => (
            <details
              key={f.q}
              style={{
                background: '#fff',
                border: `1.5px solid ${SOFT_GREY}`,
                borderRadius: 14,
                padding: '18px 22px',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 16,
                  listStyle: 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                {f.q}
                <span style={{ color: PILLOW, fontSize: 22, lineHeight: 1 }}>+</span>
              </summary>
              <p
                style={{
                  marginTop: 12,
                  marginBottom: 0,
                  fontSize: 15,
                  lineHeight: 1.6,
                  color: '#444',
                }}
              >
                {f.a}
              </p>
            </details>
          ))}
        </div>
        <p
          style={{
            textAlign: 'center',
            fontSize: 14,
            color: '#666',
            margin: '28px 0 0',
          }}
        >
          Security questions? Read{' '}
          <a
            href="/security"
            style={{ color: INK, fontWeight: 600, textDecorationColor: YELLOW }}
          >
            what the GitHub App can and cannot read
          </a>{' '}
          and our{' '}
          <a
            href="/data-policy"
            style={{ color: INK, fontWeight: 600, textDecorationColor: YELLOW }}
          >
            data policy
          </a>
          .
        </p>
      </section>
    </MarketingLayout>
  );
}
