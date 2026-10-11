import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import type { ActionState } from '~/lib/runtime/action-runner';
import { workbenchStore } from '~/lib/stores/workbench';
import { WORK_DIR } from '~/utils/constants';

// every action of every reply, re-read whenever any runner changes
export function useAllActions() {
  const artifacts = useStore(workbenchStore.artifacts);
  const [, bump] = useState(0);

  useEffect(() => {
    const offs = Object.values(artifacts).map((a) => a.runner.actions.listen(() => bump((n) => n + 1)));

    return () => offs.forEach((off) => off());
  }, [artifacts]);

  return Object.values(artifacts).flatMap((a) => Object.values(a.runner.actions.get()));
}

export const fullPath = (filePath: string) => `${WORK_DIR}/${filePath.replace(/^\.?\//, '')}`;

/*
 * Files Foldo is writing right now (a file action that is streaming in), and the ones the latest reply already wrote,
 * as absolute paths like the file tree uses. Drives the "writing" and "updated" markers and the read-only bar.
 */
export function useFileActivity(isStreaming?: boolean) {
  useAllActions();

  const artifacts = workbenchStore.artifacts.get();
  const latest = artifacts[workbenchStore.artifactIdList.at(-1) ?? ''];
  const writing = new Set<string>();
  const updated = new Set<string>();

  for (const artifact of Object.values(artifacts)) {
    for (const action of Object.values(artifact.runner.actions.get()) as ActionState[]) {
      if (action.type === 'file' && action.filePath && action.status === 'running' && !action.executed && !artifact.closed && isStreaming) {
        writing.add(fullPath(action.filePath));
      }
    }
  }

  for (const action of Object.values(latest?.runner.actions.get() ?? {}) as ActionState[]) {
    if (action.type === 'file' && action.filePath && action.status === 'complete') {
      updated.add(fullPath(action.filePath));
    }
  }

  return { writing, updated };
}
