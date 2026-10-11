import { useStore } from '@nanostores/react';
import { useLoaderData } from '@remix-run/react';
import { atom } from 'nanostores';
import { memo, useEffect, useRef, useState } from 'react';
import { SIcon } from '~/components/chat/studio-icons';
import { fixInFlight } from '~/components/chat/studio-state';
import { Icon } from '~/components/ui/icons';
import { chatId } from '~/lib/persistence';
import { previewError, requestFix } from '~/lib/stores/ui';
import { workbenchStore } from '~/lib/stores/workbench';
import { Booting } from './Booting';
import { PortDropdown } from './PortDropdown';

/*
 * The preview body (iframe, booting state, error banner) and the address bar that sits in the workbench toolbar.
 * They share the selected port, the path and a reload counter through these atoms.
 */
const selectedPort = atom<number | undefined>(undefined);
const path = atom('/');
const reloads = atom(0);

let iframe: HTMLIFrameElement | null = null;

function useActivePreview() {
  const previews = useStore(workbenchStore.previews);
  const chosen = useStore(selectedPort);

  // the team's pick, else the lowest port (the app, not a helper server)
  return (
    previews.find((p) => p.port === chosen) ??
    previews.reduce<(typeof previews)[number] | undefined>((min, p) => (!min || p.port < min.port ? p : min), undefined)
  );
}

export const reloadPreview = () => reloads.set(reloads.get() + 1);

export function fullscreenPreview() {
  iframe?.requestFullscreen?.().catch(() => undefined);
}

// Workbench toolbar: reload + "localhost:5173/" (teams know that address; the real one is a long sandbox URL)
export function AddressBar({ readOnly }: { readOnly?: boolean }) {
  const previews = useStore(workbenchStore.previews);
  const active = useActivePreview();
  const current = useStore(path);
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [portsOpen, setPortsOpen] = useState(false);
  const shown = active ? `localhost:${active.port}${current}` : '';

  const go = (value: string) => {
    const match = /^(?:https?:\/\/)?(?:localhost:(\d+))?(\/.*)?$/.exec(value.trim());

    if (!match) {
      return;
    }

    const port = match[1] ? Number(match[1]) : undefined;

    if (port && previews.some((p) => p.port === port)) {
      selectedPort.set(port);
    }

    path.set(match[2] || '/');
    reloadPreview();
  };

  return (
    <div className="flex h-[32px] min-w-0 flex-1 items-center gap-2 rounded-[7px] border border-rule bg-paper pl-[10px] pr-1">
      <button
        type="button"
        aria-label="Reload preview"
        title="Reload preview"
        disabled={!active}
        onClick={reloadPreview}
        className="inline-flex h-[24px] w-[24px] flex-none items-center justify-center rounded-[4px] border-0 bg-transparent p-0 text-pencil enabled:hover:bg-wash enabled:hover:text-ink"
      >
        <Icon.Refresh size={14} />
      </button>
      <label htmlFor="foldo-preview-url" className="sr-only">
        Preview address
      </label>
      <input
        id="foldo-preview-url"
        type="text"
        value={draft ?? shown}
        readOnly={readOnly}
        disabled={!active}
        placeholder="Waiting for the dev server…"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => setDraft(undefined)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && draft !== undefined) {
            go(draft);
            setDraft(undefined);
            event.currentTarget.blur();
          }
        }}
        className="min-w-0 flex-1 border-0 bg-transparent font-mono text-[12px] text-ink2 outline-none placeholder:text-pencil disabled:bg-transparent"
      />
      {previews.length > 1 && active && (
        <PortDropdown
          activePreviewIndex={previews.indexOf(active)}
          setActivePreviewIndex={(index) => selectedPort.set(previews[index]?.port)}
          isDropdownOpen={portsOpen}
          setHasSelectedPreview={() => undefined}
          setIsDropdownOpen={setPortsOpen}
          previews={previews}
        />
      )}
    </div>
  );
}

export const Preview = memo(({ isStreaming }: { isStreaming?: boolean }) => {
  const ref = useRef<HTMLIFrameElement>(null);
  const active = useActivePreview();
  const current = useStore(path);
  const reload = useStore(reloads);
  const error = useStore(previewError);
  const fixing = useStore(fixInFlight);
  const projectId = useStore(chatId);
  const { shared } = useLoaderData() as { shared?: boolean };
  // nobody can fix the original from its share link (a signed-in visitor can once their message has made a remix)
  const canFix = !shared || Boolean(projectId);
  const src = active ? active.baseUrl + current : undefined;

  useEffect(() => {
    iframe = ref.current;

    return () => {
      iframe = null;
    };
  });

  useEffect(() => {
    if (reload && ref.current && src) {
      ref.current.src = src;
    }
  }, [reload]);

  const frame = active ? (
    <iframe
      ref={ref}
      title="App preview"
      className="block h-full w-full border-none bg-white"
      src={src}
      // generated apps love "copy link" buttons, which throw without clipboard permission in a cross-origin frame
      allow="clipboard-read; clipboard-write; fullscreen"
    />
  ) : null;

  if (error) {
    return (
      <div className="flex h-full w-full flex-col gap-4 overflow-auto bg-sheet p-4">
        <div role="alert" data-testid="foldo-preview-error" className="flex flex-none items-center gap-5 rounded-[10px] border border-error-border bg-error-bg py-4 pl-2 pr-4">
          <img
            src="/art/build-error-cut.webp"
            alt="Foldo in a hard hat with a wrench in its mouth, next to a pile of toppled building blocks"
            width={220}
            height={152}
            className="block h-auto w-[220px] flex-none lt-lg:hidden"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-[10px]">
            <div className="flex items-center gap-2">
              <Icon.Alert size={18} className="flex-none text-error" />
              <span className="text-[16px] font-semibold">Your app hit an error</span>
            </div>
            <p className="m-0 text-[14px] text-ink2">The preview stopped after the last build. Your code is safe; Foldo can usually fix this in one go.</p>
            <pre className="m-0 max-h-[88px] overflow-hidden whitespace-pre-wrap rounded-[8px] border border-rule bg-codebg px-3 py-[10px] font-mono text-[12px] leading-[1.6] text-ink2">
              {error}
            </pre>
            <div className="flex flex-wrap items-center gap-2">
              {canFix && (
                <button
                  type="button"
                  className="btn-primary btn-sm rounded-[8px]"
                  onClick={() => {
                    requestFix(error);

                    if (!isStreaming) {
                      previewError.set(undefined);
                    }
                  }}
                >
                  <SIcon.Wrench size={15} /> Fix this error
                </button>
              )}
              <button type="button" className="btn-secondary btn-sm rounded-[8px] px-[14px]" onClick={() => previewError.set(undefined)}>
                Dismiss
              </button>
              {fixing && <span className="ml-auto font-mono text-[12px] text-pencil">Foldo is already fixing this</span>}
            </div>
          </div>
        </div>
        <div className="flex min-h-[200px] flex-1 items-center justify-center overflow-hidden rounded-[10px] border border-dashed border-rule bg-sheet">
          {frame ?? <span className="text-[13px] text-pencil">The preview is blank until the fix lands.</span>}
        </div>
      </div>
    );
  }

  return <div className="relative h-full w-full">{frame ?? <Booting isStreaming={isStreaming} />}</div>;
});
