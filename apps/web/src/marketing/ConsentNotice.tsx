import { useEffect, useState } from 'react';

const ACK_KEY = 'foldo:cookie-acked';

/**
 * Shows a single line "we keep a few essentials in your browser" notice on
 * first visit, but only for visitors whose browser timezone resolves to a
 * European one (which covers the EU + UK + EEA). Persists a flag in
 * localStorage so it never reappears once dismissed. We don't load this
 * banner for visitors elsewhere because we don't collect anything that
 * triggers other regions' consent rules.
 */
function isLikelyEuOrUk(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    if (tz.startsWith('Europe/')) return true;
    // EEA outliers + UK overseas dependencies that share UK/EU framework.
    if (
      tz === 'Atlantic/Reykjavik' ||
      tz === 'Atlantic/Faroe' ||
      tz === 'Atlantic/Canary' ||
      tz === 'Atlantic/Madeira' ||
      tz === 'Atlantic/Azores'
    ) {
      return true;
    }
    return false;
  } catch {
    // If we can't tell, lean towards showing the banner: better legal posture.
    return true;
  }
}

export function ConsentNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(ACK_KEY) === '1') return;
    } catch {
      // Storage unavailable — show once per page load.
    }
    if (isLikelyEuOrUk()) setVisible(true);
  }, []);

  const dismiss = (): void => {
    try {
      localStorage.setItem(ACK_KEY, '1');
    } catch {
      // ignore
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 200,
        maxWidth: 720,
        margin: '0 auto',
        background: '#111111',
        color: '#fff',
        borderRadius: 14,
        boxShadow: '0 24px 60px -28px rgba(0,0,0,0.5)',
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div style={{ flex: 1, minWidth: 220, fontSize: 13.5, lineHeight: 1.5 }}>
        Foldo keeps a few essentials in your browser to keep you logged in and
        remember which boards you've opened. No analytics, no ads, no
        third-party tracking.{' '}
        <a
          href="/cookies"
          style={{ color: '#FFC21A', textDecoration: 'underline' }}
        >
          Read the cookie policy
        </a>
        .
      </div>
      <button
        type="button"
        onClick={dismiss}
        style={{
          background: '#FFC21A',
          color: '#111',
          border: 0,
          borderRadius: 999,
          padding: '8px 16px',
          fontWeight: 700,
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        Got it
      </button>
    </div>
  );
}
