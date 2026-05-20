import { memo } from 'react';
import type { FrameKindPlugin, FrameRenderProps } from '@foldo/plugin-api';
import { ArrowFrame } from '../../components/ArrowFrame';

function ArrowRender({ frame, branch, wrapperProps }: FrameRenderProps) {
  return (
    <ArrowFrame frame={frame} branch={branch} wrapperProps={wrapperProps} />
  );
}

export const arrowFramePlugin: FrameKindPlugin = {
  kind: 'arrow',
  label: 'Arrow',
  Render: memo(ArrowRender),
};
