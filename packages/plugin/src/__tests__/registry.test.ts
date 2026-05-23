import { describe, expect, it, vi } from 'vitest';
import {
  PluginRegistry,
  type Plugin,
  type PluginContext,
} from '../index';

function makePlugin(id: string, overrides: Partial<Plugin> = {}): Plugin {
  return {
    manifest: {
      id,
      name: id,
      version: '1.0.0',
      surfaces: [],
      ...(overrides.manifest ?? {}),
    },
    ...overrides,
  };
}

const ctx: PluginContext = {
  notify: () => {},
  subscribe: () => () => {},
};

describe('PluginRegistry', () => {
  it('installs and lists plugins in install order', () => {
    const r = new PluginRegistry();
    r.install(makePlugin('a'));
    r.install(makePlugin('b'));
    expect(r.list().map((p) => p.manifest.id)).toEqual(['a', 'b']);
  });

  it('installAll preserves order', () => {
    const r = new PluginRegistry();
    r.installAll([makePlugin('a'), makePlugin('b'), makePlugin('c')]);
    expect(r.list().map((p) => p.manifest.id)).toEqual(['a', 'b', 'c']);
  });

  it('surfaces() filters by kind across plugins, preserving order', () => {
    const r = new PluginRegistry();
    r.install({
      manifest: {
        id: 'p1',
        name: 'p1',
        version: '1',
        surfaces: [
          {
            kind: 'toolbar',
            tools: [
              { id: 't1', label: 'T1', icon: null, activate: () => {} },
            ],
          },
        ],
      },
    });
    r.install({
      manifest: {
        id: 'p2',
        name: 'p2',
        version: '1',
        surfaces: [
          {
            kind: 'leftPanel',
            tab: { id: 'tab1', label: 'L', icon: null, render: () => null },
          },
        ],
      },
    });
    r.install({
      manifest: {
        id: 'p3',
        name: 'p3',
        version: '1',
        surfaces: [
          {
            kind: 'toolbar',
            tools: [
              { id: 't2', label: 'T2', icon: null, activate: () => {} },
            ],
          },
        ],
      },
    });
    expect(r.surfaces('toolbar').flatMap((s) => s.tools.map((t) => t.id))).toEqual([
      't1',
      't2',
    ]);
    expect(r.surfaces('leftPanel').map((s) => s.tab.id)).toEqual(['tab1']);
    expect(r.surfaces('rightPanel')).toEqual([]);
  });

  it('activate() runs every plugin activate() once and is idempotent', () => {
    const r = new PluginRegistry();
    const a = vi.fn();
    const b = vi.fn();
    r.install({ ...makePlugin('a'), activate: a });
    r.install({ ...makePlugin('b'), activate: b });
    r.activate(ctx);
    r.activate(ctx); // second call no-ops
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith(ctx);
  });

  it('swallows + logs errors from a plugin activate() so others still run', () => {
    const r = new PluginRegistry();
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const b = vi.fn();
    r.install({
      ...makePlugin('boom'),
      activate: () => {
        throw new Error('kaboom');
      },
    });
    r.install({ ...makePlugin('b'), activate: b });
    r.activate(ctx);
    expect(b).toHaveBeenCalledOnce();
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
  });

  it('deactivate() runs teardowns returned by activate', () => {
    const r = new PluginRegistry();
    const teardown = vi.fn();
    r.install({ ...makePlugin('a'), activate: () => teardown });
    r.activate(ctx);
    r.deactivate();
    expect(teardown).toHaveBeenCalledOnce();
    // After deactivate, re-activate works again
    const teardown2 = vi.fn();
    r.install({ ...makePlugin('b'), activate: () => teardown2 });
    r.activate(ctx);
    expect(teardown2).toHaveBeenCalledTimes(0); // activate doesn't trigger teardowns
  });
});
