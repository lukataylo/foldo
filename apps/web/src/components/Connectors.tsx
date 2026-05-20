import { memo, useMemo } from 'react';
import type { Frame } from '@foldo/protocol';
import { useBoardSelector } from '../state/useBoardStore';

// Renders subtle curves between parent and child frames in world coords.
// Sits inside the transformed layer so it scales with zoom.
//
// Reads frames straight from the board store and is memo'd with no props, so
// App's per-camera-tick re-renders never reach it — it recomputes only when
// the frames map actually changes.
export const Connectors = memo(function Connectors() {
  const frames = useBoardSelector((s) => s.frames);

  const geometry = useMemo(() => {
    const links: Array<{ child: Frame; parent: Frame }> = [];
    for (const f of frames.values()) {
      if (f.parentFrameId) {
        const parent = frames.get(f.parentFrameId);
        if (parent) links.push({ child: f, parent });
      }
    }
    if (links.length === 0) return null;

    // Bounding box of every linked frame. Loop (not Math.min(...spread)) so a
    // large board can't blow the call stack.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const { child, parent } of links) {
      for (const f of [child, parent]) {
        minX = Math.min(minX, f.position.x);
        maxX = Math.max(maxX, f.position.x + f.size.width);
        minY = Math.min(minY, f.position.y);
        maxY = Math.max(maxY, f.position.y + f.size.height);
      }
    }
    const pad = 200;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;

    const paths = links.map(({ child, parent }) => {
      const horizontal = child.position.x > parent.position.x;
      const sx = horizontal
        ? parent.position.x + parent.size.width
        : parent.position.x + parent.size.width / 2;
      const sy = horizontal
        ? parent.position.y + parent.size.height / 2
        : parent.position.y + parent.size.height;
      const ex = horizontal
        ? child.position.x
        : child.position.x + child.size.width / 2;
      const ey = horizontal
        ? child.position.y + child.size.height / 2
        : child.position.y;
      const cx1 = horizontal ? sx + (ex - sx) * 0.5 : sx;
      const cy1 = horizontal ? sy : sy + (ey - sy) * 0.5;
      const cx2 = horizontal ? ex - (ex - sx) * 0.5 : ex;
      const cy2 = horizontal ? ey : ey - (ey - sy) * 0.5;
      return {
        key: `${parent.id}->${child.id}`,
        d:
          `M ${sx - minX} ${sy - minY} ` +
          `C ${cx1 - minX} ${cy1 - minY}, ${cx2 - minX} ${cy2 - minY}, ` +
          `${ex - minX} ${ey - minY}`,
        endX: ex - minX,
        endY: ey - minY,
      };
    });

    return { minX, minY, width: maxX - minX, height: maxY - minY, paths };
  }, [frames]);

  if (!geometry) return null;

  return (
    <svg
      className="pointer-events-none absolute"
      style={{
        left: geometry.minX,
        top: geometry.minY,
        width: geometry.width,
        height: geometry.height,
        overflow: 'visible',
      }}
      width={geometry.width}
      height={geometry.height}
    >
      {geometry.paths.map((p) => (
        <g key={p.key}>
          <path
            d={p.d}
            stroke="#ff7849"
            strokeOpacity="0.5"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            className="connector-anim"
          />
          <circle cx={p.endX} cy={p.endY} r="3.5" fill="#ff7849" fillOpacity="0.8" />
        </g>
      ))}
    </svg>
  );
});
