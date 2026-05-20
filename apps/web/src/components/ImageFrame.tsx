import type { HTMLAttributes } from 'react';
import type { Branch, Comment, Frame, ImageFrameContent } from '@foldo/protocol';
import { FrameShell } from './FrameShell';
import { CommentPin } from './CommentPin';
import { useFrameDrag } from './useFrameDrag';
import { frameStyleToCss } from '../plugins/frameStyle';
import type { Tool } from '../types';

interface Props {
  frame: Frame;
  branch: Branch;
  tool?: Tool;
  comments?: Comment[];
  onDropPin?: (frameId: string, xRel: number, yRel: number) => void;
  onCommentClick?: (frameId: string, comment: Comment) => void;
  wrapperProps?: HTMLAttributes<HTMLDivElement>;
}

export function ImageFrame({
  frame,
  branch,
  tool = 'select',
  comments = [],
  onDropPin,
  onCommentClick,
  wrapperProps,
}: Props) {
  const c = frame.content as ImageFrameContent;
  const src = c.url ?? c.dataUrl ?? '';
  const { handlers: dragHandlers } = useFrameDrag({ frame });
  return (
    <FrameShell frame={frame} branch={branch} wrapperProps={wrapperProps}>
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
          ...frameStyleToCss(frame.style),
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
    </FrameShell>
  );
}
