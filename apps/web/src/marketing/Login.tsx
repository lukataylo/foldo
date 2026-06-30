import { useState, type FormEvent } from 'react';
import { FoldoMark, GitHubIcon, INK, MarketingPicture, MarketingStyles, useMarketingTheme, PAPER, PILLOW } from './shared';
import { apiLogin, storeAuth } from './auth';

export default function Login() {
  useMarketingTheme('Log in · Foldo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const { token, user } = await apiLogin({ email, password });
      storeAuth(token, user);
      window.location.assign('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="marketing-root"
      style={{
        background: PAPER,
        color: INK,
        minHeight: '100vh',
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <MarketingStyles />

      <header
        style={{
          maxWidth: 1240,
          margin: '0 auto',
          padding: '24px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: INK }}>
          <FoldoMark size={36} />
          <span className="display" style={{ fontSize: 28, lineHeight: 1, marginTop: 4 }}>Foldo</span>
        </a>
        <a className="nav-link" href="/signup">
          New here? <span style={{ fontWeight: 700, color: INK }}>Sign up →</span>
        </a>
      </header>

      <div
        className="stack-mobile"
        style={{
          maxWidth: 1100,
          margin: '24px auto 80px',
          padding: '0 32px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 56,
          alignItems: 'stretch',
        }}
      >
        {/* Form column */}
        <div
          style={{
            background: '#fff',
            border: `1.5px solid #E6E3DE`,
            borderRadius: 24,
            padding: '40px 36px',
            boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 30px 60px -40px rgba(17,17,17,0.25)',
          }}
        >
          <span className="chip">
            <span style={{ fontSize: 14 }}>🐾</span> Welcome back
          </span>
          <h1
            className="display"
            style={{ fontSize: 44, margin: '20px 0 8px', lineHeight: 1.05 }}
          >
            The pack's<br />been waiting.
          </h1>
          <p style={{ color: '#666', fontSize: 15, lineHeight: 1.55, margin: '0 0 28px' }}>
            Log in to your canvas. Resume the review you abandoned last Thursday
            . The dog hasn't moved.
          </p>

          <form onSubmit={onSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label className="field-label" htmlFor="email">Email</label>
              <input
                id="email"
                className="field-input"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label className="field-label" htmlFor="password">Password</label>
                <a
                  href="/forgot"
                  style={{ fontSize: 12.5, color: '#666', textDecoration: 'none' }}
                >
                  Forgot it?
                </a>
              </div>
              <input
                id="password"
                className="field-input"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13.5,
                color: '#555',
                margin: '14px 0 22px',
                cursor: 'pointer',
              }}
            >
              <input type="checkbox" defaultChecked style={{ accentColor: INK }} />
              Keep me sniffing around for 30 days
            </label>
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
                  lineHeight: 1.4,
                }}
              >
                {error}
              </div>
            )}
            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', opacity: submitting ? 0.6 : 1 }}
              disabled={submitting}
            >
              {submitting ? 'Fetching…' : 'Fetch my canvas'}
            </button>
          </form>

          <div
            style={{
              margin: '24px 0 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              color: '#888',
              fontSize: 12.5,
            }}
          >
            <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #E6E3DE' }} />
            OR
            <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #E6E3DE' }} />
          </div>

          <button
            className="btn-ghost"
            type="button"
            disabled
            title="GitHub OAuth is in the works. Email and password works today."
            style={{
              width: '100%',
              justifyContent: 'center',
              opacity: 0.55,
              cursor: 'not-allowed',
            }}
          >
            <GitHubIcon /> Continue with GitHub
            <span
              style={{
                marginLeft: 8,
                fontSize: 10,
                fontWeight: 700,
                background: '#eee',
                color: '#555',
                padding: '2px 6px',
                borderRadius: 999,
              }}
            >
              SOON
            </span>
          </button>

          <p style={{ marginTop: 22, fontSize: 13, color: '#777', textAlign: 'center' }}>
            By logging in you agree to the{' '}
            <a href="/terms" style={{ color: INK }}>terms</a>. Short version:
            don't break things, be kind to the dog.
          </p>
        </div>

        {/* Illustration column */}
        <div
          className="hide-mobile"
          style={{
            background: PILLOW,
            borderRadius: 24,
            padding: '40px 36px',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 30px 60px -40px rgba(17,17,17,0.25)',
          }}
        >
          <div>
            <span className="chip dark">
              <span style={{ fontSize: 13 }}>★</span> 5,400+ teams reviewing
            </span>
            <h2
              className="display"
              style={{
                fontSize: 38,
                lineHeight: 1.04,
                margin: '20px 0 12px',
                color: INK,
              }}
            >
              One canvas.<br />Every branch.<br />Every reviewer.
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.55, color: '#1a1a1a', maxWidth: 340 }}>
              Foldo keeps the review surface open for everyone. Engineers, PMs,
              designers, and the agent that just shipped commit #12.
            </p>
          </div>
          <MarketingPicture
            src="/marketing/pillow.png"
            alt="Foldo on a pillow"
            style={{
              width: '100%',
              maxWidth: 340,
              height: 'auto',
              display: 'block',
              margin: '20px auto 0',
            }}
          />
        </div>
      </div>
    </div>
  );
}
