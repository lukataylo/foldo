// postMessage protocol bridge for the DOM Editor plugin.
//
// ============================================================
// Protocol versioning
// ============================================================
//
// Every message carries a `version` integer (PROTOCOL_VERSION below).
// On the iframe side, apps/sample-app/src/inspect-listener.ts checks
// the version on every inbound message — a mismatch yields a
// `foldo:inspect:error` reply with `code: 'PROTOCOL_VERSION'`, and the
// inbound message is dropped. The canvas surfaces the error to the
// user ("DOM editor incompatible with iframe — check that the
// sample-app is up to date") so the failure mode is obvious rather
// than mysteriously silent. Bump PROTOCOL_VERSION whenever the wire
// shape changes in a non-backwards-compatible way.
//
// ============================================================
// The protocol (five message types — keep in sync on both sides)
// ============================================================
//
// 1. Canvas → iframe: enter pick mode.
//
//    { type: 'foldo:inspect:pick', version, multi? }
//
//    The iframe-side handler attaches a capture-phase mousemove +
//    click pair. The next user click captures the target element's
//    CSS selector and computed-style snapshot, posts back the
//    `picked` message below, and detaches both listeners — unless
//    `multi` is true, in which case pick mode stays armed so the
//    user can shift-/cmd-click successive elements without
//    re-clicking the Pick button.
//
// 2. Iframe → canvas: an element was picked.
//
//    { type: 'foldo:inspect:picked', version,
//      selector: string,                 // unique-enough selector
//      computed: Record<string, string>, // computed style key → value
//      label?: string,                   // optional pretty label
//      additive?: boolean }              // true if user cmd-/shift-clicked
//
//    `computed` should include at minimum the keys the DOM Editor
//    surfaces today (see DEFAULT_PICK_KEYS below) — the panel falls
//    back to '' for any missing key.
//
// 3. Canvas → iframe: apply a CSS overlay to one or more selectors.
//
//    { type: 'foldo:inspect:apply', version,
//      selectors: string[],              // one or more — historically `selector` (singular)
//      styles: Record<string, string> }
//
//    The iframe-side handler queries `document.querySelectorAll`
//    for each selector and writes each (k, v) into the matching
//    elements' inline style. Persistence is in-memory only — on
//    iframe reload, every overlay vanishes (correct v1 behaviour).
//
//    Back-compat: accepts legacy `{ selector: string }` (singular)
//    payloads from older canvas builds.
//
// 4. Canvas → iframe: revert a previously applied overlay.
//
//    { type: 'foldo:inspect:revert', version,
//      selectors: string[],
//      properties: string[] }            // property names to remove
//
//    Removes the named inline-style properties from the matching
//    elements. Used by the panel's Undo / Reset all buttons.
//
// 5. Iframe → canvas: error.
//
//    { type: 'foldo:inspect:error', version,
//      code: 'PROTOCOL_VERSION' | 'PICK_FAILED' | 'APPLY_FAILED',
//      message?: string,
//      expected?: number,                // PROTOCOL_VERSION only
//      got?: number }                    // PROTOCOL_VERSION only
//
//    Surfaced inline in the panel so the user knows why pick / apply
//    didn't take effect (cross-origin iframe, sandboxed sample-app
//    out of sync, malformed selector, …).
//
// Origin discipline: the iframe-side listener allowlists the canvas's
// origin (mirroring sample-app's existing PARENT_ORIGIN); broadcasts
// from this file use the iframe's own `iframe.src` origin instead of
// '*'. Together the two halves refuse any cross-origin chatter.

// ---------- Protocol version ----------

/**
 * Bump on any non-backwards-compatible wire change. The iframe-side
 * listener rejects messages with a different version and replies with
 * `{type:'foldo:inspect:error', code:'PROTOCOL_VERSION', expected, got}`.
 */
export const PROTOCOL_VERSION = 1;

// ---------- Message types ----------

/** Sent canvas → iframe to put the iframe into pick mode. */
export interface InspectPickMessage {
  type: 'foldo:inspect:pick';
  version: number;
  /** If true, stay in pick mode after the first click (multi-select). */
  multi?: boolean;
}

/** Sent iframe → canvas after the user clicks an element. */
export interface InspectPickedMessage {
  type: 'foldo:inspect:picked';
  version: number;
  selector: string;
  computed: Record<string, string>;
  label?: string;
  /** True when the user held shift/cmd while clicking — additive selection. */
  additive?: boolean;
}

/** Sent canvas → iframe to apply CSS overlays to one or more selectors. */
export interface InspectApplyMessage {
  type: 'foldo:inspect:apply';
  version: number;
  selectors: string[];
  styles: Record<string, string>;
}

/** Sent canvas → iframe to revert prior overlays. */
export interface InspectRevertMessage {
  type: 'foldo:inspect:revert';
  version: number;
  selectors: string[];
  properties: string[];
}

/** Sent iframe → canvas to report an error. */
export interface InspectErrorMessage {
  type: 'foldo:inspect:error';
  version: number;
  code: 'PROTOCOL_VERSION' | 'PICK_FAILED' | 'APPLY_FAILED';
  message?: string;
  expected?: number;
  got?: number;
}

export type InspectBridgeMessage =
  | InspectPickMessage
  | InspectPickedMessage
  | InspectApplyMessage
  | InspectRevertMessage
  | InspectErrorMessage;

// ---------- Default computed-style keys the panel reads ----------

/**
 * The set of computed-style keys the iframe-side picker should
 * include in the `picked` reply. Keep aligned with the controls
 * exposed by DomEditor.tsx + PropertyGroups.tsx.
 */
export const DEFAULT_PICK_KEYS = [
  // Layout
  'display',
  'position',
  'flex-direction',
  'gap',
  'width',
  'height',
  'top',
  'right',
  'bottom',
  'left',
  'z-index',
  // Spacing
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  // Typography
  'font-size',
  'font-weight',
  'line-height',
  'color',
  // Fill
  'background-color',
  // Border & shadow
  'border-radius',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'box-shadow',
  // Transform
  'transform',
  // Visibility
  'opacity',
] as const;

// ---------- Message constructors / validators ----------

export function makePickMessage(opts: { multi?: boolean } = {}): InspectPickMessage {
  return {
    type: 'foldo:inspect:pick',
    version: PROTOCOL_VERSION,
    multi: opts.multi === true ? true : undefined,
  };
}

export function makeApplyMessage(
  selectorOrSelectors: string | string[],
  styles: Record<string, string>,
): InspectApplyMessage {
  const selectors = Array.isArray(selectorOrSelectors)
    ? selectorOrSelectors
    : [selectorOrSelectors];
  return {
    type: 'foldo:inspect:apply',
    version: PROTOCOL_VERSION,
    selectors,
    styles,
  };
}

export function makeRevertMessage(
  selectorOrSelectors: string | string[],
  properties: string[],
): InspectRevertMessage {
  const selectors = Array.isArray(selectorOrSelectors)
    ? selectorOrSelectors
    : [selectorOrSelectors];
  return {
    type: 'foldo:inspect:revert',
    version: PROTOCOL_VERSION,
    selectors,
    properties,
  };
}

export function isInspectPicked(v: unknown): v is InspectPickedMessage {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (o.type !== 'foldo:inspect:picked') return false;
  if (typeof o.selector !== 'string') return false;
  if (!o.computed || typeof o.computed !== 'object') return false;
  return true;
}

export function isInspectError(v: unknown): v is InspectErrorMessage {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (o.type !== 'foldo:inspect:error') return false;
  if (typeof o.code !== 'string') return false;
  return true;
}

// ---------- DOM transport ----------

/**
 * Broadcast a canvas → iframe message to every iframe in the page.
 * v1 is intentionally undiscriminating: the AppFrame bridge already
 * scopes inbound listeners by `event.source`, so an iframe that
 * doesn't recognise `foldo:inspect:*` simply ignores it.
 */
export function broadcastToFrames(
  msg: InspectPickMessage | InspectApplyMessage | InspectRevertMessage,
  win: Window = window,
): void {
  const frames = win.document.querySelectorAll('iframe');
  frames.forEach((iframe) => {
    let targetOrigin: string;
    try {
      targetOrigin = new URL(iframe.src).origin;
    } catch {
      return;
    }
    if (!targetOrigin || targetOrigin === 'null') return;
    try {
      iframe.contentWindow?.postMessage(msg, targetOrigin);
    } catch {
      /* ignore */
    }
  });
}

/**
 * Subscribe to `foldo:inspect:picked` events on `win`. Returns an
 * unsubscribe. The listener fires only for well-formed messages
 * (see `isInspectPicked`); malformed payloads are dropped silently.
 */
export function onPicked(
  handler: (msg: InspectPickedMessage) => void,
  win: Window = window,
): () => void {
  function listener(ev: MessageEvent): void {
    if (!isInspectPicked(ev.data)) return;
    handler(ev.data);
  }
  win.addEventListener('message', listener);
  return () => win.removeEventListener('message', listener);
}

/**
 * Subscribe to `foldo:inspect:error` events on `win`. Returns an
 * unsubscribe. Surfaces version mismatches, cross-origin pick
 * failures, and apply errors to the panel UI.
 */
export function onInspectError(
  handler: (msg: InspectErrorMessage) => void,
  win: Window = window,
): () => void {
  function listener(ev: MessageEvent): void {
    if (!isInspectError(ev.data)) return;
    handler(ev.data);
  }
  win.addEventListener('message', listener);
  return () => win.removeEventListener('message', listener);
}

// ---------- Computed → control extraction ----------

/**
 * The Figma-style controls the DOM Editor surfaces. Each value is
 * stored as a string so the input fields can round-trip the raw
 * computed-style value without parsing ambiguity.
 *
 * Grouped into the panel's collapsible sections (Layout, Spacing,
 * Typography, Fill, Border & Shadow, Transform, Visibility) so the
 * reader can see at a glance which control lives where.
 */
export interface DomEditorControls {
  // Layout
  display: string;
  position: string;
  flexDirection: string;
  gap: string;
  width: string;
  height: string;
  top: string;
  right: string;
  bottom: string;
  left: string;
  zIndex: string;
  // Spacing
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
  marginTop: string;
  marginRight: string;
  marginBottom: string;
  marginLeft: string;
  // Typography
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  color: string;
  // Fill
  backgroundColor: string;
  // Border & shadow
  borderRadius: string;
  borderWidth: string;
  borderStyle: string;
  borderColor: string;
  boxShadow: string;
  // Transform
  transform: string;
  // Visibility
  opacity: string;
}

export const EMPTY_CONTROLS: DomEditorControls = {
  display: '',
  position: '',
  flexDirection: '',
  gap: '',
  width: '',
  height: '',
  top: '',
  right: '',
  bottom: '',
  left: '',
  zIndex: '',
  paddingTop: '',
  paddingRight: '',
  paddingBottom: '',
  paddingLeft: '',
  marginTop: '',
  marginRight: '',
  marginBottom: '',
  marginLeft: '',
  fontSize: '',
  fontWeight: '',
  lineHeight: '',
  color: '',
  backgroundColor: '',
  borderRadius: '',
  borderWidth: '',
  borderStyle: '',
  borderColor: '',
  boxShadow: '',
  transform: '',
  opacity: '',
};

/**
 * Mapping from the DomEditorControls field name to the CSS property
 * (kebab-case) the iframe-side handler reads. Single source of truth
 * for extractControls + controlsToStyles below — historically those
 * two functions kept the mapping in sync by hand; now they share this
 * table so adding a new field is a one-liner.
 */
export const CONTROL_TO_CSS: Record<keyof DomEditorControls, string> = {
  display: 'display',
  position: 'position',
  flexDirection: 'flex-direction',
  gap: 'gap',
  width: 'width',
  height: 'height',
  top: 'top',
  right: 'right',
  bottom: 'bottom',
  left: 'left',
  zIndex: 'z-index',
  paddingTop: 'padding-top',
  paddingRight: 'padding-right',
  paddingBottom: 'padding-bottom',
  paddingLeft: 'padding-left',
  marginTop: 'margin-top',
  marginRight: 'margin-right',
  marginBottom: 'margin-bottom',
  marginLeft: 'margin-left',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  lineHeight: 'line-height',
  color: 'color',
  backgroundColor: 'background-color',
  borderRadius: 'border-radius',
  borderWidth: 'border-top-width',
  borderStyle: 'border-top-style',
  borderColor: 'border-top-color',
  boxShadow: 'box-shadow',
  transform: 'transform',
  opacity: 'opacity',
};

/**
 * Reduce a computed-style snapshot to the DomEditorControls shape.
 * Missing keys collapse to '' so the controls always render.
 */
export function extractControls(
  computed: Record<string, string>,
): DomEditorControls {
  const out = { ...EMPTY_CONTROLS };
  (Object.keys(CONTROL_TO_CSS) as Array<keyof DomEditorControls>).forEach((k) => {
    const cssProp = CONTROL_TO_CSS[k];
    out[k] = computed[cssProp] ?? '';
  });
  return out;
}

/**
 * Serialise the control state into the CSS property bag that the
 * `apply` message ships. Empty-string values are omitted so the
 * iframe-side handler doesn't emit empty declarations.
 */
export function controlsToStyles(
  controls: DomEditorControls,
): Record<string, string> {
  const out: Record<string, string> = {};
  (Object.keys(CONTROL_TO_CSS) as Array<keyof DomEditorControls>).forEach((k) => {
    const v = controls[k];
    if (v.trim() !== '') out[CONTROL_TO_CSS[k]] = v;
  });
  return out;
}
