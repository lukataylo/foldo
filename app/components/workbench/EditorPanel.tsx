import { useStore } from '@nanostores/react';
import { memo, useEffect, useMemo } from 'react';
import {
  CodeMirrorEditor,
  type EditorDocument,
  type EditorSettings,
  type OnChangeCallback as OnEditorChange,
  type OnSaveCallback as OnEditorSave,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import type { FileMap } from '~/lib/stores/files';
import { themeStore } from '~/lib/stores/theme';
import { workbenchStore } from '~/lib/stores/workbench';
import { WORK_DIR } from '~/utils/constants';
import { renderLogger } from '~/utils/logger';
import { isMobile } from '~/utils/mobile';
import { useFileActivity } from './actions';
import { FileTree } from './FileTree';

interface EditorPanelProps {
  files?: FileMap;
  unsavedFiles?: Set<string>;
  editorDocument?: EditorDocument;
  selectedFile?: string | undefined;
  isStreaming?: boolean;
  onEditorChange?: OnEditorChange;
  onEditorScroll?: OnEditorScroll;
  onFileSelect?: (value?: string) => void;
  onFileSave?: OnEditorSave;
  onFileReset?: () => void;
}

const editorSettings: EditorSettings = { tabSize: 2, fontSize: '13px', gutterFontSize: '13px' };

const Spin = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16140F" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="flex-none animate-spin">
    <path d="M12 3a9 9 0 1 1-9 9" />
  </svg>
);

// Code view (Build-Streaming): Files on Paper at the left, the open file on Code bg, read-only while Foldo writes
export const EditorPanel = memo(
  ({ files, unsavedFiles, editorDocument, selectedFile, isStreaming, onFileSelect, onEditorChange, onEditorScroll, onFileSave, onFileReset }: EditorPanelProps) => {
    renderLogger.trace('EditorPanel');

    const theme = useStore(themeStore);
    const { writing, updated } = useFileActivity(isStreaming);
    const writingKey = [...writing].join('|');

    // follow Foldo: open the file it is writing as soon as it exists
    useEffect(() => {
      const next = [...writing].reverse().find((path) => files?.[path]?.type === 'file');

      if (next && next !== selectedFile) {
        workbenchStore.setSelectedFile(next);
      }
    }, [writingKey, files]);

    const segments = useMemo(() => editorDocument?.filePath.replace(`${WORK_DIR}/`, '').split('/'), [editorDocument]);
    const unsaved = editorDocument !== undefined && unsavedFiles?.has(editorDocument.filePath);
    const beingWritten = editorDocument !== undefined && writing.has(editorDocument.filePath);

    return (
      <div className="flex h-full min-h-0">
        <nav aria-label="Files" className="flex w-[224px] flex-none flex-col border-r border-rule bg-paper lt-md:hidden">
          <div className="flex h-[40px] flex-none items-center border-b border-rule2 px-[14px] font-mono text-[12px] uppercase tracking-[.08em] text-pencil">
            Files
          </div>
          <FileTree
            className="min-h-0 flex-1 overflow-y-auto"
            files={files}
            hideRoot
            unsavedFiles={unsavedFiles}
            writingFiles={writing}
            updatedFiles={updated}
            rootFolder={WORK_DIR}
            selectedFile={selectedFile}
            onFileSelect={onFileSelect}
          />
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[40px] flex-none items-center gap-[10px] border-b border-rule2 px-[14px]">
            {segments && (
              <span className="min-w-0 truncate font-mono text-[12px] text-pencil">
                {segments.map((part, i) =>
                  i === segments.length - 1 ? (
                    <span key={i} className="font-medium text-ink">
                      {part}
                    </span>
                  ) : (
                    <span key={i}>
                      {part} <span aria-hidden="true">/</span>{' '}
                    </span>
                  ),
                )}
              </span>
            )}
            {beingWritten && (
              <span className="inline-flex h-[24px] flex-none items-center gap-[6px] rounded-full leading-[18px] border border-rule bg-wash px-[9px] text-[12px] font-medium text-ink2">
                <Spin /> Foldo is writing this file
              </span>
            )}
            {isStreaming ? (
              <span className="ml-auto whitespace-nowrap font-mono text-[12px] text-pencil">Read-only while writing</span>
            ) : (
              unsaved && (
                <span className="ml-auto flex gap-2">
                  <button type="button" className="btn-secondary h-[28px] rounded-[6px] px-[10px] text-[12px]" onClick={onFileReset}>
                    Reset
                  </button>
                  <button type="button" className="btn-dark h-[28px] rounded-[6px] px-[10px] text-[12px]" onClick={() => onFileSave?.()}>
                    Save
                  </button>
                </span>
              )
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden bg-codebg">
            <CodeMirrorEditor
              theme={theme}
              editable={!isStreaming && editorDocument !== undefined}
              settings={editorSettings}
              doc={editorDocument}
              autoFocusOnDocumentChange={!isMobile()}
              onScroll={onEditorScroll}
              onChange={onEditorChange}
              onSave={onFileSave}
            />
          </div>
        </div>
      </div>
    );
  },
);
