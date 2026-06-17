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

  // Broadcast a panel's open/closed state so external chrome (TopBar view
  // toggles) can reflect and drive it without a ref into the host.
  const emitChanged = (id: string, open: boolean) => {
    window.dispatchEvent(
      new CustomEvent('foldo:sidePanelChanged', { detail: { id, open } }),
    );
  };

  const setOpen = (id: string, open: boolean) => {
    setOpenIds((prev) => {
      if (open === prev.has(id)) return prev;
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      persistOpenState(id, open);
      return next;
    });
    emitChanged(id, open);
  };

  // Plugins / chrome drive panels via window events so they don't need a ref
  // into the host. Only panels owned by this slot react.
  useEffect(() => {
    const owns = (id?: string) => !!id && panels.some((p) => p.id === id);
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (owns(id)) setOpen(id, true);
    };
    const onToggle = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (owns(id)) setOpenIds((prev) => {
        const open = !prev.has(id);
        const next = new Set(prev);
        if (open) next.add(id); else next.delete(id);
        persistOpenState(id, open);
        emitChanged(id, open);
        return next;
      });
    };
    window.addEventListener('foldo:openSidePanel', onOpen);
    window.addEventListener('foldo:toggleSidePanel', onToggle);
    // Announce current state so late-mounting chrome can sync.
    for (const p of panels) emitChanged(p.id, persistedOpenState(p));
    return () => {
      window.removeEventListener('foldo:openSidePanel', onOpen);
      window.removeEventListener('foldo:toggleSidePanel', onToggle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels]);

  if (panels.length === 0) return null;

  const horizontalPos = slot === 'left' ? 'left-3' : 'right-3';

  return (
    <div
      className={`pointer-events-none absolute ${horizontalPos} top-16 bottom-16 z-30 flex flex-col items-stretch gap-2`}
    >
      {panels.map((p) =>
        openIds.has(p.id) ? (
          <OpenPanel key={p.id} plugin={p} onCollapse={() => setOpen(p.id, false)} />
        ) : null,
      )}
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
