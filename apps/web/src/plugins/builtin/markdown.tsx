import { memo } from 'react';
import type { FrameKindPlugin, FrameRenderProps } from '@foldo/plugin-api';
import { MarkdownFrame } from '../../components/MarkdownFrame';
import {
  useActions,
  useBoard,
  useFrameComments,
  useIsInViewport,
  useTool,
} from '../runtime';
import type { Tool } from '../../types';

function MarkdownRender({ frame, branch, wrapperProps }: FrameRenderProps) {
  const actions = useActions();
  return (
    <MarkdownFrame
      frame={frame}
      branch={branch}
      board={useBoard()}
      comments={useFrameComments(frame.id)}
      tool={useTool() as Tool}
      inViewport={useIsInViewport(frame.id)}
      onSelectMdLine={actions.selectMarkdownLine}
      onCommentClick={actions.openComment}
      onDropPin={actions.dropPin}
      wrapperProps={wrapperProps}
    />
  );
}

export const markdownFramePlugin: FrameKindPlugin = {
  kind: 'markdown',
  label: 'Doc',
  Render: memo(MarkdownRender),
  isScrollable: true,
};
