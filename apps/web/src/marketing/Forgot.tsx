import { useState, type FormEvent } from 'react';
import SimplePage from './SimplePage';
import { apiRequestPasswordReset } from './auth';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      // The server always responds 200 and never reveals whether the email
      // matches an account, so we show the same confirmation either way.
      await apiRequestPasswordReset(email);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SimplePage
      title="Forgot it?"
      chip="🐕 Help"
      intro="Drop your email and we'll send a link to reset your password. The link works once and expires in an hour."
    >
      {submitted ? (
        <div
          style={{
            background: '#fff',
            border: '1.5px solid #E6E3DE',
            borderRadius: 14,
            padding: '20px 22px',
          }}
        >
          <strong>Check your inbox.</strong>
          <p style={{ marginTop: 8, color: '#555', lineHeight: 1.55 }}>
            If <code>{email}</code> matches an account, a password-reset link
            is on its way. It expires in an hour, so don't dawdle. Didn't get
            it? Check spam, then try again.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} style={{ maxWidth: 420 }}>
          <label className="field-label" htmlFor="forgot-email">Account email</label>
          <input
            id="forgot-email"
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
            <div
              role="alert"
              style={{
                marginTop: 12,
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
            style={{ marginTop: 14, opacity: submitting ? 0.6 : 1 }}
            disabled={submitting}
          >
            {submitting ? 'Sending…' : 'Send me a reset link'}
          </button>
        </form>
      )}

      <p style={{ marginTop: 26, fontSize: 13, color: '#777' }}>
        Remembered it? Just <a href="/login">log in</a>. Truly stuck? Email{' '}
        <a href="mailto:hi@foldo.dev">hi@foldo.dev</a>.
      </p>
    </SimplePage>
  );
}
