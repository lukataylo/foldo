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
  | { type: 'foldo.sample.scroll'; x: number; y: number };

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

export function isSampleAppOutbound(v: unknown): v is SampleAppOutbound {
  if (!v || typeof v !== 'object') return false;
  const t = (v as { type?: unknown }).type;
  return typeof t === 'string' && t.startsWith('foldo.sample.');
}
