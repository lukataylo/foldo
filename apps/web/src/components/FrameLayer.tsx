// The on-canvas frame list, isolated from App's viewport re-renders.
//
// App re-renders on every camera RAF tick (popover positioning, follow-me).
// If the frame list lived inline in App, each tick would recreate every
// frame element + a fresh `wrapperProps` object, defeating the per-frame
// React.memo. FrameLayer is memo'd with no props and reads frames straight
// from the board store, so a camera tick never reaches it. Each frame is a
// memo'd <FrameHost> keyed by id, so a single frame's mutation (drag, edit)
// re-renders only that frame.

import { memo, useMemo, type HTMLAttributes } from 'react';
import type { Branch, Frame } from '@foldo/protocol';
import type { FrameKindPlugin } from '@foldo/plugin-api';
import { useBoardSelector } from '../state/useBoardStore';
import { registry } from '../plugins/registry';

const LOCKED_STYLE: HTMLAttributes<HTMLDivElement>['style'] = {
  pointerEvents: 'none',
  opacity: 0.85,
};

const FrameHost = memo(function FrameHost({
  frame,
  branch,
  plugin,
}: {
  frame: Frame;
  branch: Branch;
  plugin: FrameKindPlugin;
}) {
  // Stable per-frame host attrs. Rebuilt only when this frame's identity or
  // lock state changes — not on every parent render.
  const wrapperProps = useMemo<HTMLAttributes<HTMLDivElement>>(
    () => ({
      'data-frame-id': frame.id,
      'data-frame-kind': frame.kind,
      ...(frame.locked ? { style: LOCKED_STYLE } : null),
    }),
    [frame.id, frame.kind, frame.locked],
  );
  const Render = plugin.Render;
  return <Render frame={frame} branch={branch} wrapperProps={wrapperProps} />;
});

export const FrameLayer = memo(function FrameLayer() {
  const frames = useBoardSelector((s) => s.frames);
  const branches = useBoardSelector((s) => s.branches);

  const items = useMemo(() => {
    const out: Array<{ frame: Frame; branch: Branch; plugin: FrameKindPlugin }> =
      [];
    for (const frame of frames.values()) {
      if (frame.hidden) continue;
      const branch = branches.get(frame.branchId);
      if (!branch) continue;
      const plugin = registry.getFrameKind(frame.kind);
      if (!plugin) {
        console.warn(
          `[foldo] no plugin registered for frame kind "${frame.kind}"`,
        );
        continue;
      }
      out.push({ frame, branch, plugin });
    }
    return out;
  }, [frames, branches]);

  return (
    <>
      {items.map(({ frame, branch, plugin }) => (
        <FrameHost
          key={frame.id}
          frame={frame}
          branch={branch}
          plugin={plugin}
        />
      ))}
    </>
  );
});
