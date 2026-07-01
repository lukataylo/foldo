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

const SAMPLE_APP_URL =
  process.env.FOLDO_SAMPLE_APP_URL ?? 'http://localhost:5174';

export function inferOverrides(args: {
  intent: string;
  elementLabel?: string;
}): VariantOverrides {
  const intent = args.intent.toLowerCase();
  const label = (args.elementLabel ?? '').toLowerCase();
  const out: VariantOverrides = {};

  const isCtaPrimary = label.includes('cta-primary');
  if (
    isCtaPrimary &&
    (intent.includes('trial') || intent.includes('14-day') || intent.includes('14 day'))
  ) {
    out.ctaLabel = 'Start your 14-day free trial';
    out.ctaSubtext = 'No credit card. Cancel anytime.';
  } else if (isCtaPrimary) {
    // Pull a short label out of the intent so the simulated edit is at least
    // visible: take the first verb-phrase up to ~32 chars.
    out.ctaLabel = sentenceCase(args.intent).slice(0, 32);
    out.ctaSubtext = 'Simulated by Foldo. No MCP connected.';
  }

  const isProTier = label.includes('tier-card--pro') || label.includes('pro');
  if (isProTier) {
    out.proGradientToned = true;
  }

  // Catch-all: if we still have no overrides, set a generic subtext so the
  // user always sees that something *changed* in the child frame.
  if (
    !out.ctaLabel &&
    !out.ctaSubtext &&
    !out.proGradientToned
  ) {
    out.ctaSubtext = 'Simulated by Foldo. No MCP connected.';
  }

  return out;
}

function sentenceCase(s: string): string {
  const t = s.trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

async function buildChildFrame(
  parent: Frame,
  dispatch: Dispatch,
  newSha: string,
): Promise<Frame> {
  const overrides = inferOverrides({
    intent: dispatch.intent,
    elementLabel: dispatch.target.elementLabel,
  });

  const allSiblings = await listFramesForBoard(parent.boardId);
  const siblings = allSiblings.filter(
    (f) => Math.abs(f.position.y - parent.position.y) < 1,
  );
  const rightmost = siblings.reduce(
    (max, f) => (f.position.x + f.size.width > max ? f.position.x + f.size.width : max),
    parent.position.x + parent.size.width,
  );
  const gap = 40;

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

  const iframeUrl = `${SAMPLE_APP_URL}/?${iframeParams.toString()}`;

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
  const intent = d.intent.length > 60 ? d.intent.slice(0, 57) + '...' : d.intent;
  return `[simulated] edit: ${intent}`;
}

export async function simulateDispatch(dispatch: Dispatch): Promise<void> {
  try {
    const sendingEvent: DispatchEvent = {
      ts: nowIso(),
      level: 'info',
      message:
        'Simulating dispatch: no MCP agent connected, Foldo will fake a child frame.',
    };
    // Broadcast the row's actual status: if the terminal guard blocked the
    // write (dispatch already done/error/cancelled), echoing the hardcoded
    // status would resurrect client spinners.
    const sending = await setDispatchStatus(dispatch.id, 'sending', sendingEvent);
    if (sending) {
      hub.broadcast(dispatch.boardId, {
        type: 'dispatch.status',
        dispatchId: dispatch.id,
        status: sending.status,
        event: sendingEvent,
      });
    }

    await sleep(700);

    const runningEvent: DispatchEvent = {
      ts: nowIso(),
      level: 'info',
      message: 'Replaying recipe in simulator…',
    };
    const running = await setDispatchStatus(dispatch.id, 'running', runningEvent);
    if (running) {
      hub.broadcast(dispatch.boardId, {
        type: 'dispatch.status',
        dispatchId: dispatch.id,
        status: running.status,
        event: runningEvent,
      });
    }

    await sleep(1500);

    const parent = await getFrameById(dispatch.frameId);
    if (!parent) {
      await failDispatch(dispatch.id, `parent frame ${dispatch.frameId} not found`);
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
    const childFrame = await buildChildFrame(parent, dispatch, newSha);
    await insertFrame(childFrame);

    await upsertCommit({
      sha: newSha,
      branchId: dispatch.branchId,
      message: childFrame.commitMessage,
      authorUserId: 'u-claude',
      parentSha: dispatch.baseCommitSha,
      createdAt: nowIso(),
    });
    await updateBranchHead(dispatch.branchId, newSha);

    const doneEvent: DispatchEvent = {
      ts: nowIso(),
      level: 'info',
      message:
        'Simulated child frame ready. No commit was actually pushed (connect Claude Code MCP to apply for real).',
    };
    const done = await completeDispatch(dispatch.id, childFrame.id, newSha, doneEvent);

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
    await failDispatch(dispatch.id, message);
    hub.broadcast(dispatch.boardId, {
      type: 'dispatch.status',
      dispatchId: dispatch.id,
      status: 'error',
      event: { ts: nowIso(), level: 'error', message },
    });
  }
}
