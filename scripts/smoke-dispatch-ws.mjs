#!/usr/bin/env node
// Smoke: connect as a browser, send a dispatch, watch for the full
// dispatch.created → dispatch.status(sending) → dispatch.status(running) →
// frame.added → dispatch.done lifecycle over WS.

import WebSocket from 'ws';

const BOARD = 'board-acme-landing';
const ME = 'u-you';

const events = [];

const ws = new WebSocket(
  `ws://localhost:4000/ws?boardId=${BOARD}&userId=${ME}&token=${ME}`,
);

const allEvents = new Set([
  'welcome',
  'dispatch.created',
  'dispatch.status',
  'frame.added',
  'dispatch.done',
]);

ws.on('open', async () => {
  ws.send(JSON.stringify({ type: 'hello', boardId: BOARD, userId: ME, token: ME }));
  await new Promise((r) => setTimeout(r, 200));

  // POST the dispatch via REST
  const res = await fetch('http://localhost:4000/api/dispatches', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer u-you',
    },
    body: JSON.stringify({
      boardId: BOARD,
      frameId: 'f-cta-app',
      branchId: 'feat/cta-revamp',
      baseCommitSha: '4f81b62',
      intent: 'Update CTA with 14-day trial copy',
      target: {
        elementLabel: '<button class="cta-primary">',
        elementFile: 'src/components/Pricing.tsx',
        elementLine: 48,
      },
    }),
  });
  const d = await res.json();
  console.log('REST dispatch:', d.id, d.status);

  // Wait up to 10s for full lifecycle
  await new Promise((r) => setTimeout(r, 10000));
  ws.close();
});

ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (!allEvents.has(m.type)) return;
  if (m.type === 'welcome') {
    console.log('welcome (users:', m.users.length + ')');
  } else if (m.type === 'dispatch.created') {
    console.log('  dispatch.created', m.dispatch.id, 'status=', m.dispatch.status);
  } else if (m.type === 'dispatch.status') {
    console.log('  dispatch.status', m.dispatchId, '→', m.status, m.event ? '· ' + m.event.message : '');
  } else if (m.type === 'frame.added') {
    const ov = m.frame.content?.overrides ?? {};
    console.log('  frame.added', m.frame.id, 'parent=', m.frame.parentFrameId, 'overrides=', ov);
  } else if (m.type === 'dispatch.done') {
    console.log('  dispatch.done', m.dispatch.id, 'resultFrameId=', m.dispatch.resultFrameId);
  }
  events.push(m.type);
});

ws.on('close', () => {
  const got = (t) => events.includes(t);
  const ok = got('dispatch.created') && got('frame.added') && got('dispatch.done');
  console.log('\n' + (ok ? '✓ dispatch lifecycle complete' : '✗ dispatch lifecycle missing events'));
  process.exit(ok ? 0 : 1);
});
ws.on('error', (e) => { console.error(e); process.exit(1); });
