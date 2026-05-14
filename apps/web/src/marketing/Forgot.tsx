import { useState, type FormEvent } from 'react';
import SimplePage from './SimplePage';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    // Honest UX: we don't have email infrastructure wired yet. Show a friendly
    // confirmation but be clear we'll follow up by hand.
    setSubmitted(true);
  };

  return (
    <SimplePage
      title="Forgot it?"
      chip="🐕 Help"
      intro="Drop your email and we'll get you back into the canvas. Email-based reset isn't fully automated yet. A human will reach out within a business day."
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
          <strong>Got it.</strong>
          <p style={{ marginTop: 8, color: '#555', lineHeight: 1.55 }}>
            If <code>{email}</code> matches an account, we'll send a reset
            link as soon as a human ack's the queue. Sit, stay, refresh your
            inbox.
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
          />
          <button
            type="submit"
            className="btn-primary"
            style={{ marginTop: 14 }}
          >
            Send me a reset
          </button>
        </form>
      )}

      <p style={{ marginTop: 26, fontSize: 13, color: '#777' }}>
        In the meantime: if you remember your password, just{' '}
        <a href="/login">log in</a>. If you're truly stuck, email{' '}
        <a href="mailto:hi@foldo.dev">hi@foldo.dev</a> and we'll reset by hand.
      </p>
    </SimplePage>
  );
}
