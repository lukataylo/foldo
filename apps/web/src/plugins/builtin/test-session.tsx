import { memo } from 'react';
import type { FrameKindPlugin, FrameRenderProps } from '@foldo/plugin-api';
import { TestSessionFrame } from '../../components/TestSessionFrame';
import { useActions } from '../runtime';

function TestSessionRender({ frame, branch, wrapperProps }: FrameRenderProps) {
  const actions = useActions();
  return (
    <TestSessionFrame
      frame={frame}
      branch={branch}
      onMakeEditFromIssue={actions.makeEditFromIssue}
      wrapperProps={wrapperProps}
    />
  );
}

export const testSessionFramePlugin: FrameKindPlugin = {
  kind: 'test_session',
  label: 'User test session',
  Render: memo(TestSessionRender),
};
