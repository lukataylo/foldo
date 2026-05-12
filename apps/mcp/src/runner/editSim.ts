// Shared edit-simulation core. Used by both the MCP `apply_edit_prompt` tool
// invocation and the cloud-dispatched `dispatch.execute` handler.
//
// Real implementation: shell out to `claude` CLI with a constructed prompt,
// parse its tool calls, run code edits, commit and push. For the prototype
// we mirror the server's sim/dispatch.ts logic so the canvas can show a new
// frame with sensible overrides without any actual code mutation.

import { nanoid } from 'nanoid';
import type {
  AppFrameContent,
  CommentTarget,
  Dispatch,
  Frame,
  VariantOverrides,
} from '@foldo/protocol';

export interface EditSimInput {
  /** The frame the edit was launched against (parent for the new frame). */
  baseFrame: Frame;
  /** Element / file target for the edit. */
  target: CommentTarget;
  /** Natural-language intent describing what the user wants. */
  intent: string;
  /** When invoked from a dispatch, we link the new frame back to it. */
  dispatchId?: string;
  /** Base URL of the sample app dev server. */
  sampleAppUrl: string;
}

export interface EditSimOutput {
  /** Faux 7-char commit SHA. */
  sha: string;
  /** Short commit message used as the frame title. */
  commitMessage: string;
  /** The synthetic frame to place on the canvas. */
  newFrame: Frame;
  /** Inferred variant overrides. */
  overrides: VariantOverrides;
  /** Short rationale or fallback note for the streaming log. */
  note: string;
}

/** Pseudo SHA — 7 lowercase hex-ish chars, mirroring how `git log --oneline` looks. */
export function makePseudoSha(): string {
  return nanoid(7).toLowerCase().replace(/[^a-z0-9]/g, '0');
}

function appContent(frame: Frame): AppFrameContent | undefined {
  return frame.content.kind === 'app' ? frame.content : undefined;
}

/** Encode the synthetic overrides + state into an iframe URL the sample app understands. */
export function buildIframeUrl(
  baseUrl: string,
  app: AppFrameContent,
  sha: string,
  overrides: VariantOverrides,
): string {
  const u = new URL(baseUrl);
  u.searchParams.set('variant', app.variant);
  u.searchParams.set('commit', sha);
  u.searchParams.set('foldo.embedded', '1');
  if (app.stateLabel) u.searchParams.set('state', app.stateLabel);
  if (app.route && app.route !== '/') u.searchParams.set('route', app.route);
  if (overrides.ctaLabel) u.searchParams.set('override.ctaLabel', overrides.ctaLabel);
  if (overrides.ctaSubtext)
    u.searchParams.set('override.ctaSubtext', overrides.ctaSubtext);
  if (overrides.proGradientToned)
    u.searchParams.set('override.proGradientToned', '1');
  return u.toString();
}

/** Infer overrides + commit message from the comment target and intent. */
export function inferEdit(
  baseFrame: Frame,
  target: CommentTarget,
  intent: string,
): { overrides: VariantOverrides; commitMessage: string; note: string } {
  const label = (target.elementLabel ?? '').toLowerCase();
  const trimmedIntent = intent.split('\n')[0]?.trim() ?? '';
  const shortIntent = trimmedIntent.slice(0, 60);
  const app = appContent(baseFrame);
  const baseVariant = app?.variant;

  // CTA branch — explicit trial / duration / 14-day intent on a primary CTA.
  if (
    label.includes('cta-primary') &&
    /14[- ]?day|trial|duration/i.test(intent)
  ) {
    return {
      overrides: {
        ctaLabel: 'Start your 14-day free trial',
        ctaSubtext: 'No credit card. Cancel anytime.',
      },
      commitMessage: `cta: ${shortIntent || 'extend trial to 14 days'}`,
      note: 'matched cta-primary heuristic — extending trial copy and subtext',
    };
  }

  // Pro tier highlight branch — soften / tone-down intent on a pro element.
  if (
    (label.includes('pro') &&
      /tone|quiet|softer|less|reduce|calm|subtle/i.test(intent)) ||
    baseVariant === 'pro-highlight'
  ) {
    return {
      overrides: { proGradientToned: true },
      commitMessage: `pricing: ${shortIntent || 'soften pro tier gradient'}`,
      note: 'matched pro-highlight heuristic — toning down the pro gradient',
    };
  }

  // Fallback — no override, but still produce a frame so the canvas shows progress.
  return {
    overrides: {},
    commitMessage: `chore: ${shortIntent || 'tweak per Claude Code prompt'}`,
    note:
      'no heuristic match — emitting a placeholder frame; real claude CLI would edit code',
  };
}

export function simulateEdit(input: EditSimInput): EditSimOutput {
  const { baseFrame, target, intent, dispatchId, sampleAppUrl } = input;
  const { overrides, commitMessage, note } = inferEdit(baseFrame, target, intent);
  const sha = makePseudoSha();
  const app = appContent(baseFrame);

  const now = new Date().toISOString();
  const newPos = {
    x: baseFrame.position.x + baseFrame.size.width + 100,
    y: baseFrame.position.y,
  };

  const nextContent: AppFrameContent = app
    ? {
        ...app,
        overrides: { ...(app.overrides ?? {}), ...overrides },
        iframeUrl: buildIframeUrl(sampleAppUrl, app, sha, {
          ...(app.overrides ?? {}),
          ...overrides,
        }),
      }
    : {
        kind: 'app',
        variant: 'baseline',
        route: '/',
        viewport: { width: baseFrame.size.width, height: baseFrame.size.height },
        overrides,
        iframeUrl: buildIframeUrl(
          sampleAppUrl,
          {
            kind: 'app',
            variant: 'baseline',
            route: '/',
            viewport: {
              width: baseFrame.size.width,
              height: baseFrame.size.height,
            },
          },
          sha,
          overrides,
        ),
      };

  const newFrame: Frame = {
    id: `frame-${nanoid(8)}`,
    boardId: baseFrame.boardId,
    kind: 'app',
    branchId: baseFrame.branchId,
    commitSha: sha,
    commitMessage,
    age: 'just now',
    position: newPos,
    size: { ...baseFrame.size },
    content: nextContent,
    parentFrameId: baseFrame.id,
    generatedByDispatchId: dispatchId,
    createdAt: now,
    updatedAt: now,
  };

  return { sha, commitMessage, newFrame, overrides, note };
}

/** Synthesise a minimal `Frame` from a `Dispatch` when we don't have the real one. */
export function dispatchToBaseFrame(d: Dispatch): Frame {
  const now = new Date().toISOString();
  return {
    id: d.frameId,
    boardId: d.boardId,
    kind: 'app',
    branchId: d.branchId,
    commitSha: d.baseCommitSha,
    commitMessage: 'base',
    age: 'just now',
    position: { x: 0, y: 0 },
    size: { width: 1280, height: 800 },
    content: {
      kind: 'app',
      variant: 'baseline',
      route: '/',
      viewport: { width: 1280, height: 800 },
    },
    createdAt: now,
    updatedAt: now,
  };
}
