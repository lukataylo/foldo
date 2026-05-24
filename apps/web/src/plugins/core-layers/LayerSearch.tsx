// A+W4: search input + filter logic for the Layer Navigator.
//
// The component is a small controlled input that sits above the toolbar; the
// parent (LayerNavigator) owns the query string and calls into `matchFrame`
// to decide which frames stay visible. A useImperativeHandle-style ref lets
// the parent focus the input from Cmd+F.
//
// The fuzzy matcher is intentionally tiny — substring + token-prefix — so
// the bundle stays dep-free and the behaviour is predictable for unit tests.
// "Fuzzy" here means case-insensitive, accent-tolerant via toLowerCase, and
// matches across word boundaries (e.g. "stk note" matches "sticky note").

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import type { Frame } from '@foldo/protocol';
import { frameDisplayName } from './LayerNavigator';

// ---------- styles ----------

const wrapperStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
};

// 16px font so iOS Safari doesn't auto-zoom on focus.
const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'rgba(0,0,0,0.3)',
  color: '#e8e8ea',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 4,
  padding: '8px 28px 8px 10px',
  fontSize: 16,
  fontFamily: 'inherit',
  outline: 'none',
};

const clearBtn: CSSProperties = {
  position: 'absolute',
  right: 4,
  top: '50%',
  transform: 'translateY(-50%)',
  width: 22,
  height: 22,
  border: 'none',
  background: 'transparent',
  color: '#9a9aa0',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
  padding: 0,
  borderRadius: 3,
};

// ---------- matcher ----------

/** Case-insensitive substring + token-prefix match. Empty query matches everything. */
export function matchFrame(frame: Frame, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = frameDisplayName(frame).toLowerCase();
  if (name.includes(q)) return true;
  // Token-prefix: every space-separated piece of the query must be a prefix
  // of some token in the display name. "stk note" → match "Sticky note".
  const tokens = name.split(/\s+/).filter(Boolean);
  const needles = q.split(/\s+/).filter(Boolean);
  return needles.every((needle) =>
    tokens.some((token) => token.startsWith(needle)),
  );
}

// ---------- component ----------

export interface LayerSearchHandle {
  focus(): void;
}

export interface LayerSearchProps {
  value: string;
  onChange(next: string): void;
  /** Total frame count for the placeholder hint. */
  totalFrames: number;
}

export const LayerSearch = forwardRef<LayerSearchHandle, LayerSearchProps>(
  function LayerSearch({ value, onChange, totalFrames }, ref) {
    const inputRef = useRef<HTMLInputElement | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        focus(): void {
          inputRef.current?.focus();
          inputRef.current?.select();
        },
      }),
      [],
    );

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (value) {
          onChange('');
        } else {
          inputRef.current?.blur();
        }
      }
    };

    return (
      <div style={wrapperStyle}>
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Search ${totalFrames || 0} frame${totalFrames === 1 ? '' : 's'}…`}
          style={inputStyle}
          aria-label="Search layers"
          data-testid="foldo-layer-search-input"
          // Search-style inputs in iOS get the search keyboard automatically;
          // explicit role keeps a11y consistent across browsers.
          role="searchbox"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            style={clearBtn}
            aria-label="Clear search"
            data-testid="foldo-layer-search-clear"
            title="Clear search"
          >
            ×
          </button>
        ) : null}
      </div>
    );
  },
);
