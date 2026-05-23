import { useState, type FormEvent } from 'react';
import SimplePage from './SimplePage';
import { API_BASE } from './auth';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // Server intentionally returns 200 even on unknown email (no account-
      // enumeration). Network failure is the only client-side error path.
      const res = await fetch(`${API_BASE}/api/auth/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok && res.status !== 200) {
        throw new Error(`request failed (${res.status})`);
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SimplePage
      title="Forgot it?"
      chip="🐕 Help"
      intro="Drop your email and we'll send you a reset link. The link expires in 15 minutes."
    >
      {submitted ? (
        <div
          data-testid="foldo-forgot-confirmation"
          style={{
            background: '#fff',
            border: '1.5px solid #E6E3DE',
            borderRadius: 14,
            padding: '20px 22px',
          }}
        >
          <strong>Check your inbox.</strong>
          <p style={{ marginTop: 8, color: '#555', lineHeight: 1.55 }}>
            If <code>{email}</code> matches an account we just sent a reset
            link. It expires in 15 minutes. Didn't get it? Wait a minute,
            then try again.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} style={{ maxWidth: 420 }}>
          <label className="field-label" htmlFor="forgot-email">Account email</label>
          <input
            id="forgot-email"
            data-testid="foldo-forgot-email"
            className="field-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            autoFocus
            disabled={submitting}
          />
          {error && (
            <div role="alert" style={{ marginTop: 12, color: '#a02020', fontSize: 13.5 }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            data-testid="foldo-forgot-submit"
            className="btn-primary"
            style={{ marginTop: 14, opacity: submitting ? 0.6 : 1 }}
            disabled={submitting}
          >
            {submitting ? 'Sending…' : 'Send me a reset'}
          </button>
        </form>
      )}

      <p style={{ marginTop: 26, fontSize: 13, color: '#777' }}>
        Remember your password? <a href="/login">Log in</a>. Still stuck?{' '}
        <a href="mailto:hi@foldo.dev">hi@foldo.dev</a>.
      </p>
    </SimplePage>
  );
}
