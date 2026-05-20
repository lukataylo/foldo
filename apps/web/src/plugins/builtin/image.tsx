import { memo } from 'react';
import type { FrameKindPlugin, FrameRenderProps } from '@foldo/plugin-api';
import { ImageFrame } from '../../components/ImageFrame';
import { useActions, useFrameComments, useTool } from '../runtime';
import type { Tool } from '../../types';

function ImageRender({ frame, branch, wrapperProps }: FrameRenderProps) {
  const actions = useActions();
  return (
    <ImageFrame
      frame={frame}
      branch={branch}
      tool={useTool() as Tool}
      comments={useFrameComments(frame.id)}
      onDropPin={actions.dropPin}
      onCommentClick={actions.openComment}
      wrapperProps={wrapperProps}
    />
  );
}

export const imageFramePlugin: FrameKindPlugin = {
  kind: 'image',
  label: 'Image',
  Render: memo(ImageRender),
};
