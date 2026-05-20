// Built-in "app" frame plugin — wraps the existing AppFrame component.

import { memo } from 'react';
import type { FrameKindPlugin, FrameRenderProps } from '@foldo/plugin-api';
import { AppFrame } from '../../components/AppFrame';
import {
  useActions,
  useFrameComments,
  useIsInViewport,
  useSelectedElement,
  useTool,
} from '../runtime';
import type { Tool } from '../../types';

function AppFrameRender({ frame, branch, wrapperProps }: FrameRenderProps) {
  const tool = useTool() as Tool;
  const comments = useFrameComments(frame.id);
  const selectedElement = useSelectedElement();
  const inViewport = useIsInViewport(frame.id);
  const actions = useActions();
  return (
    <AppFrame
      frame={frame}
      branch={branch}
      comments={comments}
      tool={tool}
      selectedElement={selectedElement}
      onSelectElement={actions.selectElement}
      onDropPin={actions.dropPin}
      onCommentClick={actions.openComment}
      inViewport={inViewport}
      wrapperProps={wrapperProps}
    />
  );
}

export const appFramePlugin: FrameKindPlugin = {
  kind: 'app',
  label: 'App',
  Render: memo(AppFrameRender),
  layerLabel: (f) => f.commitMessage || 'App',
};
