// Design inspector plugin — right-side panel with Layout / Border / Font /
// Fill controls. Operates on the currently selected frame (set by the Layers
// panel or by the Design tool clicking on a frame).
//
// Style changes are applied optimistically to the local store and persisted
// via PATCH /api/frames/:id. Built-in frame components opt in by reading
// `frame.style` and rendering it onto their outer wrapper.

import { useCallback } from 'react';
import type { Frame, FrameStyle } from '@foldo/protocol';
import type { FoldoPlugin } from '@foldo/plugin-api';
import { boardStore, useBoardSnapshot } from '../../state/useBoardStore';
import { updateFrame as apiUpdateFrame } from '../../api/frames';
import { useSelectedFrameId } from '../runtime';

function DesignIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M5 9.5L7 7.5 9.5 10l1.5-1.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DesignPanel() {
  const snap = useBoardSnapshot();
  const selectedFrameId = useSelectedFrameId();
  const frame = selectedFrameId ? snap.frames.get(selectedFrameId) ?? null : null;

  const applyStyle = useCallback(
    (next: FrameStyle) => {
      if (!frame) return;
      const merged: FrameStyle = { ...(frame.style ?? {}), ...next };
      boardStore.upsertFrame({ ...frame, style: merged });
      void apiUpdateFrame(frame.id, { style: merged }).catch((err) => {
        console.warn('[foldo] design update failed', err);
      });
    },
    [frame],
  );

  const clearStyle = useCallback(() => {
    if (!frame) return;
    boardStore.upsertFrame({ ...frame, style: undefined });
    void apiUpdateFrame(frame.id, { style: null }).catch((err) => {
      console.warn('[foldo] design clear failed', err);
    });
  }, [frame]);

  if (!frame) {
    return (
      <div className="px-3 py-4 text-[11.5px] leading-relaxed text-inkFaint">
        Select a frame (from the Layers panel or by clicking it on the canvas)
        to edit its design.
      </div>
    );
  }

  const style = frame.style ?? {};
  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <Section title="Layout">
        <SizeRow frame={frame} />
        <NumRow
          label="Pad ↑"
          value={style.padding?.top}
          onChange={(v) =>
            applyStyle({ padding: { ...(style.padding ?? {}), top: v } })
          }
        />
        <NumRow
          label="Pad ↓"
          value={style.padding?.bottom}
          onChange={(v) =>
            applyStyle({ padding: { ...(style.padding ?? {}), bottom: v } })
          }
        />
        <NumRow
          label="Pad ←"
          value={style.padding?.left}
          onChange={(v) =>
            applyStyle({ padding: { ...(style.padding ?? {}), left: v } })
          }
        />
        <NumRow
          label="Pad →"
          value={style.padding?.right}
          onChange={(v) =>
            applyStyle({ padding: { ...(style.padding ?? {}), right: v } })
          }
        />
      </Section>

      <Section title="Border">
        <NumRow
          label="Width"
          value={style.border?.width}
          onChange={(v) =>
            applyStyle({ border: { ...(style.border ?? {}), width: v } })
          }
        />
        <ColorRow
          label="Color"
          value={style.border?.color}
          onChange={(v) =>
            applyStyle({ border: { ...(style.border ?? {}), color: v } })
          }
        />
        <NumRow
          label="Radius"
          value={style.border?.radius}
          onChange={(v) =>
            applyStyle({ border: { ...(style.border ?? {}), radius: v } })
          }
        />
        <SelectRow
          label="Style"
          value={style.border?.style ?? 'solid'}
          options={['solid', 'dashed', 'dotted']}
          onChange={(v) =>
            applyStyle({
              border: {
                ...(style.border ?? {}),
                style: v as NonNullable<FrameStyle['border']>['style'],
              },
            })
          }
        />
      </Section>

      <Section title="Font">
        <TextRow
          label="Family"
          value={style.font?.family}
          placeholder="Inter"
          onChange={(v) =>
            applyStyle({ font: { ...(style.font ?? {}), family: v || undefined } })
          }
        />
        <NumRow
          label="Size"
          value={style.font?.size}
          onChange={(v) =>
            applyStyle({ font: { ...(style.font ?? {}), size: v } })
          }
        />
        <NumRow
          label="Weight"
          value={style.font?.weight}
          step={100}
          min={100}
          max={900}
          onChange={(v) =>
            applyStyle({ font: { ...(style.font ?? {}), weight: v } })
          }
        />
        <ColorRow
          label="Color"
          value={style.font?.color}
          onChange={(v) =>
            applyStyle({ font: { ...(style.font ?? {}), color: v } })
          }
        />
      </Section>

      <Section title="Fill">
        <ColorRow
          label="Background"
          value={style.fill}
          onChange={(v) => applyStyle({ fill: v })}
        />
        <NumRow
          label="Opacity"
          value={style.opacity != null ? Math.round(style.opacity * 100) : undefined}
          step={5}
          min={0}
          max={100}
          onChange={(v) =>
            applyStyle({ opacity: v == null ? undefined : v / 100 })
          }
        />
      </Section>

      <button
        onClick={clearStyle}
        className="touch-target mt-1 rounded-md border border-hairlineSoft px-3 py-1.5 text-[11.5px] text-inkMute hover:bg-white/5 hover:text-ink"
      >
        Reset design overrides
      </button>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-inkFaint">
        {title}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function SizeRow({ frame }: { frame: Frame }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-[11px] text-inkMute">Size</div>
      <div className="font-mono text-[11px] text-ink">
        {Math.round(frame.size.width)} × {Math.round(frame.size.height)}
      </div>
    </div>
  );
}

function NumRow({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  label: string;
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-inkMute">{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value ?? ''}
        placeholder="—"
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '' ? undefined : Number(v));
        }}
        className="w-20 rounded border border-hairlineSoft bg-canvas/80 px-2 py-1 text-right font-mono text-[11px] text-ink placeholder:text-inkFaint focus:outline-none focus:border-accent/60"
      />
    </label>
  );
}

function TextRow({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | undefined;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-inkMute">{label}</span>
      <input
        type="text"
        value={value ?? ''}
        placeholder={placeholder ?? '—'}
        onChange={(e) => onChange(e.target.value)}
        className="w-28 rounded border border-hairlineSoft bg-canvas/80 px-2 py-1 text-[11px] text-ink placeholder:text-inkFaint focus:outline-none focus:border-accent/60"
      />
    </label>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-inkMute">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="color"
          value={value ?? '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-7 cursor-pointer rounded border border-hairlineSoft bg-canvas"
          aria-label={label}
        />
        <input
          type="text"
          value={value ?? ''}
          placeholder="—"
          onChange={(e) => onChange(e.target.value || undefined)}
          className="w-20 rounded border border-hairlineSoft bg-canvas/80 px-2 py-1 font-mono text-[11px] text-ink placeholder:text-inkFaint focus:outline-none focus:border-accent/60"
        />
      </div>
    </label>
  );
}

function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-inkMute">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 rounded border border-hairlineSoft bg-canvas/80 px-2 py-1 text-[11px] text-ink focus:outline-none focus:border-accent/60"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

// Tool button to surface the Design plugin in the LeftRail. Clicking it
// switches tools (which doesn't have direct canvas behavior) and toggles the
// right panel open via a window event the SidePanelHost listens for.

export const designPlugin: FoldoPlugin = {
  id: 'foldo:design',
  register(api) {
    api.registerTool({
      id: 'design',
      label: 'Design (D)',
      shortcut: 'D',
      Icon: DesignIcon,
      order: 80,
      group: 'design',
      onBackgroundClick: () => {
        // Open the design panel via the side-panel host's open-state contract.
        window.dispatchEvent(
          new CustomEvent('foldo:openSidePanel', { detail: { id: 'design' } }),
        );
      },
      preventDeselectOnBackground: true,
    });
    api.registerSidePanel({
      id: 'design',
      slot: 'right',
      label: 'Design',
      Icon: DesignIcon,
      defaultOpen: false,
      defaultWidth: 260,
      Component: DesignPanel,
    });
  },
};
