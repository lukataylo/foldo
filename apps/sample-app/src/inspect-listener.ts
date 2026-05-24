// Iframe-side counterpart for the DOM Editor postMessage protocol defined
// in apps/web/src/plugins/core-dom-editor/inspect-bridge.ts.
//
// Five message shapes are exchanged (see inspect-bridge.ts for the full
// protocol doc):
//   canvas → iframe: foldo:inspect:pick { multi? }
//   iframe → canvas: foldo:inspect:picked { selector, computed, label?, additive? }
//   canvas → iframe: foldo:inspect:apply { selectors[], styles }
//   canvas → iframe: foldo:inspect:revert { selectors[], properties[] }
//   iframe → canvas: foldo:inspect:error { code, message?, expected?, got? }
//
// All messages carry an integer `version` field; mismatches are rejected
// with a PROTOCOL_VERSION error reply.
//
// Behaviour:
//   - On pick: paint a subtle outline on the hovered element; the next
//     click snapshots a selector + computed styles and posts `picked`.
//     If the inbound pick message has `multi: true`, the listener stays
//     armed after the click — successive shift/cmd-clicks add to the
//     selection from the canvas's POV (`additive: true` on the reply).
//   - On apply: write the supplied styles as inline overrides on every
//     element matching any selector in the message.
//   - On revert: remove the named inline-style properties.
//   - Any throw inside the handler is caught and reported as a
//     PICK_FAILED / APPLY_FAILED error message so the canvas can show
//     the user instead of failing silently (typical for cross-origin
//     iframes that can't run the picker at all).
//
// Origin discipline:
//   - The parent's origin is supplied via the existing PARENT_ORIGIN env
//     in bridge/messages.ts. Incoming messages from any other origin are
//     silently dropped before they reach the dispatch table.

import { PARENT_ORIGIN } from './bridge/messages';

/**
 * Bump this whenever the wire protocol changes in a non-backwards-
 * compatible way. Keep in sync with PROTOCOL_VERSION in
 * apps/web/src/plugins/core-dom-editor/inspect-bridge.ts.
 */
const PROTOCOL_VERSION = 1;

// Computed-style keys mirrored from inspect-bridge.ts > DEFAULT_PICK_KEYS.
// Kept inline so this iframe-side module doesn't reach into the canvas
// package — the protocol is the contract, not the file boundary.
const PICK_KEYS: readonly string[] = [
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
];

interface InspectListenerHandle {
  dispose: () => void;
}

type Mode = 'idle' | 'picking';

export function initInspectListener(): InspectListenerHandle {
  let mode: Mode = 'idle';
  let multi = false; // stay-armed flag from the inbound pick message
  let pendingAdditive = false; // set during onClick if user held shift/meta
  let hoverEl: Element | null = null;
  let prevOutline: string | null = null;
  let prevOutlineOffset: string | null = null;

  const clearHoverOutline = (): void => {
    if (hoverEl && hoverEl instanceof HTMLElement) {
      if (prevOutline !== null) hoverEl.style.outline = prevOutline;
      else hoverEl.style.removeProperty('outline');
      if (prevOutlineOffset !== null) hoverEl.style.outlineOffset = prevOutlineOffset;
      else hoverEl.style.removeProperty('outline-offset');
    }
    hoverEl = null;
    prevOutline = null;
    prevOutlineOffset = null;
  };

  const paintHoverOutline = (el: Element): void => {
    if (!(el instanceof HTMLElement)) return;
    clearHoverOutline();
    hoverEl = el;
    prevOutline = el.style.outline || '';
    prevOutlineOffset = el.style.outlineOffset || '';
    el.style.outline = '2px solid #ff7849';
    el.style.outlineOffset = '-2px';
  };

  const onMouseMove = (e: MouseEvent): void => {
    if (mode !== 'picking') return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    if (target === hoverEl) return;
    paintHoverOutline(target);
  };

  const onClick = (e: MouseEvent): void => {
    if (mode !== 'picking') return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    pendingAdditive = e.metaKey || e.ctrlKey || e.shiftKey;
    try {
      const selector = buildSelector(target);
      const computed = snapshotComputedStyles(target);
      const label = humanLabel(target);
      if (!multi) exitPickMode();
      else clearHoverOutline(); // keep the listeners armed; clear the paint
      postPicked(selector, computed, label, pendingAdditive);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      postError('PICK_FAILED', msg);
      exitPickMode();
    }
  };

  const enterPickMode = (multiMode: boolean): void => {
    if (mode === 'picking') {
      multi = multiMode; // allow re-arming to flip the flag
      return;
    }
    mode = 'picking';
    multi = multiMode;
    document.body.dataset.foldoInspectPick = '1';
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
  };

  const exitPickMode = (): void => {
    if (mode === 'idle') return;
    mode = 'idle';
    multi = false;
    delete document.body.dataset.foldoInspectPick;
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    clearHoverOutline();
  };

  const onMessage = (e: MessageEvent): void => {
    // Origin allowlist: only parent-origin messages get to drive the picker
    // or apply overlays. Any other source (a sibling iframe, a hostile
    // attacker, a stale dev tab) is dropped silently.
    if (e.origin !== PARENT_ORIGIN) return;
    const data = e.data as { type?: unknown; version?: unknown } | null;
    if (!data || typeof data !== 'object') return;
    // Only react to foldo:inspect:* messages — the sample-app shares its
    // window with the parent bridge and the recipe replayer, both of which
    // push other shapes through. Ignore anything outside our namespace
    // before the version check so we don't false-positive on protocol
    // mismatches from unrelated traffic.
    if (typeof data.type !== 'string' || !data.type.startsWith('foldo:inspect:')) {
      return;
    }
    // Version check — replies always include the version so the canvas can
    // detect a sample-app that's behind the schema.
    if (typeof data.version !== 'number' || data.version !== PROTOCOL_VERSION) {
      postError('PROTOCOL_VERSION', undefined, {
        expected: PROTOCOL_VERSION,
        got: typeof data.version === 'number' ? data.version : 0,
      });
      return;
    }
    try {
      dispatchMessage(data as Record<string, unknown>);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      postError('APPLY_FAILED', msg);
    }
  };

  function dispatchMessage(data: Record<string, unknown>): void {
    if (data.type === 'foldo:inspect:pick') {
      enterPickMode(data.multi === true);
      return;
    }
    if (data.type === 'foldo:inspect:apply') {
      const selectors = normalizeSelectors(data);
      const styles = data.styles;
      if (!selectors || !styles || typeof styles !== 'object') return;
      for (const sel of selectors) {
        applyStyles(sel, styles as Record<string, string>);
      }
      return;
    }
    if (data.type === 'foldo:inspect:revert') {
      const selectors = normalizeSelectors(data);
      const props = Array.isArray(data.properties)
        ? (data.properties as unknown[]).filter((p): p is string => typeof p === 'string')
        : null;
      if (!selectors || !props) return;
      for (const sel of selectors) {
        revertStyles(sel, props);
      }
      return;
    }
  }

  function postPicked(
    selector: string,
    computed: Record<string, string>,
    label: string,
    additive: boolean,
  ): void {
    try {
      window.parent.postMessage(
        {
          type: 'foldo:inspect:picked',
          version: PROTOCOL_VERSION,
          selector,
          computed,
          label,
          additive,
        },
        PARENT_ORIGIN,
      );
    } catch {
      // ignore — parent likely detached or origin mismatch
    }
  }

  function postError(
    code: 'PROTOCOL_VERSION' | 'PICK_FAILED' | 'APPLY_FAILED',
    message?: string,
    extra: { expected?: number; got?: number } = {},
  ): void {
    try {
      window.parent.postMessage(
        {
          type: 'foldo:inspect:error',
          version: PROTOCOL_VERSION,
          code,
          message,
          ...extra,
        },
        PARENT_ORIGIN,
      );
    } catch {
      // ignore
    }
  }

  window.addEventListener('message', onMessage);

  return {
    dispose: () => {
      exitPickMode();
      window.removeEventListener('message', onMessage);
    },
  };
}

// ---------- helpers ----------

/**
 * Coerce the `selectors` / legacy `selector` field on an inbound apply /
 * revert message into a string[]. Returns null on a malformed shape so the
 * caller can drop the message without surfacing a confusing error.
 */
function normalizeSelectors(data: Record<string, unknown>): string[] | null {
  if (Array.isArray(data.selectors)) {
    const out = (data.selectors as unknown[]).filter(
      (s): s is string => typeof s === 'string' && s.length > 0,
    );
    return out.length > 0 ? out : null;
  }
  if (typeof data.selector === 'string' && data.selector.length > 0) {
    return [data.selector];
  }
  return null;
}

/**
 * Build a "good enough" selector for the given element. Order of preference:
 *   1. data-foldo-element (the sample-app's own annotation — most stable)
 *   2. id (if present and idempotent)
 *   3. unique data-testid (very common in this codebase)
 *   4. tag + nth-of-type chain up to the nearest stable ancestor
 */
export function buildSelector(el: Element): string {
  if (el instanceof HTMLElement) {
    const fld = el.dataset.foldoElement;
    if (fld) return `[data-foldo-element="${cssEscape(fld)}"]`;
  }
  if (el.id) {
    return `#${cssEscape(el.id)}`;
  }
  const testid = el.getAttribute('data-testid');
  if (testid) {
    const sel = `[data-testid="${cssEscape(testid)}"]`;
    if (document.querySelectorAll(sel).length === 1) return sel;
  }
  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && depth < 6) {
    if (cur === document.body) {
      parts.unshift('body');
      break;
    }
    parts.unshift(segmentFor(cur));
    cur = cur.parentElement;
    depth++;
  }
  return parts.join(' > ') || el.tagName.toLowerCase();
}

function segmentFor(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el instanceof HTMLElement && el.dataset.foldoElement) {
    return `${tag}[data-foldo-element="${cssEscape(el.dataset.foldoElement)}"]`;
  }
  if (el.id) return `${tag}#${cssEscape(el.id)}`;
  const parent = el.parentElement;
  if (!parent) return tag;
  let n = 0;
  for (const sib of Array.from(parent.children)) {
    if (sib.tagName === el.tagName) {
      n++;
      if (sib === el) return `${tag}:nth-of-type(${n})`;
    }
  }
  return tag;
}

function cssEscape(s: string): string {
  if (typeof (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS?.escape === 'function') {
    return (globalThis as { CSS: { escape: (s: string) => string } }).CSS.escape(s);
  }
  return s.replace(/(["\\\]\[\.\#\:\(\)\,\>\+\~\*\$\^\|\!])/g, '\\$1');
}

function snapshotComputedStyles(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  const style = window.getComputedStyle(el);
  for (const key of PICK_KEYS) {
    out[key] = style.getPropertyValue(key);
  }
  return out;
}

function humanLabel(el: Element): string {
  if (el instanceof HTMLElement && el.dataset.foldoElement) {
    return el.dataset.foldoElement;
  }
  const txt = el.textContent?.trim().slice(0, 36);
  const tag = el.tagName.toLowerCase();
  return txt ? `${tag} · ${txt}` : tag;
}

function applyStyles(selector: string, styles: Record<string, string>): void {
  let nodes: NodeListOf<Element>;
  try {
    nodes = document.querySelectorAll(selector);
  } catch {
    // Invalid selector — drop silently rather than throwing across the bridge.
    return;
  }
  nodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    for (const [k, v] of Object.entries(styles)) {
      if (typeof v !== 'string') continue;
      try {
        node.style.setProperty(k, v);
      } catch {
        /* ignore individual property failures */
      }
    }
  });
}

function revertStyles(selector: string, properties: string[]): void {
  let nodes: NodeListOf<Element>;
  try {
    nodes = document.querySelectorAll(selector);
  } catch {
    return;
  }
  nodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    for (const p of properties) {
      try {
        node.style.removeProperty(p);
      } catch {
        /* ignore */
      }
    }
  });
}
