// Iframe-side counterpart for the DOM Editor postMessage protocol defined
// in apps/web/src/plugins/core-dom-editor/inspect-bridge.ts.
//
// Three message shapes are exchanged:
//   canvas → iframe: { type: 'foldo:inspect:pick' }
//   iframe → canvas: { type: 'foldo:inspect:picked', selector, computed, label? }
//   canvas → iframe: { type: 'foldo:inspect:apply', selector, styles }
//
// Behaviour:
//   - On `foldo:inspect:pick`: enter pick mode. A capture-phase mousemove
//     listener paints a subtle outline on the currently-hovered element.
//     The next click swallows the original action, computes a "good enough"
//     unique selector for the element, snapshots its computed styles, and
//     posts `foldo:inspect:picked` back to the parent. Pick mode then exits.
//   - On `foldo:inspect:apply`: find every element matching `selector` and
//     write `styles` into their inline style. In-memory only — refreshing
//     the iframe clears every override, which is the correct v1 behaviour
//     (the "Save to source" path in DomEditor is a separate pipeline).
//
// Origin discipline:
//   - The parent's origin is supplied via the existing PARENT_ORIGIN env in
//     bridge/messages.ts (read by parentBridge.ts). We use the same value
//     so the two surfaces share one allowlist source. Incoming messages
//     from any other origin are silently dropped.

import { PARENT_ORIGIN } from './bridge/messages';

// Computed-style keys mirrored from apps/web/src/plugins/core-dom-editor/
// inspect-bridge.ts > DEFAULT_PICK_KEYS. Kept inline (rather than imported)
// so this iframe-side module doesn't reach into the canvas package — the
// protocol is the contract, not the file boundary.
const PICK_KEYS: readonly string[] = [
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
];

interface InspectListenerHandle {
  dispose: () => void;
}

type Mode = 'idle' | 'picking';

export function initInspectListener(): InspectListenerHandle {
  let mode: Mode = 'idle';
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
    // Swallow the click so we don't navigate / submit forms while picking.
    e.preventDefault();
    e.stopPropagation();
    const selector = buildSelector(target);
    const computed = snapshotComputedStyles(target);
    const label = humanLabel(target);
    exitPickMode();
    postPicked(selector, computed, label);
  };

  const enterPickMode = (): void => {
    if (mode === 'picking') return;
    mode = 'picking';
    document.body.dataset.foldoInspectPick = '1';
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
  };

  const exitPickMode = (): void => {
    if (mode === 'idle') return;
    mode = 'idle';
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
    const data = e.data as { type?: unknown } | null;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'foldo:inspect:pick') {
      enterPickMode();
      return;
    }
    if (data.type === 'foldo:inspect:apply') {
      const msg = data as { selector?: unknown; styles?: unknown };
      if (typeof msg.selector !== 'string') return;
      if (!msg.styles || typeof msg.styles !== 'object') return;
      applyStyles(msg.selector, msg.styles as Record<string, string>);
      return;
    }
  };

  function postPicked(
    selector: string,
    computed: Record<string, string>,
    label: string,
  ): void {
    try {
      window.parent.postMessage(
        { type: 'foldo:inspect:picked', selector, computed, label },
        PARENT_ORIGIN,
      );
    } catch {
      // ignore — parent likely detached or origin mismatch
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
 * Build a "good enough" selector for the given element. Order of preference:
 *   1. data-foldo-element (the sample-app's own annotation — most stable)
 *   2. id (if present and idempotent)
 *   3. unique data-testid (very common in this codebase)
 *   4. tag + nth-of-type chain up to the nearest stable ancestor
 *
 * Doesn't have to round-trip perfectly — it just needs to be unique
 * enough for the apply step's querySelectorAll to find the same node.
 */
export function buildSelector(el: Element): string {
  if (el instanceof HTMLElement) {
    const fld = el.dataset.foldoElement;
    if (fld) return `[data-foldo-element="${cssEscape(fld)}"]`;
  }
  if (el.id) {
    // Validate the id is selector-safe; CSS.escape covers the rest.
    return `#${cssEscape(el.id)}`;
  }
  const testid = el.getAttribute('data-testid');
  if (testid) {
    const sel = `[data-testid="${cssEscape(testid)}"]`;
    if (document.querySelectorAll(sel).length === 1) return sel;
  }
  // Walk up building tag:nth-of-type segments until we hit a node we can
  // anchor with one of the strategies above. Cap depth so we don't return
  // a 30-segment selector that still isn't unique.
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
  // nth-of-type among siblings with the same tag
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
  // Use the browser's CSS.escape when available; fall back to a
  // conservative pre-escape for older targets.
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
