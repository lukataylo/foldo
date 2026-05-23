import type { Frame } from '@foldo/protocol';

interface Props {
  frames: Frame[];
  /**
   * Set of frame ids currently in (or near) the viewport. When provided, links
   * whose parent AND child are both off-viewport are dropped before path
   * generation — that's free on a small board but matters once hundreds of
   * parent/child pairs exist, when most are scrolled off-screen.
   */
  inViewportFrameIds?: ReadonlySet<string>;
}

// Renders subtle curves between parent and child frames in world coords.
// Sits inside the transformed layer so it scales with zoom.
export function Connectors({ frames, inViewportFrameIds }: Props) {
  const map = new Map(frames.map((f) => [f.id, f]));
  let links = frames
    .filter((f) => f.parentFrameId && map.has(f.parentFrameId))
    .map((child) => ({ child, parent: map.get(child.parentFrameId!)! }));

  if (inViewportFrameIds && inViewportFrameIds.size > 0) {
    links = links.filter(
      ({ child, parent }) =>
        inViewportFrameIds.has(child.id) || inViewportFrameIds.has(parent.id),
    );
  }

  if (!links.length) return null;

  // SVG covers the bounding box of all linked frames.
  const xs: number[] = [];
  const ys: number[] = [];
  links.forEach(({ child, parent }) => {
    xs.push(parent.position.x, parent.position.x + parent.size.width);
    xs.push(child.position.x, child.position.x + child.size.width);
    ys.push(parent.position.y, parent.position.y + parent.size.height);
    ys.push(child.position.y, child.position.y + child.size.height);
  });
  const pad = 200;
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;
  const width = maxX - minX;
  const height = maxY - minY;

  return (
    <svg
      className="pointer-events-none absolute"
      style={{
        left: minX,
        top: minY,
        width,
        height,
        overflow: 'visible',
      }}
      width={width}
      height={height}
    >
      {links.map(({ child, parent }) => {
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
        const path = `M ${sx - minX} ${sy - minY} C ${cx1 - minX} ${cy1 - minY}, ${cx2 - minX} ${cy2 - minY}, ${ex - minX} ${ey - minY}`;
        return (
          <g key={`${parent.id}->${child.id}`}>
            <path
              d={path}
              stroke="#ff7849"
              strokeOpacity="0.5"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              className="connector-anim"
            />
            <circle
              cx={ex - minX}
              cy={ey - minY}
              r="3.5"
              fill="#ff7849"
              fillOpacity="0.8"
            />
          </g>
        );
      })}
    </svg>
  );
}
