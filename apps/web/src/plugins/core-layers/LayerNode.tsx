// Single tree row in the Layer Navigator. Kept dumb on purpose: it knows
// how to render an icon + label + optional caret, and forwards its click to
// the parent. The parent (LayerNavigator) owns expand/collapse state and
// the call to the select-frame escape hatch.
//
// A+W4 extensions:
//   - Comment count badge (red dot if any unresolved, gray otherwise) with
//     its own click handler so users can jump straight to the comments.
//   - Selected / focused styling: blue 4px left-border for the canvas
//     selection; subtle highlight for the keyboard-focused row.
//   - Multi-select highlight: secondary background when included in the
//     LayerNavigator's selection set.
//   - a11y: real treeitem role with aria-level + aria-current + tabIndex.
//   - Inline error indicator pill — fades out 5s after a failed mutation.
//   - Right-click handler passes the originating mouse coordinates back up.

import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode, Ref } from 'react';

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
  position: 'relative',
};

const rowHover: CSSProperties = {
  ...row,
  background: 'rgba(255,255,255,0.05)',
};

// A+W4: secondary highlight for rows that are part of a multi-select set
// but aren't the currently-focused row.
const rowMultiSelected: CSSProperties = {
  ...row,
  background: 'rgba(80, 120, 220, 0.18)',
};

// A+W4: canvas-selection indicator. Blue left border, 4px wide, drawn via
// an inset boxShadow so the row height doesn't shift.
const rowSelectedShadow = 'inset 4px 0 0 0 #4a8bff';

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

// A+W4: comment count badge styles. Red 14x14 dot with white text when
// there's an unresolved comment, gray otherwise. White ring around it so
// it pops against both the row background and the selected highlight.
const badgeBase: CSSProperties = {
  width: 16,
  minWidth: 16,
  height: 16,
  borderRadius: 8,
  fontSize: 9,
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  color: '#fff',
  cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.12)',
  padding: '0 4px',
};

const badgeUnread: CSSProperties = {
  ...badgeBase,
  background: '#e25555',
};

const badgeResolved: CSSProperties = {
  ...badgeBase,
  background: '#5b5b62',
};

const errorIndicator: CSSProperties = {
  marginLeft: 4,
  width: 14,
  height: 14,
  borderRadius: 7,
  background: '#e25555',
  color: '#fff',
  fontSize: 10,
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  transition: 'opacity 600ms ease-out',
};

export interface CommentBadgeInfo {
  count: number;
  unresolved: number;
}

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
  /** A+W4: canvas selection — draws the blue left-border indicator. */
  selectedOnCanvas?: boolean;
  /** A+W4: part of the multi-select set — secondary highlight. */
  multiSelected?: boolean;
  /** A+W4: comment badge data. Omit to skip the badge entirely. */
  badge?: CommentBadgeInfo;
  /** A+W4: error indicator — renders a fading red dot when set. */
  errorMessage?: string;
  onClick(event?: MouseEvent<HTMLElement>): void;
  /** A+W4: right-click handler (LayerNavigator opens its context menu here). */
  onContextMenu?(event: MouseEvent<HTMLElement>): void;
  /** A+W4: click on the comment badge — jumps to / expands comments. */
  onBadgeClick?(event: MouseEvent<HTMLElement>): void;
  /** Stable testid hook for the e2e + unit specs. */
  testId?: string;
  // ---------- a11y ----------
  /** A+W4: aria-level for treeitem role; 1 = branch, 2 = frame, 3 = comment. */
  ariaLevel?: number;
  /** A+W4: omit to keep the row out of the Tab order — only one row in the
   * tree should have tabIndex=0 at a time (the focused row). */
  tabIndex?: number;
  /** A+W4: optional native onKeyDown so the parent can wire roving focus. */
  onKeyDown?(event: KeyboardEvent<HTMLElement>): void;
  /** A+W4: optional native ref so the parent can call .focus() on the row. */
  rowRef?: Ref<HTMLDivElement>;
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
    selectedOnCanvas,
    multiSelected,
    badge,
    errorMessage,
    onClick,
    onContextMenu,
    onBadgeClick,
    testId,
    ariaLevel,
    tabIndex,
    onKeyDown,
    rowRef,
  } = props;

  // Compose the base style — multi-select wins over plain hover so a row
  // that's both focused + part of a selection set still reads as selected.
  const base = multiSelected
    ? rowMultiSelected
    : focused
      ? rowHover
      : row;
  const rowStyle: CSSProperties = {
    ...base,
    paddingLeft: 6 + depth * 14,
    boxShadow: selectedOnCanvas ? rowSelectedShadow : undefined,
  };

  // A+W4: treeitem semantics. The parent provides ariaLevel so we get the
  // right value for branches (1), frames (2), and comments (3). aria-current
  // mirrors the focused state — screen readers announce "current" on the
  // row with keyboard focus. We render a div with role=treeitem (rather
  // than a button) so nested treeitem rows can sit inside us without a
  // button-in-button validation error.
  return (
    <div
      ref={rowRef}
      role="treeitem"
      aria-level={ariaLevel}
      aria-expanded={expandable ? !!expanded : undefined}
      aria-current={focused ? 'true' : undefined}
      aria-selected={multiSelected || selectedOnCanvas ? true : undefined}
      tabIndex={tabIndex}
      style={rowStyle}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
      data-testid={testId}
      data-foldo-layer-focused={focused ? 'true' : undefined}
      data-foldo-layer-selected={selectedOnCanvas ? 'true' : undefined}
      data-foldo-layer-multi-selected={multiSelected ? 'true' : undefined}
      onMouseEnter={(e) => {
        // Hover only changes the background if the row isn't already
        // highlighted by selection / multi-select.
        if (multiSelected || focused) return;
        (e.currentTarget as HTMLDivElement).style.background =
          'rgba(255,255,255,0.05)';
      }}
      onMouseLeave={(e) => {
        if (multiSelected) {
          (e.currentTarget as HTMLDivElement).style.background =
            rowMultiSelected.background as string;
        } else if (focused) {
          (e.currentTarget as HTMLDivElement).style.background =
            'rgba(255,255,255,0.05)';
        } else {
          (e.currentTarget as HTMLDivElement).style.background = 'transparent';
        }
      }}
    >
      <span style={caret} aria-hidden="true">
        {expandable ? (expanded ? '▾' : '▸') : ''}
      </span>
      <span style={icon} aria-hidden="true">
        {iconNode}
      </span>
      <span style={labelStyle}>{text}</span>
      {badge && badge.count > 0 ? (
        <span
          style={badge.unresolved > 0 ? badgeUnread : badgeResolved}
          onClick={(e) => {
            e.stopPropagation();
            if (onBadgeClick) onBadgeClick(e);
          }}
          data-testid={`${testId ?? 'foldo-layer-node'}-badge`}
          aria-label={`${badge.count} comment${badge.count === 1 ? '' : 's'}${
            badge.unresolved > 0
              ? `, ${badge.unresolved} unresolved`
              : ', all resolved'
          }`}
          role="status"
        >
          {badge.count}
        </span>
      ) : null}
      {errorMessage ? (
        <span
          style={errorIndicator}
          title={errorMessage}
          aria-label={`Error: ${errorMessage}`}
          data-testid={`${testId ?? 'foldo-layer-node'}-error`}
          role="alert"
        >
          !
        </span>
      ) : null}
      {metaText ? <span style={metaStyle}>{metaText}</span> : null}
    </div>
  );
}
