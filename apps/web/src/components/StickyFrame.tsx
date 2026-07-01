import { useCallback, useEffect, useRef, useState } from 'react';
import type { Branch, Frame, StickyFrameContent } from '@foldo/protocol';
import { FrameMeta } from './FrameMeta';
import { updateFrame as apiUpdateFrame } from '../api/frames';
import { boardStore } from '../state/BoardStore';
import { notifyToast } from '../plugins/registry';

interface Props {
  frame: Frame;
  branch: Branch;
  zoom?: number;
}

const PALETTE: Record<string, { bg: string; ink: string; edge: string }> = {
  yellow: { bg: '#fff2a8', ink: '#3a2f00', edge: '#e9d96b' },
  pink: { bg: '#ffd0e4', ink: '#5a1136', edge: '#e7a8c4' },
  green: { bg: '#cdf3c8', ink: '#1f4f1a', edge: '#a6dba0' },
  blue: { bg: '#cfe4ff', ink: '#0d2f5c', edge: '#a8c8eb' },
  lilac: { bg: '#e0d3ff', ink: '#2e1668', edge: '#bba6e0' },
};

export function StickyFrame({ frame, branch, zoom = 1 }: Props) {
  const content = frame.content as StickyFrameContent;
  const palette = PALETTE[content.color ?? 'yellow'] ?? PALETTE.yellow;
  const [body, setBody] = useState(content.body ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync incoming server changes when we're not actively editing.
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setBody(content.body ?? '');
  }, [content.body]);

  const flush = useCallback(
    (next: string) => {
      // Build from the live store entry, not the captured prop — the frame
      // may have moved (drag or a WS frame.moved) in the 600ms since the
      // keystroke armed the debounce, and spreading the stale prop would
      // write the old position back into the store.
      const current = boardStore.getSnapshot().frames.get(frame.id) ?? frame;
      const prevContent = current.content as StickyFrameContent;
      if ((prevContent.body ?? '') === next) return;
      const nextContent: StickyFrameContent = { ...prevContent, body: next };
      boardStore.upsertFrame({ ...current, content: nextContent });
      apiUpdateFrame(frame.id, { content: nextContent }).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[foldo] sticky update failed', err);
        // Roll back the optimistic write — but only if it's still what's
        // showing, so a newer successful save or WS update isn't clobbered.
        // Merge only `body` into the LIVE content: restoring prevContent
        // wholesale would also revert concurrent changes to other content
        // fields (e.g. a color change that arrived over WS in between).
        const live = boardStore.getSnapshot().frames.get(frame.id);
        if (live && (live.content as StickyFrameContent).body === next) {
          boardStore.upsertFrame({
            ...live,
            content: {
              ...(live.content as StickyFrameContent),
              body: prevContent.body,
            },
          });
          if (!focusedRef.current) setBody(prevContent.body ?? '');
        }
        notifyToast('Failed to save sticky note');
      });
    },
    [frame],
  );

  return (
    <div
      className="absolute"
      style={{
        left: frame.position.x,
        top: frame.position.y,
        width: frame.size.width,
        height: frame.size.height,
      }}
    >
      <FrameMeta frame={frame} branch={branch} zoom={zoom} />
      <div
        style={{
          width: '100%',
          height: '100%',
          background: palette.bg,
          border: `1.5px solid ${palette.edge}`,
          borderRadius: 6,
          color: palette.ink,
          padding: '16px 18px',
          boxShadow:
            '0 1px 0 rgba(0,0,0,0.04), 0 18px 28px -22px rgba(17,17,17,0.45)',
          fontFamily:
            '"Inter", ui-sans-serif, system-ui, sans-serif',
          fontSize: 15,
          lineHeight: 1.45,
          overflow: 'hidden',
        }}
      >
        <textarea
          value={body}
          onFocus={() => {
            focusedRef.current = true;
          }}
          onBlur={() => {
            focusedRef.current = false;
            if (debounceRef.current) clearTimeout(debounceRef.current);
            flush(body);
          }}
          onChange={(e) => {
            const next = e.target.value;
            setBody(next);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => flush(next), 600);
          }}
          placeholder="Type a note…"
          style={{
            width: '100%',
            height: '100%',
            background: 'transparent',
            border: 0,
            outline: 'none',
            resize: 'none',
            color: 'inherit',
            font: 'inherit',
            padding: 0,
          }}
        />
      </div>
    </div>
  );
}
