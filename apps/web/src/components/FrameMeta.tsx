import { useState } from 'react';
import type { Branch, Frame } from '@foldo/protocol';
import { boardStore } from '../state/BoardStore';
import { deleteFrame as apiDeleteFrame } from '../api/frames';
import { useFrameDrag } from './useFrameDrag';

interface Props {
  frame: Frame;
  branch: Branch;
  /** Current canvas zoom, needed to convert screen-pixel drags to world units. */
  zoom?: number;
  /** When true, header acts as a drag handle and exposes the actions menu. */
  canEdit?: boolean;
}

export function FrameMeta({ frame, branch, zoom = 1, canEdit = true }: Props) {
  const isAgent = branch.authoredBy === 'agent';
  const isCapture = !!frame.capturedFromUrl;

  const { handlers } = useFrameDrag({ frame, zoom, enabled: canEdit });

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function onConfirmDelete(): Promise<void> {
    boardStore.removeFrame(frame.id);
    try {
      await apiDeleteFrame(frame.id);
    } catch (err) {
      // best-effort: re-fetch board on failure; for now log + reinsert
      // eslint-disable-next-line no-console
      console.error('delete frame failed', err);
    }
  }

  return (
    <div
      {...handlers}
      className="absolute left-0 flex items-center gap-2 text-[12px] text-inkMute"
      style={{
        top: -34,
        lineHeight: 1,
        width: frame.size.width,
        cursor: canEdit ? 'grab' : 'default',
        userSelect: 'none',
      }}
    >
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: branch.color }}
      />
      <span className="font-medium text-ink">{branch.name}</span>
      {isAgent && (
        <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-[1px] text-[9.5px] font-medium uppercase tracking-[0.06em] text-accent">
          <BotIcon /> agent
        </span>
      )}
      {isCapture && (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-warn/30 bg-warn/10 px-1.5 py-[1px] text-[9.5px] font-medium uppercase tracking-[0.06em] text-warn"
          title={frame.capturedFromUrl}
        >
          <ExtensionMini /> captured
        </span>
      )}
      <span className="text-inkFaint">·</span>
      <span className="font-mono text-[11px] text-inkMute">
        {frame.commitSha.slice(0, 7)}
      </span>
      <span className="text-inkFaint">·</span>
      <span className="truncate text-inkMute">{frame.commitMessage}</span>
      <span className="text-inkFaint">·</span>
      <span className="shrink-0 text-inkFaint">{frame.age}</span>

      {canEdit && (
        <div data-no-drag className="relative ml-auto shrink-0">
          {/* A+W1 touch: framemeta-kebab is always visible on touch devices via
              the @media(hover:none) rule below; on hover-capable devices it
              keeps the existing hover-only opacity ramp via the framemeta-actions
              container above. The button itself is now 44x44. */}
          <button
            type="button"
            aria-label="Frame actions"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
              setConfirmDelete(false);
            }}
            className="foldo-framemeta-kebab flex h-11 w-11 items-center justify-center rounded hover:bg-white/10"
          >
            <KebabIcon />
          </button>
          {/* A+W1 touch: keep the kebab visible on touch screens (no hover). */}
          <style>{`
            @media (hover: none) {
              .foldo-framemeta-kebab { opacity: 1 !important; }
            }
          `}</style>
          {menuOpen && (
            <div
              role="menu"
              data-no-drag
              className="absolute right-0 top-6 z-50 min-w-[148px] rounded-md border border-hairline bg-panel p-1 shadow-panel"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {!confirmDelete ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-[12px] text-red-300 hover:bg-red-500/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete(true);
                  }}
                >
                  <TrashIcon /> Delete frame
                </button>
              ) : (
                <div className="flex flex-col gap-1 px-2 py-1.5 text-[11.5px] text-inkMute">
                  <span>Delete this frame?</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded bg-red-500/15 px-2 py-0.5 text-red-300 hover:bg-red-500/25"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        void onConfirmDelete();
                      }}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="rounded px-2 py-0.5 text-inkMute hover:bg-white/5"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        setConfirmDelete(false);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExtensionMini() {
  return (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 6.5V11a1.5 1.5 0 0 0 1.5 1.5h6A1.5 1.5 0 0 0 12 11V6.5M3 6.5h9M3 6.5V5a1.5 1.5 0 0 1 1.5-1.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
      <rect
        x="2.5"
        y="5"
        width="11"
        height="8"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="6" cy="9" r="0.9" fill="currentColor" />
      <circle cx="10" cy="9" r="0.9" fill="currentColor" />
      <path
        d="M8 5V2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="8" cy="2.2" r="0.9" fill="currentColor" />
    </svg>
  );
}

function KebabIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="3" r="1.4" />
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="8" cy="13" r="1.4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 4.5h10M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 4.5l.6 8.2a1 1 0 0 0 1 .9h2.8a1 1 0 0 0 1-.9l.6-8.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
