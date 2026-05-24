// `/reset?token=...` — second half of the password-reset flow. Receives the
// token from the email link, asks the user for a new password, calls the
// complete endpoint, persists the freshly-issued session token, and
// redirects to /home.

import { useEffect, useState, type FormEvent } from 'react';
import SimplePage from './SimplePage';
import { API_BASE, storeAuth, type AuthUser } from './auth';
/* A+W1 features — share the password validator with Forgot/Signup. */
import { isValidPassword, MIN_PASSWORD_LENGTH } from './validation';

export default function Reset() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      const t = params.get('token');
      setToken(t && t.trim() ? t.trim() : null);
    } catch {
      setToken(null);
    }
  }, []);

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!token) {
      setError('Reset link is missing its token. Open the link from your email again.');
      return;
    }
    if (!isValidPassword(password)) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords don’t match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/password-reset/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        token?: string;
        user?: AuthUser;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? `Reset failed (${res.status})`);
        return;
      }
      if (body.token && body.user) {
        storeAuth(body.token, body.user);
        location.assign('/home');
      } else {
        setError('Server returned an unexpected response. Try logging in.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SimplePage
      title="Set a new password"
      chip="🐕 Reset"
      intro="Pick a fresh password. We'll log you in as soon as you save."
    >
      {!token ? (
        <div
          data-testid="foldo-reset-missing-token"
          role="alert"
          style={{
            background: '#fff0f0',
            border: '1px solid #ffd2d2',
            padding: '14px 16px',
            borderRadius: 10,
            color: '#a02020',
            maxWidth: 420,
          }}
        >
          That link is missing its reset token. Open the email link again, or
          start over from <a href="/forgot">/forgot</a>.
        </div>
      ) : (
        <form onSubmit={onSubmit} style={{ maxWidth: 420 }}>
          <label className="field-label" htmlFor="reset-password">New password</label>
          <input
            id="reset-password"
            data-testid="foldo-reset-password"
            className="field-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            autoFocus
            disabled={submitting}
          />
          <label
            className="field-label"
            htmlFor="reset-confirm"
            style={{ marginTop: 14, display: 'block' }}
          >
            Confirm password
          </label>
          <input
            id="reset-confirm"
            data-testid="foldo-reset-confirm"
            className="field-input"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Type it again"
            required
            disabled={submitting}
          />
          {error && (
            <div
              role="alert"
              data-testid="foldo-reset-error"
              style={{ marginTop: 12, color: '#a02020', fontSize: 13.5 }}
            >
              {error}
            </div>
          )}
          {/* A+W1 features — explicit "Resetting…" label so the submit
              state is unambiguous (previously "Saving…" matched Signup). */}
          <button
            type="submit"
            data-testid="foldo-reset-submit"
            className="btn-primary"
            style={{
              marginTop: 14,
              opacity: submitting ? 0.6 : 1,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? 'Resetting…' : 'Save new password'}
          </button>
        </form>
      )}
    </SimplePage>
  );
}
