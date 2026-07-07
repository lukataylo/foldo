#!/usr/bin/env node
// Render the marketing demo video WITH the product itself (Foldo-of-Foldo).
//
// Creates a board + walkthrough that films Foldo's own web app (the
// marketing landing, the public demo board, pricing), triggers a take
// through the real director pipeline, then downloads the rendered master +
// poster into apps/web/public/demo/ where the landing page's <video> slot
// expects them.
//
// Prereqs: `npm run dev` running (web 5173, server 4000, sample 5174),
// ffmpeg installed, and — for narrated audio — ELEVENLABS_API_KEY in .env
// (without it the demo renders silent with captions; honest, but record the
// launch version with the key set).
//
// Usage: node scripts/render-foldo-demo.mjs

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.FOLDO_API_URL ?? 'http://localhost:4000';
const WEB = process.env.FOLDO_WEB_URL ?? 'http://localhost:5173';
// Dev alias token (TOKEN_ALIASES maps demo-user → u-you outside production).
const TOKEN = process.env.FOLDO_TOKEN ?? 'demo-user';

const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

const BOARD = {
  name: 'foldo/foldo (dogfood)',
  repoSlug: 'lukataylo/foldo',
  devUrl: WEB,
};

const WALKTHROUGH = {
  title: 'Foldo in 60 seconds',
  targetUrl: WEB,
  steps: [
    {
      id: 'headline',
      title: 'Documentation that updates itself',
      narration:
        'This is Foldo. Your team ships agent-written code every week — Foldo turns every merged pull request into an up-to-date narrated walkthrough of what your product now does.',
      actions: [
        { kind: 'goto', url: '/' },
        { kind: 'wait', ms: 4000 },
        { kind: 'scroll', y: 500 },
        { kind: 'wait', ms: 3000 },
      ],
      durationMs: 14000,
    },
    {
      id: 'board',
      title: 'The board is the artifact',
      narration:
        'Walkthroughs land on a board, each take beside its predecessor, so a stakeholder sees what changed this week without reading a changelog. This board is public — nobody here has cloned a repo.',
      actions: [
        { kind: 'goto', url: '/s/demo' },
        { kind: 'wait', ms: 5000 },
        { kind: 'scroll', y: 400 },
        { kind: 'wait', ms: 4000 },
      ],
      durationMs: 16000,
    },
    {
      id: 'incremental',
      title: 'Only what changed is re-rendered',
      narration:
        'When a pull request merges, the director re-films only the steps the diff touched. Unchanged segments are reused byte for byte — the manifest proves it with a hash. Comments on a walkthrough dispatch change requests straight back to your coding agent.',
      actions: [
        { kind: 'goto', url: '/s/demo' },
        { kind: 'wait', ms: 6000 },
      ],
      durationMs: 16000,
    },
    {
      id: 'pricing',
      title: 'Simple pricing',
      narration:
        'Seventy-nine pounds a month per product, fourteen-day free trial, and setup is a GitHub App install plus a preview URL. Documentation that updates itself when your agents ship.',
      actions: [
        { kind: 'goto', url: '/pricing' },
        { kind: 'wait', ms: 5000 },
      ],
      durationMs: 14000,
    },
  ],
};

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, json };
}

async function main() {
  // 1. Board (idempotent: 409 REPO_TAKEN means it already exists).
  let boardId;
  const created = await api('POST', '/api/boards', BOARD);
  if (created.ok) {
    boardId = created.json.board.id;
  } else if (created.status === 409) {
    const boards = await api('GET', '/api/boards');
    boardId = boards.json.boards.find((b) => b.repoSlug === BOARD.repoSlug)?.id;
  }
  if (!boardId) throw new Error(`no board: ${JSON.stringify(created.json)}`);
  console.log(`board: ${boardId}`);

  // 2. Walkthrough (reuse by title if it exists).
  const list = await api('GET', `/api/boards/${boardId}/walkthroughs`);
  let walkthrough = list.json.walkthroughs?.find((w) => w.title === WALKTHROUGH.title);
  if (!walkthrough) {
    const res = await api('POST', '/api/walkthroughs', { boardId, ...WALKTHROUGH });
    if (!res.ok) throw new Error(`create walkthrough: ${JSON.stringify(res.json)}`);
    walkthrough = res.json.walkthrough;
  }
  console.log(`walkthrough: ${walkthrough.id}`);

  // 3. Render a take through the real pipeline.
  const render = await api('POST', `/api/walkthroughs/${walkthrough.id}/takes`, {
    summary: 'Marketing demo — rendered by the pipeline it advertises.',
  });
  if (!render.ok) throw new Error(`render: ${JSON.stringify(render.json)}`);
  const takeId = render.json.take.id;
  console.log(`take ${takeId} queued; filming Foldo with Foldo…`);

  // 4. Poll.
  const deadline = Date.now() + 10 * 60_000;
  let take;
  for (;;) {
    const res = await api('GET', `/api/walkthroughs/${walkthrough.id}`);
    take = res.json.takes.find((t) => t.id === takeId);
    if (take && ['ready', 'degraded', 'error'].includes(take.status)) break;
    if (Date.now() > deadline) throw new Error('render timed out after 10m');
    process.stdout.write(`  ${take?.status ?? '…'}\r`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log(`\ntake finished: ${take.status}`);
  if (take.status === 'error') throw new Error(take.errorMessage ?? 'render failed');
  if (!take.videoUrl) throw new Error('no video produced (is ffmpeg installed?)');
  if (take.status === 'degraded') {
    console.warn('⚠ take degraded (some steps are stills) — check warnings before shipping this cut');
  }

  // 5. Download into the landing page's slot.
  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = join(here, '..', 'apps', 'web', 'public', 'demo');
  await mkdir(outDir, { recursive: true });

  const video = await fetch(`${API}${take.videoUrl}`);
  await writeFile(join(outDir, 'foldo-demo.mp4'), Buffer.from(await video.arrayBuffer()));
  if (take.posterUrl) {
    const poster = await fetch(`${API}${take.posterUrl}`);
    await writeFile(
      join(outDir, 'foldo-demo-poster.png'),
      Buffer.from(await poster.arrayBuffer()),
    );
  }
  console.log(`wrote ${join(outDir, 'foldo-demo.mp4')} (sha256 ${take.masterSha256})`);
  console.log('Landing page demo slot is live. Commit the files or upload them to the web host.');
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
