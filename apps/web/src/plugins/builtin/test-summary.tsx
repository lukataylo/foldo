import { memo } from 'react';
import type { FrameKindPlugin, FrameRenderProps } from '@foldo/plugin-api';
import { TestSummaryFrame } from '../../components/TestSummaryFrame';

function TestSummaryRender({ frame, branch, wrapperProps }: FrameRenderProps) {
  return (
    <TestSummaryFrame
      frame={frame}
      branch={branch}
      wrapperProps={wrapperProps}
    />
  );
}

export const testSummaryFramePlugin: FrameKindPlugin = {
  kind: 'test_summary',
  label: 'Test summary',
  Render: memo(TestSummaryRender),
};
