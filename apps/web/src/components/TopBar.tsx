import { useEffect, useRef, useState } from 'react';
import type { Board, UserId, User } from '@foldo/protocol';
import { PresenceAvatars } from '../multiplayer/PresenceAvatars';
import { useBoardSelector } from '../state/useBoardStore';
import { ShareManagementModal } from './ShareManagementModal';

const HOME_URL = '/home';

interface Props {
  board: Board | null;
  meUserId: UserId | null;
  followingUserId: UserId | null;
  onFollow: (userId: UserId | null) => void;
  onCapture: () => void;
  onOpenTests: () => void;
  onSwitchUser: (userId: UserId) => void;
  wsStatus: 'connecting' | 'open' | 'closed' | 'reconnecting' | 'offline';
  offline: boolean;
}

export function TopBar({
  board,
  meUserId,
  followingUserId,
  onFollow,
  onCapture,
  onOpenTests,
  onSwitchUser,
  wsStatus,
  offline,
}: Props) {
  const [open, setOpen] = useState(false);
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [shared, setShared] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareMgmtOpen, setShareMgmtOpen] = useState(false);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
  const users = useBoardSelector((s) => s.users);
  const mcpConnected = useBoardSelector((s) => s.mcpConnected);
  const me = meUserId ? users.get(meUserId) ?? null : null;
  const switchable: User[] = [];
  for (const u of users.values()) if (u.kind === 'human') switchable.push(u);
  const repoName = board?.repoSlug ?? 'unloaded';

  // Close the small share-menu dropdown on outside click / Esc — mirrors
  // the kebab menu in BoardCard so the affordance feels the same across
  // home + canvas.
  useEffect(() => {
    if (!shareMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setShareMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShareMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [shareMenuOpen]);

  const onShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShared(true);
      setTimeout(() => setShared(false), 1400);
    } catch {
      // Older browsers, fall back to selection
      const ta = document.createElement('textarea');
      ta.value = window.location.href;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
      setShared(true);
      setTimeout(() => setShared(false), 1400);
    }
  };
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between px-4 pt-3">
      {/* left: logo + repo selector */}
      {/* A+W1 touch: bumped py-1.5 → py-2 so the chrome reads ~40px tall on iPad. */}
      <div className="pointer-events-auto relative flex items-center gap-3 rounded-xl border border-hairlineSoft bg-panel px-2 py-2 shadow-panel">
        <a href={HOME_URL} title="Back to home">
          <Logo />
        </a>
        <div className="h-4 w-px bg-hairline" />
        <button
          onClick={() => setOpen((o) => !o)}
          /* A+W1 touch: py-1 → py-2 for fingertip targets. */
          className="flex items-center gap-1.5 rounded-md px-2 py-2 text-[12.5px] font-medium text-ink hover:bg-white/5"
        >
          <RepoIcon />
          <span data-testid="foldo-canvas-topbar-boardname">{repoName}</span>
          <Chevron />
        </button>
        <ConnectionDot status={wsStatus} offline={offline} />
        <McpChip connected={mcpConnected} />
        {open && (
          <div className="absolute left-2 top-12 w-60 rounded-lg border border-hairline bg-panel p-1 shadow-panel">
            <a
              href={HOME_URL}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-ink hover:bg-white/5"
            >
              <BoardsIcon /> All boards…
            </a>
            <div className="mt-1 border-t border-hairlineSoft pt-1">
              <a
                href="/home?new=1"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-inkMute hover:bg-white/5"
              >
                <PlusIcon /> Connect a repo…
              </a>
            </div>
          </div>
        )}
      </div>

      {/* right: capture, share, avatars */}
      <div className="pointer-events-auto flex items-center gap-2">
        {me && switchable.length > 1 && (
          <div className="relative">
            <button
              onClick={() => setUserPickerOpen((o) => !o)}
              title="Switch demo user (refresh required)"
              className="flex items-center gap-1.5 rounded-lg border border-hairlineSoft bg-panel px-2 py-1 text-[12px] text-ink hover:bg-white/5"
            >
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full text-[9.5px] font-semibold text-white"
                style={{ background: me.color }}
              >
                {me.initial}
              </span>
              <span>{me.name}</span>
              <Chevron />
            </button>
            {userPickerOpen && (
              <div className="absolute right-0 top-9 z-50 w-60 rounded-lg border border-hairline bg-panel p-1 shadow-panel">
                <div className="px-2 py-1 text-[10.5px] uppercase tracking-[0.1em] text-inkFaint">
                  Demo as
                </div>
                {switchable.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setUserPickerOpen(false);
                      onSwitchUser(u.id);
                    }}
                    className={
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] hover:bg-white/5 ' +
                      (u.id === meUserId ? 'text-ink' : 'text-inkMute')
                    }
                  >
                    <span
                      className="flex h-4 w-4 items-center justify-center rounded-full text-[9.5px] font-semibold text-white"
                      style={{ background: u.color }}
                    >
                      {u.initial}
                    </span>
                    <span className="flex-1 text-left">{u.name}</span>
                    {u.id === meUserId && <CheckIcon />}
                  </button>
                ))}
                <div className="border-t border-hairlineSoft px-2 py-1.5 text-[10.5px] text-inkFaint">
                  Open another window to demo multiplayer with a different user.
                </div>
              </div>
            )}
          </div>
        )}
        {/* A+W1 touch: py-1.5 → py-2 across the action chips for finger reach. */}
        <button
          data-testid="foldo-canvas-topbar-capture"
          onClick={onCapture}
          className="flex items-center gap-1.5 rounded-lg border border-hairlineSoft bg-panel px-2.5 py-2 text-[12px] text-ink hover:bg-white/5"
        >
          <ExtensionIcon /> Capture from URL
        </button>
        <button
          onClick={onOpenTests}
          title="Create unmoderated UX test links"
          className="flex items-center gap-1.5 rounded-lg border border-hairlineSoft bg-panel px-2.5 py-2 text-[12px] text-ink hover:bg-white/5"
        >
          <FlaskIcon /> Tests
        </button>
        <div className="relative inline-flex" ref={shareMenuRef}>
          <button
            data-testid="foldo-canvas-topbar-share"
            onClick={onShare}
            title="Copy this canvas URL to clipboard"
            className={
              'rounded-l-lg border px-2.5 py-2 text-[12px] transition-colors ' +
              (shared
                ? 'border-ok/40 bg-ok/15 text-ok'
                : 'border-hairlineSoft bg-panel text-ink hover:bg-white/5')
            }
          >
            {shared ? 'Copied!' : 'Share'}
          </button>
          <button
            data-testid="foldo-canvas-topbar-share-menu"
            onClick={() => setShareMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={shareMenuOpen}
            title="Manage share links"
            className={
              '-ml-px rounded-r-lg border border-l-0 px-1.5 py-2 text-[12px] transition-colors ' +
              'border-hairlineSoft bg-panel text-ink hover:bg-white/5'
            }
          >
            <Chevron />
          </button>
          {shareMenuOpen && (
            <div className="absolute right-0 top-9 z-50 w-52 rounded-lg border border-hairline bg-panel p-1 shadow-panel">
              <button
                type="button"
                data-testid="foldo-canvas-topbar-share-manage"
                onClick={() => {
                  setShareMenuOpen(false);
                  setShareMgmtOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-ink hover:bg-white/5"
              >
                Manage share links…
              </button>
              <div className="border-t border-hairlineSoft px-2 py-1 text-[10.5px] text-inkFaint">
                Revoke any active links to this board.
              </div>
            </div>
          )}
        </div>
        <PresenceAvatars
          meUserId={meUserId}
          followingUserId={followingUserId}
          onFollow={onFollow}
        />
      </div>

      <ShareManagementModal
        open={shareMgmtOpen}
        boardId={board?.id ?? null}
        onClose={() => setShareMgmtOpen(false)}
      />
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-1.5 pl-1.5">
      <img
        src="/foldo-mark.svg"
        alt="Foldo"
        width={26}
        height={26}
        draggable={false}
        style={{ display: 'block' }}
      />
      <span className="font-semibold tracking-tight text-ink">foldo</span>
    </div>
  );
}

function ConnectionDot({
  status,
  offline,
}: {
  status: Props['wsStatus'];
  offline: boolean;
}) {
  let color = '#7fd49a';
  let title = 'Live · connected';
  if (offline) {
    color = '#9a9a9a';
    title = 'Offline demo · using local mock data';
  } else if (status === 'connecting' || status === 'reconnecting') {
    color = '#f5b86b';
    title = 'Reconnecting…';
  } else if (status === 'closed') {
    color = '#9a9a9a';
    title = 'Disconnected';
  } else if (status === 'offline') {
    color = '#ef6f6f';
    title = 'Server unreachable';
  }
  return (
    <div
      title={title}
      className="ml-1 h-2 w-2 rounded-full"
      style={{ background: color, boxShadow: `0 0 6px ${color}` }}
    />
  );
}

function McpChip({ connected }: { connected: boolean }) {
  const color = connected ? '#7fd49a' : '#9a9a9a';
  const label = connected ? 'MCP live' : 'MCP offline · dispatches simulated';
  return (
    <span
      title={label}
      className="ml-1 inline-flex items-center gap-1 rounded-md border border-hairlineSoft px-1.5 py-0.5 text-[10.5px] text-inkMute"
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      />
      MCP
    </span>
  );
}

function BoardsIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function RepoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 2.5h8.5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4.5a1.5 1.5 0 0 1-1.5-1.5v-8a1.5 1.5 0 0 1 1.5-1.5z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M3 12a1.5 1.5 0 0 1 1.5-1.5H12.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function Chevron() {
  return (
    <svg width="9" height="9" viewBox="0 0 16 16">
      <path
        d="M4 6.5l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16">
      <path
        d="M8 3v10M3 8h10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16">
      <path
        d="M3.5 8.5l2.8 2.8 6.2-6.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function FlaskIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M6 2.5h4M6.8 2.5v4.2L3.8 12a1 1 0 0 0 .9 1.5h6.6a1 1 0 0 0 .9-1.5L9.2 6.7V2.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.4 9.5h5.2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
function ExtensionIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 6.5V11a1.5 1.5 0 0 0 1.5 1.5h6A1.5 1.5 0 0 0 12 11V6.5M3 6.5h9M3 6.5V5a1.5 1.5 0 0 1 1.5-1.5h1.25a1 1 0 0 0 1-.6c.1-.2.3-.4.6-.4h1.3c.3 0 .5.2.6.4.1.4.5.6 1 .6h1.25A1.5 1.5 0 0 1 12 5v1.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
