import { useStore } from '@nanostores/react';
import { useLoaderData } from '@remix-run/react';
import { memo, useCallback, useEffect, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { toast } from 'react-toastify';
import { SharedSheet } from '~/components/chat/SharedAbout';
import { SIcon } from '~/components/chat/studio-icons';
import type { LayoutMode } from '~/components/chat/studio-state';
import {
  type OnChangeCallback as OnEditorChange,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { Icon } from '~/components/ui/icons';
import { chatId, description } from '~/lib/persistence';
import { workbenchStore, type WorkbenchViewType } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { renderLogger } from '~/utils/logger';
import { downloadProjectZip } from '~/utils/zip';
import { EditorPanel } from './EditorPanel';
import { AddressBar, fullscreenPreview, Preview } from './Preview';
import { TerminalPanel } from './TerminalPanel';

interface WorkspaceProps {
  chatStarted?: boolean;
  isStreaming?: boolean;
  layout: LayoutMode;
  // a signed-out visitor on a share link: preview first, no download or terminal
  viewer?: boolean;
}

const TERMINAL_SIZE = 30;

const toolButton =
  'inline-flex h-[32px] flex-none items-center gap-[6px] rounded-[7px] border border-solid border-rule bg-sheet text-[13px] font-medium text-ink outline-none hover:bg-wash focus-visible:shadow-[0_0_0_2px_#FBF8F1,0_0_0_4px_#16140F]';

let defaulted = false;

/*
 * Code and preview (Build-* boards): toolbar with Code / Preview, the preview address, Download zip and the terminal
 * toggle; the view below; the terminal drawer under it. Hidden (never unmounted) in the "Chat only" layout so the
 * running preview and terminals survive.
 */
export const Workbench = memo(({ chatStarted, isStreaming, layout, viewer }: WorkspaceProps) => {
  renderLogger.trace('Workbench');

  const { shared } = useLoaderData() as { shared?: boolean };
  const selectedFile = useStore(workbenchStore.selectedFile);
  const currentDocument = useStore(workbenchStore.currentDocument);
  const unsavedFiles = useStore(workbenchStore.unsavedFiles);
  const files = useStore(workbenchStore.files);
  const view = useStore(workbenchStore.currentView);
  const showTerminal = useStore(workbenchStore.showTerminal);
  const previews = useStore(workbenchStore.previews);
  const terminalRef = useRef<ImperativePanelHandle>(null);
  const projectId = useStore(chatId);

  // the preview leads: it shows the setup steps until the app runs
  useEffect(() => {
    if (!defaulted) {
      defaulted = true;
      workbenchStore.currentView.set('preview');
    }
  }, []);

  useEffect(() => {
    workbenchStore.setDocuments(files);
  }, [files]);

  useEffect(() => {
    const panel = terminalRef.current;

    if (!panel) {
      return;
    }

    if (showTerminal && panel.isCollapsed()) {
      panel.resize(TERMINAL_SIZE);
    } else if (!showTerminal && !panel.isCollapsed()) {
      panel.collapse();
    }
  }, [showTerminal]);

  const onEditorChange = useCallback<OnEditorChange>((update) => {
    workbenchStore.setCurrentDocumentContent(update.content);
  }, []);

  const onEditorScroll = useCallback<OnEditorScroll>((position) => {
    workbenchStore.setCurrentDocumentScrollPosition(position);
  }, []);

  const onFileSelect = useCallback((filePath: string | undefined) => {
    workbenchStore.setSelectedFile(filePath);
  }, []);

  const onFileSave = useCallback(() => {
    workbenchStore.saveCurrentDocument().catch(() => {
      toast.error("Couldn't save that file. Try again.");
    });
  }, []);

  const onFileReset = useCallback(() => {
    workbenchStore.resetCurrentDocument();
  }, []);

  if (!chatStarted) {
    return null;
  }

  const setView = (next: WorkbenchViewType) => workbenchStore.currentView.set(next);
  // the terminal belongs to the team's own project (a remix gets one once it is saved as theirs)
  const ownerTools = !shared || Boolean(projectId);

  return (
    <section
      aria-label={viewer ? 'Preview' : 'Code and preview'}
      data-testid="foldo-workbench"
      className={classNames('relative min-w-0 flex-1 flex-col overflow-hidden bg-sheet', {
        flex: layout !== 'chat' || Boolean(viewer),
        'md:my-3 md:mr-3 md:rounded-[10px] md:border md:border-solid md:border-rule': layout !== 'workspace' || Boolean(viewer),
        'm-3 rounded-[10px] border border-solid border-rule': layout === 'workspace' && !viewer,
        hidden: layout === 'chat' && !viewer,
        'lt-md:!hidden': layout === 'both' && !viewer,
      })}
    >
      <div className={classNames('flex h-[48px] flex-none items-center gap-[10px] border-b border-rule px-[10px]', { 'lt-md:hidden': Boolean(viewer) })}>
        <div role="tablist" aria-label="View" className="seg flex-none">
          {(['code', 'preview'] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className="seg-item" onClick={() => setView(v)}>
              {v === 'code' ? 'Code' : 'Preview'}
            </button>
          ))}
        </div>
        <AddressBar readOnly={viewer} />
        {viewer ? (
          <>
            {previews.length > 0 ? (
              <span className="pill-live">
                <span className="pill-dot" />
                Running
              </span>
            ) : (
              <span className="pill-neutral">Starting</span>
            )}
            <button
              type="button"
              aria-label="Full screen preview"
              title="Full screen preview"
              disabled={!previews.length}
              onClick={() => {
                setView('preview');
                fullscreenPreview();
              }}
              className={`${toolButton} w-[32px] justify-center px-0`}
            >
              <SIcon.Expand />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`${toolButton} px-[10px]`}
              data-testid="foldo-download-zip"
              onClick={() => {
                if (!downloadProjectZip(workbenchStore.files.get(), description.get() ?? 'foldo-project')) {
                  toast.info('Nothing to download yet. Ask Foldo to build something first.');
                }
              }}
            >
              <SIcon.Download size={15} />
              Download zip
            </button>
            {ownerTools && (
              <button
                type="button"
                aria-label="Toggle Terminal"
                title="Terminal (Ctrl+J)"
                aria-pressed={showTerminal}
                className={`${toolButton} w-[32px] justify-center px-0 aria-pressed:bg-wash`}
                onClick={() => workbenchStore.toggleTerminal(!showTerminal)}
              >
                <Icon.Terminal />
              </button>
            )}
          </>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <PanelGroup direction="vertical">
          <Panel minSize={20} defaultSize={showTerminal ? 100 - TERMINAL_SIZE : 100}>
            <div className={classNames('h-full', { hidden: view !== 'code' })}>
              <EditorPanel
                editorDocument={currentDocument}
                isStreaming={isStreaming}
                selectedFile={selectedFile}
                files={files}
                unsavedFiles={unsavedFiles}
                onFileSelect={onFileSelect}
                onEditorScroll={onEditorScroll}
                onEditorChange={onEditorChange}
                onFileSave={onFileSave}
                onFileReset={onFileReset}
              />
            </div>
            <div className={classNames('h-full', { hidden: view !== 'preview' })}>
              <Preview isStreaming={isStreaming} />
            </div>
          </Panel>
          <PanelResizeHandle className={showTerminal ? 'h-px bg-rule' : 'hidden'} />
          <Panel
            ref={terminalRef}
            defaultSize={showTerminal ? TERMINAL_SIZE : 0}
            minSize={10}
            collapsible
            onCollapse={() => workbenchStore.toggleTerminal(false)}
            onExpand={() => workbenchStore.toggleTerminal(true)}
          >
            {ownerTools && <TerminalPanel />}
          </Panel>
        </PanelGroup>
      </div>
      {viewer && <SharedSheet />}
    </section>
  );
});
