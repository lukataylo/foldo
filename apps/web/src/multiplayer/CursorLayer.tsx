// Renders other users' cursors at world coordinates.
// Placed *inside* the transformed canvas layer so coords scale with zoom.
// Each cursor smoothly interpolates between received positions via a CSS transition.

import { memo } from 'react';
import type { PresenceUser, UserId } from '@foldo/protocol';
import { useBoardSelector } from '../state/useBoardStore';

interface Props {
  /** Don't render your own cursor. */
  meUserId: UserId | null;
  zoom: number;
}

export const CursorLayer = memo(function CursorLayer({ meUserId, zoom }: Props) {
  const presence = useBoardSelector((s) => s.presence);
  const others: PresenceUser[] = [];
  for (const p of presence.values()) {
    if (!p.online) continue;
    if (p.userId === meUserId) continue;
    if (!p.cursor) continue;
    others.push(p);
  }
  if (!others.length) return null;
  return (
    <>
      {others.map((p) => (
        <RemoteCursor key={p.userId} user={p} zoom={zoom} />
      ))}
    </>
  );
});

function RemoteCursor({ user, zoom }: { user: PresenceUser; zoom: number }) {
  const { cursor, color, name } = user;
  if (!cursor) return null;
  // The transform is applied in world units; we counter-scale so the cursor
  // glyph stays visually the same size at any zoom level.
  const invZoom = 1 / Math.max(0.05, zoom);
  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-[55]"
      style={{
        transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
        transition: 'transform 80ms linear',
        willChange: 'transform',
      }}
    >
      <div
        style={{
          transform: `scale(${invZoom})`,
          transformOrigin: '0 0',
        }}
      >
        <svg width="20" height="22" viewBox="0 0 20 22" fill="none">
          <path
            d="M2 2L17 10.5L9.2 12.4L5.6 19.6Z"
            fill={color}
            stroke="white"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
        <div
          className="ml-3 -mt-1 inline-block max-w-[140px] truncate rounded-md px-1.5 py-0.5 text-[10.5px] font-medium text-white shadow-md"
          style={{ background: color }}
        >
          {name}
        </div>
      </div>
    </div>
  );
}
