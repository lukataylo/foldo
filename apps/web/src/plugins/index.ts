// Static list of every plugin shipped with apps/web. Boot order matters
// only when two plugins contribute to the same surface — earlier entries
// render first. Add new in-tree plugins here.

import type { Plugin } from '@foldo/plugin';
import { coreToolsPlugin } from './core-tools/index';
import { coreLayersPlugin } from './core-layers/index';
import { domEditorPlugin } from './core-dom-editor/index';

export const BUILTIN_PLUGINS: Plugin[] = [
  coreToolsPlugin,
  coreLayersPlugin,
  domEditorPlugin,
];
