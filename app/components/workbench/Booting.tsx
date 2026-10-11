import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import { SIcon } from '~/components/chat/studio-icons';
import { Icon } from '~/components/ui/icons';
import { isServerCommand, type ActionState } from '~/lib/runtime/action-runner';
import { workbenchStore } from '~/lib/stores/workbench';
import { templateStatus } from '~/lib/templates/client';
import { webcontainer, webcontainerContext } from '~/lib/webcontainer';
import { useAllActions } from './actions';

type StepState = 'done' | 'running' | 'queued' | 'failed';

const INSTALL = /\b(npm (install|i|ci)|pnpm (install|i|add)|yarn( install| add)?)\b/;

function useSandboxReady() {
  const [ready, setReady] = useState(webcontainerContext.loaded);

  useEffect(() => {
    let live = true;

    webcontainer.then(() => live && setReady(true)).catch(() => undefined);

    return () => {
      live = false;
    };
  }, []);

  return ready;
}

// the three setup steps, from the real sandbox, action runner and preview state
export function useBootSteps() {
  const sandbox = useSandboxReady();
  const actions = useAllActions();
  const previews = useStore(workbenchStore.previews);
  const tpl = useStore(templateStatus);

  const shells = actions.filter((a): a is ActionState & { type: 'shell' } => a.type === 'shell');
  const installs = shells.filter((a) => INSTALL.test(a.content) && !isServerCommand(a.content));
  const servers = shells.filter((a) => isServerCommand(a.content));
  const lastInstall = installs.at(-1);
  const lastServer = servers.at(-1);
  const serving = previews.length > 0;

  let install: StepState;

  if (lastInstall?.status === 'failed') {
    install = 'failed';
  } else if (tpl && /packages/i.test(tpl)) {
    install = 'running';
  } else if (lastInstall?.status === 'running') {
    install = 'running';
  } else if (lastInstall?.status === 'pending') {
    install = 'queued';
  } else if (lastInstall || serving || lastServer?.status === 'running') {
    install = 'done';
  } else {
    install = 'queued';
  }

  let server: StepState;

  if (serving) {
    server = 'done';
  } else if (lastServer?.status === 'failed') {
    server = 'failed';
  } else if (lastServer?.status === 'running' && lastServer.executed) {
    server = 'running';
  } else {
    server = 'queued';
  }

  const steps: { label: string; state: StepState }[] = [
    { label: 'Starting the sandbox', state: sandbox ? 'done' : 'running' },
    { label: 'Installing packages', state: sandbox ? install : 'queued' },
    { label: 'Starting the dev server', state: sandbox && install === 'done' ? server : 'queued' },
  ];

  const done = steps.filter((s) => s.state === 'done').length;
  const running = steps.some((s) => s.state === 'running') ? 0.5 : 0;
  const current = Math.min(3, steps.findIndex((s) => s.state !== 'done') + 1 || 3);

  return { steps, current, progress: Math.round(((done + running) / 3) * 100), anything: actions.length > 0 || Boolean(tpl) };
}

const LABEL: Record<StepState, string> = { done: 'done', running: 'running', queued: 'queued', failed: 'failed' };

/*
 * Build-Booting: shown in the preview until the dev server answers. "Step 2 of 3" and the bar follow the real steps.
 * Before anything has been asked for, the same spot says where the app will appear.
 */
export function Booting({ isStreaming }: { isStreaming?: boolean }) {
  const { steps, current, progress, anything } = useBootSteps();

  if (!anything && !isStreaming) {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-auto bg-paper px-6 py-10">
        <div className="flex w-full max-w-[420px] flex-col items-center gap-5 text-center">
          <img
            src="/art/empty-preview.webp"
            alt="Foldo waiting in front of a blank cinema screen, popcorn spilled"
            width={240}
            height={240}
            className="block h-[240px] w-[240px] rounded-[14px] border border-rule object-cover"
          />
          <div className="flex flex-col gap-2">
            <h2 className="m-0 font-serif text-[32px] font-normal leading-[1.05]">Your app will show up here</h2>
            <p className="m-0 text-[15px] text-ink2">The preview opens once the dev server is running. Ask Foldo to build something to get started.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className="flex h-full w-full items-center justify-center overflow-auto bg-paper px-6 py-10" data-testid="foldo-booting">
      <div className="flex w-full max-w-[420px] flex-col items-center gap-6 text-center">
        <img
          src="/art/booting-cut.webp"
          alt="Foldo the paper dachshund turning the crank of a little gear machine"
          width={340}
          height={267}
          className="-mb-2 block h-auto w-[340px] max-w-full"
        />
        <div className="flex flex-col gap-2">
          <span className="eyebrow">
            Step {current} of 3
          </span>
          <h2 className="m-0 font-serif text-[36px] font-normal leading-[1.05] tracking-[-.01em]">
            Warming up your <span className="marker">workspace</span>
          </h2>
          <p className="m-0 text-[15px] text-ink2">Foldo is setting up a fresh sandbox for this project. Your preview opens here on its own.</p>
        </div>
        <div className="w-full rounded-[12px] border border-rule bg-sheet text-left">
          <ol className="m-0 flex list-none flex-col gap-[10px] px-4 py-[14px] text-[14px]">
            {steps.map((s) => (
              <li
                key={s.label}
                className={`flex items-center gap-[10px] ${s.state === 'running' ? 'font-medium' : ''} ${s.state === 'queued' ? 'text-pencil' : ''}`}
              >
                {s.state === 'done' ? (
                  <Icon.Check className="flex-none text-live" />
                ) : s.state === 'running' ? (
                  <SIcon.Arc size={16} className="text-ink" />
                ) : s.state === 'failed' ? (
                  <SIcon.Failed className="text-error" />
                ) : (
                  <SIcon.Queued />
                )}
                <span className="flex-1">{s.label}</span>
                <span
                  className={`font-mono text-[12px] font-normal ${s.state === 'done' ? 'text-live' : s.state === 'running' ? 'text-ink2' : s.state === 'failed' ? 'text-error' : ''}`}
                >
                  {LABEL[s.state]}
                </span>
              </li>
            ))}
          </ol>
          <div className="px-4 pb-[14px]">
            <div
              role="progressbar"
              aria-label="Workspace setup"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="h-[4px] overflow-hidden rounded-full bg-rule2"
            >
              <div className="h-full rounded-full bg-ink transition-[width] duration-slow" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
        <span className="font-mono text-[12px] text-pencil">Usually under a minute</span>
      </div>
    </div>
  );
}
