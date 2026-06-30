// A+W4: right-click context menu for a Layer Navigator row.
//
// The component is a small absolute-positioned popover with four entries —
// Rename, Duplicate, Delete, Copy link to frame. The parent (LayerNavigator)
// owns the open/close state and the action callbacks; this file only owns
// the visual presentation, positioning, and outside-click / Escape
// dismissal.
//
// We render via the parent's flow (no portal) so the menu's positioning is
// relative to the navigator's container. Z-index 50 keeps it above the tree
// but well below any global toast / popover the canvas might render.
//
// Duplicate is gated by `canDuplicate`: there is no v1 duplicate API, so
// when the prop is false the row renders disabled with a "Coming soon"
// tooltip — preserves muscle memory once the API ships.

import { useEffect, useRef, type CSSProperties } from 'react';

// ---------- styles ----------

const menu: CSSProperties = {
  position: 'absolute',
  zIndex: 50,
  background: '#1f1f23',
  color: '#e8e8ea',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6,
  boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
  padding: 4,
  minWidth: 168,
  fontSize: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
};

const item: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 10px',
  border: 'none',
  background: 'transparent',
  color: '#e8e8ea',
  textAlign: 'left',
  cursor: 'pointer',
  borderRadius: 4,
  fontSize: 12,
  // Allow the menu to sit on top of rows without inheriting their hover bg.
  width: '100%',
};

const itemDisabled: CSSProperties = {
  ...item,
  color: '#6f6f76',
  cursor: 'not-allowed',
};

const divider: CSSProperties = {
  height: 1,
  background: 'rgba(255,255,255,0.06)',
  margin: '4px 2px',
};

// ---------- component ----------

export interface LayerContextMenuProps {
  x: number;
  y: number;
  frameId: string;
  canRename: boolean;
  canDuplicate: boolean;
  onRename(frameId: string): void;
  onDuplicate(frameId: string): void;
  onDelete(frameId: string): void;
  onCopyLink(frameId: string): void;
  onClose(): void;
}

export function LayerContextMenu(props: LayerContextMenuProps): JSX.Element {
  const {
    x,
    y,
    frameId,
    canRename,
    canDuplicate,
    onRename,
    onDuplicate,
    onDelete,
    onCopyLink,
    onClose,
  } = props;
  const menuRef = useRef<HTMLDivElement | null>(null);

  // A+W4: dismiss on outside-click or Escape. We attach the click listener on
  // the next tick so the same right-click that opened the menu doesn't also
  // close it. mousedown rather than click so the menu disappears before the
  // canvas underneath has a chance to register an unrelated click.
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent): void => {
      const node = menuRef.current;
      if (!node) return;
      if (e.target instanceof Node && node.contains(e.target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDocMouseDown);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const renderItem = (
    label: string,
    handler: () => void,
    opts: { disabled?: boolean; testId: string; title?: string } = { testId: '' },
  ): JSX.Element => (
    <button
      type="button"
      style={opts.disabled ? itemDisabled : item}
      disabled={opts.disabled}
      onClick={() => {
        if (opts.disabled) return;
        handler();
        onClose();
      }}
      onMouseEnter={(e) => {
        if (opts.disabled) return;
        (e.currentTarget as HTMLButtonElement).style.background =
          'rgba(255,255,255,0.06)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
      data-testid={opts.testId}
      title={opts.title}
      role="menuitem"
    >
      {label}
    </button>
  );

  return (
    <div
      ref={menuRef}
      style={{ ...menu, left: x, top: y }}
      role="menu"
      aria-label="Layer actions"
      data-testid="foldo-layer-context-menu"
      // Stop the contextmenu event so right-clicking the menu itself doesn't
      // spawn a second one (and doesn't bubble to the row below).
      onContextMenu={(e) => e.preventDefault()}
    >
      {renderItem('Rename', () => onRename(frameId), {
        disabled: !canRename,
        testId: 'foldo-layer-ctx-rename',
        title: canRename
          ? 'Rename this frame'
          : 'Rename only supports doc + sticky frames',
      })}
      {renderItem('Duplicate', () => onDuplicate(frameId), {
        disabled: !canDuplicate,
        testId: 'foldo-layer-ctx-duplicate',
        title: canDuplicate
          ? 'Duplicate this frame'
          : 'Duplicate API not yet available',
      })}
      <div style={divider} aria-hidden="true" />
      {renderItem('Copy link to frame', () => onCopyLink(frameId), {
        testId: 'foldo-layer-ctx-copy-link',
        title: 'Copy a deep link to this frame',
      })}
      <div style={divider} aria-hidden="true" />
      {renderItem('Delete', () => onDelete(frameId), {
        testId: 'foldo-layer-ctx-delete',
        title: 'Delete this frame',
      })}
    </div>
  );
}
