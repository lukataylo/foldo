// Layers panel plugin — Figma-style stack of frames, top-most first.
// Click a row to fit-to + select; toggle the eye to hide; toggle the lock to
// disable pointer interaction. Reorder is exposed as Move up / Move down for
// v1 — full drag-to-reorder will come later.

import { useCallback, useMemo } from 'react';
import type { Frame } from '@foldo/protocol';
import type { FoldoPlugin } from '@foldo/plugin-api';
import { boardStore, useBoardSnapshot } from '../../state/useBoardStore';
import { updateFrame as apiUpdateFrame } from '../../api/frames';
import { registry } from '../registry';

function compareFramesForLayer(a: Frame, b: Frame): number {
  // Higher z first; tiebreak by createdAt descending so newer frames stack
  // above older ones when z hasn't been explicitly set.
  const az = a.z ?? 0;
  const bz = b.z ?? 0;
  if (az !== bz) return bz - az;
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}

function layerLabelFor(frame: Frame): string {
  const plugin = registry.getFrameKind(frame.kind);
  if (plugin?.layerLabel) return plugin.layerLabel(frame);
  if (plugin?.label) return plugin.label;
  return frame.kind;
}

function LayersPanel() {
  const snap = useBoardSnapshot();
  const frames = useMemo(
    () => Array.from(snap.frames.values()).sort(compareFramesForLayer),
    [snap.frames],
  );

  const setHidden = useCallback((frame: Frame, hidden: boolean) => {
    boardStore.upsertFrame({ ...frame, hidden });
    void apiUpdateFrame(frame.id, { hidden }).catch(() => {
      // Roll back optimistic change.
      boardStore.upsertFrame({ ...frame, hidden: frame.hidden });
    });
  }, []);

  const setLocked = useCallback((frame: Frame, locked: boolean) => {
    boardStore.upsertFrame({ ...frame, locked });
    void apiUpdateFrame(frame.id, { locked }).catch(() => {
      boardStore.upsertFrame({ ...frame, locked: frame.locked });
    });
  }, []);

  const swapZ = useCallback(
    (a: Frame, b: Frame) => {
      const az = a.z ?? 0;
      const bz = b.z ?? 0;
      // If they share z, just bump `a` to b+1 so the swap is observable.
      const nextA = az === bz ? bz + 1 : bz;
      const nextB = az === bz ? bz : az;
      boardStore.upsertFrame({ ...a, z: nextA });
      boardStore.upsertFrame({ ...b, z: nextB });
      void apiUpdateFrame(a.id, { z: nextA }).catch(() => {});
      void apiUpdateFrame(b.id, { z: nextB }).catch(() => {});
    },
    [],
  );

  const onFocus = useCallback((frame: Frame) => {
    // Dispatch a synthetic event the host listens for (App.tsx adds a
    // `focusFrameById` window event handler at boot). Keeps the layers
    // plugin from needing direct refs into the canvas.
    window.dispatchEvent(
      new CustomEvent('foldo:focusFrame', { detail: { id: frame.id } }),
    );
  }, []);

  if (!snap.hydrated) {
    return (
      <div className="px-3 py-4 text-[11.5px] text-inkFaint">Loading…</div>
    );
  }

  if (frames.length === 0) {
    return (
      <div className="px-3 py-4 text-[11.5px] text-inkFaint">
        No frames yet. Add a sticky or capture a URL to see layers here.
      </div>
    );
  }

  return (
    <div className="py-1.5">
      {frames.map((f, idx) => {
        const above = frames[idx - 1];
        const below = frames[idx + 1];
        return (
          <LayerRow
            key={f.id}
            frame={f}
            canMoveUp={!!above}
            canMoveDown={!!below}
            onMoveUp={() => above && swapZ(f, above)}
            onMoveDown={() => below && swapZ(f, below)}
            onToggleHide={() => setHidden(f, !f.hidden)}
            onToggleLock={() => setLocked(f, !f.locked)}
            onFocus={() => onFocus(f)}
          />
        );
      })}
    </div>
  );
}

function LayerRow({
  frame,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onToggleHide,
  onToggleLock,
  onFocus,
}: {
  frame: Frame;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleHide: () => void;
  onToggleLock: () => void;
  onFocus: () => void;
}) {
  const label = layerLabelFor(frame);
  const hidden = frame.hidden === true;
  const locked = frame.locked === true;
  return (
    <div
      data-layer-frame-id={frame.id}
      data-layer-frame-kind={frame.kind}
      className="group flex items-center gap-1 px-2 py-1 hover:bg-white/5"
    >
      <button
        onClick={onFocus}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <KindGlyph kind={frame.kind} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11.5px] text-ink">{label}</div>
          <div className="truncate text-[10px] text-inkFaint">
            {frame.kind} · z={frame.z ?? 0}
          </div>
        </div>
      </button>
      <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100">
        <IconButton title="Move up" onClick={onMoveUp} disabled={!canMoveUp}>
          <ChevronUp />
        </IconButton>
        <IconButton
          title="Move down"
          onClick={onMoveDown}
          disabled={!canMoveDown}
        >
          <ChevronDown />
        </IconButton>
        <IconButton
          title={hidden ? 'Show' : 'Hide'}
          onClick={onToggleHide}
          active={hidden}
        >
          {hidden ? <EyeOff /> : <Eye />}
        </IconButton>
        <IconButton
          title={locked ? 'Unlock' : 'Lock'}
          onClick={onToggleLock}
          active={locked}
        >
          {locked ? <LockClosed /> : <LockOpen />}
        </IconButton>
      </div>
    </div>
  );
}

function IconButton({
  title,
  onClick,
  disabled,
  active,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={
        'touch-target flex h-6 w-6 items-center justify-center rounded text-inkMute hover:bg-white/5 hover:text-ink disabled:opacity-30 ' +
        (active ? 'text-accent' : '')
      }
    >
      {children}
    </button>
  );
}

function KindGlyph({ kind }: { kind: string }) {
  const palette: Record<string, string> = {
    app: '#7fd49a',
    markdown: '#c8a6e5',
    sticky: '#FDE48A',
    arrow: '#9a9a9a',
    image: '#84c4ff',
    test_summary: '#ff7849',
    test_session: '#ff9b6e',
  };
  const color = palette[kind] ?? '#666666';
  return (
    <span
      className="inline-block h-3.5 w-3.5 shrink-0 rounded-[3px]"
      style={{ background: color }}
    />
  );
}

function ChevronUp() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
      <path
        d="M4 10l4-4 4 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
function ChevronDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
function Eye() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <path
        d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function EyeOff() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 2l12 12M3.2 6.2C2.1 7.3 1.5 8 1.5 8s2.5 4.5 6.5 4.5c1 0 1.9-.3 2.6-.6M6.5 4c.5-.1 1-.2 1.5-.2 4 0 6.5 4.2 6.5 4.2s-.6.9-1.6 2"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}
function LockClosed() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <rect
        x="3"
        y="7"
        width="10"
        height="7"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M5 7V5a3 3 0 0 1 6 0v2"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}
function LockOpen() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <rect
        x="3"
        y="7"
        width="10"
        height="7"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M5 7V5a3 3 0 0 1 6 0"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function LayersIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M8 2l6 3-6 3-6-3 6-3z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M2 8l6 3 6-3M2 11l6 3 6-3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const layersPlugin: FoldoPlugin = {
  id: 'foldo:layers',
  register(api) {
    api.registerSidePanel({
      id: 'layers',
      slot: 'left',
      label: 'Layers',
      Icon: LayersIcon,
      defaultOpen: false,
      defaultWidth: 240,
      Component: LayersPanel,
    });
  },
};
