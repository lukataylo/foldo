import type { ArrowFrameContent, Branch, Frame } from '@foldo/protocol';
import { FrameMeta } from './FrameMeta';

interface Props {
  frame: Frame;
  branch: Branch;
  zoom?: number;
}

/**
 * Renders a straight arrow as an SVG. `from`/`to` are world coordinates
 * relative to the frame's `position` (the top-left of the bounding box).
 */
export function ArrowFrame({ frame, branch, zoom = 1 }: Props) {
  const c = frame.content as ArrowFrameContent;
  const stroke = c.color ?? '#111111';
  const thickness = c.thickness ?? 2.5;
  const w = frame.size.width;
  const h = frame.size.height;
  const fromX = clamp(c.from.x, 0, w);
  const fromY = clamp(c.from.y, 0, h);
  const toX = clamp(c.to.x, 0, w);
  const toY = clamp(c.to.y, 0, h);

  // Arrowhead geometry — short triangle at the end.
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.max(Math.hypot(dx, dy), 1);
  const ux = dx / len;
  const uy = dy / len;
  const head = 14;
  const halfBase = 7;
  const baseX = toX - ux * head;
  const baseY = toY - uy * head;
  const leftX = baseX + uy * halfBase;
  const leftY = baseY - ux * halfBase;
  const rightX = baseX - uy * halfBase;
  const rightY = baseY + ux * halfBase;

  return (
    <div
      className="absolute"
      style={{
        left: frame.position.x,
        top: frame.position.y,
        width: w,
        height: h,
        pointerEvents: 'none',
      }}
    >
      <FrameMeta frame={frame} branch={branch} zoom={zoom} />
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <line
          x1={fromX}
          y1={fromY}
          x2={baseX}
          y2={baseY}
          stroke={stroke}
          strokeWidth={thickness}
          strokeLinecap="round"
        />
        <polygon
          points={`${toX},${toY} ${leftX},${leftY} ${rightX},${rightY}`}
          fill={stroke}
        />
      </svg>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
