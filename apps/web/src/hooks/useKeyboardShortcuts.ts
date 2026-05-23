// Canvas keyboard shortcuts. Extracted from App.tsx so the handler is mounted
// once with stable dependencies, and so the tool ↔ keyboard binding has a
// single home (it'll move into the plugin substrate in Phase 4 — at that
// point this hook becomes the implementation of the `core/shortcuts` plugin).
//
// Shortcuts (ignored when typing in INPUT/TEXTAREA/contenteditable):
//   V — select tool         ⌘0 / Ctrl+0 — zoom to fit
//   H — hand / pan tool     ⌘= / Ctrl+= — zoom in
//   C — comment tool        ⌘- / Ctrl+- — zoom out
//   E — AI edit             Esc       — clear selection + popovers + intent
//   S — sticky note
//   A — arrow
//   I — image

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

      switch (e.key) {
        case 'v':
        case 'V':
          setTool('select');
          return;
        case 'h':
        case 'H':
          setTool('hand');
          return;
        case 'c':
        case 'C':
          setTool('comment');
          return;
        case 'e':
        case 'E':
          setTool('edit');
          if (!selectionRef.current) {
            pushToast('Click an element first, then press E');
          }
          return;
        case 's':
        case 'S':
          setTool('sticky');
          return;
        case 'a':
        case 'A':
          setTool('arrow');
          return;
        case 'i':
        case 'I':
          setTool('image');
          return;
        case 'Escape':
          onEscape();
          return;
      }

      // Zoom shortcuts only fire with the meta / ctrl modifier and must
      // preventDefault so the browser doesn't run its own page zoom.
      if (e.metaKey || e.ctrlKey) {
        if (e.key === '0') {
          e.preventDefault();
          canvasRef.current?.zoomToFit();
        } else if (e.key === '=') {
          e.preventDefault();
          canvasRef.current?.zoomIn();
        } else if (e.key === '-') {
          e.preventDefault();
          canvasRef.current?.zoomOut();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTool, selectionRef, pushToast, canvasRef, onEscape]);
}
