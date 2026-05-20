// Built-in frame kinds, registered once at app boot before <App /> mounts.
//
// Each frame kind is a plugin so that the canvas's frame switch lives entirely
// inside the registry — adding a new kind is a matter of adding another
// `registerFrameKind` call here (or from an external plugin module) instead
// of editing the canvas's render code.

import { registry } from '../registry';
import { appFramePlugin } from './app';
import { arrowFramePlugin } from './arrow';
import { imageFramePlugin } from './image';
import { markdownFramePlugin } from './markdown';
import { stickyFramePlugin } from './sticky';
import { testSessionFramePlugin } from './test-session';
import { testSummaryFramePlugin } from './test-summary';
import { builtinTools } from './tools';

export function registerBuiltinFrameKinds(): void {
  registry.registerFrameKind(appFramePlugin);
  registry.registerFrameKind(markdownFramePlugin);
  registry.registerFrameKind(stickyFramePlugin);
  registry.registerFrameKind(arrowFramePlugin);
  registry.registerFrameKind(imageFramePlugin);
  registry.registerFrameKind(testSummaryFramePlugin);
  registry.registerFrameKind(testSessionFramePlugin);
  for (const tool of builtinTools) {
    registry.registerTool(tool);
  }
}
