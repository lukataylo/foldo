// Uptime monitor for the night. Run it on an organizer's laptop (and a second one if you can):
//   node scripts/monitor.mjs --url https://foldo.dev --login monitor@example.com:PASSWORD --chat-every 5 --webhook https://hooks.slack.com/...
// Every 20 s: /healthz, the template catalogue, the packages snapshot and (with --login) a real sign-in; every
// --chat-every minutes (default 5) one real build ("Say hi") to prove the AI path works. It prints state CHANGES
// loudly (terminal bell + optional webhook POST) so you only look up when something breaks.
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);

  return i === -1 ? d : process.argv[i + 1];
};

const BASE = String(arg('url', 'https://foldo.dev')).replace(/\/$/, '');
const LOGIN = arg('login', '');
const EVERY = Number(arg('interval', 20)) * 1000;
const CHAT_EVERY = Number(arg('chat-every', 5)) * 60_000;
const HOOK = arg('webhook', process.env.SLACK_WEBHOOK_URL || '');
const state = { cookie: '', lastChat: 0, down: new Set() };

const timed = async (name, fn, maxMs) => {
  const t = performance.now();

  try {
    const detail = await fn();
    const ms = performance.now() - t;

    return ms > maxMs ? { name, ok: false, why: `slow: ${(ms / 1000).toFixed(1)}s (limit ${maxMs / 1000}s)` } : { name, ok: true, ms, detail };
  } catch (e) {
    return { name, ok: false, why: e.message };
  }
};

const get = async (path, init = {}) => {
  const res = await fetch(BASE + path, { redirect: 'manual', signal: AbortSignal.timeout(30_000), ...init, headers: { origin: BASE, ...(state.cookie && { cookie: state.cookie }), ...init.headers } });

  return res;
};

async function checks() {
  const out = [];
  out.push(await timed('healthz', async () => { const r = await get('/healthz'); if (r.status !== 200) throw new Error(`HTTP ${r.status}`); }, 3000));
  out.push(await timed('home page', async () => { const r = await get('/'); if (r.status !== 200) throw new Error(`HTTP ${r.status}`); }, 6000));
  out.push(
    await timed('templates + packages', async () => {
      const d = await (await get('/api/templates')).json();

      if (!d.templates?.length) throw new Error('no templates');

      const url = d.snapshots?.core?.url;

      if (url) {
        const h = await get(url, { method: 'HEAD' });

        if (h.status !== 200) throw new Error(`snapshot HTTP ${h.status}`);
      }
    }, 6000),
  );

  if (LOGIN) {
    const [email, password] = LOGIN.split(':');
    out.push(
      await timed('sign in', async () => {
        const r = await get('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ intent: 'login', email, password }).toString() });
        const set = r.headers.getSetCookie?.()[0];

        if (r.status !== 302 || !set) throw new Error(`HTTP ${r.status}`);

        state.cookie = set.split(';')[0];
      }, 8000),
    );

    if (state.cookie && Date.now() - state.lastChat > CHAT_EVERY) {
      state.lastChat = Date.now();
      out.push(
        await timed('AI build', async () => {
          const r = await get('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Reply with one short friendly sentence.' }] }) });

          if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 80)}`);

          const text = await r.text();

          if (text.length < 5) throw new Error('empty reply');

          return r.headers.get('x-foldo-model');
        }, 90_000),
      );
    }
  }

  return out;
}

async function alert(text) {
  console.log(`\x07${text}`);

  if (HOOK) {
    await fetch(HOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }).catch(() => undefined);
  }
}

console.log(`monitoring ${BASE} every ${EVERY / 1000}s${LOGIN ? ' (with sign-in and AI probe)' : ' (no --login: AI path not probed)'}`);

for (;;) {
  const results = await checks();
  const stamp = new Date().toLocaleTimeString();

  for (const r of results) {
    if (!r.ok && !state.down.has(r.name)) {
      state.down.add(r.name);
      await alert(`[${stamp}] FOLDO PROBLEM: ${r.name} failed (${r.why})  ${BASE}`);
    } else if (r.ok && state.down.has(r.name)) {
      state.down.delete(r.name);
      await alert(`[${stamp}] recovered: ${r.name}  ${BASE}`);
    }
  }

  console.log(`${stamp} ${results.map((r) => `${r.name}:${r.ok ? `${Math.round(r.ms)}ms${r.detail ? ` (${r.detail})` : ''}` : `FAIL(${r.why})`}`).join('  ')}`);
  await new Promise((r) => setTimeout(r, EVERY));
}
