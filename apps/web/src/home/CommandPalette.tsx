import { useEffect, useMemo, useRef, useState } from 'react';
import { INK, SOFT_GREY, YELLOW } from '../marketing/shared';
import type { HomeBoardSummary } from './api';
import { IconSearch } from './icons';

interface CommandPaletteProps {
  boards: HomeBoardSummary[];
  onOpenBoard: (id: string) => void;
  onNewBoard: () => void;
}

type CommandItem =
  | { kind: 'board'; id: string; label: string; sub: string }
  | { kind: 'action'; id: string; label: string; sub: string; run: () => void };

export function CommandPalette({ boards, onOpenBoard, onNewBoard }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global ⌘K / Ctrl-K trigger.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Focus the input when opening.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // Defer so the autoFocus prop sticks even when re-mounting fast.
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  const items = useMemo<CommandItem[]>(() => {
    const q = query.trim().toLowerCase();
    const boardItems: CommandItem[] = boards.map((b) => ({
      kind: 'board' as const,
      id: b.id,
      label: b.name,
      sub: `${b.repoSlug} · ${b.branchCount} branch${b.branchCount === 1 ? '' : 'es'}`,
    }));
    const actionItems: CommandItem[] = [
      {
        kind: 'action' as const,
        id: 'new-board',
        label: 'New board',
        sub: 'Connect a repo and start a fresh canvas',
        run: onNewBoard,
      },
      {
        kind: 'action' as const,
        id: 'settings',
        label: 'Account & settings',
        sub: 'Profile · Password · Sessions · Billing',
        run: () => window.location.assign('/settings'),
      },
      {
        kind: 'action' as const,
        id: 'docs',
        label: 'Open docs',
        sub: 'How Foldo works · MCP · self-host',
        run: () => window.location.assign('/docs'),
      },
    ];
    const all = [...boardItems, ...actionItems];
    if (!q) return all;
    const scored = all
      .map((it) => {
        const hay = `${it.label} ${it.sub}`.toLowerCase();
        const idx = hay.indexOf(q);
        return { it, score: idx };
      })
      .filter((s) => s.score >= 0)
      .sort((a, b) => a.score - b.score);
    return scored.map((s) => s.it);
  }, [boards, query, onNewBoard]);

  // Clamp activeIndex when the filtered list shrinks.
  useEffect(() => {
    if (activeIndex >= items.length) setActiveIndex(Math.max(0, items.length - 1));
  }, [items.length, activeIndex]);

  if (!open) return null;

  const choose = (item: CommandItem): void => {
    setOpen(false);
    if (item.kind === 'board') {
      onOpenBoard(item.id);
    } else {
      item.run();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(17,17,17,0.45)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          background: '#fff',
          border: `1.5px solid ${SOFT_GREY}`,
          borderRadius: 14,
          boxShadow: '0 30px 60px -20px rgba(17,17,17,0.4)',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'relative' }}>
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#9a9a9a',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 18,
              height: 18,
            }}
          >
            <IconSearch size={18} />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a board, run a command…"
            style={{
              width: '100%',
              padding: '14px 16px 14px 40px',
              fontSize: 15,
              border: 0,
              outline: 'none',
              color: INK,
              background: 'transparent',
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((i) => Math.min(items.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const it = items[activeIndex];
                if (it) choose(it);
              }
            }}
          />
        </div>
        <div
          style={{
            borderTop: `1px solid ${SOFT_GREY}`,
            maxHeight: 360,
            overflowY: 'auto',
          }}
        >
          {items.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: '#999', fontSize: 13.5 }}>
              No matches. Try a different query.
            </div>
          )}
          {items.map((it, idx) => (
            <button
              key={`${it.kind}:${it.id}`}
              type="button"
              onClick={() => choose(it)}
              onMouseEnter={() => setActiveIndex(idx)}
              style={{
                width: '100%',
                textAlign: 'left',
                background: idx === activeIndex ? YELLOW : 'transparent',
                border: 0,
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
              }}
            >
              <span
                aria-hidden
                style={{ width: 18, textAlign: 'center', color: idx === activeIndex ? INK : '#888' }}
              >
                {it.kind === 'board' ? '▣' : '⌘'}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, color: INK }}>{it.label}</div>
                <div style={{ fontSize: 12, color: idx === activeIndex ? '#333' : '#888' }}>{it.sub}</div>
              </span>
              <span style={{ fontSize: 11, color: idx === activeIndex ? '#333' : '#aaa' }}>
                {it.kind === 'board' ? 'open' : 'run'}
              </span>
            </button>
          ))}
        </div>
        <div
          style={{
            borderTop: `1px solid ${SOFT_GREY}`,
            padding: '8px 16px',
            fontSize: 11.5,
            color: '#888',
            display: 'flex',
            gap: 14,
          }}
        >
          <span>↵ select</span>
          <span>↑↓ navigate</span>
          <span>esc close</span>
          <span style={{ marginLeft: 'auto' }}>⌘K to toggle</span>
        </div>
      </div>
    </div>
  );
}
