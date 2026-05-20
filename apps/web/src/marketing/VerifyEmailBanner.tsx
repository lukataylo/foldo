import { useEffect, useState } from 'react';
import { apiMe, apiResendVerification } from './auth';

const DISMISS_KEY = 'foldo:verify-banner-dismissed';

/**
 * Dismissible "verify your email" banner for unverified logged-in users.
 *
 * Self-contained: it calls `/api/auth/me` on mount to decide whether to show,
 * so the home / settings apps can mount it with zero props:
 *
 *   import VerifyEmailBanner from '../marketing/VerifyEmailBanner';
 *   ...
 *   <VerifyEmailBanner />
 *
 * Verification is a SOFT gate — the banner only nudges, it never blocks.
 * Dismissal is remembered in localStorage for the session.
 */
export default function VerifyEmailBanner() {
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState<string | undefined>(undefined);
  const [resendState, setResendState] =
    useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      /* sessionStorage unavailable */
    }
    if (dismissed) return;
    apiMe().then((me) => {
      if (cancelled || !me) return;
      if (!me.emailVerified) {
        setEmail(me.user.email);
        setVisible(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss(): void {
    setVisible(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* non-fatal */
    }
  }

  async function resend(): Promise<void> {
    if (resendState === 'sending') return;
    setResendState('sending');
    try {
      await apiResendVerification();
      setResendState('sent');
    } catch {
      setResendState('error');
    }
  }

  if (!visible) return null;

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        padding: '10px 16px',
        background: '#FFF6E0',
        borderBottom: '1px solid #F0DFAE',
        color: '#5a4a16',
        fontSize: 13.5,
        lineHeight: 1.4,
      }}
    >
      <span style={{ flex: 1, minWidth: 200 }}>
        <strong>Verify your email.</strong>{' '}
        {email ? (
          <>We sent a confirmation link to <code>{email}</code>.</>
        ) : (
          <>Check your inbox for a confirmation link.</>
        )}{' '}
        {resendState === 'sent' && (
          <span style={{ color: '#2c6b2c' }}>Sent — check your inbox.</span>
        )}
        {resendState === 'error' && (
          <span style={{ color: '#a02020' }}>
            Couldn't resend. Try again shortly.
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={resend}
        disabled={resendState === 'sending' || resendState === 'sent'}
        style={{
          background: '#5a4a16',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '6px 12px',
          fontSize: 12.5,
          fontWeight: 700,
          cursor:
            resendState === 'sending' || resendState === 'sent'
              ? 'default'
              : 'pointer',
          opacity: resendState === 'sending' ? 0.6 : 1,
        }}
      >
        {resendState === 'sending'
          ? 'Sending…'
          : resendState === 'sent'
            ? 'Sent'
            : 'Resend'}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#5a4a16',
          fontSize: 16,
          cursor: 'pointer',
          padding: '0 4px',
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
