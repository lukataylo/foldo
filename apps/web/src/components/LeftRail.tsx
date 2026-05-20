import { Fragment, useMemo } from 'react';
import type { ToolPlugin } from '@foldo/plugin-api';
import { registry } from '../plugins/registry';
import type { Tool } from '../types';

interface Props {
  tool: Tool;
  onChange: (t: Tool) => void;
  /**
   * Render orientation. `vertical` is the default left-rail layout; `horizontal`
   * is used when the Layers panel takes over the left side and the rail moves
   * to the bottom of the screen.
   */
  orientation?: 'vertical' | 'horizontal';
}

export function LeftRail({ tool, onChange, orientation = 'vertical' }: Props) {
  const tools = useMemo(() => registry.listTools(), []);
  const groups = useMemo(() => groupByContinuousField(tools, (t) => t.group), [tools]);

  const wrapClass =
    orientation === 'horizontal'
      ? 'pointer-events-none absolute left-1/2 z-40 -translate-x-1/2 safe-bottom'
      : 'pointer-events-none absolute left-3 top-1/2 z-40 -translate-y-1/2';
  const wrapStyle: React.CSSProperties =
    orientation === 'horizontal' ? { bottom: `calc(4.25rem + env(safe-area-inset-bottom, 0px))` } : {};

  const innerClass =
    orientation === 'horizontal'
      ? 'pointer-events-auto flex items-center gap-0.5 rounded-xl border border-hairlineSoft bg-panel p-1 shadow-panel'
      : 'pointer-events-auto flex flex-col gap-0.5 rounded-xl border border-hairlineSoft bg-panel p-1 shadow-panel';

  return (
    <div className={wrapClass} style={wrapStyle}>
      <div className={innerClass}>
        {groups.map((group, gi) => (
          <Fragment key={gi}>
            {gi > 0 &&
              (orientation === 'horizontal' ? (
                <div className="mx-0.5 h-4 w-px bg-hairlineSoft" />
              ) : (
                <div className="my-0.5 h-px bg-hairlineSoft" />
              ))}
            {group.map((t) => (
              <RailButton
                key={t.id}
                label={t.label}
                active={tool === t.id}
                onClick={() => onChange(t.id)}
                shortcut={t.shortcut}
              >
                <t.Icon />
              </RailButton>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** Split a sorted list into runs sharing the same field value. */
function groupByContinuousField<T>(
  items: T[],
  getField: (item: T) => string | undefined,
): T[][] {
  const groups: T[][] = [];
  let last: string | undefined | null = null;
  for (const item of items) {
    const field = getField(item);
    if (field !== last || groups.length === 0) {
      groups.push([item]);
      last = field;
    } else {
      groups[groups.length - 1].push(item);
    }
  }
  return groups;
}

function RailButton({
  label,
  active,
  onClick,
  shortcut,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  shortcut?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={
        'touch-target group relative flex h-9 w-9 items-center justify-center rounded-md transition-colors ' +
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

// Re-export so existing imports `import type { ToolPlugin } from "..."` keep working.
export type { ToolPlugin };
