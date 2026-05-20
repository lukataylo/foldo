// FrameShell — the shared positioned wrapper + FrameMeta chrome every
// on-canvas frame sits inside. Frames render `<FrameShell …>{body}</FrameShell>`
// instead of each repeating the absolute-positioning boilerplate and the
// `{...wrapperProps}` spread. The host-supplied `wrapperProps` (data-* attrs
// for tests + locked-state styling) is spread exactly once, here.

import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import type { Branch, Frame } from '@foldo/protocol';
import { FrameMeta } from './FrameMeta';

interface Props {
  frame: Frame;
  branch: Branch;
  /** Host attrs (data-frame-id/kind, locked styles). Spread onto the root. */
  wrapperProps?: HTMLAttributes<HTMLDivElement>;
  /** Extra style merged onto the positioned wrapper (e.g. arrow pointer-events). */
  style?: CSSProperties;
  /** Render the FrameMeta header. Default true. */
  showMeta?: boolean;
  children: ReactNode;
}

export function FrameShell({
  frame,
  branch,
  wrapperProps,
  style,
  showMeta = true,
  children,
}: Props) {
  return (
    <div
      {...wrapperProps}
      className={
        wrapperProps?.className ? `absolute ${wrapperProps.className}` : 'absolute'
      }
      style={{
        left: frame.position.x,
        top: frame.position.y,
        width: frame.size.width,
        height: frame.size.height,
        ...style,
        ...wrapperProps?.style,
      }}
    >
      {showMeta && <FrameMeta frame={frame} branch={branch} />}
      {children}
    </div>
  );
}
