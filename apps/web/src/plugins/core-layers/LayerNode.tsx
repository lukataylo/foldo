// Single tree row in the Layer Navigator. Kept dumb on purpose: it knows
// how to render an icon + label + optional caret, and forwards its click to
// the parent. The parent (LayerNavigator) owns expand/collapse state and
// the call to the select-frame escape hatch.

import type { CSSProperties, ReactNode } from 'react';

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  width: '100%',
  /* A+W1 touch: 4x6 → 8x10 padding + 12px font so each row is ~32-36px tall;
     comfortable for iPad fingertips without losing the dense-list feel. */
  padding: '8px 10px',
  border: 'none',
  background: 'transparent',
  color: '#e8e8ea',
  fontSize: 13,
  textAlign: 'left',
  cursor: 'pointer',
  borderRadius: 4,
  lineHeight: 1.3,
};

const rowHover: CSSProperties = {
  ...row,
  background: 'rgba(255,255,255,0.05)',
};

const caret: CSSProperties = {
  width: 12,
  height: 12,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  color: '#9a9aa0',
  fontSize: 9,
  lineHeight: 1,
};

const icon: CSSProperties = {
  width: 12,
  height: 12,
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#9a9aa0',
  fontSize: 10,
};

const labelStyle: CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const metaStyle: CSSProperties = {
  flexShrink: 0,
  color: '#666',
  fontSize: 10,
};

export interface LayerNodeProps {
  /** Visual indent depth, 0 = root. */
  depth: number;
  /** Renderable icon (emoji string or element). */
  iconNode: ReactNode;
  label: string;
  /** Optional right-side metadata (e.g. comment count). */
  metaText?: string;
  /** Show a caret + toggle on click. Omit to render a leaf row. */
  expandable?: boolean;
  expanded?: boolean;
  /** Whether this row is the currently-focused one in the tree. */
  focused?: boolean;
  onClick: () => void;
  /** Stable testid hook for the e2e + unit specs. */
  testId?: string;
}

export function LayerNode(props: LayerNodeProps): JSX.Element {
  const {
    depth,
    iconNode,
    label: text,
    metaText,
    expandable,
    expanded,
    focused,
    onClick,
    testId,
  } = props;
  const rowStyle: CSSProperties = {
    ...(focused ? rowHover : row),
    paddingLeft: 6 + depth * 14,
  };
  return (
    <button
      type="button"
      style={rowStyle}
      onClick={onClick}
      data-testid={testId}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          'rgba(255,255,255,0.05)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = focused
          ? 'rgba(255,255,255,0.05)'
          : 'transparent';
      }}
    >
      <span style={caret} aria-hidden="true">
        {expandable ? (expanded ? '▾' : '▸') : ''}
      </span>
      <span style={icon} aria-hidden="true">
        {iconNode}
      </span>
      <span style={labelStyle}>{text}</span>
      {metaText ? <span style={metaStyle}>{metaText}</span> : null}
    </button>
  );
}
