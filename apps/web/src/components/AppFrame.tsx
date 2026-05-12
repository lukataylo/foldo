// App frame — renders the sample app inside an iframe and forwards element
// click/hover events from the sample app's postMessage bridge.

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppFrameContent,
  Branch,
  Comment,
  Frame,
} from '@foldo/protocol';
import { FrameMeta } from './FrameMeta';
import { CommentPin } from './CommentPin';
import {
  isSampleAppOutbound,
  type SampleAppInbound,
  type SampleAppOutbound,
  type SampleElementInfo,
  type SampleRect,
} from '../iframe/messages';
import type { SelectedElement, Tool } from '../types';

interface Props {
  frame: Frame;
  branch: Branch;
  comments: Comment[];
  tool: Tool;
  selectedElement?: SelectedElement | null;
  onSelectElement: (sel: SelectedElement | null) => void;
  onDropPin: (frameId: string, x: number, y: number) => void;
  onCommentClick: (frameId: string, comment: Comment) => void;
  /** When false the frame is far from the camera — render a static placeholder. */
  inViewport: boolean;
  zoom: number;
}

const SAMPLE_APP_BASE =
  (typeof window !== 'undefined' &&
    (window as unknown as { __FOLDO_SAMPLE__?: string }).__FOLDO_SAMPLE__) ||
  'http://localhost:5174';

export function AppFrame({
  frame,
  branch,
  comments,
  tool,
  selectedElement,
  onSelectElement,
  onDropPin,
  onCommentClick,
  inViewport,
  zoom,
}: Props) {
  const content = frame.content as AppFrameContent;
  const [testMode, setTestMode] = useState(false);
  const [hoverRect, setHoverRect] = useState<SampleRect | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const iframeUrl = useMemo(() => buildIframeUrl(content, frame.commitSha), [
    content,
    frame.commitSha,
  ]);

  const reviewMode = !testMode;

  // Sync review mode + overrides into the iframe whenever they change.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !inViewport) return;
    const send = () => postToFrame(iframe, { type: 'foldo.sample.setReviewMode', enabled: reviewMode });
    // try once; sample app emits "ready" once mounted and we also push on load
    send();
  }, [reviewMode, inViewport]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !inViewport) return;
    if (!content.overrides) return;
    postToFrame(iframe, {
      type: 'foldo.sample.setOverrides',
      overrides: content.overrides as unknown as Record<string, string | boolean>,
    });
  }, [content.overrides, inViewport]);

  // Listen for sample-app postMessage events. Only react to messages whose
  // source matches our own iframe contentWindow.
  useEffect(() => {
    if (!inViewport) return;
    function onMessage(ev: MessageEvent) {
      const iframe = iframeRef.current;
      if (!iframe || ev.source !== iframe.contentWindow) return;
      if (!isSampleAppOutbound(ev.data)) return;
      const msg = ev.data as SampleAppOutbound;
      switch (msg.type) {
        case 'foldo.sample.ready':
          // Push the current review mode + overrides.
          postToFrame(iframe, {
            type: 'foldo.sample.setReviewMode',
            enabled: reviewMode,
          });
          if (content.overrides) {
            postToFrame(iframe, {
              type: 'foldo.sample.setOverrides',
              overrides: content.overrides as unknown as Record<
                string,
                string | boolean
              >,
            });
          }
          if (content.recipe?.length) {
            postToFrame(iframe, {
              type: 'foldo.sample.replayRecipe',
              steps: content.recipe,
            });
          }
          return;
        case 'foldo.sample.element.click':
          if (!reviewMode) return;
          onSelectFromIframe(msg.element, msg.rect);
          return;
        case 'foldo.sample.element.hover':
          if (!reviewMode || tool !== 'select') {
            setHoverRect(null);
            return;
          }
          setHoverRect(msg.rect);
          return;
        case 'foldo.sample.element.hover.clear':
          setHoverRect(null);
          return;
        default:
          return;
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // intentionally exclude reviewMode/content/tool — handler reads latest via closure refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inViewport, frame.id, reviewMode, tool, content.overrides, content.recipe]);

  const onSelectFromIframe = (el: SampleElementInfo, rect: SampleRect) => {
    onSelectElement({
      frameId: frame.id,
      label: el.label,
      file: el.file,
      line: el.line,
      currentSource: el.currentSource,
      rect,
    });
  };

  const onOverlayPointerDown = (e: React.PointerEvent) => {
    if (tool !== 'comment') return;
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onDropPin(frame.id, x, y);
    e.preventDefault();
    e.stopPropagation();
  };

  const showSelectionOnThisFrame = selectedElement?.frameId === frame.id;

  return (
    <div
      className="absolute"
      style={{
        left: frame.position.x,
        top: frame.position.y,
        width: frame.size.width,
        height: frame.size.height,
      }}
    >
      <FrameMeta frame={frame} branch={branch} />

      <div
        className="relative h-full w-full overflow-hidden rounded-md border border-black/15 bg-white frame-shadow"
        style={{ pointerEvents: 'auto' }}
      >
        {inViewport ? (
          <iframe
            ref={iframeRef}
            src={iframeUrl}
            title={`${branch.name} · ${frame.commitSha}`}
            className="absolute inset-0 h-full w-full border-0"
            // Permit our origin parent to talk to it
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            loading="lazy"
          />
        ) : (
          <FramePlaceholder content={content} />
        )}

        {/* Review overlay — when in comment/select tool, captures pointer events
            so we can drop pins on top of the iframe; otherwise pointer-events
            pass through to the iframe (test mode). */}
        <div
          ref={overlayRef}
          className="absolute inset-0 z-10"
          style={{
            pointerEvents: tool === 'comment' ? 'auto' : 'none',
            cursor: tool === 'comment' ? 'crosshair' : 'default',
          }}
          onPointerDown={onOverlayPointerDown}
        />

        {/* Hover + selection highlight (in canvas/world units) */}
        {reviewMode && (
          <>
            {hoverRect && tool === 'select' && (
              <div
                className="pointer-events-none absolute z-20 rounded-[3px] border border-accent/70"
                style={{
                  left: hoverRect.x - 2,
                  top: hoverRect.y - 2,
                  width: hoverRect.width + 4,
                  height: hoverRect.height + 4,
                  boxShadow: '0 0 0 1px rgba(255,120,73,0.18)',
                }}
              />
            )}
            {showSelectionOnThisFrame &&
              selectedElement!.rect.width > 0 &&
              selectedElement!.rect.height > 0 && (
                <div
                  className="pointer-events-none absolute z-20 rounded-[3px]"
                  style={{
                    left: selectedElement!.rect.x - 2,
                    top: selectedElement!.rect.y - 2,
                    width: selectedElement!.rect.width + 4,
                    height: selectedElement!.rect.height + 4,
                    border: '1.5px solid #ff7849',
                    boxShadow:
                      '0 0 0 4px rgba(255,120,73,0.18), 0 0 0 1px rgba(255,120,73,0.6)',
                  }}
                />
              )}
          </>
        )}

        {/* top-right corner controls */}
        <div className="absolute right-2 top-2 z-30 flex items-center gap-1.5">
          {content.stateLabel && (
            <div className="rounded-full bg-black/80 px-2 py-0.5 text-[10.5px] font-medium text-white/90 backdrop-blur">
              {content.stateLabel}
            </div>
          )}
          {content.recipe && content.recipe.length > 0 && (
            <RecipeBadge steps={content.recipe.length} />
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setTestMode((m) => !m);
            }}
            className={
              'rounded-md border px-2 py-0.5 text-[10.5px] font-medium backdrop-blur transition-colors ' +
              (testMode
                ? 'border-ok/60 bg-ok/20 text-ok'
                : 'border-white/30 bg-black/60 text-white/90 hover:bg-black/80')
            }
          >
            {testMode ? '● Live · Test it' : 'Test it'}
          </button>
        </div>

        {/* comment pins */}
        {comments.map((c) => (
          <CommentPin
            key={c.id}
            comment={c}
            frameSize={{ width: frame.size.width, height: frame.size.height }}
            onClick={() => onCommentClick(frame.id, c)}
          />
        ))}
      </div>
      {/* Suppress unused-warning */}
      <span style={{ display: 'none' }}>{zoom}</span>
    </div>
  );
}

function buildIframeUrl(content: AppFrameContent, commitSha: string): string {
  if (content.iframeUrl) return content.iframeUrl;
  const url = new URL(SAMPLE_APP_BASE);
  url.searchParams.set('variant', content.variant);
  url.searchParams.set('commit', commitSha);
  if (content.stateLabel) url.searchParams.set('state', content.stateLabel);
  if (content.route) url.searchParams.set('route', content.route);
  return url.toString();
}

function postToFrame(iframe: HTMLIFrameElement, msg: SampleAppInbound) {
  try {
    iframe.contentWindow?.postMessage(msg, '*');
  } catch {
    /* ignore */
  }
}

function FramePlaceholder({ content }: { content: AppFrameContent }) {
  return (
    <div className="flex h-full w-full flex-col bg-[#f6f6f6] text-[#7a7a7a]">
      <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 text-[11.5px]">
        <span className="font-mono">{content.route}</span>
        <span className="uppercase tracking-[0.08em] text-[10px]">
          {content.variant}
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[11.5px]">
          <div className="h-2 w-32 animate-pulse rounded-full bg-black/10" />
          <div className="h-2 w-24 animate-pulse rounded-full bg-black/10" />
          <div className="h-2 w-40 animate-pulse rounded-full bg-black/10" />
          <span className="mt-3 text-[10.5px] text-[#a0a0a0]">
            Off-screen · iframe will mount on scroll
          </span>
        </div>
      </div>
    </div>
  );
}

function RecipeBadge({ steps }: { steps: number }) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-black/80 px-2 py-0.5 text-[10.5px] font-medium text-white/90 backdrop-blur">
      <svg width="10" height="10" viewBox="0 0 16 16">
        <path d="M5 4l6 4-6 4z" fill="currentColor" />
      </svg>
      <span>recipe · {steps}</span>
    </div>
  );
}
