// The pivot's flagship path, end to end:
//
//   merged PR webhook → director films the walkthrough → frame on the board
//   → second merge re-renders ONLY the touched step (byte-identical reuse,
//     asserted by sha256) → a comment on the walkthrough frame becomes an
//     agent dispatch.
//
// Runs against the real pipeline: real chromium capture of the sample app,
// real ffmpeg assembly (CI runners have ffmpeg). No ANTHROPIC_API_KEY in CI
// means the deterministic heuristic verdict decides what changed — which is
// exactly what makes the incremental assertion stable.

import { expect, test, type APIRequestContext } from '@playwright/test';
import { createUser, loginAs } from '../helpers/factory';

const API = 'http://localhost:4000';
const BOARD_ID = 'board-acme-landing';
const WALKTHROUGH_ID = 'w-demo-acme';

interface WireSegment {
  stepId: string;
  segmentSha256?: string;
  source: 'reused' | 'rebuilt' | 'still';
}
interface WireTake {
  id: string;
  status: string;
  videoUrl?: string;
  captionsUrl?: string;
  masterSha256?: string;
  segments: WireSegment[];
  stepDiffs: Array<{ stepId: string; status: string }>;
  frameId?: string;
  errorMessage?: string;
}

async function getTakes(
  request: APIRequestContext,
  token: string,
): Promise<WireTake[]> {
  const res = await request.get(`${API}/api/walkthroughs/${WALKTHROUGH_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { takes: WireTake[] };
  return body.takes;
}

/** Poll until the given take leaves the render pipeline. */
async function waitForTake(
  request: APIRequestContext,
  token: string,
  takeId: string,
  timeoutMs = 240_000,
): Promise<WireTake> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const takes = await getTakes(request, token);
    const take = takes.find((t) => t.id === takeId);
    if (take && ['ready', 'degraded', 'error'].includes(take.status)) return take;
    if (Date.now() > deadline) {
      throw new Error(
        `take ${takeId} still ${take?.status ?? 'missing'} after ${timeoutMs}ms`,
      );
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

test.describe('living docs: merge → walkthrough → dispatch', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(420_000);

  test('merged-PR webhook renders the first take and it lands on the board', async ({
    page,
    request,
  }) => {
    const user = await createUser();

    // 1. Simulate GitHub delivering a merged-PR event for the demo repo.
    // (Dev deployments have no webhook secret; the handler accepts unsigned.)
    const hook = await request.post(`${API}/api/webhooks/github`, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'pull_request',
      },
      data: {
        action: 'closed',
        number: 42,
        pull_request: {
          number: 42,
          title: 'pricing: refresh hero copy',
          merged: true,
          merge_commit_sha: 'deadbeef42',
          base: { ref: 'main' },
          head: { ref: 'feat/hero-copy', sha: 'cafe42' },
        },
        repository: { full_name: 'acme/landing' },
      },
    });
    expect(hook.ok()).toBeTruthy();
    const hookBody = (await hook.json()) as { takes: string[] };
    expect(hookBody.takes.length).toBe(1);
    const takeId = hookBody.takes[0]!;

    // 2. The director films all three steps (first take) and assembles.
    const take = await waitForTake(request, user.token, takeId);
    expect(take.errorMessage ?? '').not.toMatch(/browser launch failed/);
    expect(['ready', 'degraded']).toContain(take.status);
    // Captions always exist — they're the degradation floor.
    expect(take.captionsUrl).toBeTruthy();
    const captions = await request.get(`${API}${take.captionsUrl}`);
    expect(captions.ok()).toBeTruthy();
    expect(await captions.text()).toContain('WEBVTT');
    // CI has ffmpeg, so a full master should exist with a manifest hash.
    expect(take.videoUrl).toBeTruthy();
    expect(take.masterSha256).toBeTruthy();
    const video = await request.get(`${API}${take.videoUrl}`);
    expect(video.ok()).toBeTruthy();

    // 3. The walkthrough frame is on the board and playable.
    await loginAs(page, user);
    await page.goto(`/board/${BOARD_ID}`);
    const frame = page.getByTestId('foldo-walkthrough-frame').first();
    await expect(frame).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('foldo-walkthrough-video').first()).toBeVisible();
  });

  test('second merge re-renders only the touched step, byte-identically reusing the rest', async ({
    request,
  }) => {
    const user = await createUser();
    const before = await getTakes(request, user.token);
    const parent = [...before]
      .reverse()
      .find((t) => t.status === 'ready' || t.status === 'degraded');
    expect(parent, 'first test must have produced a finished take').toBeTruthy();

    // A diff that touches ONLY the "Start Pro trial" label — the anchor of
    // the pro_trial step. The heuristic verdict marks that one changed and
    // the other two unchanged.
    const render = await request.post(
      `${API}/api/walkthroughs/${WALKTHROUGH_ID}/takes`,
      {
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        },
        data: {
          prNumber: 43,
          prTitle: 'pricing: rename the Pro CTA',
          diff: [
            '--- a/src/pricing/PricingPage.tsx',
            '+++ b/src/pricing/PricingPage.tsx',
            '@@ -160,1 +160,1 @@',
            '-        cta="Start Pro trial"',
            '+        cta="Start Pro trial today"',
          ].join('\n'),
        },
      },
    );
    expect(render.ok()).toBeTruthy();
    const { take: queued } = (await render.json()) as { take: WireTake };

    const take2 = await waitForTake(request, user.token, queued.id);
    expect(['ready', 'degraded']).toContain(take2.status);

    const diffByStep = Object.fromEntries(take2.stepDiffs.map((d) => [d.stepId, d.status]));
    expect(diffByStep).toEqual({
      pricing_page: 'unchanged',
      plans: 'unchanged',
      pro_trial: 'changed',
    });

    const seg = (t: WireTake, id: string) => t.segments.find((s) => s.stepId === id)!;
    // Unchanged steps: copied from the parent take byte-for-byte.
    for (const stepId of ['pricing_page', 'plans']) {
      expect(seg(take2, stepId).source).toBe('reused');
      expect(seg(take2, stepId).segmentSha256).toBe(seg(parent!, stepId).segmentSha256);
    }
    // The touched step was freshly filmed rather than copied. (We don't
    // assert its bytes differ: a step that degraded to a still is fully
    // deterministic — same PNG through the same pinned encode — so a
    // visually-unchanged re-film can legitimately reproduce identical
    // bytes. That's content-addressing working, not a bug.)
    expect(['rebuilt', 'still']).toContain(seg(take2, 'pro_trial').source);
    expect(take2.masterSha256).toBeTruthy();
  });

  test('a comment on the walkthrough frame dispatches a change request', async ({
    page,
    request,
  }) => {
    const user = await createUser();
    const takes = await getTakes(request, user.token);
    const finished = [...takes]
      .reverse()
      .find((t) => (t.status === 'ready' || t.status === 'degraded') && t.frameId);
    expect(finished, 'needs a finished take with a frame').toBeTruthy();

    // Drop a pinned comment on the walkthrough frame via the API (the UI pin
    // flow is covered by the comments specs; here we prove the loop).
    const commentRes = await request.post(`${API}/api/comments`, {
      headers: {
        Authorization: `Bearer ${user.token}`,
        'Content-Type': 'application/json',
      },
      data: {
        boardId: BOARD_ID,
        frameId: finished!.frameId,
        text: 'The Pro trial CTA should say how long the trial is.',
        pin: { x: 0.5, y: 0.5 },
      },
    });
    expect(commentRes.ok()).toBeTruthy();
    const comment = (await commentRes.json()) as { id: string };

    // Open the comment via its deep link (the canvas pans to the frame and
    // opens the popover — same path a Slack-shared comment URL takes).
    await loginAs(page, user);
    await page.goto(
      `/board/${BOARD_ID}/frame/${finished!.frameId}/comment/${comment.id}`,
    );
    await page.waitForSelector('[data-testid="foldo-walkthrough-frame"]', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('foldo-comment-popover')).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId('foldo-comment-make-edit').click();
    await expect(page.getByTestId('foldo-edit-panel')).toBeVisible();
    await expect(page.getByTestId('foldo-edit-panel-intent')).toHaveValue(
      /Pro trial CTA/,
    );
    await page.getByTestId('foldo-edit-panel-send').click();

    // The dispatch is created and (with no MCP connected) the simulator
    // runs it to completion.
    await expect
      .poll(
        async () => {
          const res = await request.get(`${API}/api/dispatches?boardId=${BOARD_ID}`, {
            headers: { Authorization: `Bearer ${user.token}` },
          });
          if (!res.ok()) return 'fetch-failed';
          const body = (await res.json()) as {
            dispatches: Array<{ intent: string; status: string }>;
          };
          const ours = body.dispatches.find((d) =>
            d.intent.includes('Pro trial CTA'),
          );
          return ours?.status ?? 'missing';
        },
        { timeout: 60_000 },
      )
      .toMatch(/queued|sending|running|done/);
  });
});
