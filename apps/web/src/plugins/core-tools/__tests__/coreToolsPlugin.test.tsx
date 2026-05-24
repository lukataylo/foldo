// @vitest-environment jsdom
//
// Unit gates for the core/tools plugin, mapping to the wave-4 audit:
//
//   1. Manifest declares every canvas tool (select / hand / comment / edit /
//      sticky / arrow / image) as a toolbar contribution, in that order.
//   2. Every tool whose ToolSpec has a `shortcut` also contributes a matching
//      `hotkey` surface — the registry-reading useKeyboardShortcuts hook
//      requires this 1:1 to bind the V/H/C/E/S/A/I keys.
//   3. ToolSpec.activate() persists the tool id to localStorage under the
//      canonical key so a reload restores the same tool. Also routes through
//      the window escape hatch so App's React state stays in sync.
//   4. getInitialTool() reads the persisted value back, falling back to
//      'select' when nothing is stored / the value is unrecognised.
//
// We exercise the manifest + activate() against a real localStorage (jsdom
// provides it). No React render is needed for these specs — the contract is
// data-shape, not UI.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CORE_TOOLS,
  LAST_TOOL_KEY,
  coreToolsPlugin,
  getInitialTool,
} from '../index';
import type { Tool } from '../../../types';

const TOOL_IDS: readonly Tool[] = [
  'select',
  'hand',
  'comment',
  'edit',
  'sticky',
  'arrow',
  'image',
];

function resetWorld(): void {
  localStorage.clear();
  // Re-install a fresh stub each test so spy assertions don't leak.
  (window as unknown as { __foldoSetTool?: (t: Tool) => void }).__foldoSetTool =
    undefined;
}

describe('coreToolsPlugin manifest', () => {
  beforeEach(resetWorld);

  it('declares every canvas tool as a toolbar contribution, in canonical order', () => {
    const toolbar = coreToolsPlugin.manifest.surfaces.find(
      (s) => s.kind === 'toolbar',
    );
    expect(toolbar).toBeDefined();
    if (toolbar?.kind !== 'toolbar') throw new Error('unreachable');
    const ids = toolbar.tools.map((t) => t.id);
    expect(ids).toEqual(TOOL_IDS);
  });

  it('exposes the same tool list as CORE_TOOLS (toolbar surface uses it verbatim)', () => {
    expect(CORE_TOOLS.map((t) => t.id)).toEqual(TOOL_IDS);
    // Every CORE_TOOLS entry has the four required fields the renderers consume.
    for (const t of CORE_TOOLS) {
      expect(typeof t.label).toBe('string');
      expect(t.icon).toBeDefined();
      expect(typeof t.activate).toBe('function');
    }
  });

  it('groups tools into pointer / review / create for the divider hairline', () => {
    const groups = new Map<string, string[]>();
    for (const t of CORE_TOOLS) {
      const g = t.group ?? '';
      const arr = groups.get(g) ?? [];
      arr.push(t.id);
      groups.set(g, arr);
    }
    expect(groups.get('pointer')).toEqual(['select', 'hand']);
    expect(groups.get('review')).toEqual(['comment', 'edit']);
    expect(groups.get('create')).toEqual(['sticky', 'arrow', 'image']);
  });
});

describe('coreToolsPlugin hotkey contributions', () => {
  beforeEach(resetWorld);

  it('contributes one hotkey surface per tool that declares a shortcut', () => {
    const hotkeys = coreToolsPlugin.manifest.surfaces.filter(
      (s) => s.kind === 'hotkey',
    );
    const expected = CORE_TOOLS.filter((t) => !!t.shortcut).length;
    expect(hotkeys).toHaveLength(expected);

    for (const tool of CORE_TOOLS) {
      if (!tool.shortcut) continue;
      const surface = coreToolsPlugin.manifest.surfaces.find(
        (s) => s.kind === 'hotkey' && s.spec.id === `core/tools.${tool.id}`,
      );
      expect(surface).toBeDefined();
      if (surface?.kind !== 'hotkey') throw new Error('unreachable');
      expect(surface.spec.keys).toEqual([tool.shortcut.toLowerCase()]);
      expect(surface.spec.label).toBe(tool.label);
      expect(surface.spec.category).toBe('tools');
    }
  });

  it('hotkey handlers invoke the same activate path as the toolbar button', () => {
    const setTool = vi.fn();
    (window as unknown as { __foldoSetTool?: (t: Tool) => void }).__foldoSetTool =
      setTool;
    const selectHotkey = coreToolsPlugin.manifest.surfaces.find(
      (s) => s.kind === 'hotkey' && s.spec.id === 'core/tools.select',
    );
    if (selectHotkey?.kind !== 'hotkey') throw new Error('select hotkey missing');
    selectHotkey.spec.handler();
    expect(setTool).toHaveBeenCalledWith('select');

    const stickyHotkey = coreToolsPlugin.manifest.surfaces.find(
      (s) => s.kind === 'hotkey' && s.spec.id === 'core/tools.sticky',
    );
    if (stickyHotkey?.kind !== 'hotkey') throw new Error('sticky hotkey missing');
    stickyHotkey.spec.handler();
    expect(setTool).toHaveBeenLastCalledWith('sticky');
  });
});

describe('ToolSpec.activate() persistence', () => {
  beforeEach(resetWorld);

  it('writes the selected tool id to localStorage under foldo:lastTool', () => {
    const stickyTool = CORE_TOOLS.find((t) => t.id === 'sticky');
    if (!stickyTool) throw new Error('sticky tool missing');
    stickyTool.activate();
    expect(localStorage.getItem(LAST_TOOL_KEY)).toBe('sticky');

    const handTool = CORE_TOOLS.find((t) => t.id === 'hand');
    if (!handTool) throw new Error('hand tool missing');
    handTool.activate();
    expect(localStorage.getItem(LAST_TOOL_KEY)).toBe('hand');
  });

  it('still routes through window.__foldoSetTool so App state stays in sync', () => {
    const setTool = vi.fn();
    (window as unknown as { __foldoSetTool?: (t: Tool) => void }).__foldoSetTool =
      setTool;
    const arrowTool = CORE_TOOLS.find((t) => t.id === 'arrow');
    if (!arrowTool) throw new Error('arrow tool missing');
    arrowTool.activate();
    expect(setTool).toHaveBeenCalledWith('arrow');
    expect(localStorage.getItem(LAST_TOOL_KEY)).toBe('arrow');
  });

  it('survives a missing __foldoSetTool (boots before App mounts)', () => {
    (window as unknown as { __foldoSetTool?: (t: Tool) => void }).__foldoSetTool =
      undefined;
    const t = CORE_TOOLS.find((x) => x.id === 'image');
    if (!t) throw new Error('image tool missing');
    expect(() => t.activate()).not.toThrow();
    // Persistence still fires even without the setter — the user's last
    // pick must round-trip across reload regardless of mount ordering.
    expect(localStorage.getItem(LAST_TOOL_KEY)).toBe('image');
  });
});

describe('getInitialTool()', () => {
  beforeEach(resetWorld);

  it("returns 'select' when nothing has been persisted yet", () => {
    expect(getInitialTool()).toBe('select');
  });

  it('returns the previously-persisted value when one exists', () => {
    localStorage.setItem(LAST_TOOL_KEY, 'arrow');
    expect(getInitialTool()).toBe('arrow');
    localStorage.setItem(LAST_TOOL_KEY, 'comment');
    expect(getInitialTool()).toBe('comment');
  });

  it("falls back to 'select' when the stored value isn't a known tool", () => {
    localStorage.setItem(LAST_TOOL_KEY, 'bogus-tool-id');
    expect(getInitialTool()).toBe('select');
  });

  it('round-trips: activate() then getInitialTool() returns the same value', () => {
    const handTool = CORE_TOOLS.find((t) => t.id === 'hand');
    if (!handTool) throw new Error('hand tool missing');
    handTool.activate();
    expect(getInitialTool()).toBe('hand');
  });
});
