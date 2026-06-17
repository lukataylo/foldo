// Live demo of the Foldo collaboration loop:
//   multiple people leave comments on a mockup  ->  push each to Claude via MCP
//   ->  Claude (real CLI) executes the edit  ->  a new mockup frame lands on the canvas.
//
// Prereq: local stack on :4000, MCP runner connected to board-acme-landing in
// REAL mode (FOLDO_TARGET_REPO=/tmp/foldo-mockup-demo).
//
//   node scripts/mcp-workflow-demo.mjs

const API = 'http://localhost:4000';
const BOARD = 'board-acme-landing';
const FRAME = 'f-main-app';
const BRANCH = 'main';
const BASE = 'db09f2d2c73d3c7d74fd9f14e673246636826f6a'; // HEAD of /tmp/foldo-mockup-demo
const log = (...a) => console.log('[mcp-demo]', ...a);

const H = (uid) => ({ Authorization: `Bearer ${uid}`, 'Content-Type': 'application/json' });

// Three different people, three different pieces of design feedback.
const PEOPLE = [
  { uid: 'u-anna', name: 'Anna Cole',
    comment: 'The primary CTA copy is generic — make it say "Start your 14-day free trial".',
    intent: 'In the pricing page, change the primary CTA button text to "Start your 14-day free trial".',
    target: { elementLabel: '<button class="cta-primary">', elementFile: 'src/pricing/elements.ts' } },
  { uid: 'u-mateo', name: 'Mateo Rivas',
    comment: 'Pro tier should read as the recommended plan — add a "Most popular" badge.',
    intent: 'Add a "Most popular" badge label to the Pro tier card in the pricing page.',
    target: { elementLabel: '<TierCard tier="pro" highlight />', elementFile: 'src/pricing/elements.ts' } },
  { uid: 'u-priya', name: 'Priya Sen',
    comment: 'The secondary CTA is unclear — change it to "Talk to sales".',
    intent: 'Change the secondary CTA button text to "Talk to sales" in the pricing page.',
    target: { elementLabel: '<button class="cta-secondary">', elementFile: 'src/pricing/elements.ts' } },
];

async function frameCount() {
  const d = await (await fetch(`${API}/api/boards/${BOARD}`, { headers: { Authorization: 'Bearer u-you' } })).json();
  return d.frames.length;
}
async function findResultFrame(dispatchId) {
  const d = await (await fetch(`${API}/api/boards/${BOARD}`, { headers: { Authorization: 'Bearer u-you' } })).json();
  return d.frames.find((f) => f.generatedByDispatchId === dispatchId);
}

const results = [];
for (const p of PEOPLE) {
  log(`\n=== ${p.name} (${p.uid}) ===`);

  // 1. leave a comment on the mockup
  const cRes = await fetch(`${API}/api/comments`, {
    method: 'POST', headers: H(p.uid),
    body: JSON.stringify({ boardId: BOARD, frameId: FRAME, text: p.comment,
      pin: { x: 0.5, y: 0.5 }, target: p.target }),
  });
  const comment = cRes.ok ? await cRes.json() : null;
  log(`comment ${cRes.status}${comment ? ' id=' + (comment.comment?.id ?? comment.id) : ' :: ' + (await cRes.text().catch(() => ''))}`);

  // 2. push it to Claude (create a dispatch)
  const dRes = await fetch(`${API}/api/dispatches`, {
    method: 'POST', headers: H(p.uid),
    body: JSON.stringify({ boardId: BOARD, frameId: FRAME, branchId: BRANCH, baseCommitSha: BASE,
      intent: p.intent, target: p.target }),
  });
  if (!dRes.ok) { log(`dispatch FAILED ${dRes.status}: ${await dRes.text()}`); results.push({ ...p, ok: false }); continue; }
  const dBody = await dRes.json();
  const dispatch = dBody.dispatch ?? dBody;
  const dispatchId = dispatch.id;
  log(`dispatch created id=${dispatchId} status=${dispatch.status} -> Claude executing...`);

  // 3. wait for Claude to execute and the new mockup frame to land
  const deadline = Date.now() + 180_000;
  let frame = null, status = dispatch.status;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    const list = await (await fetch(`${API}/api/dispatches?boardId=${BOARD}`, { headers: { Authorization: 'Bearer u-you' } })).json().catch(() => ({}));
    const cur = (list.dispatches ?? []).find((x) => x.id === dispatchId);
    if (cur) status = cur.status;
    frame = await findResultFrame(dispatchId);
    if (frame || status === 'done' || status === 'error') break;
  }
  log(`status=${status} resultFrame=${frame ? frame.id : 'none'}${frame ? ' commit=' + (frame.commitSha) + ' msg="' + (frame.commitMessage) + '"' : ''}`);
  results.push({ name: p.name, uid: p.uid, dispatchId, status, resultFrameId: frame?.id, commitSha: frame?.commitSha, commitMessage: frame?.commitMessage });
}

log('\n==== SUMMARY ====');
console.log(JSON.stringify(results, null, 2));
const done = results.filter((r) => r.status === 'done' && r.resultFrameId).length;
log(`${done}/${PEOPLE.length} dispatches executed by Claude and produced a new mockup frame`);
process.exit(done === PEOPLE.length ? 0 : 1);
