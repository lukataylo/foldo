import type { Branch, Comment, Frame, ImageFrameContent } from '@foldo/protocol';
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

export function ImageFrame({
  frame,
  branch,
  zoom = 1,
  tool = 'select',
  comments = [],
  onDropPin,
  onCommentClick,
}: Props) {
  const c = frame.content as ImageFrameContent;
  // Upload URLs are relative to the API origin (`/api/uploads/…`), not the
  // web host — resolve them before handing to <img>.
  const src = c.url ? resolveApiUrl(c.url) : (c.dataUrl ?? '');
  const { handlers: dragHandlers } = useFrameDrag({ frame, zoom });
  return (
    <div
      data-testid="foldo-canvas-frame-image"
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
        {src ? (
          <img
            src={src}
            alt={c.alt ?? c.caption ?? 'Image frame'}
            style={{
              width: '100%',
              height: c.caption ? 'calc(100% - 36px)' : '100%',
              objectFit: 'contain',
              display: 'block',
              background: '#f5f0e8',
            }}
            draggable={false}
          />
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              color: '#999',
            }}
          >
            Image unavailable
          </div>
        )}
        {c.caption && (
          <div
            style={{
              padding: '6px 10px',
              fontSize: 12,
              color: '#444',
              borderTop: '1px solid rgba(0,0,0,0.08)',
            }}
          >
            {c.caption}
          </div>
        )}

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
          .filter((c) => c.pin)
          .map((c) => (
            <CommentPin
              key={c.id}
              comment={c}
              frameSize={{ width: frame.size.width, height: frame.size.height }}
              onClick={() => onCommentClick?.(frame.id, c)}
            />
          ))}
      </div>
    </div>
  );
}
