import { useState } from 'react';
import { CheckCircle, INK, MarketingLayout, PILLOW, PromptCaret, SOFT_GREY, YELLOW } from './shared';
import { API_BASE } from './auth';

const REASONS = [
  'See Foldo running against a real repo of yours',
  'Talk pricing for teams over 10 editors',
  'Discuss SSO, audit log, or self-host',
  'Ask why the dog is so calm',
];

export default function Demo() {
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get('d-name') ?? ''),
      email: String(data.get('d-email') ?? ''),
      company: String(data.get('d-company') ?? ''),
      teamSize: String(data.get('d-size') ?? ''),
      agents: String(data.get('d-stack') ?? ''),
      message: String(data.get('d-msg') ?? ''),
    };
    try {
      const res = await fetch(`${API_BASE}/api/demo-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MarketingLayout title="Book a demo · Foldo">
      <section
        style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 32px 80px' }}
      >
        <div
          className="stack-mobile"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 56,
            alignItems: 'start',
          }}
        >
          {/* Left */}
          <div>
            <span className="chip">
              <span style={{ fontSize: 14 }}>📅</span> Book a demo
            </span>
            <h1
              className="display h-display"
              style={{ fontSize: 56, lineHeight: 1.03, margin: '20px 0 14px' }}
            >
              Twenty minutes.<br />
              No <span style={{ color: YELLOW }}>fetch quest.</span>
            </h1>
            <p
              style={{
                fontSize: 17,
                lineHeight: 1.6,
                color: '#3b3b3b',
                margin: '0 0 28px',
                maxWidth: 460,
              }}
            >
              Tell us a bit about your team and we'll send a calendar link
              within an hour. No SDR call, no email drip, no "let me circle
              back with the team." A human will show up, share a screen, and
              fold the demo around what you actually care about.
            </p>

            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'grid', gap: 12 }}>
              {REASONS.map((r) => (
                <li key={r} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ marginTop: 1, flex: 'none' }}>
                    <CheckCircle />
                  </span>
                  <span style={{ fontSize: 15, color: '#222' }}>{r}</span>
                </li>
              ))}
            </ul>

            <div
              style={{
                background: '#fff',
                border: `1.5px solid ${SOFT_GREY}`,
                borderRadius: 18,
                padding: 22,
                display: 'flex',
                gap: 14,
                alignItems: 'center',
              }}
            >
              <img
                src="/marketing/step-2-review.png"
                alt=""
                style={{ width: 80, height: 'auto', flex: 'none' }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>
                  Or: try it solo right now.
                </div>
                <div style={{ fontSize: 13.5, color: '#666', lineHeight: 1.55 }}>
                  Sign up for free in under a minute. The seeded board is
                  identical to what you'd see on a call.
                </div>
                <a
                  href="/signup"
                  style={{
                    marginTop: 6,
                    display: 'inline-block',
                    color: INK,
                    fontSize: 13.5,
                    fontWeight: 700,
                    textDecoration: 'underline',
                    textDecorationColor: YELLOW,
                  }}
                >
                  Start free →
                </a>
              </div>
            </div>
          </div>

          {/* Right (form) */}
          <div
            style={{
              background: '#fff',
              border: `1.5px solid ${SOFT_GREY}`,
              borderRadius: 24,
              padding: '36px 32px',
              boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 30px 60px -40px rgba(17,17,17,0.25)',
              position: 'relative',
            }}
          >
            {sent ? (
              <div style={{ textAlign: 'center', padding: '40px 12px' }}>
                <img
                  src="/marketing/step-4-verify.png"
                  alt="Foldo wagging tail"
                  style={{ width: 200, height: 'auto', margin: '0 auto 16px' }}
                />
                <h2 className="display" style={{ fontSize: 36, margin: '0 0 12px' }}>
                  Got it.
                </h2>
                <p style={{ fontSize: 15, color: '#555', lineHeight: 1.6, maxWidth: 320, margin: '0 auto' }}>
                  We'll be in touch within an hour with a calendar link. If
                  you don't hear from us, check your spam. Even the dog gets
                  filtered sometimes.
                </p>
              </div>
            ) : (
              <form onSubmit={onSubmit}>
                <div style={{ marginBottom: 14 }}>
                  <label className="field-label" htmlFor="d-name">Your name</label>
                  <input id="d-name" name="d-name" className="field-input" type="text" placeholder="Anna Cole" required />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label className="field-label" htmlFor="d-email">Work email</label>
                  <input id="d-email" name="d-email" className="field-input" type="email" placeholder="anna@company.com" required />
                </div>
                <div
                  className="stack-sm"
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}
                >
                  <div>
                    <label className="field-label" htmlFor="d-company">Company</label>
                    <input id="d-company" name="d-company" className="field-input" type="text" placeholder="Acme Co." />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="d-size">Team size</label>
                    <select id="d-size" name="d-size" className="field-input" defaultValue="">
                      <option value="" disabled>Pick one…</option>
                      <option>1–5</option>
                      <option>6–25</option>
                      <option>26–100</option>
                      <option>100+</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label className="field-label" htmlFor="d-stack">Agents you use today</label>
                  <input id="d-stack" name="d-stack" className="field-input" type="text" placeholder="Claude Code, Cursor, in-house MCP…" />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label className="field-label" htmlFor="d-msg">What do you want to see?</label>
                  <textarea
                    id="d-msg"
                    name="d-msg"
                    className="field-input"
                    rows={4}
                    placeholder="We're drowning in branch previews. Want to see how multiplayer review works for our reviewers."
                  />
                </div>
                {error && (
                  <div
                    role="alert"
                    style={{
                      marginBottom: 14,
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: '#fff0f0',
                      border: '1px solid #ffd2d2',
                      color: '#a02020',
                      fontSize: 13.5,
                    }}
                  >
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}
                  style={{ width: '100%', justifyContent: 'center', opacity: submitting ? 0.6 : 1 }}
                >
                  <PromptCaret /> {submitting ? 'Sending…' : 'Request a demo'}
                </button>
                <p style={{ marginTop: 14, fontSize: 12.5, color: '#888', textAlign: 'center' }}>
                  No SDR. No drip. Just a real person and a screenshare.
                </p>
              </form>
            )}

            <div
              style={{
                position: 'absolute',
                top: -18,
                right: -18,
                background: PILLOW,
                borderRadius: 999,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.4,
                color: INK,
                transform: 'rotate(6deg)',
              }}
            >
              avg reply: 38min
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
