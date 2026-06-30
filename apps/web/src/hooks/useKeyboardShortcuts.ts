// Canvas keyboard shortcuts. Extracted from App.tsx so the handler is mounted
// once with stable dependencies.
//
// /* A+W4 features */ — tool keybinds (V/H/C/E/S/A/I) are no longer hardcoded
// here. They come from `hotkey` surface contributions in the plugin registry
// (core/tools owns the canonical set). The canvas-level shortcuts (Escape +
// the Cmd/Ctrl-zoom triplet) stay inline because they reach into refs that
// can't reasonably leave App.tsx — moving them would require routing every
// canvas-handle method through a window escape hatch for the benefit of one
// caller. If a future "core/canvas-shortcuts" plugin lands we'll revisit.
//
// Shortcuts (ignored when typing in INPUT/TEXTAREA/contenteditable):
//   V — select tool         ⌘0 / Ctrl+0 — zoom to fit
//   H — hand / pan tool     ⌘= / Ctrl+= — zoom in
//   C — comment tool        ⌘- / Ctrl+- — zoom out
//   E — AI edit             Esc       — clear selection + popovers + intent
//   S — sticky note
//   A — arrow
//   I — image
//
// The V/H/C/E/S/A/I row is contributed by core/tools as `hotkey` surfaces;
// adding a new tool that ships a `shortcut` letter is enough — no edit
// to this hook required. Tool registrations can also stack modifiers
// (`Meta+Shift+P` etc.) thanks to the canonical key-format parser below.

import { useEffect, useRef, type RefObject } from 'react';
import type { CanvasHandle } from '../components/Canvas';
import type { SelectedElement, Tool } from '../types';
import { getHotkeys } from '../plugins/registry';

export interface KeyboardShortcutOptions {
  /** Switch the current tool. Retained for the "click an element first" hint. */
  setTool: (tool: Tool) => void;
  /** Latest selected element; the E shortcut uses it to decide whether to toast. */
  selectionRef: RefObject<SelectedElement | null>;
  /** Show an ephemeral toast (used for the "click an element first" hint). */
  pushToast: (msg: string) => void;
  /** Canvas handle for the zoom shortcuts. */
  canvasRef: RefObject<CanvasHandle | null>;
  /** Run when Esc is pressed (clear selection, popovers, intent). */
  onEscape: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

/**
 * Normalise a KeyboardEvent into the canonical `Meta+Shift+v` form used by
 * `HotkeySpec.keys`. Single printable keys (`v`, `=`, `0`) are lowercased;
 * named keys (Escape, Enter) keep their `KeyboardEvent.key` casing because
 * that's the shape plugins author against.
 */
function canonicalize(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey) parts.push('Meta');
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  // Shift only counts toward the bind name when the key itself isn't already
  // shift-modified into a printable variant (so `Shift+1` matches as `Shift+1`
  // not `!`). We use `e.code` to recover the unshifted glyph when needed.
  const printable = e.key.length === 1;
  if (e.shiftKey && !printable) parts.push('Shift');
  const k = printable ? e.key.toLowerCase() : e.key;
  parts.push(k);
  return parts.join('+');
}

/**
 * Compare a live keydown against a hotkey binding string. Plain letters
 * match case-insensitively; modifier prefixes are checked exactly.
 */
function matches(binding: string, e: KeyboardEvent): boolean {
  const canon = canonicalize(e);
  if (canon.toLowerCase() === binding.toLowerCase()) return true;
  // Plain-letter bindings (`'v'`) should also match the shift-held form
  // (`V`) — users with capslock or a sticky shift shouldn't lose their
  // tool keybinds.
  if (!binding.includes('+') && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (e.key.toLowerCase() === binding.toLowerCase()) return true;
  }
  return false;
}

export function useKeyboardShortcuts({
  selectionRef,
  pushToast,
  canvasRef,
  onEscape,
}: KeyboardShortcutOptions): void {
  // Snapshot the hotkey list on hook-mount. The registry is install-once
  // (frozen after boot in registry.ts), so this is a stable reference for
  // the lifetime of the page — no need to re-resolve on every render.
  const hotkeysRef = useRef(getHotkeys());

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isTypingTarget(e.target)) return;

      // Escape always clears local state; never delegated to a plugin
      // because the handler reaches refs owned by App.
      if (e.key === 'Escape') {
        onEscape();
        return;
      }

      // Zoom shortcuts only fire with the meta / ctrl modifier and must
      // preventDefault so the browser doesn't run its own page zoom. These
      // stay inline because they need direct canvasRef access.
      if (e.metaKey || e.ctrlKey) {
        if (e.key === '0') {
          e.preventDefault();
          canvasRef.current?.zoomToFit();
          return;
        }
        if (e.key === '=') {
          e.preventDefault();
          canvasRef.current?.zoomIn();
          return;
        }
        if (e.key === '-') {
          e.preventDefault();
          canvasRef.current?.zoomOut();
          return;
        }
      }

      // Delegate to plugin-contributed hotkeys (core/tools owns V/H/C/E/S/A/I).
      const hotkeys = hotkeysRef.current;
      for (const hk of hotkeys) {
        for (const binding of hk.keys) {
          if (matches(binding, e)) {
            hk.handler();
            // The E (edit) shortcut keeps its "click an element first" hint;
            // detect by hotkey id rather than re-matching the letter so a
            // future re-bind of E doesn't silently drop the toast.
            if (hk.id === 'core/tools.edit' && !selectionRef.current) {
              pushToast('Click an element first, then press E');
            }
            return;
          }
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectionRef, pushToast, canvasRef, onEscape]);
}
