// Simulates N teams: sign up (or sign in), save a project, send a realistic prompt, read the whole streamed reply.
//   node scripts/load-test.mjs --url http://localhost:3000 --users 25
//   options: --invite CODE  --ramp 5 (seconds to spread arrivals)  --expect-artifact  --accounts file.txt (email:password per line)
// Works against the stub (scripts/stub-llm.mjs) or a real provider. Against a proxied deployment (Railway) sign-ups are
// throttled per real IP, so pass --accounts with pre-made logins instead.
import { readFileSync } from 'node:fs';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);

  return i === -1 ? def : (process.argv[i + 1]?.startsWith('--') || process.argv[i + 1] === undefined ? true : process.argv[i + 1]);
};

const PRICE_IN = Number(arg('price-in', 0)); // USD per million tokens, optional
const PRICE_OUT = Number(arg('price-out', 0));
const BASE = String(arg('url', 'http://localhost:3000')).replace(/\/$/, '');
const N = Number(arg('users', 10));
const RAMP = Number(arg('ramp', 5));
const INVITE = arg('invite', '') || '';
const MESSAGES = Number(arg('messages', 1)); // chat messages per team, sent one after another
const DOWNLOAD = Boolean(arg('download', false)); // each team also loads the home page, template and packages snapshot
const EXPECT_ARTIFACT = Boolean(arg('expect-artifact', false));
const ACCOUNTS = arg('accounts', '') ? readFileSync(String(arg('accounts')), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean) : [];

const PROMPTS = [
  'Build a monthly budget tracker where I add income and expenses and see what is left',
  'Make an expense splitter for a group of friends dining out',
  'Create a savings goal calculator with a progress bar',
  'Build a loan repayment calculator that shows monthly payments',
  'Create a currency converter with a few hardcoded exchange rates',
  'Make an invoice generator for freelancers that I can print',
  'Build a compound interest calculator with a simple chart',
  'Create a landing page for a student banking app',
];

const pct = (arr, p) => (arr.length ? arr.slice().sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0);
const results = [];

async function user(i) {
  const r = { i, ok: false, status: 0, ttfb: 0, total: 0, bytes: 0, model: '', artifact: false, step: '', ttfbs: [], totals: [] };
  const ip = `10.9.${Math.floor(i / 250)}.${(i % 250) + 1}`; // only honoured by a local server; ignored behind a proxy
  let cookie = '';

  const call = async (path, init = {}) => {
    const res = await fetch(BASE + path, { redirect: 'manual', ...init, headers: { 'x-forwarded-for': ip, origin: BASE, ...(cookie && { cookie }), ...init.headers } });
    const set = res.headers.getSetCookie?.() ?? [];

    if (set.length) {
      cookie = set[0].split(';')[0];
    }

    return res;
  };

  try {
    await new Promise((res) => setTimeout(res, (RAMP * 1000 * i) / Math.max(1, N)));

    r.step = 'auth';
    const form = (o) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() });
    let res;

    if (ACCOUNTS[i]) {
      const [email, password] = ACCOUNTS[i].split(':');
      res = await call('/login', form({ intent: 'login', email, password }));
    } else {
      res = await call('/login', form({ intent: 'register', name: `Load Team ${i}`, email: `load${Date.now()}-${i}@example.com`, password: 'load-test-pw-1', invite: INVITE }));
    }

    if (res.status !== 302 || !cookie) {
      throw Object.assign(new Error(`auth ${res.status}`), { status: res.status });
    }

    if (DOWNLOAD) {
      r.step = 'download';
      const t = performance.now();
      await call('/');
      const tpl = await (await call('/api/templates')).json();
      await (await call(`/templates/${tpl.templates[i % tpl.templates.length].id}.json`)).arrayBuffer();
      const snap = tpl.snapshots.core?.url;

      if (snap) {
        r.snapshotBytes = (await (await call(snap)).arrayBuffer()).byteLength;
      }

      r.downloadMs = performance.now() - t;
    }

    let joined = '';

    for (let m = 0; m < MESSAGES; m++) {
      r.step = `chat ${m + 1}/${MESSAGES}`;
      const prompt = PROMPTS[(i + m) % PROMPTS.length];
      const t0 = performance.now();
      let res = await call('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }) });
      r.status = res.status;
      r.model = res.headers.get('x-foldo-model') ?? '';

      if (!res.ok) {
        throw Object.assign(new Error((await res.text()).slice(0, 80)), { status: res.status });
      }

      const reader = res.body.getReader();
      let text = '';
      let first = 0;

      for (;;) {
        const { done, value } = await reader.read();

        if (!first) {
          first = performance.now() - t0;
          r.ttfbs.push(first);
        }

        if (done) {
          break;
        }

        r.bytes += value.length;
        text += new TextDecoder().decode(value);
      }

      r.totals.push(performance.now() - t0);
      joined = text.split('\n').filter((l) => l.startsWith('0:')).map((l) => { try { return JSON.parse(l.slice(2)); } catch { return ''; } }).join('');
      r.artifact = joined.includes('<boltArtifact') && joined.includes('</boltArtifact>');
    }

    r.ttfb = r.ttfbs[0] ?? 0;
    r.total = r.totals.reduce((a, b) => a + b, 0) / Math.max(1, r.totals.length);
    r.chars = joined.length;
    r.ok = r.bytes > 0 && (!EXPECT_ARTIFACT || r.artifact);

    r.step = 'save';
    await call('/api/projects', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ description: prompt.slice(0, 40), messages: [{ id: '1', role: 'user', content: prompt }, { id: '2', role: 'assistant', content: joined || '(empty)' }] }) });
  } catch (e) {
    r.err = `${r.step}: ${e.message}`;
    r.status = e.status ?? r.status;
  }

  results.push(r);
}

// responsiveness probe: how long does a trivial request take while everyone is busy? (event-loop stalls show up here)
const probe = [];
const probeTimer = setInterval(async () => {
  const s = performance.now();

  try {
    await fetch(`${BASE}/healthz`);
    probe.push(performance.now() - s);
  } catch {
    probe.push(30_000);
  }
}, 250);

console.log(`Load test: ${N} teams against ${BASE} (ramp ${RAMP}s)${ACCOUNTS.length ? `, ${ACCOUNTS.length} pre-made accounts` : ''}`);
const t0 = performance.now();
await Promise.all(Array.from({ length: N }, (_, i) => user(i)));
const wall = (performance.now() - t0) / 1000;
clearInterval(probeTimer);

const ok = results.filter((r) => r.ok);
const bad = results.filter((r) => !r.ok);
const models = {};
for (const r of ok) models[r.model || '?'] = (models[r.model || '?'] ?? 0) + 1;
const errs = {};
for (const r of bad) errs[`${r.status || '-'} ${r.err ?? 'no artifact'}`] = (errs[`${r.status || '-'} ${r.err ?? 'no artifact'}`] ?? 0) + 1;
const fmt = (ms) => `${(ms / 1000).toFixed(2)}s`;

console.log(`\nResults (${wall.toFixed(1)}s wall clock)`);
console.log(`  success        ${ok.length}/${N}`);
console.log(`  first byte     p50 ${fmt(pct(ok.map((r) => r.ttfb), 0.5))}  p95 ${fmt(pct(ok.map((r) => r.ttfb), 0.95))}  max ${fmt(Math.max(0, ...ok.map((r) => r.ttfb)))}`);
console.log(`  full reply     p50 ${fmt(pct(ok.map((r) => r.total), 0.5))}  p95 ${fmt(pct(ok.map((r) => r.total), 0.95))}  max ${fmt(Math.max(0, ...ok.map((r) => r.total)))}`);
console.log(`  answered by    ${Object.entries(models).map(([k, v]) => `${k}: ${v}`).join(', ') || '-'}${Object.keys(models).length > 1 ? '   <- more than one model means failover kicked in' : ''}`);
console.log(`  complete artifact in ${ok.filter((r) => r.artifact).length}/${ok.length} replies${EXPECT_ARTIFACT ? '' : ' (pass --expect-artifact to fail otherwise)'}`);
const avg = (k) => (ok.length ? Math.round(ok.reduce((n, r) => n + (r[k] || 0), 0) / ok.length) : 0);
if (probe.length) {
  console.log(`  /healthz while busy  p50 ${fmt(pct(probe, 0.5))}  p95 ${fmt(pct(probe, 0.95))}  max ${fmt(Math.max(...probe))}  (${probe.length} probes)`);
}

if (DOWNLOAD) {
  const dl = ok.filter((r) => r.downloadMs);
  console.log(`  home + template + packages download  p50 ${fmt(pct(dl.map((r) => r.downloadMs), 0.5))}  p95 ${fmt(pct(dl.map((r) => r.downloadMs), 0.95))}  (${((dl[0]?.snapshotBytes ?? 0) / 1e6).toFixed(1)} MB each, ${dl.length} teams)`);
}

console.log(`  tokens/reply   prompt ${avg('promptTokens')}  completion ${avg('completionTokens')}  (visible text ${avg('chars')} chars)`);
if (PRICE_IN || PRICE_OUT) {
  console.log(`  est. cost/reply $${((avg('promptTokens') * PRICE_IN + avg('completionTokens') * PRICE_OUT) / 1e6).toFixed(4)}`);
}
console.log(`  errors         ${bad.length ? Object.entries(errs).map(([k, v]) => `${v}x ${k}`).join(' | ') : 'none'}`);
process.exit(bad.length ? 1 : 0);
