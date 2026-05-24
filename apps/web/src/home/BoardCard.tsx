import { useEffect, useRef, useState } from 'react';
import { INK, PAPER, SOFT_GREY, YELLOW } from '../marketing/shared';
import type { HomeBoardSummary } from './api';
import {
  archiveBoard,
  createBoardShare,
  listBoardShares,
  restoreBoard,
  revokeBoardShare,
} from './api';

interface BoardCardProps {
  board: HomeBoardSummary;
  starred: boolean;
  onOpen: () => void;
  onToggleStar: () => void;
  onToast?: (msg: string) => void;
  /**
   * Called when the user archives this board so the parent can drop it
   * from the optimistic list. Skipped when omitted (archived view doesn't
   * need it — the card stays put until Restore moves it back to active).
   */
  onArchived?: () => void;
  /**
   * Called when the user restores this archived board. Parent typically
   * drops it from the archived list (it'll reappear on the next active fetch).
   */
  onRestored?: () => void;
}

const DEFAULT_COLORS = ['#9a9a9a', '#b08cff', '#5db0ff', '#f5b86b'];

export function BoardCard({
  board,
  starred,
  onOpen,
  onToggleStar,
  onToast,
  onArchived,
  onRestored,
}: BoardCardProps) {
  const isArchived = !!board.archivedAt;
  const colors = board.branchColors.length > 0 ? board.branchColors : DEFAULT_COLORS;
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const toast = (m: string) => {
    if (onToast) onToast(m);
    else console.info(m);
  };

  const handleCopyShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { url } = await createBoardShare(board.id);
      try {
        await navigator.clipboard.writeText(url);
        toast('Share link copied to clipboard');
      } catch {
        // Clipboard may be unavailable (e.g. insecure context); show the URL.
        toast(`Share link: ${url}`);
      }
    } catch (err) {
      toast(
        err instanceof Error
          ? `Couldn't create share: ${err.message}`
          : `Couldn't create share`,
      );
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  };

  const handleArchive = async () => {
    if (busy) return;
    // A live confirm() — board archive nukes the card from the active list,
    // even if the data is recoverable. Worth one extra click to avoid the
    // "I clicked the wrong thing in a menu" follow-up.
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Archive "${board.name}"? You can restore it from the archived view.`)
    ) {
      setMenuOpen(false);
      return;
    }
    setBusy(true);
    try {
      await archiveBoard(board.id);
      toast(`Archived "${board.name}"`);
      if (onArchived) onArchived();
    } catch (err) {
      toast(
        err instanceof Error
          ? `Couldn't archive: ${err.message}`
          : `Couldn't archive board`,
      );
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  };

  const handleRestore = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await restoreBoard(board.id);
      toast(`Restored "${board.name}"`);
      if (onRestored) onRestored();
    } catch (err) {
      toast(
        err instanceof Error
          ? `Couldn't restore: ${err.message}`
          : `Couldn't restore board`,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const shares = await listBoardShares(board.id);
      if (shares.length === 0) {
        toast('No active share links');
      } else {
        await Promise.all(shares.map((s) => revokeBoardShare(board.id, s.token)));
        toast(
          shares.length === 1
            ? 'Share link revoked'
            : `${shares.length} share links revoked`,
        );
      }
    } catch (err) {
      toast(
        err instanceof Error
          ? `Couldn't revoke: ${err.message}`
          : `Couldn't revoke share link`,
      );
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  };

  return (
    <div
      role={isArchived ? 'group' : 'button'}
      tabIndex={isArchived ? -1 : 0}
      className={`home-card${isArchived ? ' is-archived' : ''}`}
      data-testid="foldo-home-boardcard"
      data-archived={isArchived ? 'true' : 'false'}
      onClick={isArchived ? undefined : onOpen}
      onKeyDown={(e) => {
        if (isArchived) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      style={isArchived ? { cursor: 'default', opacity: 0.78 } : undefined}
    >
      <div className="thumb">
        <Thumb colors={colors} frameCount={board.frameCount} />
        <button
          type="button"
          aria-label={starred ? 'Unstar' : 'Star'}
          className={`star-btn${starred ? ' is-active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar();
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill={starred ? YELLOW : 'none'}
            stroke={INK}
            strokeWidth="2"
            strokeLinejoin="round"
          >
            <path d="M12 2l2.9 6.9L22 10l-5.5 4.7L18.2 22 12 18.2 5.8 22l1.7-7.3L2 10l7.1-1.1z" />
          </svg>
        </button>
        <div
          className={`kebab-wrap${menuOpen ? ' is-open' : ''}`}
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Board actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="kebab-btn"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill={INK}
              aria-hidden
            >
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </button>
          {menuOpen && (
            <div role="menu" className="kebab-menu">
              <button
                role="menuitem"
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onOpen();
                }}
              >
                Open canvas
              </button>
              <button
                role="menuitem"
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleCopyShare();
                }}
              >
                Copy share link
              </button>
              <button
                role="menuitem"
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleRevoke();
                }}
              >
                Revoke share link
              </button>
              {!isArchived && (
                <button
                  role="menuitem"
                  type="button"
                  data-testid="foldo-home-card-archive"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleArchive();
                  }}
                >
                  Archive board
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="meta">
        <div className="title" title={board.name}>{board.name}</div>
        <div className="sub">
          <span style={{ display: 'inline-flex', gap: 3 }}>
            {colors.slice(0, 4).map((c, i) => (
              <span
                key={i}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: c,
                  border: '0.5px solid rgba(0,0,0,0.1)',
                }}
              />
            ))}
          </span>
          <span>{board.branchCount} {board.branchCount === 1 ? 'branch' : 'branches'}</span>
          <span aria-hidden style={{ color: '#ccc' }}>·</span>
          <span>{formatRelative(board.lastActivity ?? board.createdAt)}</span>
        </div>
        {isArchived && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#a06a00',
                background: '#fff3d0',
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              Archived
            </span>
            <button
              type="button"
              data-testid="foldo-home-card-restore"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                void handleRestore();
              }}
              style={{
                marginLeft: 'auto',
                background: '#fff',
                border: `1.5px solid ${INK}`,
                borderRadius: 8,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 600,
                cursor: busy ? 'wait' : 'pointer',
                color: INK,
                opacity: busy ? 0.6 : 1,
              }}
            >
              Restore
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Thumb({ colors, frameCount }: { colors: string[]; frameCount: number }) {
  // A tiny stylised "mini canvas": colored stripes (branches) with frame rectangles.
  const w = 220;
  const h = 120;
  const lanes = Math.min(colors.length || 1, 4);
  const laneH = h / Math.max(lanes, 1);
  const framesPerLane = Math.min(Math.max(Math.ceil(frameCount / lanes), 1), 3);
  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <rect x="0" y="0" width={w} height={h} fill={PAPER} />
      {/* Grid hint */}
      {[0.25, 0.5, 0.75].map((p) => (
        <line
          key={p}
          x1={w * p}
          y1="0"
          x2={w * p}
          y2={h}
          stroke={SOFT_GREY}
          strokeWidth="0.6"
        />
      ))}
      {Array.from({ length: lanes }).map((_, i) => {
        const y = i * laneH + 8;
        const color = colors[i] ?? '#bbb';
        return (
          <g key={i}>
            {/* Branch lane background bar */}
            <rect
              x="6"
              y={y - 4}
              width={w - 12}
              height={laneH - 12}
              fill={color}
              opacity="0.08"
              rx="4"
            />
            {/* Branch dot */}
            <circle cx="14" cy={y + (laneH - 12) / 2 - 2} r="3.5" fill={color} />
            {/* Frame rectangles */}
            {Array.from({ length: framesPerLane }).map((__, j) => {
              const fx = 28 + j * 48;
              const fy = y - 1;
              const fw = 38;
              const fh = laneH - 14;
              return (
                <rect
                  key={j}
                  x={fx}
                  y={fy}
                  width={fw}
                  height={fh}
                  fill="#fff"
                  stroke="#d8d2c8"
                  strokeWidth="0.8"
                  rx="2"
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}
