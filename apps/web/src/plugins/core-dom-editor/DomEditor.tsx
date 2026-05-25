// DOM Editor panel body. Renders inside the `rightPanel` slot via the
// core/dom-editor plugin (see index.tsx).
//
// Flow (a+w4):
//   1. User clicks "Pick element" (or hits Cmd+Shift+I) → bridge
//      broadcasts a versioned pick request to every iframe on the page.
//   2. The iframe-side handler (apps/sample-app/src/inspect-listener.ts)
//      replies with `foldo:inspect:picked` carrying a selector and a
//      computed-style snapshot. If the message is malformed or the
//      iframe is cross-origin, it replies with `foldo:inspect:error`
//      instead — the panel surfaces the error inline.
//   3. Cmd-click on additional elements adds them to the selection;
//      subsequent edits broadcast to every selected selector.
//   4. The panel renders Figma-style controls populated from the
//      computed style, grouped into collapsible <fieldset> sections.
//      Every edit runs through `validateCssValue`; invalid values
//      paint a red border on the input and skip the broadcast.
//   5. Each successful edit is pushed onto an `undoStack`. "Undo last"
//      pops one change and broadcasts a `revert` for the affected
//      property; "Reset all" walks the stack and reverts everything.
//      Cmd+Z (while the panel has focus) drives the same undo path.
//   6. "Save to source" opens a confirmation modal showing the
//      selector + before/after diff. Confirming kicks the existing
//      dispatch flow (apiCreateDispatch) with a synthesised intent
//      string — the dispatch.status events feed the existing
//      EditPanel UI elsewhere on the canvas. Failures surface inline
//      in the DOM Editor panel; the overrides are kept intact so the
//      user can retry.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createDispatch as apiCreateDispatch } from '../../api/dispatches';
import { boardStore } from '../../state/useBoardStore';
import { selectionStore } from '../../state/selectionStore';
import { findStubWorktree } from '../core-worktrees/WorktreesPanel';
import type { CreateDispatchRequest } from '@foldo/protocol';
import {
  broadcastToFrames,
  controlsToStyles,
  EMPTY_CONTROLS,
  extractControls,
  makeApplyMessage,
  makePickMessage,
  makeRevertMessage,
  onInspectError,
  onPicked,
  type DomEditorControls,
  type InspectErrorMessage,
} from './inspect-bridge';
import { validateCssValue } from './cssValidate';
import { AllPropertyGroups } from './PropertyGroups';

// ---------- Styles (dark, 12px — matches SidePanel's tab strip) ----------

const stack: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };

const buttonBase: CSSProperties = {
  fontSize: 12,
  padding: '6px 10px',
  minHeight: 28,
  borderRadius: 4,
  border: '1px solid #323232',
  background: 'rgba(255,255,255,0.04)',
  color: '#e8e8ea',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const pickButtonActive: CSSProperties = {
  ...buttonBase,
  background: 'rgba(255,120,73,0.18)',
  borderColor: 'rgba(255,120,73,0.6)',
  color: '#ff9a73',
};

const saveButton: CSSProperties = {
  ...buttonBase,
  marginTop: 4,
  background: 'rgba(80,140,255,0.16)',
  borderColor: 'rgba(80,140,255,0.5)',
  color: '#a8c4ff',
};

const ghostButton: CSSProperties = {
  ...buttonBase,
  padding: '4px 8px',
  minHeight: 24,
  fontSize: 11,
};

const emptyState: CSSProperties = {
  fontSize: 12,
  color: '#9a9aa0',
  padding: '12px 0',
  lineHeight: 1.5,
};

const selectorTag: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11,
  color: '#9ed29e',
  background: 'rgba(150,255,150,0.06)',
  border: '1px solid rgba(150,255,150,0.15)',
  borderRadius: 4,
  padding: '4px 6px',
  wordBreak: 'break-all',
};

const errorBanner: CSSProperties = {
  fontSize: 12,
  color: '#ffb6b6',
  background: 'rgba(255,90,90,0.08)',
  border: '1px solid rgba(255,90,90,0.35)',
  borderRadius: 4,
  padding: '8px 10px',
  lineHeight: 1.4,
};

const liveRegion: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  border: 0,
};

const headerRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};

const modalBackdrop: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalSurface: CSSProperties = {
  background: '#1a1a1c',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  padding: 16,
  width: 'min(520px, calc(100vw - 32px))',
  maxHeight: 'calc(100vh - 64px)',
  overflowY: 'auto',
  color: '#e8e8ea',
  fontSize: 13,
};

const diffTable: CSSProperties = {
  marginTop: 8,
  borderCollapse: 'collapse',
  width: '100%',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11,
};

// ---------- Types ----------

interface PickedState {
  /** Ordered set of currently-selected selectors. */
  selectors: string[];
  label?: string;
  /**
   * Computed-style snapshot at the moment of first pick — keyed by
   * selector. Used as the "before" reference for the undo stack and
   * the Save-to-Source diff.
   */
  computedBySelector: Record<string, Record<string, string>>;
}

interface UndoEntry {
  selector: string;
  cssProp: string;
  before: string;
  after: string;
}

interface DispatchError {
  message: string;
}

// ---------- Component ----------

export function DomEditor(): JSX.Element {
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<PickedState | null>(null);
  const [controls, setControls] = useState<DomEditorControls>(EMPTY_CONTROLS);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [error, setError] = useState<InspectErrorMessage | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [dispatchError, setDispatchError] = useState<DispatchError | null>(null);
  const [dispatchInFlight, setDispatchInFlight] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const rootRef = useRef<HTMLDivElement | null>(null);

  // ---- Subscriptions ----

  useEffect(() => {
    return onPicked((msg) => {
      setError(null);
      setPicked((prev) => {
        const next: PickedState = prev
          ? msg.additive
            ? {
                selectors: prev.selectors.includes(msg.selector)
                  ? prev.selectors.filter((s) => s !== msg.selector)
                  : [...prev.selectors, msg.selector],
                label: prev.label,
                computedBySelector: {
                  ...prev.computedBySelector,
                  [msg.selector]: msg.computed,
                },
              }
            : {
                selectors: [msg.selector],
                label: msg.label,
                computedBySelector: { [msg.selector]: msg.computed },
              }
          : {
              selectors: [msg.selector],
              label: msg.label,
              computedBySelector: { [msg.selector]: msg.computed },
            };
        // Hydrate the controls from the *most recent* pick — most UIs do this
        // even for multi-select (Figma surfaces the active element's values
        // and applies edits to all selected). Picking additively only adds
        // to the selection; the form mirrors the freshly-added element.
        setControls(extractControls(msg.computed));
        return next;
      });
      setPicking(false);
      setAnnouncement(`Element selected: ${msg.label ?? msg.selector}`);
    });
  }, []);

  useEffect(() => {
    return onInspectError((msg) => {
      setError(msg);
      setPicking(false);
      setAnnouncement(`Inspector error: ${msg.code}`);
    });
  }, []);

  // ---- Keyboard: Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+I = toggle pick ----

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      // Cmd+Shift+I → toggle pick (only when our panel root is in the DOM)
      if (e.shiftKey && (e.key === 'I' || e.key === 'i')) {
        // Only swallow if our panel is mounted — App handles the rest of
        // the global key surface, and we don't want to break devtools'
        // default chord when the Inspect tab is hidden.
        if (!rootRef.current) return;
        e.preventDefault();
        togglePick();
        return;
      }
      // Cmd+Z → undo, but only if focus is inside our panel
      if (!e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        if (!rootRef.current) return;
        if (!rootRef.current.contains(document.activeElement)) return;
        e.preventDefault();
        undoOne();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoStack, picked, picking]);

  // ---- Mutators ----

  const togglePick = useCallback((): void => {
    const next = !picking;
    setPicking(next);
    if (next) {
      // multi-mode flag tells the iframe to stay armed after the click —
      // makes Cmd-click-to-add chains feel native (no re-clicking Pick).
      broadcastToFrames(makePickMessage({ multi: true }));
      setAnnouncement('Pick mode on. Click an element in the preview.');
    } else {
      setAnnouncement('Pick mode off.');
    }
  }, [picking]);

  const applyStyles = useCallback(
    (next: DomEditorControls) => {
      if (!picked || picked.selectors.length === 0) return;
      const styles = controlsToStyles(next);
      broadcastToFrames(makeApplyMessage(picked.selectors, styles));
    },
    [picked],
  );

  const updateControl = useCallback(
    (key: keyof DomEditorControls, value: string) => {
      // Validate up-front; if the value's broken, stash it in local state
      // (so the user sees their input) but skip the broadcast.
      const cssProp = controlKeyToCss(key);
      const validation = validateCssValue(cssProp, value);

      setControls((prev) => {
        const before = prev[key];
        const next = { ...prev, [key]: value };
        if (validation.ok && picked && before !== value) {
          // Push an undo entry per selector — Undo undoes the most recent
          // selector's change first (LIFO).
          const entries: UndoEntry[] = picked.selectors.map((selector) => {
            const computedBefore =
              picked.computedBySelector[selector]?.[cssProp] ?? before;
            return {
              selector,
              cssProp,
              before: computedBefore,
              after: value.trim(),
            };
          });
          setUndoStack((prevStack) => [...prevStack, ...entries]);
          applyStyles(next);
        }
        return next;
      });
    },
    [applyStyles, picked],
  );

  const undoOne = useCallback((): void => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      // Pop the most recent batch (entries for one applied edit may span
      // multiple selectors; we recognise a batch as a contiguous tail with
      // the same cssProp + after-value).
      const tail = prev[prev.length - 1];
      let cutoff = prev.length - 1;
      while (
        cutoff > 0 &&
        prev[cutoff - 1].cssProp === tail.cssProp &&
        prev[cutoff - 1].after === tail.after
      ) {
        cutoff--;
      }
      const popped = prev.slice(cutoff);
      const remaining = prev.slice(0, cutoff);
      // Group reverts by selector for a single message per selector — the
      // iframe-side handler iterates the property list and either restores
      // the prior value or removes the inline override.
      const bySelector = new Map<string, UndoEntry[]>();
      for (const e of popped) {
        const arr = bySelector.get(e.selector) ?? [];
        arr.push(e);
        bySelector.set(e.selector, arr);
      }
      bySelector.forEach((entries, selector) => {
        // Restore the prior computed value as an inline override — this
        // matches what the rest of the stack expects ("revert == roll back
        // one step", not "remove all inline styles").
        const styles: Record<string, string> = {};
        for (const e of entries) styles[e.cssProp] = e.before;
        broadcastToFrames(makeApplyMessage([selector], styles));
      });
      // Sync the controls form to the prior values for the active element.
      if (picked && picked.selectors.length > 0) {
        const activeSel = picked.selectors[picked.selectors.length - 1];
        const activeEntries = popped.filter((e) => e.selector === activeSel);
        if (activeEntries.length > 0) {
          setControls((c) => {
            const next = { ...c };
            for (const e of activeEntries) {
              const k = cssToControlKey(e.cssProp);
              if (k) next[k] = e.before;
            }
            return next;
          });
        }
      }
      setAnnouncement(`Undid ${popped.length} change${popped.length === 1 ? '' : 's'}.`);
      return remaining;
    });
  }, [picked]);

  const resetAll = useCallback((): void => {
    if (undoStack.length === 0) {
      setAnnouncement('Nothing to reset.');
      return;
    }
    // Walk the stack newest → oldest, restoring each `before` value. Group by
    // selector so we send one revert per selector. The "first" before per
    // (selector, prop) wins (older state).
    const earliestBySelectorProp = new Map<string, string>();
    for (const e of undoStack) {
      const key = `${e.selector}|${e.cssProp}`;
      if (!earliestBySelectorProp.has(key)) earliestBySelectorProp.set(key, e.before);
    }
    const styleBags = new Map<string, Record<string, string>>();
    const propsBag = new Map<string, string[]>();
    earliestBySelectorProp.forEach((before, key) => {
      const [selector, cssProp] = key.split('|');
      const bag = styleBags.get(selector) ?? {};
      bag[cssProp] = before;
      styleBags.set(selector, bag);
      const props = propsBag.get(selector) ?? [];
      props.push(cssProp);
      propsBag.set(selector, props);
    });
    styleBags.forEach((styles, selector) => {
      broadcastToFrames(makeApplyMessage([selector], styles));
    });
    // Also send a revert (clears the inline overlay entirely) so the element
    // can re-inherit cascade defaults — apply alone would leave an inline
    // override at the computed value, which is fine but not "fully reset".
    propsBag.forEach((properties, selector) => {
      broadcastToFrames(makeRevertMessage([selector], properties));
    });
    // Reset the controls form to the original computed snapshot for the
    // active selector.
    if (picked && picked.selectors.length > 0) {
      const activeSel = picked.selectors[picked.selectors.length - 1];
      const orig = picked.computedBySelector[activeSel];
      if (orig) setControls(extractControls(orig));
    }
    setUndoStack([]);
    setAnnouncement(`Reset ${earliestBySelectorProp.size} change${earliestBySelectorProp.size === 1 ? '' : 's'}.`);
  }, [undoStack, picked]);

  // ---- Save to source — wires to the existing dispatch flow ----

  const openSavePrompt = useCallback((): void => {
    if (!picked || picked.selectors.length === 0) return;
    setDispatchError(null);
    setConfirming(true);
  }, [picked]);

  const confirmSave = useCallback(async (): Promise<void> => {
    if (!picked || picked.selectors.length === 0) return;
    const snap = boardStore.getSnapshot();
    const board = snap.board;
    if (!board) {
      setDispatchError({ message: 'No active board.' });
      return;
    }
    // Pick a target frame: first AppFrame in the board. The DOM editor
    // doesn't know which iframe the user picked from (postMessage source
    // is sandboxed by origin), so we anchor the dispatch on the first
    // app frame of the active board — the canvas-side AppFrame layer
    // will route the result to the right child anyway.
    const frame = Array.from(snap.frames.values()).find((f) => f.kind === 'app');
    if (!frame) {
      setDispatchError({ message: 'No app frame to dispatch against.' });
      return;
    }
    const branch = snap.branches.get(frame.branchId);
    if (!branch) {
      setDispatchError({ message: 'Branch not found.' });
      return;
    }
    const styles = controlsToStyles(controls);
    const intent = synthesiseIntent(picked.selectors, styles);
    setDispatchInFlight(true);
    setDispatchError(null);
    try {
      const activeWtId = selectionStore.getSnapshot().activeWorktreeId;
      const activeWt = findStubWorktree(activeWtId);
      const body: CreateDispatchRequest = {
        boardId: board.id,
        frameId: frame.id,
        branchId: frame.branchId,
        baseCommitSha: frame.commitSha,
        intent,
        target: {
          elementLabel: picked.label ?? picked.selectors[0],
          elementFile: 'unknown',
          elementLine: 0,
        },
        ...(activeWt ? { worktreeHint: activeWt.path } : {}),
      };
      const d = await apiCreateDispatch(body);
      boardStore.upsertDispatch(d);
      setConfirming(false);
      setAnnouncement('Dispatch created. Watch the canvas for the new frame.');
      const fn = (window as unknown as { __foldoToast?: (m: string) => void })
        .__foldoToast;
      fn?.('CSS overrides dispatched to Claude Code.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDispatchError({ message: msg });
      setAnnouncement(`Dispatch failed: ${msg}`);
    } finally {
      setDispatchInFlight(false);
    }
  }, [picked, controls]);

  const cancelSave = useCallback((): void => {
    setConfirming(false);
    setDispatchError(null);
  }, []);

  // ---- Derived UI bits ----

  const headerButton = useMemo(
    () => (picking ? pickButtonActive : buttonBase),
    [picking],
  );

  const selectionCountLabel = picked
    ? picked.selectors.length === 1
      ? '1 element selected'
      : `${picked.selectors.length} elements selected`
    : '';

  const styleDiff = useMemo(() => {
    if (!picked) return [] as Array<{ prop: string; before: string; after: string }>;
    const styles = controlsToStyles(controls);
    const activeSel = picked.selectors[picked.selectors.length - 1];
    const orig = picked.computedBySelector[activeSel] ?? {};
    const diff: Array<{ prop: string; before: string; after: string }> = [];
    for (const [prop, after] of Object.entries(styles)) {
      const before = orig[prop] ?? '';
      if (before !== after) diff.push({ prop, before, after });
    }
    return diff;
  }, [controls, picked]);

  return (
    <div style={stack} data-testid="foldo-dom-editor" ref={rootRef}>
      <div role="status" aria-live="polite" aria-atomic="true" style={liveRegion}>
        {announcement}
      </div>

      <button
        type="button"
        style={headerButton}
        onClick={togglePick}
        data-testid="foldo-dom-editor-pick"
        data-pick-mode={picking ? 'on' : 'off'}
        aria-pressed={picking}
        aria-keyshortcuts="Meta+Shift+I"
      >
        {picking ? 'Pick mode · click an element' : 'Pick element'}
      </button>

      {error && (
        <div
          style={errorBanner}
          role="alert"
          data-testid="foldo-dom-editor-error"
          data-error-code={error.code}
        >
          {errorCopy(error)}
        </div>
      )}

      {!picked ? (
        <div style={emptyState} data-testid="foldo-dom-editor-empty">
          Select an element on a live preview to edit its padding, margin,
          typography, fill, border-radius and shadow. Hold Cmd / Ctrl to add
          more elements to the selection.
        </div>
      ) : (
        <>
          <div style={headerRow}>
            <div
              style={selectorTag}
              data-testid="foldo-dom-editor-selector"
              title={picked.selectors.join(', ')}
            >
              {picked.label ?? picked.selectors[0]}
            </div>
            <div
              style={{ fontSize: 11, color: '#9a9aa0' }}
              data-testid="foldo-dom-editor-selection-count"
            >
              {selectionCountLabel}
            </div>
          </div>

          <AllPropertyGroups controls={controls} onChange={updateControl} />

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              style={ghostButton}
              onClick={undoOne}
              disabled={undoStack.length === 0}
              data-testid="foldo-dom-editor-undo"
              aria-label="undo last change"
              aria-keyshortcuts="Meta+Z"
            >
              Undo
            </button>
            <button
              type="button"
              style={ghostButton}
              onClick={resetAll}
              disabled={undoStack.length === 0}
              data-testid="foldo-dom-editor-reset"
              aria-label="reset all changes"
            >
              Reset all
            </button>
          </div>

          <button
            type="button"
            style={saveButton}
            onClick={openSavePrompt}
            data-testid="foldo-dom-editor-save"
            disabled={undoStack.length === 0}
          >
            Save to source
          </button>

          {dispatchError && (
            <div
              style={errorBanner}
              role="alert"
              data-testid="foldo-dom-editor-dispatch-error"
            >
              Dispatch failed: {dispatchError.message}. Your overrides are
              still applied — adjust and try again.
            </div>
          )}
        </>
      )}

      {confirming && picked && (
        <SaveModal
          selectors={picked.selectors}
          diff={styleDiff}
          inFlight={dispatchInFlight}
          onCancel={cancelSave}
          onConfirm={confirmSave}
        />
      )}
    </div>
  );
}

// ---------- Save-to-source modal ----------

interface SaveModalProps {
  selectors: string[];
  diff: Array<{ prop: string; before: string; after: string }>;
  inFlight: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function SaveModal({
  selectors,
  diff,
  inFlight,
  onCancel,
  onConfirm,
}: SaveModalProps): JSX.Element {
  return (
    <div
      style={modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="foldo-dom-editor-save-modal-title"
      data-testid="foldo-dom-editor-save-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div style={modalSurface}>
        <h2
          id="foldo-dom-editor-save-modal-title"
          style={{ margin: 0, fontSize: 14, marginBottom: 8 }}
        >
          Save to source?
        </h2>
        <div style={{ fontSize: 12, color: '#9a9aa0', marginBottom: 8 }}>
          A Claude Code dispatch will be created with the following overrides.
          Cancel to keep them as local overlays.
        </div>
        <div style={{ fontSize: 11, color: '#9a9aa0' }}>Selectors</div>
        <ul
          style={{
            margin: '4px 0 12px 0',
            paddingLeft: 18,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 11,
          }}
        >
          {selectors.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <div style={{ fontSize: 11, color: '#9a9aa0' }}>Changes</div>
        {diff.length === 0 ? (
          <div style={{ fontSize: 12, color: '#9a9aa0', marginTop: 4 }}>
            No changes vs. the original computed style.
          </div>
        ) : (
          <table style={diffTable} data-testid="foldo-dom-editor-save-diff">
            <thead>
              <tr style={{ color: '#9a9aa0', textAlign: 'left' }}>
                <th style={{ padding: '4px 6px', fontWeight: 500 }}>property</th>
                <th style={{ padding: '4px 6px', fontWeight: 500 }}>before</th>
                <th style={{ padding: '4px 6px', fontWeight: 500 }}>after</th>
              </tr>
            </thead>
            <tbody>
              {diff.map((d) => (
                <tr key={d.prop} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '4px 6px', color: '#c8c8cc' }}>{d.prop}</td>
                  <td style={{ padding: '4px 6px', color: '#ffb6b6' }}>{d.before || '—'}</td>
                  <td style={{ padding: '4px 6px', color: '#9ed29e' }}>{d.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button
            type="button"
            style={ghostButton}
            onClick={onCancel}
            data-testid="foldo-dom-editor-save-cancel"
            disabled={inFlight}
          >
            Cancel
          </button>
          <button
            type="button"
            style={saveButton}
            onClick={onConfirm}
            data-testid="foldo-dom-editor-save-confirm"
            disabled={inFlight || diff.length === 0}
          >
            {inFlight ? 'Sending…' : 'Save to source'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Helpers ----------

function errorCopy(msg: InspectErrorMessage): string {
  if (msg.code === 'PROTOCOL_VERSION') {
    return `DOM editor incompatible with iframe — check that the sample-app is up to date (expected protocol v${msg.expected ?? '?'}, got v${msg.got ?? '?'}).`;
  }
  if (msg.code === 'PICK_FAILED') {
    return `Couldn't pick element — iframe may be cross-origin or sandboxed.${msg.message ? ` (${msg.message})` : ''}`;
  }
  if (msg.code === 'APPLY_FAILED') {
    return `Couldn't apply styles — ${msg.message ?? 'unknown error'}.`;
  }
  return `Inspector error: ${msg.code}`;
}

function synthesiseIntent(
  selectors: string[],
  styles: Record<string, string>,
): string {
  const declarations = Object.entries(styles)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
  const sels =
    selectors.length === 1 ? selectors[0] : `${selectors.length} elements (${selectors.join(', ')})`;
  return `Apply CSS overrides to ${sels} — ${declarations}`;
}

/**
 * Map a CONTROL key → CSS property (kebab-case). Mirrors
 * `CONTROL_TO_CSS` in inspect-bridge.ts but indexed by control field
 * for the few places we need to look up the CSS name without importing
 * the full table.
 */
function controlKeyToCss(key: keyof DomEditorControls): string {
  // Lazy mirror — keeping in sync via the export from inspect-bridge would
  // be circular; this is a tiny dispatch and the test in
  // __tests__/DomEditor.unit.test.tsx guards against drift.
  switch (key) {
    case 'display': return 'display';
    case 'position': return 'position';
    case 'flexDirection': return 'flex-direction';
    case 'gap': return 'gap';
    case 'width': return 'width';
    case 'height': return 'height';
    case 'top': return 'top';
    case 'right': return 'right';
    case 'bottom': return 'bottom';
    case 'left': return 'left';
    case 'zIndex': return 'z-index';
    case 'paddingTop': return 'padding-top';
    case 'paddingRight': return 'padding-right';
    case 'paddingBottom': return 'padding-bottom';
    case 'paddingLeft': return 'padding-left';
    case 'marginTop': return 'margin-top';
    case 'marginRight': return 'margin-right';
    case 'marginBottom': return 'margin-bottom';
    case 'marginLeft': return 'margin-left';
    case 'fontSize': return 'font-size';
    case 'fontWeight': return 'font-weight';
    case 'lineHeight': return 'line-height';
    case 'color': return 'color';
    case 'backgroundColor': return 'background-color';
    case 'borderRadius': return 'border-radius';
    case 'borderWidth': return 'border-top-width';
    case 'borderStyle': return 'border-top-style';
    case 'borderColor': return 'border-top-color';
    case 'boxShadow': return 'box-shadow';
    case 'transform': return 'transform';
    case 'opacity': return 'opacity';
  }
}

function cssToControlKey(cssProp: string): keyof DomEditorControls | null {
  const map: Record<string, keyof DomEditorControls> = {
    'display': 'display',
    'position': 'position',
    'flex-direction': 'flexDirection',
    'gap': 'gap',
    'width': 'width',
    'height': 'height',
    'top': 'top',
    'right': 'right',
    'bottom': 'bottom',
    'left': 'left',
    'z-index': 'zIndex',
    'padding-top': 'paddingTop',
    'padding-right': 'paddingRight',
    'padding-bottom': 'paddingBottom',
    'padding-left': 'paddingLeft',
    'margin-top': 'marginTop',
    'margin-right': 'marginRight',
    'margin-bottom': 'marginBottom',
    'margin-left': 'marginLeft',
    'font-size': 'fontSize',
    'font-weight': 'fontWeight',
    'line-height': 'lineHeight',
    'color': 'color',
    'background-color': 'backgroundColor',
    'border-radius': 'borderRadius',
    'border-top-width': 'borderWidth',
    'border-top-style': 'borderStyle',
    'border-top-color': 'borderColor',
    'box-shadow': 'boxShadow',
    'transform': 'transform',
    'opacity': 'opacity',
  };
  return map[cssProp] ?? null;
}
