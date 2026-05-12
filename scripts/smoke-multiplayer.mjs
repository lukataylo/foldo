#!/usr/bin/env node
// Smoke test: two WS clients on the same board should see each other's
// presence and cursor moves.

import WebSocket from 'ws';

const BOARD = 'board-acme-landing';
const URL = (uid) =>
  `ws://localhost:4000/ws?boardId=${BOARD}&userId=${uid}&token=${uid}`;

const events = { anna: [], mateo: [] };

function open(label, uid) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL(uid));
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'hello', boardId: BOARD, userId: uid, token: uid }));
      resolve(ws);
    });
    ws.on('error', reject);
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      events[label].push(m);
    });
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const main = async () => {
  const anna = await open('anna', 'u-anna');
  await sleep(150);
  const mateo = await open('mateo', 'u-mateo');
  await sleep(200);

  // Anna moves her cursor — Mateo should see it
  anna.send(JSON.stringify({ type: 'cursor.move', cursor: { x: 123, y: 456 } }));
  await sleep(200);

  // Mateo selects something — Anna should see selection
  mateo.send(JSON.stringify({ type: 'selection.update', selection: { frameId: 'f-cta-app', elementSelector: 'cta-primary' } }));
  await sleep(200);

  anna.close();
  mateo.close();
  await sleep(300);

  const annaCursorEvents = events.mateo.filter((m) => m.type === 'presence.cursor' && m.userId === 'u-anna');
  const mateoSelEvents = events.anna.filter((m) => m.type === 'presence.selection' && m.userId === 'u-mateo');
  const annaJoinSeen = events.mateo.some((m) => m.type === 'presence.join' && m.user?.userId === 'u-anna') ||
    events.mateo.find((m) => m.type === 'welcome')?.users.some((u) => u.userId === 'u-anna');
  const mateoJoinSeen = events.anna.some((m) => m.type === 'presence.join' && m.user?.userId === 'u-mateo');

  console.log('Anna saw mateo join:', mateoJoinSeen);
  console.log('Mateo welcome saw anna:', annaJoinSeen);
  console.log("Mateo received Anna's cursor moves:", annaCursorEvents.length);
  console.log("Anna received Mateo's selection updates:", mateoSelEvents.length);

  const ok = mateoJoinSeen && annaJoinSeen && annaCursorEvents.length > 0 && mateoSelEvents.length > 0;
  console.log(ok ? '\n✓ multiplayer round-trip OK' : '\n✗ multiplayer round-trip FAILED');
  process.exit(ok ? 0 : 1);
};

main().catch((e) => { console.error(e); process.exit(1); });
