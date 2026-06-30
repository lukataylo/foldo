import { useState, type FormEvent } from 'react';
import { CheckCircle, FoldoMark, GitHubIcon, INK, MarketingPicture, MarketingStyles, PAPER, useMarketingTheme } from './shared';
import { apiSignup, storeAuth } from './auth';

const PERKS = [
  { title: 'Free forever for solo devs', body: 'Unlimited personal boards. Bring as many AI-built branches as you can fold.' },
  { title: 'Live multiplayer review', body: 'Pin comments, follow each other’s viewport, ship the same merge in half the time.' },
  { title: 'Bring your own agent', body: 'Claude Code, Cursor, custom MCP. Foldo doesn’t care which paw wrote the patch.' },
  { title: 'Open source, MIT', body: 'Self-host if you want. Read the code. PRs welcome, bring snacks.' },
];

export default function Signup() {
  useMarketingTheme('Sign up · Foldo');
  const [name, setName] = useState('');
  const [team, setTeam] = useState('');
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
      const { token, user } = await apiSignup({ email, password, name });
      storeAuth(token, user);
      window.location.assign('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
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
        <a className="nav-link" href="/login">
          Already trained? <span style={{ fontWeight: 700, color: INK }}>Log in →</span>
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
          alignItems: 'start',
        }}
      >
        {/* Form */}
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
            <span style={{ fontSize: 14 }}>✦</span> Free to start
          </span>
          <h1
            className="display"
            style={{ fontSize: 44, margin: '20px 0 8px', lineHeight: 1.05 }}
          >
            Let's get you<br />a canvas.
          </h1>
          <p style={{ color: '#666', fontSize: 15, lineHeight: 1.55, margin: '0 0 28px' }}>
            Sign up and ship your first reviewed merge in under five minutes.
            No credit card. No salesperson. No leash required.
          </p>

          <form onSubmit={onSubmit}>
            <div
              className="stack-sm"
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}
            >
              <div>
                <label className="field-label" htmlFor="name">Your name</label>
                <input
                  id="name"
                  className="field-input"
                  type="text"
                  placeholder="Anna Cole"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="team">Team or repo</label>
                <input
                  id="team"
                  className="field-input"
                  type="text"
                  placeholder="acme/landing"
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="field-label" htmlFor="email">Work email</label>
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
              <label className="field-label" htmlFor="password">Password</label>
              <input
                id="password"
                className="field-input"
                type="password"
                placeholder="At least 8 characters, make it a good one"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                minLength={8}
              />
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                fontSize: 13,
                color: '#555',
                margin: '14px 0 22px',
                cursor: 'pointer',
                lineHeight: 1.45,
              }}
            >
              <input
                type="checkbox"
                defaultChecked
                style={{ accentColor: INK, marginTop: 3 }}
              />
              <span>
                Send me the occasional product update. We won't bark unless we
                have something to say.
              </span>
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
              {submitting ? 'Creating…' : 'Create my canvas →'}
            </button>
          </form>

          <div
            style={{
              margin: '22px 0 16px',
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
            <GitHubIcon /> Sign up with GitHub
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

          <p style={{ marginTop: 22, fontSize: 12.5, color: '#777', textAlign: 'center', lineHeight: 1.55 }}>
            By signing up you agree to the{' '}
            <a href="/terms" style={{ color: INK }}>terms</a> and{' '}
            <a href="/privacy" style={{ color: INK }}>privacy policy</a>. We
            keep the data, the dog keeps the secrets.
          </p>
        </div>

        {/* Perks */}
        <div style={{ paddingTop: 12 }}>
          <MarketingPicture
            src="/marketing/step-3-edit.png"
            alt="Foldo in a yellow bandana"
            style={{ width: 280, height: 'auto', display: 'block', marginBottom: 16 }}
          />
          <h2
            className="display"
            style={{ fontSize: 36, lineHeight: 1.05, margin: '0 0 22px' }}
          >
            What you get on day one.
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {PERKS.map((p) => (
              <li key={p.title} style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
                <div style={{ marginTop: 2, flex: 'none' }}>
                  <CheckCircle />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 4 }}>{p.title}</div>
                  <div style={{ fontSize: 14, lineHeight: 1.55, color: '#555' }}>{p.body}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
