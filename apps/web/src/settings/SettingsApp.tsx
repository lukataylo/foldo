import { useEffect, useState, type FormEvent } from 'react';
import {
  FoldoMark,
  INK,
  MarketingStyles,
  PAPER,
  PILLOW,
  SOFT_GREY,
  YELLOW,
  useMarketingTheme,
} from '../marketing/shared';
import { apiLogout, readToken, storeAuth, type AuthUser } from '../marketing/auth';
import {
  changePassword,
  fetchApiTokens,
  fetchMe,
  fetchSessions,
  mintApiToken,
  revokeApiToken,
  revokeSession,
  updateProfile,
  type ApiTokenSummary,
  type SessionSummary,
} from '../home/api';
import {
  IconBack,
  IconCard,
  IconDevices,
  IconLock,
  IconLogout,
  IconUser,
} from '../home/icons';

type Section = 'profile' | 'password' | 'sessions' | 'tokens' | 'billing';

const PALETTE = ['#ff7849', '#5db0ff', '#b08cff', '#7fd49a', '#f5b86b', '#ff8ec2'];

export default function SettingsApp() {
  useMarketingTheme('Settings · Foldo');

  useEffect(() => {
    if (!readToken()) {
      window.location.replace('/login');
    }
  }, []);

  const [section, setSection] = useState<Section>('profile');
  const [me, setMe] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await fetchMe();
        if (cancelled) return;
        setMe(m.user);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: PAPER,
        color: INK,
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <MarketingStyles />
      <style>{`
        .settings-shell { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
        .settings-link { display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:10px; cursor:pointer; color:${INK}; text-decoration:none; font-size:14px; background:transparent; border:0; width:100%; text-align:left; }
        .settings-link.is-active { background: ${YELLOW}; font-weight: 700; }
        .settings-link:hover:not(.is-active) { background: rgba(0,0,0,0.04); }
        .settings-link-icon { display:inline-flex; width:18px; height:18px; align-items:center; justify-content:center; color:inherit; }
        .settings-card { background:#fff; border:1.5px solid ${SOFT_GREY}; border-radius:18px; padding:28px 30px; margin-bottom: 22px; }
        .settings-card h2 { font-family: "Luckiest Guy", "Inter", system-ui, sans-serif; font-size: 26px; margin: 0 0 6px; letter-spacing: 0.02em; }
        .settings-card .lead { color: #666; font-size: 14px; margin: 0 0 22px; line-height: 1.55; }
        .settings-form-row { display: grid; gap: 6px; margin-bottom: 16px; }
        .settings-input {
          background:#fff; border:1.5px solid ${SOFT_GREY}; border-radius:10px;
          padding: 11px 14px; font-size: 14px; color:${INK}; outline:none;
          transition: border-color 120ms;
        }
        .settings-input:focus { border-color: ${INK}; }
        .settings-label { font-size: 12.5px; font-weight: 600; color: #444; letter-spacing: 0.02em; }
        .settings-meta { font-size: 12.5px; color: #777; }
        .settings-banner-ok { background:#f3fbef; border:1px solid #cce8c0; color:#2d6a1c; padding:10px 14px; border-radius:10px; font-size:13.5px; margin-bottom:14px; }
        .settings-banner-err { background:#fff0f0; border:1px solid #ffd2d2; color:#a02020; padding:10px 14px; border-radius:10px; font-size:13.5px; margin-bottom:14px; }
        .color-dot {
          width: 32px; height: 32px; border-radius: 50%;
          border: 2px solid #fff; box-shadow: 0 0 0 1.5px ${SOFT_GREY};
          cursor: pointer; transition: box-shadow 120ms;
        }
        .color-dot.is-active { box-shadow: 0 0 0 2px ${INK}; }
        @media (max-width: 860px) {
          .settings-shell { grid-template-columns: 1fr; }
          .settings-sidebar { border-right: 0; border-bottom: 1.5px solid ${SOFT_GREY}; height: auto; position: static; padding: 16px 18px; }
        }
      `}</style>

      <div className="settings-shell">
        <aside
          className="settings-sidebar"
          style={{
            borderRight: `1.5px solid ${SOFT_GREY}`,
            padding: '22px 16px',
            position: 'sticky',
            top: 0,
            alignSelf: 'start',
            height: '100vh',
            overflowY: 'auto',
          }}
        >
          <a
            href="/home"
            style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: INK, padding: '0 8px 18px' }}
          >
            <FoldoMark size={26} />
            <span className="display" style={{ fontSize: 20, lineHeight: 1, marginTop: 3 }}>Foldo</span>
          </a>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8a8a8a', letterSpacing: '0.08em', padding: '8px 12px 6px' }}>
            ACCOUNT
          </div>
          <button type="button" className={`settings-link${section === 'profile' ? ' is-active' : ''}`} onClick={() => setSection('profile')}>
            <span className="settings-link-icon" aria-hidden><IconUser size={14} /></span> Profile
          </button>
          <button type="button" className={`settings-link${section === 'password' ? ' is-active' : ''}`} onClick={() => setSection('password')}>
            <span className="settings-link-icon" aria-hidden><IconLock size={14} /></span> Password
          </button>
          <button type="button" className={`settings-link${section === 'sessions' ? ' is-active' : ''}`} onClick={() => setSection('sessions')}>
            <span className="settings-link-icon" aria-hidden><IconDevices size={14} /></span> Active sessions
          </button>
          <button type="button" className={`settings-link${section === 'tokens' ? ' is-active' : ''}`} onClick={() => setSection('tokens')}>
            <span className="settings-link-icon" aria-hidden><IconKey size={14} /></span> API tokens
          </button>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8a8a8a', letterSpacing: '0.08em', padding: '14px 12px 6px' }}>
            WORKSPACE
          </div>
          <button type="button" className={`settings-link${section === 'billing' ? ' is-active' : ''}`} onClick={() => setSection('billing')}>
            <span className="settings-link-icon" aria-hidden><IconCard size={14} /></span> Plan & billing
          </button>
          <div style={{ borderTop: `1px solid ${SOFT_GREY}`, margin: '18px 8px 12px' }} />
          <a href="/home" className="settings-link" style={{ color: '#666' }}>
            <span className="settings-link-icon" aria-hidden><IconBack size={14} /></span> Back to home
          </a>
          <button
            type="button"
            className="settings-link"
            style={{ color: '#a02020' }}
            onClick={async () => {
              await apiLogout();
              window.location.assign('/');
            }}
          >
            <span className="settings-link-icon" aria-hidden><IconLogout size={14} /></span> Log out
          </button>
        </aside>

        <main style={{ padding: '32px 40px 80px', minWidth: 0, maxWidth: 760 }}>
          <h1 className="display" style={{ fontSize: 36, margin: '0 0 8px', lineHeight: 1.05 }}>
            Settings
          </h1>
          <p style={{ color: '#666', fontSize: 14, margin: '0 0 28px' }}>
            Tweak your account, password, sessions, and plan. Changes save instantly.
          </p>

          {error && <div className="settings-banner-err">{error}</div>}

          {!me && <div style={{ color: '#888' }}>Loading…</div>}

          {me && section === 'profile' && (
            <ProfileSection me={me} onUpdated={(u) => setMe(u)} />
          )}
          {me && section === 'password' && <PasswordSection />}
          {me && section === 'sessions' && <SessionsSection />}
          {me && section === 'tokens' && <ApiTokensSection />}
          {me && section === 'billing' && <BillingSection />}
        </main>
      </div>
    </div>
  );
}

// ============================================================================
// Profile
// ============================================================================

function ProfileSection({ me, onUpdated }: { me: AuthUser; onUpdated: (u: AuthUser) => void }) {
  const [name, setName] = useState(me.name);
  const [email, setEmail] = useState(me.email ?? '');
  const [color, setColor] = useState(me.color);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const dirty = name !== me.name || email !== (me.email ?? '') || color !== me.color;

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (busy || !dirty) return;
    setOk(null);
    setErr(null);
    setBusy(true);
    try {
      const updated = await updateProfile({ name, email, color });
      onUpdated(updated);
      // Keep local cache in sync so /app picks up the new identity colour.
      const token = readToken();
      if (token) storeAuth(token, updated);
      setOk('Profile saved.');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card">
      <h2>Profile</h2>
      <p className="lead">
        How the pack sees you. Your initial and colour show up on every cursor,
        comment, and dispatch.
      </p>

      {ok && <div className="settings-banner-ok">{ok}</div>}
      {err && <div className="settings-banner-err">{err}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: color,
            border: `2px solid ${INK}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: INK,
            fontFamily: '"Luckiest Guy", Inter',
            fontSize: 28,
          }}
        >
          {name.trim()[0]?.toUpperCase() ?? '?'}
        </div>
        <div>
          <div style={{ fontWeight: 700 }}>{name || '·'}</div>
          <div className="settings-meta">{email || '·'}</div>
        </div>
      </div>

      <form onSubmit={onSubmit}>
        <div className="settings-form-row">
          <label className="settings-label" htmlFor="p-name">Display name</label>
          <input id="p-name" className="settings-input" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </div>
        <div className="settings-form-row">
          <label className="settings-label" htmlFor="p-email">Email</label>
          <input id="p-email" className="settings-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="settings-form-row">
          <label className="settings-label">Avatar colour</label>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Pick colour ${c}`}
                className={`color-dot${c === color ? ' is-active' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        <button
          type="submit"
          className="btn-primary"
          disabled={!dirty || busy}
          style={{ marginTop: 8, opacity: !dirty || busy ? 0.55 : 1 }}
        >
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </section>
  );
}

// ============================================================================
// Password
// ============================================================================

function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    setOk(null);
    setErr(null);
    if (next !== confirm) {
      setErr("New password and confirmation don't match.");
      return;
    }
    setBusy(true);
    try {
      const result = await changePassword({ currentPassword: current, newPassword: next });
      const extra = result.revokedSessions > 0
        ? ` Other ${result.revokedSessions} session${result.revokedSessions === 1 ? '' : 's'} signed out.`
        : '';
      setOk(`Password changed.${extra}`);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Change failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card">
      <h2>Password</h2>
      <p className="lead">
        Pick something the dog can't guess. Changing it signs you out
        everywhere else.
      </p>

      {ok && <div className="settings-banner-ok">{ok}</div>}
      {err && <div className="settings-banner-err">{err}</div>}

      <form onSubmit={onSubmit}>
        <div className="settings-form-row">
          <label className="settings-label" htmlFor="pw-current">Current password</label>
          <input id="pw-current" className="settings-input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
        </div>
        <div className="settings-form-row">
          <label className="settings-label" htmlFor="pw-next">New password</label>
          <input id="pw-next" className="settings-input" type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required autoComplete="new-password" />
          <div className="settings-meta">At least 8 characters.</div>
        </div>
        <div className="settings-form-row">
          <label className="settings-label" htmlFor="pw-confirm">Confirm new password</label>
          <input id="pw-confirm" className="settings-input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required autoComplete="new-password" />
        </div>
        <button type="submit" className="btn-primary" disabled={busy} style={{ marginTop: 4, opacity: busy ? 0.55 : 1 }}>
          {busy ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </section>
  );
}

// ============================================================================
// Sessions
// ============================================================================

function SessionsSection() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load(): Promise<void> {
    try {
      const list = await fetchSessions();
      setSessions(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load sessions');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function revoke(token: string): Promise<void> {
    setBusy(token);
    setErr(null);
    try {
      await revokeSession(token);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Revoke failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="settings-card">
      <h2>Active sessions</h2>
      <p className="lead">
        Every browser and device currently signed in with your account.
        Revoke any that aren't yours.
      </p>

      {err && <div className="settings-banner-err">{err}</div>}

      {sessions == null && <div style={{ color: '#888' }}>Loading sessions…</div>}

      {sessions != null && sessions.length === 0 && (
        <div className="settings-meta">No sessions found.</div>
      )}

      {sessions && sessions.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          {sessions.map((s) => (
            <div
              key={s.token}
              style={{
                border: `1.5px solid ${SOFT_GREY}`,
                borderRadius: 12,
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                background: s.current ? '#fffae8' : '#fff',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  background: '#f4efe6',
                  color: INK,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 'none',
                }}
              >
                <DeviceIcon ua={s.userAgent} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {prettyUserAgent(s.userAgent)} {s.current && <span style={{ color: '#a07a00', fontSize: 12 }}>· this device</span>}
                </div>
                <div className="settings-meta">
                  Last seen {formatDate(s.lastSeenAt)} · first used {formatDate(s.createdAt)}
                </div>
              </div>
              {!s.current ? (
                <button
                  type="button"
                  className="btn-ghost compact"
                  onClick={() => void revoke(s.token)}
                  disabled={busy === s.token}
                  style={{ padding: '8px 14px', fontSize: 13 }}
                >
                  {busy === s.token ? 'Revoking…' : 'Revoke'}
                </button>
              ) : (
                <span style={{ fontSize: 12, color: '#a07a00', fontWeight: 700 }}>Current</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// API tokens
// ============================================================================

function ApiTokensSection() {
  const [tokens, setTokens] = useState<ApiTokenSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [justMinted, setJustMinted] = useState<{ token: string; label: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  async function load(): Promise<void> {
    try {
      setTokens(await fetchApiTokens());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load tokens');
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function onMint(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setErr(null);
    try {
      const result = await mintApiToken(label.trim());
      setJustMinted({ token: result.token, label: result.label });
      setLabel('');
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Mint failed');
    } finally {
      setCreating(false);
    }
  }

  async function onRevoke(id: string): Promise<void> {
    setBusy(id);
    setErr(null);
    try {
      await revokeApiToken(id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Revoke failed');
    } finally {
      setBusy(null);
    }
  }

  async function copyToken(): Promise<void> {
    if (!justMinted) return;
    try {
      await navigator.clipboard.writeText(justMinted.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  }

  return (
    <section className="settings-card">
      <h2>API tokens</h2>
      <p className="lead">
        Long-lived tokens for agents and CLIs. Use one with the{' '}
        <a href="https://github.com/lukataylo/foldo-claude" target="_blank" rel="noreferrer">
          foldo-claude
        </a>{' '}
        MCP server so Claude (or any MCP host) can push screens onto your boards.
        Tokens grant access to every board your account can see. Treat them like
        passwords.
      </p>

      {err && <div className="settings-banner-err">{err}</div>}

      {justMinted && (
        <div
          style={{
            border: `1.5px solid ${YELLOW}`,
            background: '#fffbe6',
            borderRadius: 12,
            padding: '16px 18px',
            marginBottom: 18,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            New token: {justMinted.label}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              marginBottom: 8,
            }}
          >
            <code
              style={{
                background: '#fff',
                border: `1px solid ${SOFT_GREY}`,
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 12.5,
                wordBreak: 'break-all',
                flex: 1,
                minWidth: 0,
              }}
            >
              {justMinted.token}
            </code>
            <button
              type="button"
              className="btn-primary compact"
              onClick={() => void copyToken()}
              style={{ padding: '8px 14px', fontSize: 13 }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              type="button"
              className="btn-ghost compact"
              onClick={() => setJustMinted(null)}
              style={{ padding: '8px 14px', fontSize: 13 }}
            >
              Done
            </button>
          </div>
          <div style={{ fontSize: 12.5, color: '#5a4f3e' }}>
            Copy this now — once you close this banner the token is hidden for good.
          </div>
        </div>
      )}

      <form
        onSubmit={onMint}
        style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 22 }}
      >
        <div style={{ flex: 1 }}>
          <label className="settings-label" htmlFor="token-label">
            New token label
          </label>
          <input
            id="token-label"
            className="settings-input"
            type="text"
            placeholder="e.g. claude-laptop, ci-bot, anna-cursor"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
            required
            disabled={creating}
          />
        </div>
        <button
          type="submit"
          className="btn-primary"
          disabled={creating || !label.trim()}
          style={{ opacity: creating || !label.trim() ? 0.55 : 1, padding: '11px 18px' }}
        >
          {creating ? 'Creating…' : 'Create token'}
        </button>
      </form>

      {tokens == null && <div style={{ color: '#888' }}>Loading…</div>}

      {tokens && tokens.length === 0 && (
        <div className="settings-meta">No API tokens yet. Mint your first one above.</div>
      )}

      {tokens && tokens.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          {tokens.map((t) => (
            <div
              key={t.id}
              style={{
                border: `1.5px solid ${SOFT_GREY}`,
                borderRadius: 12,
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                background: '#fff',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  background: '#f4efe6',
                  color: INK,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 'none',
                }}
              >
                <IconKey size={16} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{t.label ?? 'Untitled'}</div>
                <div className="settings-meta" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <code style={{ fontSize: 11.5 }}>{t.preview}</code>
                  <span>· first used {formatDate(t.createdAt)}</span>
                  <span>· last used {formatDate(t.lastSeenAt)}</span>
                </div>
              </div>
              <button
                type="button"
                className="btn-ghost compact"
                onClick={() => void onRevoke(t.id)}
                disabled={busy === t.id}
                style={{ padding: '8px 14px', fontSize: 13 }}
              >
                {busy === t.id ? 'Revoking…' : 'Revoke'}
              </button>
            </div>
          ))}
        </div>
      )}

      <p style={{ marginTop: 22, fontSize: 13, color: '#666', lineHeight: 1.55 }}>
        Set the token as <code>FOLDO_TOKEN</code> on the agent host. See{' '}
        <a href="/docs/claude">/docs/claude</a> for the full setup.
      </p>
    </section>
  );
}

function IconKey({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="5.5" cy="8" r="2.5" />
      <path d="M7.8 8h6.2M11.5 8v2.5M13.5 8v1.8" />
    </svg>
  );
}

function DeviceIcon({ ua }: { ua: string | null }) {
  const s = (ua ?? '').toLowerCase();
  if (s.includes('iphone') || s.includes('android')) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
        <rect x="4.5" y="1.5" width="7" height="13" rx="1.4" />
        <path d="M6.5 12.5h3" />
      </svg>
    );
  }
  if (s.includes('curl') || s.includes('node')) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
        <path d="M3 5.5 5.5 8 3 10.5M7 11h6" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      <rect x="1.8" y="2.5" width="12.4" height="8.4" rx="1.2" />
      <path d="M1 13.5h14" />
    </svg>
  );
}

function prettyUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';
  if (/curl/i.test(ua)) return 'curl';
  const browserMatch = /(Edg|Chrome|Firefox|Safari)\/[\d.]+/i.exec(ua);
  const osMatch = /\(([^)]+)\)/.exec(ua);
  const browser = browserMatch?.[1] ?? 'Browser';
  let os = osMatch?.[1] ?? '';
  os = os.split(';')[0]?.trim() ?? '';
  return [browser, os].filter(Boolean).join(' · ') || ua.slice(0, 60);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

// ============================================================================
// Billing
// ============================================================================

function BillingSection() {
  return (
    <section className="settings-card">
      <h2>Plan & billing</h2>
      <p className="lead">
        You're on <b>Solo Pup</b>. Unlimited personal boards, one reviewer
        (you), and zero leashes. Upgrade when the pack grows.
      </p>

      <div
        style={{
          background: PILLOW,
          borderRadius: 16,
          padding: '22px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: '#fff',
            border: `1.5px solid ${INK}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 18,
          }}
        >
          $
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Solo Pup · $0 / month</div>
          <div style={{ fontSize: 13, color: '#1a1a1a', lineHeight: 1.5 }}>
            Free forever for solo devs. No card on file.
          </div>
        </div>
        <a href="/pricing" className="btn-primary" style={{ padding: '11px 16px', fontSize: 14 }}>
          Compare plans →
        </a>
      </div>

      <div style={{ fontSize: 13.5, color: '#666', lineHeight: 1.6 }}>
        Real billing isn't wired yet. When it lands, you'll be able to upgrade
        to <b>The Pack</b> ($24/editor) or chat to us about <b>Top Dog</b>{' '}
        without leaving this page.
      </div>
    </section>
  );
}
