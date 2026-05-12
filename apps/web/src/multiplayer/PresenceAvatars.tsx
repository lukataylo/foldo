// Live avatar strip in the top bar.
// Online users render at full opacity, offline at 50%.
// Hover reveals a "follow" affordance: clicking starts/stops follow-me.

import { memo } from 'react';
import type { PresenceUser, UserId } from '@foldo/protocol';
import { useBoardSelector } from '../state/useBoardStore';

interface Props {
  meUserId: UserId | null;
  followingUserId: UserId | null;
  onFollow: (userId: UserId | null) => void;
}

export const PresenceAvatars = memo(function PresenceAvatars({
  meUserId,
  followingUserId,
  onFollow,
}: Props) {
  const presence = useBoardSelector((s) => s.presence);
  const users = useBoardSelector((s) => s.users);
  const items: PresenceUser[] = [];
  for (const p of presence.values()) items.push(p);
  // Pin "me" first if present
  items.sort((a, b) => {
    if (a.userId === meUserId) return -1;
    if (b.userId === meUserId) return 1;
    if (a.online !== b.online) return a.online ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  if (!items.length) return null;

  return (
    <div className="ml-1 flex -space-x-1.5">
      {items.map((p) => {
        const isMe = p.userId === meUserId;
        const isFollowing = followingUserId === p.userId;
        const u = users.get(p.userId);
        const isAgent = u?.kind === 'agent';
        return (
          <button
            key={p.userId}
            title={
              isAgent
                ? `${p.name} (agent)`
                : isMe
                  ? `${p.name} (you)`
                  : `${p.name}${isFollowing ? ' · following' : ''}`
            }
            onClick={() => {
              if (isMe) return;
              onFollow(isFollowing ? null : p.userId);
            }}
            className={
              'group relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-canvas text-[11px] font-semibold text-white transition-transform hover:translate-y-[-1px] ' +
              (p.online ? '' : 'opacity-50')
            }
            style={{
              background: p.color,
              outline: isFollowing ? `2px solid #ff7849` : 'none',
              outlineOffset: 1,
            }}
          >
            {p.initial}
            {isAgent && (
              <span
                className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full border border-canvas bg-panel"
                title="Agent"
              >
                <BotMini />
              </span>
            )}
            {!isMe && !isAgent && (
              <span
                className="pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-panel px-1.5 py-0.5 text-[10px] text-inkMute opacity-0 transition-opacity group-hover:opacity-100"
                style={{ color: isFollowing ? '#ff7849' : '#9a9a9a' }}
              >
                {isFollowing ? 'stop following' : 'follow'}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});

function BotMini() {
  return (
    <svg width="7" height="7" viewBox="0 0 16 16" fill="none">
      <rect
        x="3"
        y="5.5"
        width="10"
        height="7"
        rx="1.5"
        stroke="#ff7849"
        strokeWidth="1.4"
      />
      <circle cx="6" cy="9" r="0.9" fill="#ff7849" />
      <circle cx="10" cy="9" r="0.9" fill="#ff7849" />
      <path d="M8 5.5V3" stroke="#ff7849" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
