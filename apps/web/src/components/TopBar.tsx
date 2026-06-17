import { useEffect, useState } from 'react';
import type { Board, UserId, User } from '@foldo/protocol';
import { PresenceAvatars } from '../multiplayer/PresenceAvatars';
import { useBoardSelector } from '../state/useBoardStore';
import { storageGetBool } from '../lib/storage';

const HOME_URL = '/home';

// Canonical demo personas shown in the "Demo as" picker (matches the demo
// identity allow-list in useBoardBootstrap). Keeps real signups / E2E test
// accounts out of the dropdown.
const DEMO_PERSONA_IDS = ['u-you', 'u-anna', 'u-mateo', 'u-priya'];

// One shared style for every top-bar control so the cluster reads as a single
// consistent set (same height, padding, border, radius, type).
const CTRL =
  'inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairlineSoft bg-panel px-2.5 text-[12px] text-ink transition-colors hover:bg-white/5';

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
  const users = useBoardSelector((s) => s.users);
  const mcpConnected = useBoardSelector((s) => s.mcpConnected);
  const me = meUserId ? users.get(meUserId) ?? null : null;
  // "Demo as" only offers the canonical demo personas — not real signups or
  // E2E test accounts that happen to be members of the board.
  const switchable: User[] = [];
  for (const id of DEMO_PERSONA_IDS) {
    const u = users.get(id);
    if (u && u.kind === 'human') switchable.push(u);
  }
  const repoName = board?.repoSlug ?? 'unloaded';

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
      <div className="pointer-events-auto relative flex items-center gap-3 rounded-xl border border-hairlineSoft bg-panel px-2 py-1.5 shadow-panel">
        <a href={HOME_URL} title="Back to home">
          <Logo />
        </a>
        <div className="h-4 w-px bg-hairline" />
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-medium text-ink hover:bg-white/5"
        >
          <RepoIcon />
          <span>{repoName}</span>
          <Chevron />
        </button>
        <StatusChip status={wsStatus} offline={offline} mcpConnected={mcpConnected} />
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

      {/* right: view toggles, capture, share, avatars */}
      <div className="pointer-events-auto flex items-center gap-2">
        <ViewToggles />
        {me && switchable.length > 1 && (
          <div className="relative">
            <button
              onClick={() => setUserPickerOpen((o) => !o)}
              title="Switch demo user (refresh required)"
              className={CTRL}
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
        <button onClick={onCapture} className={CTRL}>
          <ExtensionIcon /> Capture from URL
        </button>
        <button
          onClick={onOpenTests}
          title="Create unmoderated UX test links"
          className={CTRL}
        >
          <FlaskIcon /> Tests
        </button>
        <button
          onClick={onShare}
          title="Copy this canvas URL to clipboard"
          className={CTRL + (shared ? ' !border-ok/40 !bg-ok/15 !text-ok' : '')}
        >
          {shared ? 'Copied!' : 'Share'}
        </button>
        <PresenceAvatars
          meUserId={meUserId}
          followingUserId={followingUserId}
          onFollow={onFollow}
        />
      </div>
    </div>
  );
}

/**
 * Show/hide toggles for the Layers navigator (left) and Inspector (right).
 * State is mirrored from SidePanelHost via the `foldo:sidePanelChanged` event;
 * clicking dispatches `foldo:toggleSidePanel` which the host acts on.
 */
function ViewToggles() {
  const [openState, setOpenState] = useState(() => ({
    layers: storageGetBool('foldo:sidepanel:layers', false),
    design: storageGetBool('foldo:sidepanel:design', false),
  }));
  useEffect(() => {
    const onChanged = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; open: boolean }>).detail;
      if (!d) return;
      if (d.id === 'layers' || d.id === 'design') {
        setOpenState((p) => ({ ...p, [d.id]: d.open }));
      }
    };
    window.addEventListener('foldo:sidePanelChanged', onChanged);
    return () => window.removeEventListener('foldo:sidePanelChanged', onChanged);
  }, []);
  const toggle = (id: 'layers' | 'design') =>
    window.dispatchEvent(new CustomEvent('foldo:toggleSidePanel', { detail: { id } }));
  return (
    <div className="inline-flex h-8 items-center gap-0.5 rounded-lg border border-hairlineSoft bg-panel px-1">
      <ViewToggleButton label="Layers" active={openState.layers} onClick={() => toggle('layers')}>
        <LayersIcon />
      </ViewToggleButton>
      <ViewToggleButton label="Inspector" active={openState.design} onClick={() => toggle('design')}>
        <InspectIcon />
      </ViewToggleButton>
    </div>
  );
}

function ViewToggleButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={`${active ? 'Hide' : 'Show'} ${label}`}
      aria-label={`${active ? 'Hide' : 'Show'} ${label}`}
      aria-pressed={active}
      className={
        'flex h-7 w-7 items-center justify-center rounded-md transition-colors ' +
        (active ? 'bg-accent/15 text-accent' : 'text-inkMute hover:bg-white/5 hover:text-ink')
      }
    >
      {children}
    </button>
  );
}

function LayersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round">
      <path d="M8 2.2 14 5.3 8 8.4 2 5.3z" />
      <path d="M2.4 8.2 8 11.1l5.6-2.9M2.4 10.9 8 13.8l5.6-2.9" />
    </svg>
  );
}
function InspectIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round">
      <path d="M2.6 2.6h4M2.6 2.6v4M13.4 2.6h-4M13.4 2.6v4M2.6 13.4h4M2.6 13.4v-4M13.4 13.4h-4M13.4 13.4v-4" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </svg>
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

/**
 * Single combined status indicator: one dot + "MCP" label. The dot reflects
 * the realtime connection — green only when the canvas WS is live AND a Claude
 * MCP agent is connected; amber while reconnecting; red/grey when offline or
 * MCP is absent (dispatches then run on the simulator). Replaces the old
 * separate WS dot + MCP chip so there is just one status element.
 */
function StatusChip({
  status,
  offline,
  mcpConnected,
}: {
  status: Props['wsStatus'];
  offline: boolean;
  mcpConnected: boolean;
}) {
  let dot = '#7fd49a';
  let title = mcpConnected
    ? 'Live · MCP connected (real Claude)'
    : 'Live · MCP offline — dispatches simulated';
  if (offline) {
    dot = '#9a9a9a';
    title = 'Offline demo · local mock data';
  } else if (status === 'connecting' || status === 'reconnecting') {
    dot = '#f5b86b';
    title = 'Reconnecting…';
  } else if (status === 'closed') {
    dot = '#9a9a9a';
    title = 'Disconnected';
  } else if (status === 'offline') {
    dot = '#ef6f6f';
    title = 'Server unreachable';
  } else if (!mcpConnected) {
    dot = '#9a9a9a';
  }
  return (
    <span
      title={title}
      className="ml-1 inline-flex items-center gap-1.5 rounded-md border border-hairlineSoft px-1.5 py-0.5 text-[10.5px] text-inkMute"
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: dot, boxShadow: `0 0 6px ${dot}` }}
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
