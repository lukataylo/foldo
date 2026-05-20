// Shared helper that turns a FrameStyle from the protocol into React CSS
// properties. Built-in frame components import this and merge the result
// onto their outer wrapper so the Design inspector's overrides are visible.
//
// Overrides win over the frame's intrinsic defaults — i.e. if the user sets
// a Fill color on a sticky frame, that wins over the palette swatch.

import type { CSSProperties } from 'react';
import type { FrameStyle } from '@foldo/protocol';

export function frameStyleToCss(
  style: FrameStyle | undefined,
): CSSProperties {
  if (!style) return {};
  const css: CSSProperties = {};
  if (style.fill) css.background = style.fill;
  if (style.opacity != null) css.opacity = style.opacity;
  if (style.border) {
    const w = style.border.width;
    if (w != null && w === 0) {
      css.border = 'none';
    } else if (w != null || style.border.color || style.border.style) {
      const width = w ?? 1;
      const color = style.border.color ?? 'currentColor';
      const lineStyle = style.border.style ?? 'solid';
      css.border = `${width}px ${lineStyle} ${color}`;
    }
    if (style.border.radius != null) css.borderRadius = style.border.radius;
  }
  if (style.padding) {
    const p = style.padding;
    css.padding = `${p.top ?? 0}px ${p.right ?? 0}px ${p.bottom ?? 0}px ${p.left ?? 0}px`;
  }
  if (style.font) {
    if (style.font.family) css.fontFamily = style.font.family;
    if (style.font.size != null) css.fontSize = style.font.size;
    if (style.font.weight != null) css.fontWeight = style.font.weight;
    if (style.font.lineHeight != null) css.lineHeight = style.font.lineHeight;
    if (style.font.color) css.color = style.font.color;
  }
  return css;
}
