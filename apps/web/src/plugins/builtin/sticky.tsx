import { memo } from 'react';
import type { FrameKindPlugin, FrameRenderProps } from '@foldo/plugin-api';
import { StickyFrame } from '../../components/StickyFrame';

function StickyRender({ frame, branch, wrapperProps }: FrameRenderProps) {
  return (
    <StickyFrame frame={frame} branch={branch} wrapperProps={wrapperProps} />
  );
}

export const stickyFramePlugin: FrameKindPlugin = {
  kind: 'sticky',
  label: 'Sticky note',
  Render: memo(StickyRender),
  defaultSize: { width: 220, height: 180 },
};
