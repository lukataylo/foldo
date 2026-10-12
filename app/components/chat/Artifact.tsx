import { useStore } from '@nanostores/react';
import { memo, useState } from 'react';
import { isServerCommand, type ActionState } from '~/lib/runtime/action-runner';
import { requestFix } from '~/lib/stores/ui';
import { workbenchStore } from '~/lib/stores/workbench';
import { activeTemplate } from '~/lib/templates/client';
import { WORK_DIR } from '~/utils/constants';
import { Icon } from '~/components/ui/icons';
import { SIcon } from './studio-icons';
import { streamingNow } from './studio-state';

interface ArtifactProps {
  messageId: string;
}

type Row = { kind: 'done' | 'running' | 'serving' | 'queued' | 'failed' | 'stopped'; note?: string };

const isDone = (row: Row) => row.kind === 'done' || row.kind === 'serving';

/*
 * Step log (SPEC "Step log"): a Sheet card with the build's title in serif, a mono "done / total" count and one row per
 * action. While anything is still to do it is open; once every step is done it folds to a single row (click to open).
 */
export const Artifact = memo(({ messageId }: ArtifactProps) => {
  const artifacts = useStore(workbenchStore.artifacts);
  const artifact = artifacts[messageId];
  const actions = Object.values(useStore(artifact.runner.actions));
  const live = useStore(streamingNow);
  const template = useStore(activeTemplate);
  const [toggled, setToggled] = useState<boolean | undefined>(undefined);

  // a reply that ended before its closing tag was cut off: its unwritten steps never start
  const streaming = !artifact.closed && workbenchStore.artifactIdList.at(-1) === messageId && live;

  const earlier = new Set<string>();

  for (const id of workbenchStore.artifactIdList) {
    if (id === messageId) {
      break;
    }

    for (const a of Object.values(artifacts[id]?.runner.actions.get() ?? {})) {
      if (a.type === 'file') {
        earlier.add(a.filePath);
      }
    }
  }

  const rows = actions.map((action) => ({ action, row: rowState(action, streaming || artifact.closed) }));
  const done = rows.filter(({ row }) => isDone(row)).length;
  const finished = artifact.closed && done === rows.length && rows.length > 0;
  const open = toggled ?? !finished;

  return (
    <div className="artifact actions rounded-[8px] border border-rule bg-sheet" data-testid="foldo-step-log">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setToggled(!open)}
        className={`flex w-full items-center justify-between gap-3 border-0 bg-transparent px-3 py-[10px] text-left text-ink ${open ? 'border-b border-solid border-rule2' : ''}`}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          {!open && finished && <Icon.Check size={14} className="flex-none text-live" />}
          <span className="truncate font-serif text-[18px] leading-[1.2]">{artifact.title}</span>
        </span>
        <span className="flex-none font-mono text-[11px] text-pencil">
          {done} / {rows.length}
        </span>
      </button>
      {open && rows.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-[5px] px-3 pb-[10px] pt-2 text-[13px]">
          {rows.map(({ action, row }, index) => (
            <Step key={index} action={action} row={row} update={action.type === 'file' && (earlier.has(action.filePath) || Boolean(template))} />
          ))}
        </ul>
      )}
    </div>
  );
});

function rowState(action: ActionState, live: boolean): Row {
  const server = action.type === 'shell' && isServerCommand(action.content);

  switch (action.status) {
    case 'complete':
      return { kind: 'done' };
    case 'failed':
      return { kind: 'failed' };
    case 'aborted':
      return { kind: 'stopped', note: 'stopped' };
    case 'running':
      if (server && action.executed) {
        return { kind: 'serving' };
      }

      // a file is "running" while it streams in; after a cut-off it never arrives
      return action.executed || live ? { kind: 'running', note: action.type === 'file' ? 'writing…' : 'running…' } : { kind: 'queued', note: 'not started' };
    default:
      return live || action.executed ? { kind: 'queued' } : { kind: 'queued', note: 'not started' };
  }
}

const code = 'font-mono text-[12px]';
const chip = 'rounded-[4px] border border-solid border-rule2 bg-codebg px-[5px] font-mono text-[12px]';

function Step({ action, row, update }: { action: ActionState; row: Row; update: boolean }) {
  const server = action.type === 'shell' && isServerCommand(action.content);

  const icon =
    row.kind === 'done' ? (
      <Icon.Check size={14} className="flex-none text-live" />
    ) : row.kind === 'running' ? (
      <SIcon.Arc className="text-ink" />
    ) : row.kind === 'serving' ? (
      <span className="inline-flex w-[14px] flex-none justify-center">
        <span className="h-[7px] w-[7px] rounded-full bg-live" />
      </span>
    ) : row.kind === 'failed' ? (
      <SIcon.Failed size={14} className="text-error" />
    ) : (
      <SIcon.Queued size={14} />
    );

  const tone = row.kind === 'running' ? 'font-medium text-ink' : row.kind === 'queued' || row.kind === 'stopped' ? 'text-pencil' : 'text-ink';

  const openFile = () => {
    if (action.type === 'file') {
      workbenchStore.showWorkbench.set(true);
      workbenchStore.currentView.set('code');
      workbenchStore.setSelectedFile(`${WORK_DIR}/${action.filePath.replace(/^\.?\//, '')}`);
    }
  };

  return (
    <li>
      <div className={`flex min-w-0 items-center gap-2 ${tone}`}>
        {icon}
        {action.type === 'file' ? (
          <button type="button" onClick={openFile} className="inline-flex min-w-0 items-center gap-2 border-0 bg-transparent p-0 text-left text-inherit">
            {update ? 'Update' : 'Create'} <code className={`${code} truncate`}>{action.filePath}</code>
          </button>
        ) : (
          <>
            <span className="whitespace-nowrap">
              {row.kind === 'failed'
                ? 'Command failed'
                : server
                  ? row.kind === 'serving'
                    ? 'Dev server running'
                    : 'Start dev server'
                  : 'Run command'}
            </span>
            <code className={`${chip} min-w-0 truncate`}>{action.content.trim()}</code>
          </>
        )}
        {row.note && <span className="whitespace-nowrap text-[12px] font-normal text-pencil">{row.note}</span>}
      </div>
      {action.status === 'failed' && 'error' in action && action.error && (
        <div className="ml-[22px] mt-[6px] flex flex-col items-start gap-2">
          <pre className="m-0 max-h-32 w-full overflow-auto whitespace-pre-wrap rounded-[6px] border border-rule bg-codebg !px-2 !py-[6px] font-mono text-[12px] leading-[1.5] text-ink2">
            {action.error}
          </pre>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => requestFix(action.type === 'shell' ? `The command "${action.content.trim()}" failed:\n${action.error}` : action.error)}
          >
            <SIcon.Wrench size={15} /> Fix this error
          </button>
        </div>
      )}
    </li>
  );
}
