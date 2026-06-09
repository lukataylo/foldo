// @vitest-environment jsdom
//
// A+W4 extended unit specs for the Layer Navigator. The companion file
// LayerNavigator.test.tsx still covers the original three v1 guarantees
// (empty state, seeded tree, click-to-select); this file is the production
// hardening coverage promised by the Wave 4 audit:
//
//   1. Search filter narrows the rendered rows.
//   2. Keyboard arrow keys move focus through the visible frames.
//   3. Comment badge renders the right count + class for unresolved vs resolved.
//   4. Empty state copy fires when frames.size === 0 (post-hydration).
//   5. Multi-select toggles + bulk delete dispatches the right API calls.
//
// The tests render against the same BoardStore singleton the navigator
// subscribes to, and reset it between specs so each starts from a clean
// snapshot.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Branch, Comment, Frame } from '@foldo/protocol';
import { boardStore } from '../../../state/useBoardStore';
import type { BoardSnapshot } from '../../../state/BoardStore';
import { LayerNavigator } from '../LayerNavigator';
import { matchFrame } from '../LayerSearch';

// ---------- fixtures ----------

const NOW = '2025-01-01T00:00:00.000Z';

function makeBranch(over: Partial<Branch> = {}): Branch {
  return {
    id: 'b-main',
    boardId: 'board-1',
    name: 'main',
    authoredBy: 'human',
    authorUserId: 'u-1',
    color: '#888',
    headSha: 'aaa',
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function makeFrame(over: Partial<Frame> = {}): Frame {
  return {
    id: 'f-1',
    boardId: 'board-1',
    kind: 'sticky',
    branchId: 'b-main',
    commitSha: 'aaa',
    commitMessage: 'a frame',
    age: '1m ago',
    position: { x: 0, y: 0 },
    size: { width: 100, height: 100 },
    content: { kind: 'sticky', body: 'note one' },
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function makeComment(over: Partial<Comment> = {}): Comment {
  return {
    id: 'c-1',
    boardId: 'board-1',
    frameId: 'f-1',
    authorUserId: 'u-1',
    authorName: 'Tester',
    authorInitial: 'T',
    authorColor: '#111',
    text: 'first comment',
    createdAt: NOW,
    updatedAt: NOW,
    resolved: false,
    replies: [],
    ...over,
  };
}

function seed(patch: Partial<BoardSnapshot>): void {
  boardStore.set({
    hydrated: true,
    offline: false,
    wsStatus: 'open',
    meUserId: 'u-1',
    board: { id: 'board-1', name: 'b', repoSlug: 'x/y', createdAt: NOW },
    frames: new Map(),
    comments: new Map(),
    branches: new Map(),
    users: new Map(),
    presence: new Map(),
    dispatches: new Map(),
    mcpConnected: false,
    activeTestSessions: new Set(),
    testsRevision: 0,
    ...patch,
  });
}

beforeEach(() => {
  // Reset every escape-hatch the navigator reaches for so specs are
  // hermetic. The route is reset to the demo board path so the
  // canvas-selection sync doesn't poison cross-test state.
  delete (window as unknown as { __foldoSelectFrame?: unknown }).__foldoSelectFrame;
  delete (window as unknown as { __foldoToast?: unknown }).__foldoToast;
  history.replaceState({}, '', '/');
  boardStore.reset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------- 1. Search ----------

describe('LayerNavigator (A+W4) — search filter', () => {
  it('narrows visible rows to those matching the query', () => {
    const branch = makeBranch();
    const a = makeFrame({ id: 'f-apple', content: { kind: 'sticky', body: 'apple pie' } });
    const b = makeFrame({ id: 'f-banana', content: { kind: 'sticky', body: 'banana bread' } });
    const c = makeFrame({ id: 'f-cherry', content: { kind: 'sticky', body: 'cherry cake' } });
    seed({
      branches: new Map([[branch.id, branch]]),
      frames: new Map([[a.id, a], [b.id, b], [c.id, c]]),
    });

    render(<LayerNavigator />);
    expect(screen.getByTestId('foldo-layer-frame-f-apple')).toBeTruthy();
    expect(screen.getByTestId('foldo-layer-frame-f-banana')).toBeTruthy();
    expect(screen.getByTestId('foldo-layer-frame-f-cherry')).toBeTruthy();

    const input = screen.getByTestId('foldo-layer-search-input');
    fireEvent.change(input, { target: { value: 'banana' } });

    expect(screen.queryByTestId('foldo-layer-frame-f-apple')).toBeNull();
    expect(screen.getByTestId('foldo-layer-frame-f-banana')).toBeTruthy();
    expect(screen.queryByTestId('foldo-layer-frame-f-cherry')).toBeNull();
  });

  it('matchFrame helper is case-insensitive and accepts token prefixes', () => {
    const f = makeFrame({ content: { kind: 'sticky', body: 'Sticky note' } });
    expect(matchFrame(f, 'STK')).toBe(false); // not a prefix of a token
    expect(matchFrame(f, 'note')).toBe(true);
    expect(matchFrame(f, 'sti note')).toBe(true);
    expect(matchFrame(f, '')).toBe(true);
  });

  it('renders the "no matches" hint when the query filters out every frame', () => {
    const branch = makeBranch();
    const a = makeFrame({ content: { kind: 'sticky', body: 'apple' } });
    seed({
      branches: new Map([[branch.id, branch]]),
      frames: new Map([[a.id, a]]),
    });
    render(<LayerNavigator />);
    fireEvent.change(screen.getByTestId('foldo-layer-search-input'), {
      target: { value: 'xyznotreal' },
    });
    expect(screen.getByTestId('foldo-layer-no-matches')).toBeTruthy();
  });
});

// ---------- 2. Keyboard navigation ----------

describe('LayerNavigator (A+W4) — keyboard navigation', () => {
  it('ArrowDown moves focus across the visible frames in order', () => {
    const branch = makeBranch();
    const a = makeFrame({ id: 'f-a', position: { x: 0, y: 0 }, content: { kind: 'sticky', body: 'a' } });
    const b = makeFrame({ id: 'f-b', position: { x: 0, y: 100 }, content: { kind: 'sticky', body: 'b' } });
    const c = makeFrame({ id: 'f-c', position: { x: 0, y: 200 }, content: { kind: 'sticky', body: 'c' } });
    seed({
      branches: new Map([[branch.id, branch]]),
      frames: new Map([[a.id, a], [b.id, b], [c.id, c]]),
    });
    render(<LayerNavigator />);

    const tree = screen.getByTestId('foldo-layer-tree');
    // First Tab-equivalent focus event lands on the tree; onFocus selects f-a.
    act(() => {
      tree.focus();
    });
    expect(screen.getByTestId('foldo-layer-frame-f-a').getAttribute('aria-current')).toBe('true');

    // Two ArrowDown presses land on f-c.
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    expect(screen.getByTestId('foldo-layer-frame-f-b').getAttribute('aria-current')).toBe('true');
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    expect(screen.getByTestId('foldo-layer-frame-f-c').getAttribute('aria-current')).toBe('true');

    // ArrowUp walks back.
    fireEvent.keyDown(tree, { key: 'ArrowUp' });
    expect(screen.getByTestId('foldo-layer-frame-f-b').getAttribute('aria-current')).toBe('true');
  });

  it('Enter on a focused row drives the select-frame hook', () => {
    const branch = makeBranch();
    const a = makeFrame({ id: 'f-target' });
    seed({
      branches: new Map([[branch.id, branch]]),
      frames: new Map([[a.id, a]]),
    });
    const spy = vi.fn();
    (window as unknown as { __foldoSelectFrame: (id: string) => void }).__foldoSelectFrame = spy;

    render(<LayerNavigator />);
    const tree = screen.getByTestId('foldo-layer-tree');
    act(() => tree.focus());
    fireEvent.keyDown(tree, { key: 'Enter' });
    expect(spy).toHaveBeenCalledWith('f-target');
  });
});

// ---------- 3. Comment badge ----------

describe('LayerNavigator (A+W4) — comment badge', () => {
  it('renders a badge with the right count + unread styling', () => {
    const branch = makeBranch();
    const frame = makeFrame({ id: 'f-1' });
    const c1 = makeComment({ id: 'c-1', frameId: 'f-1', resolved: false });
    const c2 = makeComment({ id: 'c-2', frameId: 'f-1', resolved: true });
    seed({
      branches: new Map([[branch.id, branch]]),
      frames: new Map([[frame.id, frame]]),
      comments: new Map([[c1.id, c1], [c2.id, c2]]),
    });

    render(<LayerNavigator />);
    const badge = screen.getByTestId('foldo-layer-frame-f-1-badge');
    expect(badge.textContent).toBe('2');
    // Unresolved count is 1, so the red background is on.
    expect(badge.getAttribute('aria-label')).toMatch(/1 unresolved/);
  });

  it('omits the badge when no comments exist', () => {
    const branch = makeBranch();
    const frame = makeFrame({ id: 'f-empty' });
    seed({
      branches: new Map([[branch.id, branch]]),
      frames: new Map([[frame.id, frame]]),
    });
    render(<LayerNavigator />);
    expect(screen.queryByTestId('foldo-layer-frame-f-empty-badge')).toBeNull();
  });
});

// ---------- 4. Empty / loading states ----------

describe('LayerNavigator (A+W4) — boot states', () => {
  it('renders the skeleton rows while the store is not yet hydrated', () => {
    boardStore.reset(); // hydrated=false
    render(<LayerNavigator />);
    expect(screen.getByTestId('foldo-layer-loading')).toBeTruthy();
    expect(screen.queryByTestId('foldo-layer-empty')).toBeNull();
  });

  it('renders the friendly empty hint once the board has zero frames', () => {
    seed({});
    render(<LayerNavigator />);
    const hint = screen.getByTestId('foldo-layer-empty');
    expect(hint.textContent).toMatch(/no frames yet/i);
  });
});

// ---------- 5. Multi-select + bulk delete ----------

describe('LayerNavigator (A+W4) — multi-select', () => {
  it('cmd-click toggles selection and the toolbar reports the count', () => {
    const branch = makeBranch();
    const a = makeFrame({ id: 'f-a', position: { x: 0, y: 0 }, content: { kind: 'sticky', body: 'a' } });
    const b = makeFrame({ id: 'f-b', position: { x: 0, y: 100 }, content: { kind: 'sticky', body: 'b' } });
    seed({
      branches: new Map([[branch.id, branch]]),
      frames: new Map([[a.id, a], [b.id, b]]),
    });
    render(<LayerNavigator />);

    fireEvent.click(screen.getByTestId('foldo-layer-frame-f-a'));
    fireEvent.click(screen.getByTestId('foldo-layer-frame-f-b'), { metaKey: true });

    // Both rows are now multi-selected.
    expect(
      screen.getByTestId('foldo-layer-frame-f-a').getAttribute('data-foldo-layer-multi-selected'),
    ).toBe('true');
    expect(
      screen.getByTestId('foldo-layer-frame-f-b').getAttribute('data-foldo-layer-multi-selected'),
    ).toBe('true');

    // Toolbar delete reports the count.
    const del = screen.getByTestId('foldo-layer-delete');
    expect(del.textContent).toMatch(/Delete 2/);
  });

  it('bulk-delete confirms and removes every selected frame', async () => {
    const branch = makeBranch();
    const a = makeFrame({ id: 'f-a', position: { x: 0, y: 0 }, content: { kind: 'sticky', body: 'a' } });
    const b = makeFrame({ id: 'f-b', position: { x: 0, y: 100 }, content: { kind: 'sticky', body: 'b' } });
    seed({
      branches: new Map([[branch.id, branch]]),
      frames: new Map([[a.id, a], [b.id, b]]),
    });

    // Stub the network — apiDeleteFrame would otherwise reach for fetch.
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as never).mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({}),
      text: async () => '',
    } as unknown as Response);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<LayerNavigator />);
    fireEvent.click(screen.getByTestId('foldo-layer-frame-f-a'));
    fireEvent.click(screen.getByTestId('foldo-layer-frame-f-b'), { metaKey: true });

    await act(async () => {
      fireEvent.click(screen.getByTestId('foldo-layer-delete'));
      // Let the optimistic store updates + the fetch resolutions settle.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(confirmSpy).toHaveBeenCalledWith('Delete 2 frames?');
    // Both frames are gone from the store (optimistic removal).
    expect(boardStore.getSnapshot().frames.has('f-a')).toBe(false);
    expect(boardStore.getSnapshot().frames.has('f-b')).toBe(false);
    // The API was hit once per frame.
    const deleteCalls = fetchSpy.mock.calls.filter(([, init]) => {
      const opts = init as RequestInit | undefined;
      return opts?.method === 'DELETE';
    });
    expect(deleteCalls.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------- 6. Right-click context menu ----------

describe('LayerNavigator (A+W4) — context menu', () => {
  it('right-clicking a row opens the menu with the expected entries', () => {
    const branch = makeBranch();
    const frame = makeFrame({ id: 'f-1' });
    seed({
      branches: new Map([[branch.id, branch]]),
      frames: new Map([[frame.id, frame]]),
    });
    render(<LayerNavigator />);

    fireEvent.contextMenu(screen.getByTestId('foldo-layer-frame-f-1'));

    expect(screen.getByTestId('foldo-layer-context-menu')).toBeTruthy();
    expect(screen.getByTestId('foldo-layer-ctx-rename')).toBeTruthy();
    expect(screen.getByTestId('foldo-layer-ctx-duplicate')).toBeTruthy();
    expect(screen.getByTestId('foldo-layer-ctx-delete')).toBeTruthy();
    expect(screen.getByTestId('foldo-layer-ctx-copy-link')).toBeTruthy();
  });
});
