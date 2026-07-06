// WalkthroughFrame — the core artifact of the living-documentation pivot.
// Renders one take of a walkthrough: the narrated video (or a poster +
// status badge while the director is still capturing/rendering, or when the
// capture degraded to stills + captions), the PR context that produced it,
// the director's summary, and a compact "what changed" list of step diffs.
//
// Comment pins work like they do on image frames: the comment tool overlays
// a crosshair layer and pins render at fractional coords.

import type {
  Branch,
  Comment,
  Frame,
  StepDiff,
  WalkthroughFrameContent,
} from '@foldo/protocol';
import { resolveApiUrl } from '../api/client';
import { FrameMeta } from './FrameMeta';
import { CommentPin } from './CommentPin';
import { useFrameDrag } from './useFrameDrag';
import type { Tool } from '../types';

interface Props {
  frame: Frame;
  branch: Branch;
  zoom?: number;
  tool?: Tool;
  comments?: Comment[];
  onDropPin?: (frameId: string, xRel: number, yRel: number) => void;
  onCommentClick?: (frameId: string, comment: Comment) => void;
}

/** Human-readable badge copy per take status (no badge when 'ready'). */
function statusBadge(c: WalkthroughFrameContent): string | null {
  switch (c.status) {
    case 'queued':
      return 'Queued…';
    case 'capturing':
      return 'Capturing…';
    case 'rendering':
      return 'Rendering…';
    case 'degraded':
      return 'Capture degraded — stills + captions';
    case 'error':
      return 'Render failed';
    default:
      return null;
  }
}

export function WalkthroughFrame({
  frame,
  branch,
  zoom = 1,
  tool = 'select',
  comments = [],
  onDropPin,
  onCommentClick,
}: Props) {
  const c = frame.content as WalkthroughFrameContent;
  // Media URLs come as API-relative paths (`/api/...`) — resolve them against
  // the API origin before handing to <video>/<img>/<track>.
  const videoSrc = c.videoUrl ? resolveApiUrl(c.videoUrl) : null;
  const posterSrc = c.posterUrl ? resolveApiUrl(c.posterUrl) : null;
  const captionsSrc = c.captionsUrl ? resolveApiUrl(c.captionsUrl) : null;
  const playable = (c.status === 'ready' || c.status === 'degraded') && !!videoSrc;
  const badge = statusBadge(c);
  const visibleDiffs = (c.stepDiffs ?? []).filter((d) => d.status !== 'unchanged');
  const hasDiffInfo = (c.stepDiffs ?? []).length > 0;

  const { handlers: dragHandlers } = useFrameDrag({ frame, zoom });

  return (
    <div
      data-testid="foldo-walkthrough-frame"
      data-frame-id={frame.id}
      className="absolute"
      style={{
        left: frame.position.x,
        top: frame.position.y,
        width: frame.size.width,
        height: frame.size.height,
      }}
    >
      <FrameMeta frame={frame} branch={branch} zoom={zoom} />
      <div
        {...dragHandlers}
        className="relative"
        style={{
          width: '100%',
          height: '100%',
          background: '#fff',
          border: '1.5px solid rgba(0,0,0,0.15)',
          borderRadius: 6,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          pointerEvents: 'auto',
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        {/* ----- media (video when playable, poster/placeholder otherwise) ----- */}
        <div style={{ position: 'relative', flexShrink: 0, background: '#111' }}>
          {playable ? (
            <video
              data-testid="foldo-walkthrough-video"
              src={videoSrc ?? undefined}
              poster={posterSrc ?? undefined}
              controls
              preload="metadata"
              style={{
                width: '100%',
                aspectRatio: '16 / 9',
                display: 'block',
                background: '#111',
              }}
            >
              {captionsSrc && (
                <track kind="captions" src={captionsSrc} default />
              )}
            </video>
          ) : (
            <div
              style={{
                width: '100%',
                aspectRatio: '16 / 9',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#1a1a1d',
              }}
            >
              {posterSrc ? (
                <img
                  src={posterSrc}
                  alt={c.title}
                  draggable={false}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                    opacity: 0.65,
                  }}
                />
              ) : (
                <span style={{ fontSize: 12.5, color: '#888' }}>{c.title}</span>
              )}
            </div>
          )}
          {badge && (
            <span
              data-testid="foldo-walkthrough-status"
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                padding: '3px 8px',
                borderRadius: 999,
                background:
                  c.status === 'error'
                    ? 'rgba(190,60,60,0.92)'
                    : c.status === 'degraded'
                      ? 'rgba(190,140,30,0.92)'
                      : 'rgba(0,0,0,0.65)',
                color: '#fff',
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: 0.2,
                lineHeight: 1.4,
              }}
            >
              {badge}
            </span>
          )}
        </div>

        {/* ----- context: PR line, summary, what changed ----- */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: '#222' }}>
            {c.title}
          </div>
          {c.prNumber != null && (
            <div style={{ fontSize: 12, color: '#666' }}>
              PR #{c.prNumber}
              {c.prTitle ? ` — ${c.prTitle}` : ''}
            </div>
          )}
          {c.summary && (
            <div style={{ fontSize: 12.5, color: '#444', lineHeight: 1.5 }}>
              {c.summary}
            </div>
          )}
          {hasDiffInfo && (
            <div style={{ marginTop: 2 }}>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  color: '#999',
                  marginBottom: 4,
                }}
              >
                What changed
              </div>
              <ul
                data-testid="foldo-walkthrough-changes"
                style={{ listStyle: 'none', margin: 0, padding: 0 }}
              >
                {visibleDiffs.length === 0 ? (
                  <li style={{ fontSize: 12, color: '#888' }}>
                    No visible changes this take
                  </li>
                ) : (
                  visibleDiffs.map((d) => <StepDiffRow key={d.stepId} diff={d} />)
                )}
              </ul>
            </div>
          )}
        </div>

        {/* ----- comment tool: pin-drop layer (mirrors ImageFrame) ----- */}
        {tool === 'comment' && onDropPin && (
          <div
            className="absolute inset-0 z-20"
            style={{ cursor: 'crosshair', pointerEvents: 'auto' }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const xRel = (e.clientX - rect.left) / rect.width;
              const yRel = (e.clientY - rect.top) / rect.height;
              onDropPin(frame.id, xRel, yRel);
              e.preventDefault();
              e.stopPropagation();
            }}
          />
        )}

        {comments
          .filter((cm) => cm.pin)
          .map((cm) => (
            <CommentPin
              key={cm.id}
              comment={cm}
              frameSize={{ width: frame.size.width, height: frame.size.height }}
              onClick={() => onCommentClick?.(frame.id, cm)}
            />
          ))}
      </div>
    </div>
  );
}

const DIFF_COLORS: Record<StepDiff['status'], { dot: string; label: string }> = {
  changed: { dot: '#e0a63c', label: 'Changed' },
  added: { dot: '#5a9e5a', label: 'Added' },
  removed: { dot: '#c96a5a', label: 'Removed' },
  unchanged: { dot: '#bbb', label: 'Unchanged' },
};

function StepDiffRow({ diff }: { diff: StepDiff }) {
  const colors = DIFF_COLORS[diff.status];
  return (
    <li
      data-foldo-step-id={diff.stepId}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 6,
        padding: '2px 0',
        fontSize: 12,
        lineHeight: 1.45,
        color: '#444',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: colors.dot,
          flexShrink: 0,
          transform: 'translateY(-1px)',
        }}
      />
      <span style={{ fontWeight: 600, color: '#333', flexShrink: 0 }}>
        {colors.label}
      </span>
      <span style={{ color: '#555' }}>{diff.reason}</span>
    </li>
  );
}
