import { useStore } from '@nanostores/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import { previewError, requestFix } from '~/lib/stores/ui';
import { workbenchStore } from '~/lib/stores/workbench';
import { PortDropdown } from './PortDropdown';

export const Preview = memo(() => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const [isPortDropdownOpen, setIsPortDropdownOpen] = useState(false);
  const hasSelectedPreview = useRef(false);
  const previews = useStore(workbenchStore.previews);
  const error = useStore(previewError);
  const activePreview = previews[activePreviewIndex];

  const [url, setUrl] = useState('');
  const [iframeUrl, setIframeUrl] = useState<string | undefined>();

  useEffect(() => {
    if (!activePreview) {
      setUrl('');
      setIframeUrl(undefined);

      return;
    }

    const { baseUrl } = activePreview;

    setUrl(baseUrl);
    setIframeUrl(baseUrl);
  }, [activePreview, iframeUrl]);

  const validateUrl = useCallback(
    (value: string) => {
      if (!activePreview) {
        return false;
      }

      const { baseUrl } = activePreview;

      if (value === baseUrl) {
        return true;
      } else if (value.startsWith(baseUrl)) {
        return ['/', '?', '#'].includes(value.charAt(baseUrl.length));
      }

      return false;
    },
    [activePreview],
  );

  const findMinPortIndex = useCallback(
    (minIndex: number, preview: { port: number }, index: number, array: { port: number }[]) => {
      return preview.port < array[minIndex].port ? index : minIndex;
    },
    [],
  );

  // when previews change, display the lowest port if user hasn't selected a preview
  useEffect(() => {
    if (previews.length > 1 && !hasSelectedPreview.current) {
      const minPortIndex = previews.reduce(findMinPortIndex, 0);

      setActivePreviewIndex(minPortIndex);
    }
  }, [previews]);

  const reloadPreview = () => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      {isPortDropdownOpen && (
        <div className="z-iframe-overlay w-full h-full absolute" onClick={() => setIsPortDropdownOpen(false)} />
      )}
      <div className="bg-bolt-elements-background-depth-2 p-2 flex items-center gap-1.5">
        <IconButton icon="i-ph:arrow-clockwise" onClick={reloadPreview} />
        <div
          className="flex items-center gap-1 flex-grow bg-bolt-elements-preview-addressBar-background border border-bolt-elements-borderColor text-bolt-elements-preview-addressBar-text rounded-full px-3 py-1 text-sm hover:bg-bolt-elements-preview-addressBar-backgroundHover hover:focus-within:bg-bolt-elements-preview-addressBar-backgroundActive focus-within:bg-bolt-elements-preview-addressBar-backgroundActive
        focus-within-border-bolt-elements-borderColorActive focus-within:text-bolt-elements-preview-addressBar-textActive"
        >
          <input
            ref={inputRef}
            className="w-full bg-transparent outline-none"
            type="text"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && validateUrl(url)) {
                setIframeUrl(url);

                if (inputRef.current) {
                  inputRef.current.blur();
                }
              }
            }}
          />
        </div>
        {previews.length > 1 && (
          <PortDropdown
            activePreviewIndex={activePreviewIndex}
            setActivePreviewIndex={setActivePreviewIndex}
            isDropdownOpen={isPortDropdownOpen}
            setHasSelectedPreview={(value) => (hasSelectedPreview.current = value)}
            setIsDropdownOpen={setIsPortDropdownOpen}
            previews={previews}
          />
        )}
      </div>
      <div className="relative flex-1 border-t border-bolt-elements-borderColor">
        {error && (
          <div
            role="alert"
            data-testid="foldo-preview-error"
            className="absolute inset-x-3 bottom-3 z-10 flex items-start gap-3 rounded-xl border border-[#b42318]/40 bg-bolt-elements-background-depth-2 p-3 shadow-xl"
          >
            <span className="i-ph:warning-circle-bold mt-0.5 text-lg text-bolt-elements-icon-error" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-bolt-elements-textPrimary">Your app hit an error</div>
              <pre className="mt-1 max-h-16 overflow-auto whitespace-pre-wrap text-xs text-bolt-elements-textSecondary">{error}</pre>
            </div>
            <button
              className="btn-primary btn-md"
              onClick={() => {
                requestFix(error);
                previewError.set(undefined);
              }}
            >
              Fix this error
            </button>
            <button aria-label="Dismiss" className="btn-ghost h-8 w-8 !px-0" onClick={() => previewError.set(undefined)}>
              <span className="i-ph:x" />
            </button>
          </div>
        )}
        {activePreview ? (
          <iframe
            ref={iframeRef}
            className="border-none w-full h-full bg-white"
            src={iframeUrl}
            // generated apps love "copy link" buttons, which throw without clipboard permission in a cross-origin frame
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        ) : (
          <div className="paper-tile flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center text-[#111]">
            <img src="/art/sleepy.webp" alt="" width={180} className="rounded-2xl" />
            <div className="font-semibold">Your app will show up here</div>
            <div className="max-w-xs text-sm text-[#666]">
              The preview appears once the dev server is running. Ask Foldo to build something to get started.
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
