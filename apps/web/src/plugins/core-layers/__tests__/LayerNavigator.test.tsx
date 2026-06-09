// @vitest-environment jsdom
//
// Unit specs for the Layer Navigator panel body. Three guarantees, in order:
//
//   1. Empty state: when the board snapshot has no frames the empty hint
//      renders (no tree, no crashes).
//   2. Seeded snapshot: branches → frames → comments all render with their
//      labels. Comments only show once their parent frame is expanded.
//   3. Click-to-select: clicking a frame row calls the select-frame escape
//      hatch we registered on window.
//
// The tests render against a real BoardStore singleton — the same one
// LayerNavigator subscribes to via useBoardSnapshot — and reset it back to
// an empty snapshot between tests so each spec starts from a known floor.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Branch, Comment, Frame } from '@foldo/protocol';
import { boardStore } from '../../../state/useBoardStore';
import type { BoardSnapshot } from '../../../state/BoardStore';
import { LayerNavigator, frameDisplayName } from '../LayerNavigator';

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
  // Replace the snapshot wholesale via `set` so test ordering is deterministic
  // and we don't leak Maps between specs.
  boardStore.set({
    hydrated: true,
    offline: false,
    wsStatus: 'open',
    meUserId: 'u-1',
    board: null,
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
  // Wipe any hook registered by a previous spec or App.tsx; each test sets
  // its own as needed.
  delete (window as unknown as { __foldoSelectFrame?: unknown })
    .__foldoSelectFrame;
  delete (window as unknown as { __foldoToast?: unknown }).__foldoToast;
  boardStore.reset();
});

afterEach(() => {
  cleanup();
});

// ---------- tests ----------

describe('LayerNavigator', () => {
  it('renders the empty-state hint when the snapshot has no frames', () => {
    seed({});
    render(<LayerNavigator />);
    expect(screen.getByTestId('foldo-layer-navigator')).toBeTruthy();
    expect(screen.getByTestId('foldo-layer-empty')).toBeTruthy();
    // Toolbar is always present so the user has affordances even on an empty board.
    expect(screen.getByTestId('foldo-layer-create')).toBeTruthy();
  });

  it('renders branches, frames, and (once expanded) comments from a seeded snapshot', () => {
    const branch = makeBranch({ id: 'b-main', name: 'main' });
    const frame = makeFrame({ id: 'f-1', branchId: 'b-main' });
    const comment = makeComment({ id: 'c-1', frameId: 'f-1', text: 'looks great' });
    seed({
      branches: new Map([[branch.id, branch]]),
      frames: new Map([[frame.id, frame]]),
      comments: new Map([[comment.id, comment]]),
    });

    render(<LayerNavigator />);

    // Branch row
    const branchRow = screen.getByTestId('foldo-layer-branch-b-main');
    expect(branchRow.textContent).toContain('main');

    // Frame row — displayName uses the sticky body, not the id.
    const frameRow = screen.getByTestId('foldo-layer-frame-f-1');
    expect(frameRow.textContent).toContain('note one');

    // Comment is not visible until we click the frame to expand it.
    expect(screen.queryByTestId('foldo-layer-comment-c-1')).toBeNull();

    fireEvent.click(frameRow);

    const commentRow = screen.getByTestId('foldo-layer-comment-c-1');
    expect(commentRow.textContent).toContain('looks great');
  });

  it('clicking a frame row dispatches via the window.__foldoSelectFrame escape hatch', () => {
    const branch = makeBranch();
    const frame = makeFrame({ id: 'f-target' });
    seed({
      branches: new Map([[branch.id, branch]]),
      frames: new Map([[frame.id, frame]]),
    });
    const selectSpy = vi.fn();
    (window as unknown as { __foldoSelectFrame: (id: string) => void })
      .__foldoSelectFrame = selectSpy;

    render(<LayerNavigator />);
    fireEvent.click(screen.getByTestId('foldo-layer-frame-f-target'));

    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(selectSpy).toHaveBeenCalledWith('f-target');
  });

  it('frameDisplayName falls back through content kinds without throwing', () => {
    // Pure-helper smoke test so future contributors don't accidentally
    // crash the tree on a frame kind they haven't styled yet.
    expect(
      frameDisplayName(makeFrame({ content: { kind: 'sticky', body: 'hi' } })),
    ).toBe('hi');
    expect(
      frameDisplayName(
        makeFrame({
          kind: 'image',
          content: { kind: 'image', url: '/x.png', alt: '' },
        }),
      ),
    ).toBe('Image');
  });
});
