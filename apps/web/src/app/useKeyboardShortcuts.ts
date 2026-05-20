// Keyboard shortcuts, extracted from App.tsx: registry-driven tool shortcuts,
// Escape (clear selection / popover / intent), and zoom keys.

import { useEffect, useRef } from 'react';
import { registry } from '../plugins/registry';
import type { CanvasHandle } from '../components/Canvas';
import type { SelectedElement, Tool } from '../types';

interface UseKeyboardShortcutsArgs {
  canvasRef: React.RefObject<CanvasHandle | null>;
  selectedElement: SelectedElement | null;
  setTool: (t: Tool) => void;
  onEscape: () => void;
  toast: (msg: string) => void;
}

export function useKeyboardShortcuts({
  canvasRef,
  selectedElement,
  setTool,
  onEscape,
  toast,
}: UseKeyboardShortcutsArgs): void {
  // Keep a ref to the live selection so the keyboard handler (mounted once)
  // can read the latest value without re-binding.
  const selectionRef = useRef<SelectedElement | null>(null);
  useEffect(() => {
    selectionRef.current = selectedElement;
  }, [selectedElement]);

  // Stable refs for the callbacks so the listener can stay mounted once.
  const setToolRef = useRef(setTool);
  const onEscapeRef = useRef(onEscape);
  const toastRef = useRef(toast);
  useEffect(() => {
    setToolRef.current = setTool;
    onEscapeRef.current = onEscape;
    toastRef.current = toast;
  }, [setTool, onEscape, toast]);

  useEffect(() => {
    // Build a {shortcut → tool id} table from the plugin registry so any
    // plugin-contributed tool's shortcut works without editing this file.
    const shortcutTable = new Map<string, string>();
    for (const t of registry.listTools()) {
      if (t.shortcut) shortcutTable.set(t.shortcut.toLowerCase(), t.id);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable)
          return;
      }
      const key = e.key.toLowerCase();
      const toolId = shortcutTable.get(key);
      if (toolId) {
        setToolRef.current(toolId);
        if (toolId === 'edit' && !selectionRef.current) {
          toastRef.current('Click an element first, then press E');
        }
        return;
      }
      if (e.key === 'Escape') {
        onEscapeRef.current();
      } else if (e.key === '0' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        canvasRef.current?.zoomToFit();
      } else if (e.key === '=' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        canvasRef.current?.zoomIn();
      } else if (e.key === '-' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        canvasRef.current?.zoomOut();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canvasRef]);
}
