// postMessage protocol bridge for the DOM Editor plugin.
//
// ============================================================
// The protocol (three message types — keep in sync on both sides)
// ============================================================
//
// 1. Canvas → iframe: enter pick mode.
//
//    { type: 'foldo:inspect:pick' }
//
//    The iframe-side handler (apps/sample-app/src/inspect-listener.ts)
//    attaches a capture-phase mousemove + click pair. The next user
//    click captures the target element's CSS selector and computed
//    style snapshot, posts back the `picked` message below, and
//    detaches both listeners.
//
// 2. Iframe → canvas: an element was picked.
//
//    { type: 'foldo:inspect:picked',
//      selector: string,                 // unique-enough selector
//      computed: Record<string, string>, // computed style key → value
//      label?: string }                  // optional pretty label
//
//    `computed` should include at minimum the keys the DOM Editor
//    surfaces today (see DEFAULT_PICK_KEYS below) — the panel falls
//    back to '' for any missing key.
//
// 3. Canvas → iframe: apply a CSS overlay to a selector.
//
//    { type: 'foldo:inspect:apply',
//      selector: string,
//      styles: Record<string, string> }
//
//    The iframe-side handler queries `document.querySelectorAll(selector)`
//    and writes each (k, v) into the matching elements' inline style.
//    Persistence is in-memory only — on iframe reload, every overlay
//    vanishes, which is the correct v1 behaviour. Persisting the
//    overlay back to source is OUT OF SCOPE for v1 — a future "Save
//    to source" pipeline will package the styles as an MCP dispatch
//    (see DomEditor.tsx > onSaveToSource).
//
// Origin discipline: the iframe-side listener allowlists the canvas's
// origin (mirroring sample-app's existing PARENT_ORIGIN); broadcasts
// from this file use the iframe's own `iframe.src` origin instead of
// '*'. Together the two halves refuse any cross-origin chatter.

// ---------- Message types ----------

/** Sent canvas → iframe to put the iframe into pick mode. */
export interface InspectPickMessage {
  type: 'foldo:inspect:pick';
}

/** Sent iframe → canvas after the user clicks an element. */
export interface InspectPickedMessage {
  type: 'foldo:inspect:picked';
  selector: string;
  computed: Record<string, string>;
  label?: string;
}

/** Sent canvas → iframe to apply CSS overlays to a selector. */
export interface InspectApplyMessage {
  type: 'foldo:inspect:apply';
  selector: string;
  styles: Record<string, string>;
}

export type InspectBridgeMessage =
  | InspectPickMessage
  | InspectPickedMessage
  | InspectApplyMessage;

// ---------- Default computed-style keys the panel reads ----------

/**
 * The set of computed-style keys the iframe-side picker should
 * include in the `picked` reply. Keep aligned with the controls
 * exposed by DomEditor.tsx.
 */
export const DEFAULT_PICK_KEYS = [
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'font-size',
  'font-weight',
  'line-height',
  'color',
  'background-color',
  'border-radius',
  'box-shadow',
] as const;

// ---------- Message constructors / validators ----------

export function makePickMessage(): InspectPickMessage {
  return { type: 'foldo:inspect:pick' };
}

export function makeApplyMessage(
  selector: string,
  styles: Record<string, string>,
): InspectApplyMessage {
  return { type: 'foldo:inspect:apply', selector, styles };
}

export function isInspectPicked(v: unknown): v is InspectPickedMessage {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (o.type !== 'foldo:inspect:picked') return false;
  if (typeof o.selector !== 'string') return false;
  if (!o.computed || typeof o.computed !== 'object') return false;
  return true;
}

// ---------- DOM transport ----------

/**
 * Broadcast a canvas → iframe message to every iframe in the page.
 * v1 is intentionally undiscriminating: the AppFrame bridge already
 * scopes inbound listeners by `event.source`, so an iframe that
 * doesn't recognise `foldo:inspect:*` simply ignores it. Once the
 * iframe-side handler ships (see TODO above), we can narrow to the
 * selected frame's iframe.
 */
export function broadcastToFrames(
  msg: InspectPickMessage | InspectApplyMessage,
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

// ---------- Computed → control extraction ----------

/**
 * The Figma-style controls the DOM Editor surfaces. Each value is
 * stored as a string so the input fields can round-trip the raw
 * computed-style value without parsing ambiguity.
 */
export interface DomEditorControls {
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
  marginTop: string;
  marginRight: string;
  marginBottom: string;
  marginLeft: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  color: string;
  backgroundColor: string;
  borderRadius: string;
  boxShadow: string;
}

export const EMPTY_CONTROLS: DomEditorControls = {
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
  boxShadow: '',
};

/**
 * Reduce a computed-style snapshot to the DomEditorControls shape.
 * Missing keys collapse to '' so the controls always render.
 */
export function extractControls(
  computed: Record<string, string>,
): DomEditorControls {
  const get = (k: string): string => computed[k] ?? '';
  return {
    paddingTop: get('padding-top'),
    paddingRight: get('padding-right'),
    paddingBottom: get('padding-bottom'),
    paddingLeft: get('padding-left'),
    marginTop: get('margin-top'),
    marginRight: get('margin-right'),
    marginBottom: get('margin-bottom'),
    marginLeft: get('margin-left'),
    fontSize: get('font-size'),
    fontWeight: get('font-weight'),
    lineHeight: get('line-height'),
    color: get('color'),
    backgroundColor: get('background-color'),
    borderRadius: get('border-radius'),
    boxShadow: get('box-shadow'),
  };
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
  const put = (k: string, v: string): void => {
    if (v.trim() !== '') out[k] = v;
  };
  put('padding-top', controls.paddingTop);
  put('padding-right', controls.paddingRight);
  put('padding-bottom', controls.paddingBottom);
  put('padding-left', controls.paddingLeft);
  put('margin-top', controls.marginTop);
  put('margin-right', controls.marginRight);
  put('margin-bottom', controls.marginBottom);
  put('margin-left', controls.marginLeft);
  put('font-size', controls.fontSize);
  put('font-weight', controls.fontWeight);
  put('line-height', controls.lineHeight);
  put('color', controls.color);
  put('background-color', controls.backgroundColor);
  put('border-radius', controls.borderRadius);
  put('box-shadow', controls.boxShadow);
  return out;
}
