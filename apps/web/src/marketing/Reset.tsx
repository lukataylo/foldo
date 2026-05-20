import { useState, type FormEvent } from 'react';
import SimplePage from './SimplePage';
import { apiResetPassword } from './auth';

const PASSWORD_MIN = 8;

/** Reads `?token=` from the reset link and lets the user set a new password. */
export default function Reset() {
  const token =
    typeof location !== 'undefined'
      ? new URLSearchParams(location.search).get('token') ?? ''
      : '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (password.length < PASSWORD_MIN) {
      setError(`Password must be at least ${PASSWORD_MIN} characters`);
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match");
      return;
    }
    setSubmitting(true);
    try {
      await apiResetPassword({ token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <SimplePage
        title="Reset password"
        chip="🐕 Help"
        intro="This page needs a reset link."
      >
        <div
          style={{
            background: '#fff',
            border: '1.5px solid #E6E3DE',
            borderRadius: 14,
            padding: '20px 22px',
          }}
        >
          <strong>No reset token.</strong>
          <p style={{ marginTop: 8, color: '#555', lineHeight: 1.55 }}>
            Open the link from your password-reset email, or{' '}
            <a href="/forgot">request a new one</a>.
          </p>
        </div>
      </SimplePage>
    );
  }

  if (done) {
    return (
      <SimplePage
        title="Password reset"
        chip="🐾 Done"
        intro="Your password is updated."
      >
        <div
          style={{
            background: '#fff',
            border: '1.5px solid #E6E3DE',
            borderRadius: 14,
            padding: '20px 22px',
          }}
        >
          <strong>All set.</strong>
          <p style={{ marginTop: 8, color: '#555', lineHeight: 1.55 }}>
            You can now <a href="/login">log in</a> with your new password. We
            signed out every other device, just in case.
          </p>
        </div>
      </SimplePage>
    );
  }

  return (
    <SimplePage
      title="Choose a new password"
      chip="🐕 Help"
      intro="Pick something at least 8 characters. This link works once."
    >
      <form onSubmit={onSubmit} style={{ maxWidth: 420 }}>
        <label className="field-label" htmlFor="reset-password">New password</label>
        <input
          id="reset-password"
          className="field-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
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
          className="field-input"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Type it again"
          autoComplete="new-password"
          required
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
          {submitting ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    </SimplePage>
  );
}
