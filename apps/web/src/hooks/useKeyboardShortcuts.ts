// Canvas keyboard shortcuts. Extracted from App.tsx so the handler is mounted
// once with stable dependencies.
//
// Shortcuts (ignored when typing in INPUT/TEXTAREA/contenteditable):
//   V — select tool         ⌘0 / Ctrl+0 — zoom to fit
//   H — hand / pan tool     ⌘= / Ctrl+= — zoom in
//   C — comment tool        ⌘- / Ctrl+- — zoom out
//   E — AI edit             Esc       — clear selection + popovers + intent

import { useEffect, type RefObject } from 'react';
import type { CanvasHandle } from '../components/Canvas';
import type { SelectedElement, Tool } from '../types';

export interface KeyboardShortcutOptions {
  /** Switch the current tool. */
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

/** Hardcoded tool keybinds — the plugin hotkey registry is gone. */
const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  h: 'hand',
  c: 'comment',
  e: 'edit',
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

export function useKeyboardShortcuts({
  setTool,
  selectionRef,
  pushToast,
  canvasRef,
  onEscape,
}: KeyboardShortcutOptions): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isTypingTarget(e.target)) return;

      // Escape always clears local state.
      if (e.key === 'Escape') {
        onEscape();
        return;
      }

      // Zoom shortcuts only fire with the meta / ctrl modifier and must
      // preventDefault so the browser doesn't run its own page zoom.
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
        return;
      }
      if (e.altKey) return;

      const tool = TOOL_KEYS[e.key.toLowerCase()];
      if (tool) {
        setTool(tool);
        // The E (edit) shortcut keeps its "click an element first" hint.
        if (tool === 'edit' && !selectionRef.current) {
          pushToast('Click an element first, then press E');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTool, selectionRef, pushToast, canvasRef, onEscape]);
}
