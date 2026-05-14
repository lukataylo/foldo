import type { Branch, Frame, ImageFrameContent } from '@foldo/protocol';
import { FrameMeta } from './FrameMeta';

interface Props {
  frame: Frame;
  branch: Branch;
  zoom?: number;
}

export function ImageFrame({ frame, branch, zoom = 1 }: Props) {
  const c = frame.content as ImageFrameContent;
  const src = c.url ?? c.dataUrl ?? '';
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
      <FrameMeta frame={frame} branch={branch} zoom={zoom} />
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#fff',
          border: '1.5px solid rgba(0,0,0,0.15)',
          borderRadius: 6,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
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
      </div>
    </div>
  );
}
