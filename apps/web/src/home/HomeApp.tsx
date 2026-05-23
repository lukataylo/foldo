import { useEffect, useMemo, useState } from 'react';
import {
  FoldoMark,
  INK,
  MarketingStyles,
  PAPER,
  PILLOW,
  SOFT_GREY,
  Star,
  YELLOW,
  useMarketingTheme,
} from '../marketing/shared';
import { API_BASE, readToken, apiLogout } from '../marketing/auth';
import { authHeaders, fetchHomeBoards, fetchMe, type HomeBoardSummary } from './api';
import { Sidebar } from './Sidebar';
import { BoardCard } from './BoardCard';
import { AccountMenu } from './AccountMenu';
import { NewBoardModal } from './NewBoardModal';
import { CommandPalette } from './CommandPalette';
import { IconSearch } from './icons';

type View = 'all' | 'recents' | 'starred';

const RECENTS_KEY = 'foldo:recents';
const STARRED_KEY = 'foldo:starred';

function readStringSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

function writeStringSet(key: string, set: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

export default function HomeApp() {
  useMarketingTheme('Foldo · Home');

  // -------- auth gate --------
  useEffect(() => {
    if (!readToken()) {
      window.location.replace('/login');
    }
  }, []);

  const [boards, setBoards] = useState<HomeBoardSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('recents');
  const [search, setSearch] = useState('');
  const [me, setMe] = useState<{
    name: string;
    initial: string;
    color: string;
    email?: string;
    emailVerifiedAt?: string;
  } | null>(null);
  const [starred, setStarred] = useState<Set<string>>(() => readStringSet(STARRED_KEY));
  const [accountOpen, setAccountOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [newBoardOpen, setNewBoardOpen] = useState(() => {
    if (typeof location === 'undefined') return false;
    return new URLSearchParams(location.search).get('new') === '1';
  });

  useEffect(() => {
    if (!toast) return;
    const handle = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(handle);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [b, m] = await Promise.all([fetchHomeBoards(), fetchMe()]);
        if (cancelled) return;
        setBoards(b);
        setMe({
          name: m.user.name,
          initial: m.user.initial,
          color: m.user.color,
          email: m.user.email,
          emailVerifiedAt: m.user.emailVerifiedAt,
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const recents = useMemo(() => readStringSet(RECENTS_KEY), []);

  const filtered = useMemo(() => {
    if (!boards) return [] as HomeBoardSummary[];
    const q = search.trim().toLowerCase();
    let list = boards;
    if (view === 'starred') list = list.filter((b) => starred.has(b.id));
    if (view === 'recents') {
      list = [...list].sort((a, b) => {
        const ar = recents.has(a.id) ? 0 : 1;
        const br = recents.has(b.id) ? 0 : 1;
        if (ar !== br) return ar - br;
        return (b.lastActivity ?? '').localeCompare(a.lastActivity ?? '');
      });
    }
    if (q.length > 0) {
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(q) || b.repoSlug.toLowerCase().includes(q),
      );
    }
    return list;
  }, [boards, view, search, starred, recents]);

  const toggleStar = (id: string): void => {
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeStringSet(STARRED_KEY, next);
      return next;
    });
  };

  const openBoard = (id: string): void => {
    try {
      const rec = readStringSet(RECENTS_KEY);
      rec.delete(id);
      const list = [id, ...[...rec]];
      writeStringSet(RECENTS_KEY, new Set(list.slice(0, 12)));
    } catch {
      // ignore
    }
    window.location.assign(`/board/${id}`);
  };

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
        .home-sidebar-link { display:flex; align-items:center; gap:10px; padding:8px 12px; border-radius:10px; cursor:pointer; color:${INK}; text-decoration:none; font-size:14px; }
        .home-sidebar-link.is-active { background: ${YELLOW}; font-weight: 700; }
        .home-sidebar-link:hover:not(.is-active) { background: rgba(0,0,0,0.04); }
        .home-section-label { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: #8a8a8a; padding: 14px 12px 6px; }
        .home-team { display:flex; align-items:center; gap:8px; padding:6px 12px; font-size:13.5px; color:${INK}; }
        .home-team .dot { width:8px; height:8px; border-radius:50%; background:${PILLOW}; flex:none; }
        .home-search-input {
          width: 100%; max-width: 520px;
          background: #fff; border: 1.5px solid ${SOFT_GREY};
          border-radius: 12px; padding: 11px 14px 11px 38px;
          font-size: 14px; color: ${INK};
          outline: none; transition: border-color 120ms;
        }
        .home-search-input:focus { border-color: ${INK}; }
        .home-grid {
          display: grid; gap: 22px;
          grid-template-columns: repeat(auto-fill, minmax(228px, 1fr));
        }
        .home-card {
          background: #fff; border: 1.5px solid ${SOFT_GREY};
          border-radius: 16px; padding: 0; overflow: hidden;
          cursor: pointer; transition: transform 120ms, box-shadow 160ms, border-color 120ms;
          display: flex; flex-direction: column;
        }
        .home-card:hover { transform: translateY(-2px); box-shadow: 0 18px 30px -22px rgba(17,17,17,0.25); border-color: ${INK}; }
        .home-card .thumb { aspect-ratio: 5/3; background: ${PAPER}; border-bottom: 1.5px solid ${SOFT_GREY}; position: relative; overflow: hidden; }
        .home-card .meta { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 6px; }
        .home-card .title { font-weight: 700; font-size: 14.5px; }
        .home-card .sub { font-size: 12px; color: #777; display:flex; align-items:center; gap:8px; }
        .home-card .star-btn { position:absolute; top:8px; right:8px; background:rgba(255,255,255,0.92); border-radius:999px; width:30px; height:30px; display:flex; align-items:center; justify-content:center; border:0; cursor:pointer; opacity:0; transition: opacity 120ms; }
        .home-card:hover .star-btn { opacity: 1; }
        .home-card .star-btn.is-active { opacity: 1; }

        .home-card .kebab-wrap { position:absolute; top:8px; right:42px; }
        .home-card .kebab-btn { background:rgba(255,255,255,0.92); border-radius:999px; width:30px; height:30px; display:flex; align-items:center; justify-content:center; border:0; cursor:pointer; opacity:0; transition: opacity 120ms; }
        .home-card:hover .kebab-btn { opacity: 1; }
        .home-card .kebab-wrap.is-open .kebab-btn { opacity: 1; }
        .home-card .kebab-menu {
          position:absolute; top:34px; right:0;
          min-width:172px; background:#fff;
          border:1.5px solid ${SOFT_GREY}; border-radius:10px;
          box-shadow:0 14px 28px -16px rgba(17,17,17,0.28);
          padding:4px; display:flex; flex-direction:column;
          z-index: 6;
        }
        .home-card .kebab-menu button {
          background:transparent; border:0; text-align:left;
          padding:8px 10px; border-radius:6px; font-size:13px;
          color:${INK}; cursor:pointer;
        }
        .home-card .kebab-menu button:hover:not(:disabled) { background: rgba(0,0,0,0.05); }
        .home-card .kebab-menu button:disabled { opacity:0.5; cursor:default; }

        .home-toast {
          position: fixed; left: 50%; bottom: 28px;
          transform: translateX(-50%);
          background: ${INK}; color: #fff;
          padding: 10px 16px; border-radius: 10px;
          font-size: 13.5px; box-shadow: 0 18px 36px -22px rgba(0,0,0,0.5);
          z-index: 1000; max-width: 90vw;
        }

        .home-new-card { display:flex; align-items:center; justify-content:center; flex-direction:column; gap:8px; min-height: 180px; background: transparent; border: 2px dashed ${SOFT_GREY}; color: #777; }
        .home-new-card:hover { border-color: ${INK}; color: ${INK}; }
        .home-new-card .plus { font-size: 32px; line-height: 1; font-weight: 700; }

        .home-empty {
          background: #fff; border: 1.5px solid ${SOFT_GREY};
          border-radius: 18px; padding: 36px;
          display: flex; gap: 22px; align-items: center;
        }

        @media (max-width: 920px) {
          .home-shell { grid-template-columns: 1fr !important; }
          .home-sidebar { display: none; }
        }

        /* A+W1 touch: tighter card grid on iPad portrait + phone. */
        @media (max-width: 720px) {
          .home-grid {
            grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)) !important;
            gap: 14px !important;
          }
          main { padding: 16px 16px 80px !important; }
        }

        /* A+W1 touch: touch screens can't hover, so the star/kebab affordances
           need to be visible at rest — otherwise they're undiscoverable on iPad. */
        @media (hover: none) {
          .home-card .star-btn { opacity: 1 !important; }
          .home-card .kebab-btn { opacity: 1 !important; }
        }
      `}</style>

      <EmailVerificationBanner
        email={me?.email}
        verified={!!me?.emailVerifiedAt}
        onToast={setToast}
      />

      <div
        className="home-shell"
        style={{
          display: 'grid',
          gridTemplateColumns: '248px 1fr',
          minHeight: '100vh',
        }}
      >
        <Sidebar
          view={view}
          onView={setView}
          starredCount={starred.size}
          boards={boards}
        />

        <main style={{ padding: '20px 32px 80px', minWidth: 0 }}>
          {/* Header bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              marginBottom: 28,
            }}
          >
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#9a9a9a',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 18,
                  height: 18,
                }}
              >
                <IconSearch size={18} />
              </span>
              <input
                className="home-search-input"
                placeholder="Search boards, repos, comments"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              className="btn-yellow compact"
              type="button"
              onClick={() => setNewBoardOpen(true)}
              style={{ padding: '11px 16px', fontSize: 14, gap: 6 }}
              data-testid="foldo-home-newboard-trigger"
            >
              <span style={{ fontSize: 16, fontWeight: 700 }}>+</span> New board
            </button>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setAccountOpen((v) => !v)}
                aria-label="Account menu"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  background: me?.color ?? PILLOW,
                  color: INK,
                  border: `1.5px solid ${INK}`,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                {me?.initial ?? '·'}
              </button>
              {accountOpen && me && (
                <AccountMenu
                  user={me}
                  onClose={() => setAccountOpen(false)}
                  onLogout={async () => {
                    await apiLogout();
                    window.location.assign('/');
                  }}
                />
              )}
            </div>
          </div>

          {/* Title + view chip */}
          <div style={{ marginBottom: 18 }}>
            <h1
              className="display"
              style={{ fontSize: 36, margin: 0, lineHeight: 1.05 }}
            >
              {view === 'all' && 'All your boards.'}
              {view === 'recents' && (me ? `Welcome back, ${me.name.split(' ')[0]}.` : 'Recents')}
              {view === 'starred' && 'Starred.'}
            </h1>
            <p style={{ color: '#666', fontSize: 14, marginTop: 6 }}>
              {boards == null
                ? 'Loading the pack…'
                : `${filtered.length} board${filtered.length === 1 ? '' : 's'}`}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                background: '#fff0f0',
                border: '1px solid #ffd2d2',
                borderRadius: 12,
                padding: '14px 16px',
                marginBottom: 18,
                color: '#a02020',
                fontSize: 14,
              }}
            >
              {error}
            </div>
          )}

          {boards != null && filtered.length === 0 && !error && (
            <div className="home-empty">
              <FoldoMark size={56} />
              <div>
                <div className="display" style={{ fontSize: 22, marginBottom: 6 }}>
                  No boards here yet.
                </div>
                <div style={{ color: '#666', fontSize: 14, lineHeight: 1.55, maxWidth: 460 }}>
                  Connect a repo or accept an invite from the pack. Boards
                  show up the moment a branch lands.
                </div>
              </div>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="home-grid">
              {filtered.map((b) => (
                <BoardCard
                  key={b.id}
                  board={b}
                  starred={starred.has(b.id)}
                  onOpen={() => openBoard(b.id)}
                  onToggleStar={() => toggleStar(b.id)}
                  onToast={(m) => setToast(m)}
                />
              ))}
              <button
                type="button"
                className="home-card home-new-card"
                onClick={() => setNewBoardOpen(true)}
                aria-label="New board"
              >
                <span className="plus">+</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>New board</span>
              </button>
            </div>
          )}

          {/* Footer note */}
          <p
            style={{
              marginTop: 60,
              fontSize: 12.5,
              color: '#999',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Star size={12} /> Tip: hit ⌘K to jump between boards.
          </p>
        </main>
      </div>
      {toast && (
        <div className="home-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
      <CommandPalette
        boards={boards ?? []}
        onOpenBoard={(id) => openBoard(id)}
        onNewBoard={() => setNewBoardOpen(true)}
      />
      <NewBoardModal
        open={newBoardOpen}
        onClose={() => {
          setNewBoardOpen(false);
          // Strip the ?new=1 query so refresh doesn't keep reopening.
          if (typeof location !== 'undefined' && location.search.includes('new=')) {
            const url = new URL(location.href);
            url.searchParams.delete('new');
            window.history.replaceState({}, '', url.toString());
          }
        }}
        onCreated={(b) => {
          setBoards((prev) => (prev ? [b, ...prev] : [b]));
          setToast(`Board "${b.name}" created.`);
        }}
      />
    </div>
  );
}

/**
 * Slim banner above the home shell prompting unverified users to confirm
 * their email. Hidden once verified or for demo accounts with no email.
 * The "Resend" action hits POST /api/auth/resend-verification — rate-limited
 * server-side so a spam click can't flood Resend.
 */
function EmailVerificationBanner({
  email,
  verified,
  onToast,
}: {
  email: string | undefined;
  verified: boolean;
  onToast: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!email || verified) return null;
  const onResend = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/resend-verification`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (res.ok) {
        onToast('Verification email sent — check your inbox.');
      } else if (res.status === 429) {
        onToast('Slow down — try again in a minute.');
      } else {
        onToast('Could not send the email. Try again shortly.');
      }
    } catch {
      onToast('Could not send the email. Check your connection.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      data-testid="foldo-home-verify-banner"
      role="status"
      style={{
        background: '#fff5dc',
        borderBottom: '1px solid #f0d782',
        color: '#6b4d00',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        fontSize: 13.5,
      }}
    >
      <span>
        We sent a verification link to <strong>{email}</strong>. Confirm it to
        unlock publishing User Tests.
      </span>
      <button
        type="button"
        data-testid="foldo-home-verify-resend"
        onClick={onResend}
        disabled={busy}
        className="btn-ghost compact"
        style={{
          background: 'transparent',
          border: '1px solid #d6b65a',
          color: '#6b4d00',
          padding: '6px 12px',
          fontSize: 12.5,
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? 'Sending…' : 'Resend'}
      </button>
    </div>
  );
}
