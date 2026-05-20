import { useEffect, useRef, useState } from 'react';
import SimplePage from './SimplePage';
import { apiVerifyEmail } from './auth';

type Status = 'verifying' | 'success' | 'error' | 'no-token';

/** Reads `?token=` from the verification link and confirms the email. */
export default function VerifyEmail() {
  const token =
    typeof location !== 'undefined'
      ? new URLSearchParams(location.search).get('token') ?? ''
      : '';

  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'no-token');
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true; // guard against React StrictMode double-invoke
    apiVerifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Verification failed');
        setStatus('error');
      });
  }, [token]);

  let body;
  if (status === 'no-token') {
    body = (
      <>
        <strong>No verification token.</strong>
        <p style={{ marginTop: 8, color: '#555', lineHeight: 1.55 }}>
          Open the link from your verification email. If it expired, log in and
          use the "Resend" button in the banner.
        </p>
      </>
    );
  } else if (status === 'verifying') {
    body = (
      <>
        <strong>Verifying…</strong>
        <p style={{ marginTop: 8, color: '#555', lineHeight: 1.55 }}>
          Hang tight while we confirm your email.
        </p>
      </>
    );
  } else if (status === 'success') {
    body = (
      <>
        <strong>Email verified.</strong>
        <p style={{ marginTop: 8, color: '#555', lineHeight: 1.55 }}>
          Thanks, that's you confirmed. Head to your{' '}
          <a href="/home">canvas</a> — the verify banner is gone for good.
        </p>
      </>
    );
  } else {
    body = (
      <>
        <strong>Couldn't verify.</strong>
        <p style={{ marginTop: 8, color: '#555', lineHeight: 1.55 }}>
          {error ?? 'This link is invalid or expired.'} Log in and request a
          fresh verification email from the banner.
        </p>
      </>
    );
  }

  return (
    <SimplePage
      title="Verify your email"
      chip="🐾 Account"
      intro="Confirming your email address keeps your account secure."
    >
      <div
        style={{
          background: '#fff',
          border: '1.5px solid #E6E3DE',
          borderRadius: 14,
          padding: '20px 22px',
        }}
      >
        {body}
      </div>
    </SimplePage>
  );
}
