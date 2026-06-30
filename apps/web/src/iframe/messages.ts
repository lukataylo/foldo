// postMessage protocol used between the canvas and an embedded sample-app iframe.
// Mirrors @foldo/sample-app/src/bridge/messages.ts.

export interface SampleElementInfo {
  key: string;
  label: string;
  file: string;
  line: number;
  currentSource: string;
}

export interface SampleRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SampleAppOutbound =
  | { type: 'foldo.sample.ready'; commit: string; variant: string }
  | {
      type: 'foldo.sample.element.click';
      element: SampleElementInfo;
      rect: SampleRect;
    }
  | {
      type: 'foldo.sample.element.hover';
      element: { key: string; label: string };
      rect: SampleRect;
    }
  | { type: 'foldo.sample.element.hover.clear' }
  | { type: 'foldo.sample.recipe.completed' }
  | { type: 'foldo.sample.recipe.failed'; message: string }
  | { type: 'foldo.sample.scroll'; x: number; y: number }
  // A pinch / ctrl+wheel zoom gesture caught inside the iframe. Forwarded so
  // the canvas can zoom itself instead of the browser zooming the whole page
  // (which would push the toolbars off-screen). clientX/clientY are relative
  // to the iframe's own viewport.
  | {
      type: 'foldo.sample.wheel';
      deltaX: number;
      deltaY: number;
      clientX: number;
      clientY: number;
    };

export type SampleAppInbound =
  | { type: 'foldo.sample.setReviewMode'; enabled: boolean }
  | {
      type: 'foldo.sample.replayRecipe';
      steps: Array<{ action: string; target?: string; value?: string }>;
    }
  | {
      type: 'foldo.sample.setOverrides';
      overrides: Record<string, string | boolean>;
    };

// Explicit whitelist of allowed message types. Keep in sync with the
// SampleAppOutbound union above — the `satisfies` clause enforces every entry
// is a real type, but does NOT enforce completeness, so additions need both.
// Any object whose `type` isn't in this list is rejected at the bridge edge,
// so a malicious iframe can't smuggle in a `foldo.sample.pwn` message that
// would happen to pass a prefix check.
const VALID_OUTBOUND_TYPES = [
  'foldo.sample.ready',
  'foldo.sample.element.click',
  'foldo.sample.element.hover',
  'foldo.sample.element.hover.clear',
  'foldo.sample.recipe.completed',
  'foldo.sample.recipe.failed',
  'foldo.sample.scroll',
  'foldo.sample.wheel',
] as const satisfies ReadonlyArray<SampleAppOutbound['type']>;

const VALID_OUTBOUND_TYPE_SET: ReadonlySet<string> = new Set(VALID_OUTBOUND_TYPES);

export function isSampleAppOutbound(v: unknown): v is SampleAppOutbound {
  if (!v || typeof v !== 'object') return false;
  const t = (v as { type?: unknown }).type;
  return typeof t === 'string' && VALID_OUTBOUND_TYPE_SET.has(t);
}
