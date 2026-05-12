import type {
  AppFrameContent,
  Dispatch,
  DispatchEvent,
  Frame,
  VariantOverrides,
} from '@foldo/protocol';
import {
  completeDispatch,
  failDispatch,
  setDispatchStatus,
} from '../repo/dispatches.ts';
import { getFrameById, insertFrame, listFramesForBoard } from '../repo/frames.ts';
import { upsertCommit, updateBranchHead } from '../repo/branches.ts';
import { hub } from '../ws/hub.ts';
import { newCommitSha, newId, nowIso, sleep } from '../util.ts';

/**
 * Infer the overrides Claude Code would have produced. Mirrors the original
 * prototype's hard-coded smart-guess logic so the demo is identical when no
 * real MCP is connected.
 */
export function inferOverrides(args: {
  intent: string;
  elementLabel?: string;
}): VariantOverrides {
  const intent = args.intent.toLowerCase();
  const label = (args.elementLabel ?? '').toLowerCase();
  const out: VariantOverrides = {};

  const isCtaPrimary = label.includes('cta-primary');
  if (isCtaPrimary && (intent.includes('trial') || intent.includes('14-day') || intent.includes('14 day'))) {
    out.ctaLabel = 'Start your 14-day free trial';
    out.ctaSubtext = 'No credit card. Cancel anytime.';
  }

  const isProTier = label.includes('tier-card--pro') || label.includes('pro');
  if (isProTier) {
    out.proGradientToned = true;
  }

  return out;
}

/**
 * Build the new child frame produced by a simulated dispatch.
 * It is placed to the right of the parent's rightmost sibling in that row.
 */
function buildChildFrame(parent: Frame, dispatch: Dispatch, newSha: string): Frame {
  const overrides = inferOverrides({
    intent: dispatch.intent,
    elementLabel: dispatch.target.elementLabel,
  });

  // Find the rightmost frame in the same row (same y) on this board.
  const siblings = listFramesForBoard(parent.boardId).filter(
    (f) => Math.abs(f.position.y - parent.position.y) < 1,
  );
  const rightmost = siblings.reduce(
    (max, f) => (f.position.x + f.size.width > max ? f.position.x + f.size.width : max),
    parent.position.x + parent.size.width,
  );
  const gap = 40;

  // Carry over the parent's app content but bump the iframe URL (commit + variant).
  const parentContent =
    parent.content.kind === 'app'
      ? parent.content
      : ({
          kind: 'app',
          variant: 'baseline',
          route: '/pricing',
          viewport: { width: 1280, height: 900 },
          stateLabel: 'Default',
        } satisfies AppFrameContent);

  const variant = parentContent.variant;
  const stateLabel = parentContent.stateLabel ?? 'Default';
  const modal = parentContent.stateLabel?.toLowerCase().includes('modal') ? 'pro' : undefined;

  const iframeParams = new URLSearchParams({
    variant,
    commit: newSha,
    state: stateLabel,
    'foldo.embedded': '1',
  });
  if (modal) iframeParams.set('modal', modal);
  if (overrides.ctaLabel) iframeParams.set('override.ctaLabel', overrides.ctaLabel);
  if (overrides.ctaSubtext) iframeParams.set('override.ctaSubtext', overrides.ctaSubtext);
  if (overrides.proGradientToned) iframeParams.set('override.proGradientToned', '1');

  const iframeUrl = `http://localhost:5174/?${iframeParams.toString()}`;

  const now = nowIso();
  const child: Frame = {
    id: newId('f'),
    boardId: parent.boardId,
    kind: 'app',
    branchId: parent.branchId,
    commitSha: newSha,
    commitMessage: deriveCommitMessage(dispatch, overrides),
    age: 'just now',
    position: { x: rightmost + gap, y: parent.position.y },
    size: parent.size,
    content: {
      ...parentContent,
      overrides,
      iframeUrl,
    },
    parentFrameId: parent.id,
    generatedByDispatchId: dispatch.id,
    createdAt: now,
    updatedAt: now,
  };
  return child;
}

function deriveCommitMessage(d: Dispatch, ov: VariantOverrides): string {
  if (ov.ctaLabel) return `cta: ${ov.ctaLabel.toLowerCase()}`;
  if (ov.proGradientToned) return 'pricing: tone down Pro gradient';
  // Fallback uses the intent.
  const intent = d.intent.length > 60 ? d.intent.slice(0, 57) + '...' : d.intent;
  return `edit: ${intent}`;
}

/**
 * Run the in-process dispatch simulation. Mirrors the original prototype timing
 * and inferred overrides so the demo works without a real MCP.
 *
 * Lifecycle:
 *   1. immediately → status=sending, broadcast dispatch.status
 *   2. ~700ms → status=running, "Replaying recipe…"
 *   3. ~1500ms later → produce child frame, status=done, broadcast frame.added + dispatch.done
 */
export async function simulateDispatch(dispatch: Dispatch): Promise<void> {
  try {
    // Step 1: sending
    const sendingEvent: DispatchEvent = {
      ts: nowIso(),
      level: 'info',
      message: 'Sending dispatch to local agent…',
    };
    const sending = setDispatchStatus(dispatch.id, 'sending', sendingEvent);
    if (sending) {
      hub.broadcast(dispatch.boardId, {
        type: 'dispatch.status',
        dispatchId: dispatch.id,
        status: 'sending',
        event: sendingEvent,
      });
    }

    await sleep(700);

    // Step 2: running
    const runningEvent: DispatchEvent = {
      ts: nowIso(),
      level: 'info',
      message: 'Replaying recipe…',
    };
    const running = setDispatchStatus(dispatch.id, 'running', runningEvent);
    if (running) {
      hub.broadcast(dispatch.boardId, {
        type: 'dispatch.status',
        dispatchId: dispatch.id,
        status: 'running',
        event: runningEvent,
      });
    }

    await sleep(1500);

    // Step 3: build result frame + complete
    const parent = getFrameById(dispatch.frameId);
    if (!parent) {
      failDispatch(dispatch.id, `parent frame ${dispatch.frameId} not found`);
      hub.broadcast(dispatch.boardId, {
        type: 'dispatch.status',
        dispatchId: dispatch.id,
        status: 'error',
        event: {
          ts: nowIso(),
          level: 'error',
          message: 'Parent frame missing.',
        },
      });
      return;
    }

    const newSha = newCommitSha();
    const childFrame = buildChildFrame(parent, dispatch, newSha);
    insertFrame(childFrame);

    upsertCommit({
      sha: newSha,
      branchId: dispatch.branchId,
      message: childFrame.commitMessage,
      authorUserId: 'u-claude',
      parentSha: dispatch.baseCommitSha,
      createdAt: nowIso(),
    });
    updateBranchHead(dispatch.branchId, newSha);

    const doneEvent: DispatchEvent = {
      ts: nowIso(),
      level: 'info',
      message: 'Edit applied. Pushed new commit.',
    };
    const done = completeDispatch(dispatch.id, childFrame.id, newSha, doneEvent);

    hub.broadcast(dispatch.boardId, { type: 'frame.added', frame: childFrame });
    if (done) {
      hub.broadcast(dispatch.boardId, {
        type: 'dispatch.status',
        dispatchId: dispatch.id,
        status: 'done',
        event: doneEvent,
      });
      hub.broadcast(dispatch.boardId, { type: 'dispatch.done', dispatch: done });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failDispatch(dispatch.id, message);
    hub.broadcast(dispatch.boardId, {
      type: 'dispatch.status',
      dispatchId: dispatch.id,
      status: 'error',
      event: { ts: nowIso(), level: 'error', message },
    });
  }
}
