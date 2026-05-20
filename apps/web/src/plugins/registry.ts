// In-process registry for Foldo plugin contributions.
//
// Plugins call `registry.registerFrameKind` etc at app boot, BEFORE the React
// tree first renders. The host then consumes the frozen registry through the
// React tree. There is no hot reload story for plugins yet — adding a plugin
// requires a page refresh.

import type {
  FoldoPlugin,
  FrameKindPlugin,
  PluginRegistry,
  SidePanelPlugin,
  ToolPlugin,
} from '@foldo/plugin-api';

class Registry implements PluginRegistry {
  private frameKinds = new Map<string, FrameKindPlugin>();
  private tools = new Map<string, ToolPlugin>();
  private sidePanels = new Map<string, SidePanelPlugin>();
  private loadedPluginIds = new Set<string>();

  registerFrameKind(p: FrameKindPlugin): void {
    if (this.frameKinds.has(p.kind)) {
      console.warn(`[plugins] duplicate frame kind "${p.kind}" — overriding`);
    }
    this.frameKinds.set(p.kind, p);
  }

  registerTool(p: ToolPlugin): void {
    if (this.tools.has(p.id)) {
      console.warn(`[plugins] duplicate tool id "${p.id}" — overriding`);
    }
    this.tools.set(p.id, p);
  }

  registerSidePanel(p: SidePanelPlugin): void {
    if (this.sidePanels.has(p.id)) {
      console.warn(`[plugins] duplicate side panel id "${p.id}" — overriding`);
    }
    this.sidePanels.set(p.id, p);
  }

  load(plugin: FoldoPlugin): void {
    if (this.loadedPluginIds.has(plugin.id)) {
      console.warn(`[plugins] plugin "${plugin.id}" already loaded`);
      return;
    }
    plugin.register(this);
    this.loadedPluginIds.add(plugin.id);
  }

  getFrameKind(kind: string): FrameKindPlugin | undefined {
    return this.frameKinds.get(kind);
  }

  listFrameKinds(): FrameKindPlugin[] {
    return Array.from(this.frameKinds.values());
  }

  listTools(): ToolPlugin[] {
    return Array.from(this.tools.values()).sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    );
  }

  getTool(id: string): ToolPlugin | undefined {
    return this.tools.get(id);
  }

  listSidePanels(slot?: 'left' | 'right'): SidePanelPlugin[] {
    const all = Array.from(this.sidePanels.values());
    return slot ? all.filter((p) => p.slot === slot) : all;
  }
}

export const registry = new Registry();
