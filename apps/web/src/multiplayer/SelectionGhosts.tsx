// Translucent dashed outlines around the frames other users have selected.
// We don't (yet) know the in-frame element bounds for remote selections, so we
// outline the entire selected frame as a soft cue — same color as the user.

import { memo } from 'react';
import type { UserId } from '@foldo/protocol';
import { useBoardSelector } from '../state/useBoardStore';

interface Props {
  meUserId: UserId | null;
}

export const SelectionGhosts = memo(function SelectionGhosts({
  meUserId,
}: Props) {
  const presence = useBoardSelector((s) => s.presence);
  const frames = useBoardSelector((s) => s.frames);

  const ghosts: Array<{
    userId: string;
    name: string;
    color: string;
    frameId: string;
  }> = [];
  for (const p of presence.values()) {
    if (!p.online) continue;
    if (p.userId === meUserId) continue;
    if (!p.selection) continue;
    ghosts.push({
      userId: p.userId,
      name: p.name,
      color: p.color,
      frameId: p.selection.frameId,
    });
  }
  if (!ghosts.length) return null;

  return (
    <>
      {ghosts.map((g) => {
        const f = frames.get(g.frameId);
        if (!f) return null;
        return (
          <div
            key={g.userId + g.frameId}
            className="pointer-events-none absolute"
            style={{
              left: f.position.x - 4,
              top: f.position.y - 4,
              width: f.size.width + 8,
              height: f.size.height + 8,
              border: `1.5px dashed ${g.color}`,
              borderRadius: 8,
              boxShadow: `0 0 0 3px ${withAlpha(g.color, 0.1)}`,
              zIndex: 5,
            }}
          >
            <div
              className="absolute -top-5 left-0 inline-block max-w-[160px] truncate rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
              style={{ background: g.color }}
            >
              {g.name}
            </div>
          </div>
        );
      })}
    </>
  );
});

function withAlpha(hex: string, alpha: number): string {
  // hex → rgba(); supports #rrggbb only (the protocol stores hex colors)
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
