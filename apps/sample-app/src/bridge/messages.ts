// postMessage protocol between the Foldo canvas (parent) and this sample app
// (iframe child). Mirrored on the canvas side; will eventually be lifted into
// @foldo/protocol, but kept local here to keep agents decoupled while both
// surfaces evolve in parallel.

export interface ElementPayload {
  key: string;
  label: string;
  file: string;
  line: number;
  currentSource: string;
}

export interface ElementHoverPayload {
  key: string;
  label: string;
}

export interface ElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RecipeStepMessage {
  action: string;
  target?: string;
  value?: string;
}

// sample-app → canvas
export type SampleAppOutbound =
  | { type: 'foldo.sample.ready'; commit: string; variant: string }
  | {
      type: 'foldo.sample.element.click';
      element: ElementPayload;
      rect: ElementRect;
    }
  | {
      type: 'foldo.sample.element.hover';
      element: ElementHoverPayload;
      rect: ElementRect;
    }
  | { type: 'foldo.sample.element.hover.clear' }
  | { type: 'foldo.sample.recipe.completed' }
  | { type: 'foldo.sample.recipe.failed'; message: string }
  | { type: 'foldo.sample.scroll'; x: number; y: number };

// canvas → sample-app
export type SampleAppInbound =
  | { type: 'foldo.sample.setReviewMode'; enabled: boolean }
  | {
      type: 'foldo.sample.replayRecipe';
      steps: RecipeStepMessage[];
    }
  | {
      type: 'foldo.sample.setOverrides';
      overrides: Record<string, string | boolean>;
    };

export const PARENT_ORIGIN = 'http://localhost:5173';
