import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation, useRevalidator } from '@remix-run/react';
import { useEffect } from 'react';
import { generateText } from 'ai';
import { randomBytes } from 'node:crypto';
import { PageShell } from '~/components/PageShell';
import {
  activeStreams,
  endSessions,
  globalUsedToday,
  requireAdmin,
  setPassword,
  shell,
} from '~/lib/.server/auth';
import {
  CATALOG,
  canStoreKeys,
  costPerMessage,
  defaultMaxTokens,
  defaultProviderId,
  fallbackProviderId,
  encrypt,
  getSetting,
  globalLimit,
  listProviders,
  perUserLimit,
  setSetting,
  inviteCode,
  maxSegments,
  maxUserStreams,
  pauseState,
  signupsOpen,
} from '~/lib/.server/config';
import { snapshot } from '~/lib/.server/metrics';
import { db, today } from '~/lib/.server/db';
import { getModel } from '~/lib/.server/llm/model';
import { timeAgo } from '~/utils/timeAgo';

export const meta = () => [{ title: 'Admin · Foldo' }];

const count = (sql: string, ...args: any[]) => ((db.prepare(sql).get(...args) as any).n as number) ?? 0;

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  const day = today();
  const def = defaultProviderId();

  return json({
    ...shell(admin),
    canStoreKeys,
    stats: {
      users: count('SELECT COUNT(*) AS n FROM users'),
      projects: count('SELECT COUNT(*) AS n FROM projects'),
      listed: count('SELECT COUNT(*) AS n FROM projects WHERE listed = 1'),
      messagesToday: globalUsedToday(),
      globalLimit: globalLimit(),
      active: activeStreams(),
      byProvider: db.prepare('SELECT provider, n FROM provider_usage WHERE day = ? ORDER BY n DESC').all(day),
      live: snapshot(),
      topTeams: db
        .prepare(
          `SELECT u.name, u.email, x.n FROM usage x JOIN users u ON u.id = x.user_id WHERE x.day = ? ORDER BY x.n DESC LIMIT 10`,
        )
        .all(day),
      estSpend: globalUsedToday() * costPerMessage(),
    },
    controls: {
      max_tokens: defaultMaxTokens(),
      max_segments: maxSegments(),
      max_user_streams: maxUserStreams(),
      fallback_provider: fallbackProviderId(),
      cost_per_message: costPerMessage(),
      ...pauseState(),
    },
    providers: listProviders().map((p) => ({
      id: p.id,
      label: p.label,
      baseURL: p.baseURL,
      model: p.model,
      keySource: p.keySource,
      keyHint: p.key ? `…${p.key.slice(-4)}` : '',
      maxTokens: p.maxTokens ?? '',
      enabled: p.enabled,
      isDefault: p.id === def,
      usable: Boolean(p.key && p.enabled && p.baseURL && p.model),
    })),
    settings: {
      event_name: getSetting('event_name'),
      event_ends_at: getSetting('event_ends_at'),
      announcement: getSetting('announcement'),
      invite_code: inviteCode(),
      signups_open: signupsOpen(),
      per_user_limit: perUserLimit(),
      global_limit: globalLimit(),
    },
    users: db
      .prepare(
        `SELECT u.id, u.email, u.name, u.role, u.disabled, u.created,
           (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS projects,
           COALESCE((SELECT n FROM usage x WHERE x.user_id = u.id AND x.day = ?), 0) AS today
         FROM users u ORDER BY u.created DESC LIMIT 500`,
      )
      .all(day),
    gallery: db
      .prepare(
        `SELECT p.id, p.description, p.share_id AS shareId, u.name,
           (SELECT COUNT(*) FROM likes l WHERE l.project_id = p.id) AS likes
         FROM projects p JOIN users u ON u.id = p.user_id WHERE p.listed = 1 ORDER BY p.updated DESC LIMIT 100`,
      )
      .all(),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  const f = await request.formData();
  const s = (k: string) => String(f.get(k) ?? '').trim();
  const intent = s('intent');

  if (intent === 'save-provider') {
    const id = s('id');

    if (!CATALOG.some((c) => c.id === id)) {
      return json({ error: 'Unknown provider' }, 400);
    }

    const baseURL = s('base_url');

    if (baseURL && !/^https:\/\/[^\s]+$/.test(baseURL) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(baseURL)) {
      return json({ error: 'Base URL must start with https://' }, 400);
    }

    const prev = db.prepare('SELECT key_enc FROM providers WHERE id = ?').get(id) as any;
    let keyEnc: string | null = prev?.key_enc ?? null;

    if (f.get('clear_key')) {
      keyEnc = null;
    } else if (s('key')) {
      if (!canStoreKeys) {
        return json({ error: 'Set APP_SECRET in the environment before storing keys here.' }, 400);
      }

      keyEnc = encrypt(s('key'));
    }

    db.prepare(
      `INSERT INTO providers (id, base_url, model, key_enc, enabled, max_tokens) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET base_url = excluded.base_url, model = excluded.model, key_enc = excluded.key_enc, enabled = excluded.enabled, max_tokens = excluded.max_tokens`,
    ).run(id, baseURL || null, s('model') || null, keyEnc, f.get('enabled') ? 1 : 0, Number(s('max_tokens')) > 0 ? Number(s('max_tokens')) : null);

    return json({ ok: `Saved ${id}.` });
  }

  if (intent === 'set-default') {
    setSetting('default_provider', s('id'));

    return json({ ok: `${s('id')} is now the default model.` });
  }

  if (intent === 'test-provider') {
    const p = listProviders().find((x) => x.id === s('id'));

    if (!p?.key) {
      return json({ error: `${s('id')} has no key yet.` }, 400);
    }

    const t0 = Date.now();

    try {
      const { text } = await generateText({ model: getModel(p), prompt: 'Reply with the single word: ok', maxTokens: 8 });

      return json({ ok: `${p.label} works (${Date.now() - t0} ms): “${text.trim().slice(0, 40)}”` });
    } catch (e) {
      return json({ error: `${p.label} failed: ${(e as Error).message.slice(0, 200)}` }, 400);
    }
  }

  if (intent === 'save-settings') {
    const ends = s('event_ends_at');

    if (ends && Number.isNaN(Date.parse(ends))) {
      return json({ error: 'Event end must be a valid date/time.' }, 400);
    }

    for (const k of ['per_user_limit', 'global_limit']) {
      if (s(k) && !(Number(s(k)) >= 0)) {
        return json({ error: `${k} must be a number.` }, 400);
      }
    }

    setSetting('event_name', s('event_name').slice(0, 80));
    setSetting('event_ends_at', ends);
    setSetting('announcement', s('announcement').slice(0, 240));
    setSetting('invite_code', s('invite_code').slice(0, 60));
    setSetting('signups_open', f.get('signups_open') ? '1' : '0');
    setSetting('per_user_limit', s('per_user_limit'));
    setSetting('global_limit', s('global_limit'));

    return json({ ok: 'Settings saved.' });
  }

  if (intent === 'save-limits') {
    for (const [k, min, max] of [
      ['max_tokens', 256, 128000],
      ['max_segments', 1, 8],
      ['max_user_streams', 1, 10],
    ] as const) {
      const v = Number(s(k));

      if (!Number.isFinite(v) || v < min || v > max) {
        return json({ error: `${k.replace(/_/g, ' ')} must be between ${min} and ${max}.` }, 400);
      }

      setSetting(k, String(Math.floor(v)));
    }

    if (s('fallback_provider') && !CATALOG.some((c) => c.id === s('fallback_provider'))) {
      return json({ error: 'Unknown fallback provider' }, 400);
    }

    setSetting('fallback_provider', s('fallback_provider'));
    setSetting('cost_per_message', Number(s('cost_per_message')) >= 0 ? s('cost_per_message') : '');

    return json({ ok: 'Limits saved.' });
  }

  if (intent === 'save-pause') {
    setSetting('paused', f.get('paused') ? '1' : '');
    setSetting('pause_message', s('pause_message').slice(0, 200));

    return json({ ok: f.get('paused') ? 'New requests are paused.' : 'New requests are flowing again.' });
  }

  if (intent === 'user-toggle') {
    if (s('id') === admin.id) {
      return json({ error: "You can't disable your own account." }, 400);
    }

    db.prepare('UPDATE users SET disabled = 1 - disabled WHERE id = ?').run(s('id'));
    endSessions(s('id'));

    return json({ ok: 'Updated account.' });
  }

  if (intent === 'user-reset') {
    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(s('id')) as any;

    if (!user) {
      return json({ error: 'User not found' }, 404);
    }

    const temp = randomBytes(6).toString('base64url');
    await setPassword(s('id'), temp);
    endSessions(s('id'));

    return json({ ok: `Temporary password for ${user.email} (shown once): ${temp}` });
  }

  if (intent === 'unlist') {
    db.prepare('UPDATE projects SET listed = 0, share_id = NULL WHERE id = ?').run(s('id'));

    return json({ ok: 'Removed from the gallery and unshared.' });
  }

  return json({ error: 'Unknown action' }, 400);
}

const card = 'rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5';
const input =
  'w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-borderColorActive';
const btn =
  'rounded-lg bg-bolt-elements-button-secondary-background px-3 py-1.5 text-sm font-medium text-bolt-elements-button-secondary-text hover:bg-bolt-elements-button-secondary-backgroundHover';
const primary =
  'rounded-lg bg-bolt-elements-button-primary-background px-3 py-1.5 text-sm font-semibold text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover';

export default function Admin() {
  const d = useLoaderData<typeof loader>() as any;
  const result = useActionData<typeof action>() as { ok?: string; error?: string } | undefined;
  const busy = useNavigation().state !== 'idle';
  const { revalidate } = useRevalidator();

  useEffect(() => {
    // live view: refresh the numbers every 10s while the page is open
    const t = setInterval(() => document.visibilityState === 'visible' && revalidate(), 10_000);

    return () => clearInterval(t);
  }, [revalidate]);
  const pct = Math.min(100, Math.round((d.stats.messagesToday / Math.max(1, d.stats.globalLimit)) * 100));

  return (
    <PageShell data={d} active="admin">
      <main className="space-y-6" data-testid="foldo-admin">
        <h1 className="text-3xl font-bold">Admin</h1>
        {(result?.ok || result?.error) && (
          <div
            role="status"
            className={`rounded-xl px-4 py-3 text-sm ${result.error ? 'bg-[#fdecec] text-[#b42318]' : 'bg-[#e8f6ec] text-[#14532d]'}`}
          >
            {result.error ?? result.ok}
          </div>
        )}

        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            ['Teams', d.stats.users],
            ['Projects', d.stats.projects],
            ['In gallery', d.stats.listed],
            ['Building now', d.stats.active],
          ].map(([k, v]) => (
            <div key={k as string} className={card}>
              <div className="text-sm text-bolt-elements-textSecondary">{k}</div>
              <div className="text-3xl font-bold">{v}</div>
            </div>
          ))}
          <div className={`${card} col-span-2 md:col-span-4`}>
            <div className="flex items-baseline justify-between text-sm text-bolt-elements-textSecondary">
              <span>AI messages today</span>
              <span>
                {d.stats.messagesToday} / {d.stats.globalLimit} global cap
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-bolt-elements-background-depth-3">
              <div className="h-full bg-[var(--foldo-yellow)]" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 text-xs text-bolt-elements-textTertiary">
              {d.stats.byProvider.map((p: any) => `${p.provider}: ${p.n}`).join(' · ') || 'No messages yet today'}
            </div>
          </div>
        </section>

        <section className={card}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Live</h2>
            <span className="text-xs text-bolt-elements-textTertiary">Refreshes every 10 seconds</span>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              ['Builds running', d.stats.active],
              ['Requests / min', d.stats.live.requestsPerMinute],
              ['Failovers since start', d.stats.live.failovers],
              ['Est. spend today', `$${d.stats.estSpend.toFixed(2)}`],
            ].map(([k, v]) => (
              <div key={k as string}>
                <div className="text-sm text-bolt-elements-textSecondary">{k}</div>
                <div className="text-2xl font-bold tabular-nums">{v}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
            <div>
              <div className="mb-1 font-semibold">Errors by model (since start)</div>
              <div className="text-bolt-elements-textSecondary">
                {Object.entries(d.stats.live.errors).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'None'}
              </div>
              <div className="mb-1 mt-3 font-semibold">Answered by</div>
              <div className="text-bolt-elements-textSecondary">
                {Object.entries(d.stats.live.served).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'Nothing yet'}
              </div>
            </div>
            <div>
              <div className="mb-1 font-semibold">Top teams today</div>
              {d.stats.topTeams.length === 0 ? (
                <div className="text-bolt-elements-textSecondary">No messages yet</div>
              ) : (
                <ol className="space-y-0.5 text-bolt-elements-textSecondary">
                  {d.stats.topTeams.map((t: any) => (
                    <li key={t.email} className="flex justify-between">
                      <span className="truncate">{t.name || t.email}</span>
                      <span className="tabular-nums">{t.n}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </section>

        <section className={`${card} ${d.controls.paused ? 'border-[#b42318]' : ''}`}>
          <h2 className="text-lg font-bold">Emergency controls</h2>
          <Form method="post" className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <label className="text-sm">
              Message teams see while paused
              <input className={`${input} mt-1`} name="pause_message" defaultValue={d.controls.pause_message} maxLength={200} placeholder="We're fixing something. Back in 5 minutes." />
            </label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="paused" defaultChecked={d.controls.paused} /> Pause new requests
              </label>
              <button name="intent" value="save-pause" className={d.controls.paused ? primary : btn} disabled={busy}>
                Apply
              </button>
            </div>
          </Form>
          <p className="mt-2 text-xs text-bolt-elements-textTertiary">Builds already running finish. Nobody loses saved work.</p>
          <a href="/api/admin-backup" className={`${btn} mt-4 inline-block`} download>
            Download database backup
          </a>
        </section>

        <section className={card}>
          <h2 className="mb-4 text-lg font-bold">Reply length, failover and concurrency</h2>
          <Form method="post" className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">
              Default max tokens per reply
              <input className={`${input} mt-1`} name="max_tokens" type="number" min={256} max={128000} defaultValue={d.controls.max_tokens} />
            </label>
            <label className="text-sm">
              Continuations when cut off
              <input className={`${input} mt-1`} name="max_segments" type="number" min={1} max={8} defaultValue={d.controls.max_segments} />
            </label>
            <label className="text-sm">
              Builds at once per login
              <input className={`${input} mt-1`} name="max_user_streams" type="number" min={1} max={10} defaultValue={d.controls.max_user_streams} />
            </label>
            <label className="text-sm">
              Fallback model (used if the main one fails to start)
              <select className={`${input} mt-1`} name="fallback_provider" defaultValue={d.controls.fallback_provider}>
                <option value="">None</option>
                {d.providers.filter((p: any) => p.usable).map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Est. cost per message (USD, for the spend estimate)
              <input className={`${input} mt-1`} name="cost_per_message" type="number" step="0.001" min={0} defaultValue={d.controls.cost_per_message} />
            </label>
            <div className="flex items-end md:justify-end">
              <button name="intent" value="save-limits" className={primary} disabled={busy}>
                Save
              </button>
            </div>
          </Form>
          <p className="mt-2 text-xs text-bolt-elements-textTertiary">
            Some models cap replies lower than the default (DeepSeek and GLM are about 16k); set a per-model value in the model card below.
          </p>
        </section>

        <section className={card}>
          <h2 className="text-lg font-bold">AI models</h2>
          <p className="mb-4 mt-1 text-sm text-bolt-elements-textSecondary">
            Paste an API key to switch a provider on. Keys are encrypted at rest and never shown again.
            {!d.canStoreKeys && ' Set APP_SECRET in the environment to enable storing keys here (env var keys still work).'}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {d.providers.map((p: any) => (
              <div key={p.id} className="rounded-xl border border-bolt-elements-borderColor p-4" data-testid={`foldo-admin-provider-${p.id}`}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="font-semibold">
                    {p.label}{' '}
                    {p.isDefault && <span className="ml-1 rounded-full bg-[var(--foldo-yellow)] px-2 py-0.5 text-xs font-bold text-[#111]">default</span>}
                  </div>
                  <span className={`text-xs ${p.usable ? 'text-bolt-elements-icon-success' : 'text-bolt-elements-textTertiary'}`}>
                    {p.keySource === 'none' ? 'No key' : `Key ${p.keyHint} (${p.keySource})`}
                  </span>
                </div>
                <Form method="post" className="space-y-2">
                  <input type="hidden" name="id" value={p.id} />
                  <input className={input} name="key" type="password" autoComplete="off" placeholder={p.keySource === 'none' ? 'API key' : 'New key (leave blank to keep)'} />
                  <input className={input} name="base_url" defaultValue={p.baseURL} placeholder="Base URL (https://…/v1)" />
                  <input className={input} name="model" defaultValue={p.model} placeholder="Model id" />
                  <input className={input} name="max_tokens" type="number" min={256} defaultValue={p.maxTokens} placeholder="Max tokens for this model (blank = default)" />
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" name="enabled" defaultChecked={p.enabled} /> Enabled
                    </label>
                    {p.keySource === 'admin' && (
                      <label className="flex items-center gap-1.5 text-bolt-elements-textSecondary">
                        <input type="checkbox" name="clear_key" /> Remove stored key
                      </label>
                    )}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button name="intent" value="save-provider" className={primary} disabled={busy}>
                      Save
                    </button>
                    <button name="intent" value="test-provider" className={btn} disabled={busy || p.keySource === 'none'}>
                      Test
                    </button>
                    <button name="intent" value="set-default" className={btn} disabled={busy || !p.usable || p.isDefault}>
                      Make default
                    </button>
                  </div>
                </Form>
              </div>
            ))}
          </div>
        </section>

        <section className={card}>
          <h2 className="mb-4 text-lg font-bold">Event and limits</h2>
          <Form method="post" className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              Event name
              <input className={`${input} mt-1`} name="event_name" defaultValue={d.settings.event_name} placeholder="Spring Hack 2026" />
            </label>
            <label className="text-sm">
              Ends at (shows a countdown)
              <input className={`${input} mt-1`} name="event_ends_at" defaultValue={d.settings.event_ends_at} placeholder="2026-10-08T18:00:00Z" />
            </label>
            <label className="text-sm md:col-span-2">
              Announcement banner
              <input className={`${input} mt-1`} name="announcement" defaultValue={d.settings.announcement} placeholder="Demos start at 17:00 in the main hall" maxLength={240} />
            </label>
            <label className="text-sm">
              Invite code (blank = open sign-up)
              <input className={`${input} mt-1`} name="invite_code" defaultValue={d.settings.invite_code} autoComplete="off" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                Messages / team / day
                <input className={`${input} mt-1`} name="per_user_limit" type="number" min={0} defaultValue={d.settings.per_user_limit} />
              </label>
              <label className="text-sm">
                Global messages / day
                <input className={`${input} mt-1`} name="global_limit" type="number" min={0} defaultValue={d.settings.global_limit} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="signups_open" defaultChecked={d.settings.signups_open} /> Sign-ups open
            </label>
            <div className="md:text-right">
              <button name="intent" value="save-settings" className={primary} disabled={busy}>
                Save settings
              </button>
            </div>
          </Form>
        </section>

        <section className={card}>
          <h2 className="mb-4 text-lg font-bold">Teams ({d.users.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-bolt-elements-textTertiary">
                <tr>
                  <th className="py-2 pr-3 font-medium">Team</th>
                  <th className="pr-3 font-medium">Email</th>
                  <th className="pr-3 font-medium">Projects</th>
                  <th className="pr-3 font-medium">Today</th>
                  <th className="pr-3 font-medium">Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.users.map((u: any) => (
                  <tr key={u.id} className="border-t border-bolt-elements-borderColor">
                    <td className="py-2 pr-3">
                      {u.name || '—'} {u.disabled ? <span className="text-xs text-bolt-elements-icon-error">disabled</span> : null}
                    </td>
                    <td className="pr-3 text-bolt-elements-textSecondary">{u.email}</td>
                    <td className="pr-3">{u.projects}</td>
                    <td className="pr-3">{u.today}</td>
                    <td className="pr-3 text-bolt-elements-textTertiary">{u.created ? timeAgo(u.created) : '—'}</td>
                    <td className="whitespace-nowrap py-1 text-right">
                      <Form method="post" className="inline-flex gap-1.5">
                        <input type="hidden" name="id" value={u.id} />
                        <button name="intent" value="user-reset" className={btn}>
                          Reset password
                        </button>
                        <button name="intent" value="user-toggle" className={btn}>
                          {u.disabled ? 'Enable' : 'Disable'}
                        </button>
                      </Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={card}>
          <h2 className="mb-4 text-lg font-bold">Gallery moderation</h2>
          {d.gallery.length === 0 ? (
            <p className="text-sm text-bolt-elements-textSecondary">Nothing listed yet.</p>
          ) : (
            <ul className="divide-y divide-bolt-elements-borderColor text-sm">
              {d.gallery.map((g: any) => (
                <li key={g.id} className="flex items-center justify-between py-2">
                  <a href={`/p/${g.shareId}`} className="truncate hover:underline">
                    {g.description || 'Untitled'} <span className="text-bolt-elements-textTertiary">by {g.name} · {g.likes} likes</span>
                  </a>
                  <Form method="post">
                    <input type="hidden" name="id" value={g.id} />
                    <button name="intent" value="unlist" className={btn}>
                      Remove
                    </button>
                  </Form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </PageShell>
  );
}
