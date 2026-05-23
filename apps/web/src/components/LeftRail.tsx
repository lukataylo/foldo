// Vertical tool pill on the canvas's left edge. After the Step 9 fast-follow
// this is a thin wrapper around the `toolbar` plugin surface — every button
// you see here is contributed by the `core/tools` plugin (apps/web/src/
// plugins/core-tools/index.tsx).
//
// The component is kept around (rather than deleted in favour of the
// bottom-center PluginToolBar) for two reasons:
//   1. The vertical-pill placement is part of the canvas's visual identity.
//   2. Every e2e spec clicks `getByTestId('foldo-rail-tool-<id>')` — those
//      testids stay alive here so the test suite doesn't churn.
//
// Active-state highlight uses `tool === t.id`, which works because the
// plugin's ToolSpec ids match the canvas `Tool` union one-to-one. `onChange`
// is no longer wired to the buttons (each ToolSpec.activate() hits
// `window.__foldoSetTool` instead), but the prop stays in the signature for
// the App.tsx call site — it's a free hook for any future direct-from-rail
// tool changes.

import { Fragment } from 'react';
import { usePluginSurfaces } from '../plugins/registry';
import type { Tool } from '../types';

interface Props {
  tool: Tool;
  /** Retained for back-compat; plugin tools route through window.__foldoSetTool. */
  onChange?: (t: Tool) => void;
}

export function LeftRail({ tool }: Props) {
  const surfaces = usePluginSurfaces('toolbar');
  const tools = surfaces.flatMap((s) => s.tools);
  // Don't render the container if no plugin contributes tools — the slot is
  // visually-empty and stealing left-edge real estate would be a regression.
  if (tools.length === 0) return null;

  return (
    <div
      data-testid="foldo-canvas-leftrail"
      className="pointer-events-none absolute left-3 top-1/2 z-40 -translate-y-1/2"
    >
      <div className="pointer-events-auto flex flex-col gap-0.5 rounded-xl border border-hairlineSoft bg-panel p-1 shadow-panel">
        {tools.map((t, i) => {
          const prev = i > 0 ? tools[i - 1] : undefined;
          const groupChanged = prev && (prev.group ?? '') !== (t.group ?? '');
          return (
            <Fragment key={t.id}>
              {groupChanged ? (
                <div className="my-0.5 h-px bg-hairlineSoft" />
              ) : null}
              <RailButton
                toolId={t.id}
                label={
                  t.shortcut ? `${t.label} (${t.shortcut.toUpperCase()})` : t.label
                }
                active={tool === t.id}
                onClick={t.activate}
                shortcut={t.shortcut}
              >
                {t.icon}
              </RailButton>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function RailButton({
  toolId,
  label,
  active,
  onClick,
  shortcut,
  children,
}: {
  toolId: string;
  label: string;
  active?: boolean;
  onClick: () => void;
  shortcut?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      data-testid={`foldo-rail-tool-${toolId}`}
      title={label}
      onClick={onClick}
      /* A+W1 touch: 44x44 (h-11 w-11) for iPad finger-friendliness; was 36x36. */
      className={
        'group relative flex h-11 w-11 items-center justify-center rounded-md transition-colors ' +
        (active
          ? 'bg-accent/15 text-accent'
          : 'text-inkMute hover:bg-white/5 hover:text-ink')
      }
    >
      {children}
      {shortcut && (
        <span className="absolute right-1 top-0.5 text-[8.5px] text-inkFaint group-hover:text-inkMute">
          {shortcut}
        </span>
      )}
    </button>
  );
}
