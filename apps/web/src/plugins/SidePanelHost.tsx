// Renders SidePanelPlugin contributions for a given dock slot. Only one panel
// per slot is visible at a time; if multiple plugins register on the same slot
// they are stacked as tabs along the panel's top edge. Each plugin gets its
// own collapsed/open state, persisted in localStorage.

import { useEffect, useMemo, useState } from 'react';
import type { SidePanelPlugin } from '@foldo/plugin-api';
import { registry } from './registry';
import { storageGetBool, storageSetBool } from '../lib/storage';

const STORAGE_PREFIX = 'foldo:sidepanel:';

function persistedOpenState(p: SidePanelPlugin): boolean {
  return storageGetBool(STORAGE_PREFIX + p.id, p.defaultOpen ?? false);
}

function persistOpenState(id: string, open: boolean): void {
  storageSetBool(STORAGE_PREFIX + id, open);
}

interface Props {
  slot: 'left' | 'right';
  /**
   * Called whenever the open count changes so the host (App) can shift the
   * LeftRail to bottom orientation when any panel is open on the left.
   */
  onOpenStateChange?: (anyOpen: boolean) => void;
}

export function SidePanelHost({ slot, onOpenStateChange }: Props) {
  const panels = useMemo(() => registry.listSidePanels(slot), [slot]);
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const p of panels) {
      if (persistedOpenState(p)) initial.add(p.id);
    }
    return initial;
  });

  useEffect(() => {
    onOpenStateChange?.(openIds.size > 0);
  }, [openIds, onOpenStateChange]);

  // Plugins can request a panel open via a window event so they don't need a
  // ref into the host. Only panels for this slot react.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (!detail?.id) return;
      const plugin = panels.find((p) => p.id === detail.id);
      if (!plugin) return;
      setOpenIds((prev) => {
        if (prev.has(detail.id)) return prev;
        const next = new Set(prev);
        next.add(detail.id);
        persistOpenState(detail.id, true);
        return next;
      });
    };
    window.addEventListener('foldo:openSidePanel', onOpen);
    return () => window.removeEventListener('foldo:openSidePanel', onOpen);
  }, [panels]);

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        persistOpenState(id, false);
      } else {
        next.add(id);
        persistOpenState(id, true);
      }
      return next;
    });
  };

  if (panels.length === 0) return null;

  // For v1, render each open panel as a stacked column. The Layers plugin is
  // the only left-slot contributor right now, so this collapses to a single
  // panel + a small launcher strip when collapsed.

  const horizontalPos = slot === 'left' ? 'left-3' : 'right-3';

  return (
    <div
      className={`pointer-events-none absolute ${horizontalPos} top-16 bottom-16 z-30 flex flex-col items-stretch gap-2`}
    >
      {panels.map((p) => {
        const open = openIds.has(p.id);
        return open ? (
          <OpenPanel
            key={p.id}
            plugin={p}
            onCollapse={() => toggle(p.id)}
          />
        ) : (
          <CollapsedLauncher
            key={p.id}
            plugin={p}
            onExpand={() => toggle(p.id)}
          />
        );
      })}
    </div>
  );
}

function OpenPanel({
  plugin,
  onCollapse,
}: {
  plugin: SidePanelPlugin;
  onCollapse: () => void;
}) {
  const Body = plugin.Component;
  const w = plugin.defaultWidth ?? 260;
  return (
    <div
      className="pointer-events-auto flex h-full flex-col rounded-xl border border-hairlineSoft bg-panel shadow-panel"
      style={{ width: w }}
    >
      <div className="flex items-center justify-between border-b border-hairlineSoft px-3 py-2">
        <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
          {plugin.Icon && <plugin.Icon size={14} />}
          <span>{plugin.label}</span>
        </div>
        <button
          onClick={onCollapse}
          aria-label="Collapse panel"
          title="Collapse"
          className="touch-target flex h-6 w-6 items-center justify-center rounded-md text-inkMute hover:bg-white/5 hover:text-ink"
        >
          <ChevronLeft />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Body />
      </div>
    </div>
  );
}

function CollapsedLauncher({
  plugin,
  onExpand,
}: {
  plugin: SidePanelPlugin;
  onExpand: () => void;
}) {
  return (
    <button
      onClick={onExpand}
      title={plugin.label}
      aria-label={`Open ${plugin.label}`}
      className="touch-target pointer-events-auto flex h-9 w-9 items-center justify-center rounded-lg border border-hairlineSoft bg-panel text-inkMute shadow-panel hover:text-ink"
    >
      {plugin.Icon ? <plugin.Icon size={14} /> : <ChevronRight />}
    </button>
  );
}

function ChevronLeft() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <path
        d="M10 4l-4 4 4 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ChevronRight() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
