import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { Form, useActionData, useLoaderData, useNavigation, useRevalidator, useSubmit } from '@remix-run/react';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'react-toastify';
import { generateText } from 'ai';
import { randomBytes } from 'node:crypto';
import { AdminShell, ago, cardClass, h2Class, tableBtn, thClass, type SectionId } from '~/components/admin/AdminShell';
import { PreviewFrame } from '~/components/landing/ProjectCard';
import { Icon } from '~/components/ui/icons';
import {
  activeStreams,
  activeTeams,
  addExtraToday,
  endSessions,
  extraToday,
  MAX_EXTRA_PER_DAY,
  pruneQuotaTweaks,
  usedToday,
  globalUsedToday,
  requireAdmin,
  resetUsageToday,
  setPassword,
  shell,
} from '~/lib/.server/auth';
import {
  CATALOG,
  canStoreKeys,
  costPerMessage,
  costPerPreview,
  previewDailyLimit,
  defaultMaxTokens,
  defaultProviderId,
  fallbackProviderId,
  encrypt,
  eventMode,
  getSetting,
  legalInfo,
  globalLimit,
  HARNESSES,
  harnessId,
  type HarnessId,
  listProviders,
  usableProviders,
  perUserLimit,
  providerTest,
  setProviderTest,
  setSetting,
  storeSetting,
  inviteCode,
  maxSegments,
  maxUserStreams,
  pauseState,
  REASONING_LEVELS,
  reasoningEffort,
  signupsOpen,
  setPaused,
} from '~/lib/.server/config';
import { isAdminRow, testNote } from '~/lib/.server/admin';
import { snapshot } from '~/lib/.server/metrics';
import { autoBackupsPaused, listBackups, runBackup } from '~/lib/.server/backup';
import { db, today } from '~/lib/.server/db';
import { getModel } from '~/lib/.server/llm/model';
import { normalizeEmail } from '~/lib/email';
import { previewsToday, queuePreview } from '~/lib/.server/previews';
import { iconProps } from '~/lib/templates/client';

export const meta = () => [{ title: 'Organizer console · Foldo' }];

// same default as the studio's (Studio.tsx): the organizers only while event mode is on
const defaultPause = (eventMode: boolean) => `${eventMode ? 'The organizers have' : 'Foldo has'} paused new builds for a moment. Hang tight.`;

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  const day = today();
  const def = defaultProviderId();
  const fallback = fallbackProviderId();
  const live = snapshot();
  const perTeam = perUserLimit();

  pruneQuotaTweaks();

  const users = (
    db
      .prepare(
        `SELECT u.id, u.email, u.name, u.role, u.disabled, u.created,
           (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS projects,
           (SELECT MAX(p.updated) FROM projects p WHERE p.user_id = u.id) AS lastActive
         FROM users u ORDER BY u.created DESC LIMIT 1000`,
      )
      .all() as any[]
  )
    .filter((u) => !isAdminRow(u))
    .map(({ role, ...u }) => ({ ...u, today: usedToday(u.id), limit: perTeam + extraToday(u.id) }));

  const providers = listProviders().map((p) => {
    const test = providerTest(p.id);
    const usable = Boolean(p.key && p.enabled && p.baseURL && p.model);

    return {
      id: p.id,
      name: p.id === 'custom' ? 'Custom' : (CATALOG.find((c) => c.id === p.id)?.label ?? p.id),
      label: p.label,
      baseURL: p.baseURL,
      model: p.model,
      keySource: p.keySource,
      last4: p.key ? p.key.slice(-4) : '',
      moreKeys: Math.max(0, p.keys.length - 1),
      maxTokens: p.maxTokens ?? '',
      enabled: p.enabled,
      isDefault: p.id === def,
      reserve: p.id === fallback,
      usable,
      failed: test && !test.ok ? test : undefined,
    };
  });

  // what /gallery shows (listed, shared, team not disabled) plus what organizers hid
  const gallery = db
    .prepare(
      `SELECT p.id, p.description, p.share_id AS shareId, p.template, p.hidden_at AS hiddenAt, p.preview_at AS previewAt, u.name,
         (p.hidden_at IS NULL) AS listed,
         (SELECT COUNT(*) FROM likes l WHERE l.project_id = p.id) AS likes
       FROM projects p JOIN users u ON u.id = p.user_id
       WHERE u.disabled = 0 AND p.share_id IS NOT NULL AND ((p.listed = 1 AND p.hidden_at IS NULL) OR p.hidden_at IS NOT NULL)
       ORDER BY listed DESC, likes DESC, p.updated DESC LIMIT 200`,
    )
    .all() as any[];

  // every team's project, newest first: organizers open them read-only for judging (shared or not)
  const projects = db
    .prepare(
      `SELECT p.id, p.description, p.updated, p.share_id AS shareId, p.listed, u.name, u.email, u.role
       FROM projects p JOIN users u ON u.id = p.user_id ORDER BY p.updated DESC LIMIT 2000`,
    )
    .all()
    .filter((p: any) => !isAdminRow(p))
    .map(({ role, email, ...p }: any) => ({ ...p, name: p.name || email.split('@')[0], shared: Boolean(p.shareId), listed: Boolean(p.listed) }));

  const backups = listBackups();

  return json({
    ...shell(admin),
    now: Date.now(),
    canStoreKeys,
    backups: backups.slice(0, 6),
    lastBackupAt: backups[0]?.mtime ?? null,
    backupEveryMin: Number(process.env.BACKUP_INTERVAL_MIN ?? 10),
    backupsPaused: autoBackupsPaused(),
    stats: {
      teams: users.length,
      teamsBuilding: activeTeams(),
      messagesToday: globalUsedToday(),
      globalLimit: globalLimit(),
      streams: activeStreams(),
      requestsPerMinute: live.requestsPerMinute,
      errorRate: live.errorRate15m,
      failovers: live.failovers,
      served: Object.entries(live.served).sort((a, b) => b[1] - a[1]),
      errors: Object.entries(live.errors).sort((a, b) => b[1] - a[1]),
      topTeams: db
        .prepare(`SELECT u.name, u.email, x.n FROM usage x JOIN users u ON u.id = x.user_id WHERE x.day = ? ORDER BY x.n DESC LIMIT 5`)
        .all(day),
      previewsToday: previewsToday(),
      previewLimit: previewDailyLimit(),
      // gallery thumbnails are billed too, at a fraction of a message (see costPerPreview)
      estSpend: globalUsedToday() * costPerMessage() + previewsToday() * costPerPreview(),
    },
    controls: {
      max_tokens: defaultMaxTokens(),
      max_segments: maxSegments(),
      max_user_streams: maxUserStreams(),
      fallback_provider: fallback,
      cost_per_message: costPerMessage(),
      reasoning_effort: reasoningEffort(),
      reasoning_levels: [...REASONING_LEVELS],
      harness: harnessId(),
      harnesses: Object.entries(HARNESSES).map(([id, h]) => ({ id, label: h.label.replace(/\s*\(.*\)$/, ''), note: h.note })),
      ...pauseState(),
    },
    providers,
    settings: {
      // effective values, env fallbacks included
      event_name: getSetting('event_name', process.env.EVENT_NAME ?? ''),
      event_ends_at: getSetting('event_ends_at', process.env.EVENT_ENDS_AT ?? ''),
      announcement: getSetting('announcement'),
      invite_code: inviteCode(),
      signups_open: signupsOpen(),
      event_mode: eventMode(),
      per_user_limit: perTeam,
      global_limit: globalLimit(),
    },
    users,
    projects,
    gallery,
    legal: legalInfo(),
    waitlist: (db.prepare('SELECT COUNT(*) AS n FROM waitlist').get() as { n: number }).n,
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

    // a new key, URL or model deserves a fresh test
    setProviderTest(id);

    return json({ ok: `Saved ${id}.` });
  }

  if (intent === 'provider-enable') {
    const id = s('id');

    if (!CATALOG.some((c) => c.id === id)) {
      return json({ error: 'Unknown provider' }, 400);
    }

    db.prepare(`INSERT INTO providers (id, enabled) VALUES (?, 1) ON CONFLICT (id) DO UPDATE SET enabled = 1`).run(id);

    return json({ ok: `${id} is enabled.` });
  }

  if (intent === 'apply-harness') {
    const id = s('harness');

    if (!(id in HARNESSES)) {
      return json({ error: 'Unknown harness' }, 400);
    }

    const h = HARNESSES[id as HarnessId];

    // main model on the OpenRouter card, reserve on the Custom card (same OpenRouter endpoint), keys and limits untouched
    db.prepare(
      `INSERT INTO providers (id, base_url, model, enabled) VALUES ('openrouter', NULL, ?, 1) ON CONFLICT (id) DO UPDATE SET model = excluded.model`,
    ).run(h.main);
    db.prepare(
      `INSERT INTO providers (id, base_url, model, enabled) VALUES ('custom', 'https://openrouter.ai/api/v1', ?, 1) ON CONFLICT (id) DO UPDATE SET model = excluded.model`,
    ).run(h.reserve);
    setSetting('harness', id);
    setSetting('default_provider', 'openrouter');

    const reserveReady = usableProviders().some((p) => p.id === 'custom');
    setSetting('fallback_provider', reserveReady ? 'custom' : '');

    return json({
      ok: `Harness: ${h.label}.${reserveReady ? '' : ' No reserve model yet: put an OpenRouter key in the Custom row to enable failover.'}`,
    });
  }

  if (intent === 'set-default') {
    if (!usableProviders().some((p) => p.id === s('id'))) {
      return json({ error: `${s('id')} needs a key and must be enabled before it can be the default.` }, 400);
    }

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
      // no retries and a hard timeout: a silent provider must not hang the console
      const { text } = await generateText({
        model: getModel(p),
        prompt: 'Reply with the single word: ok',
        maxTokens: 8,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(15_000),
      });
      setProviderTest(p.id, { ok: true, note: '', at: Date.now() });

      return json({ ok: `${p.label} works (${Date.now() - t0} ms): “${text.trim().slice(0, 40)}”` });
    } catch (e) {
      setProviderTest(p.id, { ok: false, note: testNote(e), at: Date.now() });

      return json({ error: `${p.label} failed: ${testNote(e)}.` }, 400);
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

    // stored even when blank, so a cleared field wins over an env fallback ("Leave blank for open sign-up")
    storeSetting('event_name', s('event_name').slice(0, 80));
    storeSetting('event_ends_at', ends);
    setSetting('announcement', s('announcement').slice(0, 240));
    storeSetting('invite_code', s('invite_code').slice(0, 60));
    setSetting('per_user_limit', s('per_user_limit'));
    setSetting('global_limit', s('global_limit'));

    // both switches are sent only once touched, so a console opened before someone else flipped one never flips it back
    if (f.has('signups_open')) {
      setSetting('signups_open', f.get('signups_open') ? '1' : '0');
    }

    if (f.has('event_mode')) {
      setSetting('event_mode', f.get('event_mode') ? '1' : '');
    }

    return json({ ok: 'Settings saved.' });
  }

  if (intent === 'save-legal') {
    const email = s('contact_email');

    if (email && !normalizeEmail(email)) {
      return json({ error: 'Contact email must be a valid email address.' }, 400);
    }

    setSetting('legal_name', s('legal_name').slice(0, 120));
    setSetting('contact_email', email ? normalizeEmail(email)! : '');
    setSetting('legal_country', s('legal_country').slice(0, 80));

    return json({ ok: 'Company details saved.' });
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

    if (s('reasoning_effort') && !(REASONING_LEVELS as readonly string[]).includes(s('reasoning_effort'))) {
      return json({ error: 'Unknown reasoning effort' }, 400);
    }

    setSetting('fallback_provider', s('fallback_provider'));

    // the extra fields sit in a disclosure; scripts that leave them out keep the stored values
    if (f.has('reasoning_effort')) {
      setSetting('reasoning_effort', s('reasoning_effort'));
    }

    if (f.has('cost_per_message')) {
      setSetting('cost_per_message', Number(s('cost_per_message')) >= 0 ? s('cost_per_message') : '');
    }

    return json({ ok: 'Limits saved.' });
  }

  if (intent === 'save-pause') {
    setPaused(Boolean(f.get('paused')));
    setSetting('pause_message', s('pause_message').slice(0, 200));

    return json({ ok: f.get('paused') ? 'New builds are paused.' : 'Builds are running again.' });
  }

  if (intent === 'pause-on') {
    setPaused(true);
    setSetting('pause_message', s('pause_message').slice(0, 200));

    return json({ ok: 'New builds are paused.' });
  }

  if (intent === 'save-pause-message') {
    setSetting('pause_message', s('pause_message').slice(0, 200));

    return json({ ok: 'Pause message saved.' });
  }

  if (intent === 'toggle-backups') {
    const pause = !autoBackupsPaused();
    setSetting('backups_paused', pause ? '1' : '');

    return json({ ok: pause ? 'Automatic backups paused.' : 'Automatic backups are running again.' });
  }

  if (intent === 'backup-now') {
    return json({ ok: `Backup written: ${runBackup()}` });
  }

  if (['user-toggle', 'user-reset', 'quota-add', 'quota-reset'].includes(intent)) {
    const user = db.prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(s('id')) as
      | { id: string; email: string; name: string; role: string }
      | undefined;

    if (!user) {
      return json({ error: 'Team not found' }, 404);
    }

    if (isAdminRow(user)) {
      return json({ error: "Organizer accounts can't be changed here." }, 400);
    }

    const who = user.name || user.email;

    if (intent === 'user-toggle') {
      db.prepare('UPDATE users SET disabled = 1 - disabled WHERE id = ?').run(user.id);
      endSessions(user.id);

      return json({ ok: 'Updated account.' });
    }

    if (intent === 'user-reset') {
      const temp = randomBytes(6).toString('base64url');
      await setPassword(user.id, temp);
      endSessions(user.id);

      return json({ ok: `Temporary password for ${user.email} (shown once): ${temp}`, temp: { email: user.email, password: temp } });
    }

    if (intent === 'quota-add') {
      const n = Math.floor(Number(s('extra')));

      if (!(n >= 1 && n <= MAX_EXTRA_PER_DAY)) {
        return json({ error: `Extra messages must be between 1 and ${MAX_EXTRA_PER_DAY}.` }, 400);
      }

      if (extraToday(user.id) + n > MAX_EXTRA_PER_DAY) {
        return json({ error: `${who} already has ${extraToday(user.id)} extra today; the most is ${MAX_EXTRA_PER_DAY} a day.` }, 400);
      }

      addExtraToday(user.id, n);

      return json({ ok: `${who} gets ${n} more ${n === 1 ? 'message' : 'messages'} today.` });
    }

    resetUsageToday(user.id);

    return json({ ok: `Reset today's count for ${who}.` });
  }

  if (intent === 'gallery-hide' || intent === 'gallery-show') {
    const p = db.prepare('SELECT id, share_id, hidden_at FROM projects WHERE id = ?').get(s('id')) as any;

    if (!p) {
      return json({ error: 'Project not found' }, 404);
    }

    if (!p.share_id) {
      return json({ error: 'That project is not shared, so it is not in the gallery.' }, 400);
    }

    if (intent === 'gallery-hide') {
      // off the public gallery only (the team can't list it again); the share link keeps working for judges
      db.prepare('UPDATE projects SET listed = 0, hidden_at = ? WHERE id = ?').run(Date.now(), p.id);

      return json({ ok: 'Hidden from the gallery. The share link still works.' });
    }

    db.prepare('UPDATE projects SET listed = 1, hidden_at = NULL WHERE id = ?').run(p.id);
    queuePreview(p.id);

    return json({ ok: 'Back in the gallery.' });
  }

  return json({ error: 'Unknown action' }, 400);
}

type Data = ReturnType<typeof useLoaderData<typeof loader>>;
type Result = { ok?: string; error?: string; temp?: { email: string; password: string } } | undefined;

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');
const n = (v: number) => v.toLocaleString('en-US');
const srOnly = 'absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)]';
const smallInput =
  'font-normal h-[40px] w-full min-w-0 rounded-[8px] border border-solid border-field bg-sheet px-3 font-mono text-[14px] text-ink outline-none transition-[border-color,box-shadow] duration-120 focus:border-ink focus:shadow-[0_0_0_3px_rgba(255,194,26,.45)]';
const monoInput = 'input font-mono text-[14px]';

function SectionHead({ id, title, children, align = 'baseline' }: { id: string; title: ReactNode; children?: ReactNode; align?: 'baseline' | 'center' }) {
  return (
    <div className={cx('flex flex-wrap justify-between gap-3', align === 'center' ? 'items-center' : 'items-baseline')}>
      <h2 id={id} className={h2Class}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Switch({ on, label, onClick, disabled }: { on: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-labelledby={label} className="switch" onClick={onClick} disabled={disabled}>
      <span className={cx('switch-knob', on && 'border-white')} />
    </button>
  );
}

function Meter({ pct, tone = 'ink', width = 90 }: { pct: number; tone?: 'ink' | 'warning' | 'muted'; width?: number }) {
  return (
    <span aria-hidden="true" className="block h-[6px] shrink-0 overflow-hidden rounded-full bg-rule2" style={{ width }}>
      <span
        className={cx('block h-full rounded-full', tone === 'warning' ? 'bg-warning' : tone === 'muted' ? 'bg-pencil' : 'bg-ink')}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </span>
  );
}

export default function Admin() {
  const d = useLoaderData<typeof loader>() as any;
  const result = useActionData<typeof action>() as Result;
  const nav = useNavigation();
  const submit = useSubmit();
  const { revalidate } = useRevalidator();
  const [section, setSection] = useState<SectionId>('live');

  const busy = (intent: string, id?: string) =>
    nav.state !== 'idle' && nav.formData?.get('intent') === intent && (id === undefined || nav.formData?.get('id') === id);
  const post = (fields: Record<string, string>) => submit(fields, { method: 'post', preventScrollReset: true });

  useEffect(() => {
    // live view: refresh the numbers every 10s while the page is open
    const t = setInterval(() => document.visibilityState === 'visible' && revalidate(), 10_000);

    return () => clearInterval(t);
  }, [revalidate]);

  useEffect(() => {
    if (result?.error) {
      toast.error(result.error);
    } else if (result?.ok && !result.temp) {
      toast.success(result.ok);
    }
  }, [result]);

  // a nav click wins over the scroll spy while the page scrolls to it
  const pinned = useRef(0);
  const navigate = (id: SectionId) => {
    pinned.current = Date.now();
    setSection(id);
  };

  useEffect(() => {
    // highlight the section in view in the left nav: the lowest one whose top has passed 140px; on a shared row the first
    const root = document.querySelector('[data-testid=foldo-admin-shell]');

    if (!root) {
      return undefined;
    }

    const onScroll = () => {
      if (Date.now() - pinned.current < 1000) {
        return;
      }

      let current: SectionId = 'live';
      let currentTop = -Infinity;

      for (const el of root.querySelectorAll<HTMLElement>('main section[id]')) {
        const top = el.getBoundingClientRect().top;

        if (top < 140 && top > currentTop + 2) {
          current = el.id as SectionId;
          currentTop = top;
        }
      }

      setSection(current);
    };

    root.addEventListener('scroll', onScroll, { passive: true });

    return () => root.removeEventListener('scroll', onScroll);
  }, []);

  const failedModels = d.providers.filter((p: any) => p.failed).length;
  const listed = d.gallery.filter((g: any) => g.listed).length;

  const badges: Partial<Record<SectionId, ReactNode>> = {
    live: <span aria-label="live" className="block h-[6px] w-[6px] rounded-full bg-live" />,
    emergency: d.controls.paused ? (
      <span className="font-mono text-[12px] font-medium text-error">on</span>
    ) : (
      <span className="font-mono text-[12px] text-pencil">off</span>
    ),
    models: failedModels ? (
      <span className="inline-flex items-center gap-1 font-mono text-[12px] text-error" aria-label={`${failedModels} failing`}>
        <span className="h-[6px] w-[6px] rounded-full bg-error" />
        {failedModels}
      </span>
    ) : undefined,
    teams: <span className="font-mono text-[12px] text-pencil">{d.stats.teams}</span>,
    projects: <span className="font-mono text-[12px] text-pencil">{d.projects.length}</span>,
    gallery: <span className="font-mono text-[12px] text-pencil">{listed}</span>,
    backups: d.lastBackupAt ? <span className="font-mono text-[12px] text-pencil">{ago(d.lastBackupAt, d.now).replace(/ ago$/, '').replace(' min', 'm').replace(' h', 'h').replace(' d', 'd').replace('just now', 'now')}</span> : undefined,
  };

  return (
    <AdminShell data={d} now={d.now} page="console" active={section} badges={badges} onNavigate={navigate}>
      {/* SSR copy of the last action's result (screen readers, scripts); the toast is the visible one */}
      <p role="status" className={srOnly} data-testid="foldo-admin-result">
        {result?.error ?? result?.ok ?? ''}
      </p>
      <div data-testid="foldo-admin" className="contents">
        <Live d={d} />
        <Emergency d={d} busy={busy} />
        <Models d={d} busy={busy} post={post} />
        <EventSettings d={d} busy={busy} />
        <CompanySettings d={d} busy={busy} />
        <Teams d={d} busy={busy} temp={result?.temp} />
        <Projects d={d} />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(440px,100%),1fr))] items-start gap-6">
          <Gallery d={d} busy={busy} />
          <Backups d={d} busy={busy} post={post} />
        </div>
      </div>
    </AdminShell>
  );
}

type Busy = (intent: string, id?: string) => boolean;

function Live({ d }: { d: Data & any }) {
  const s = d.stats;
  const pct = Math.min(100, Math.round((s.messagesToday / Math.max(1, s.globalLimit)) * 100));
  const [updated, setUpdated] = useState('');
  const label = (id: string) => d.providers.find((p: any) => p.id === id)?.label ?? id;

  useEffect(() => setUpdated(new Date(d.now).toLocaleTimeString('en-GB')), [d.now]);

  const tiles = [
    ['Teams building now', n(s.teamsBuilding), `of ${n(s.teams)} teams signed up`],
    ['Messages today', n(s.messagesToday), `of ${n(s.globalLimit)} global cap · ${pct}% · ${n(s.previewsToday)} of ${n(s.previewLimit)} thumbnails`],
    ['Streams in flight', n(s.streams), `limit ${d.controls.max_user_streams} per login · ${s.requestsPerMinute} req/min`],
    ['Provider error rate', `${(s.errorRate * 100).toFixed(1)}%`, `last 15 min · ${s.failovers} ${s.failovers === 1 ? 'failover' : 'failovers'} since start`],
  ];

  return (
    <section id="live" aria-labelledby="a-live" className={cx(cardClass, 'gap-[18px]')}>
      <SectionHead id="a-live" title="Live">
        <span className="font-mono text-[12px] text-pencil">
          {updated && `updated ${updated} · `}est. spend today ${s.estSpend.toFixed(2)}
        </span>
      </SectionHead>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] border-y border-rule">
        {tiles.map(([k, v, sub], i) => (
          <div
            key={k}
            className={cx(
              'flex flex-col gap-[2px] pb-4 pt-[14px]',
              i === 0 ? 'pr-4' : 'border-l border-rule2 px-4 max-sm:border-l-0 max-sm:border-t max-sm:px-0',
              i === 3 && 'pr-0',
            )}
          >
            <span className="text-[13px] text-pencil">{k}</span>
            <span className="font-serif text-[44px] leading-none tabular-nums">{v}</span>
            <span className="text-[13px] text-ink2">{sub}</span>
            {i === 1 && (
              <span role="img" aria-label={`${n(s.messagesToday)} of ${n(s.globalLimit)} messages used, ${pct} percent`} className="mt-[6px] block h-[6px] overflow-hidden rounded-full bg-rule2">
                <span className="block h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-x-8 gap-y-5 text-[13px]">
        <div className="flex flex-col gap-[6px]">
          <h3 className="m-0 text-[13px] font-semibold">Answered by</h3>
          {s.served.length ? (
            <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-ink2">
              {s.served.map(([id, v]: [string, number]) => (
                <Fragment key={id}>
                  <dt>
                    {label(id)}{' '}
                    <span className="font-mono text-[12px] text-pencil">
                      {id}
                      {id === d.controls.fallback_provider && ' · fallback'}
                    </span>
                  </dt>
                  <dd className="m-0 tabular-nums">{n(v)}</dd>
                </Fragment>
              ))}
            </dl>
          ) : (
            <p className="m-0 text-ink2">Nothing yet since the server started.</p>
          )}
          <h3 className="m-0 mt-2 text-[13px] font-semibold">Errors by model since start</h3>
          <p className="m-0 text-ink2">{s.errors.map(([id, v]: [string, number]) => `${label(id)}: ${v}`).join(' · ') || 'None'}</p>
        </div>
        <div className="flex flex-col gap-[6px]">
          <h3 className="m-0 text-[13px] font-semibold">Top teams today</h3>
          {s.topTeams.length ? (
            <ol className="m-0 flex list-none flex-col gap-1 p-0 text-ink2">
              {s.topTeams.map((t: any) => (
                <li key={t.email} className="flex justify-between gap-3">
                  <span className="truncate">{t.name || t.email}</span>
                  <span className="tabular-nums">{n(t.n)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="m-0 text-ink2">No messages yet today.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Emergency({ d, busy }: { d: any; busy: Busy }) {
  const paused: boolean = d.controls.paused;
  const pauseFallback = defaultPause(Boolean(d.settings.event_mode));
  const [message, setMessage] = useState<string>(d.controls.message || pauseFallback);
  const submit = useSubmit();
  const toggle = () => submit({ intent: 'save-pause', paused: paused ? '' : 'on', pause_message: message }, { method: 'post', preventScrollReset: true });

  return (
    <section id="emergency" aria-labelledby="a-emg" className={cx(cardClass, 'gap-4', paused && 'border-error-border')}>
      <SectionHead id="a-emg" title="Emergency controls">
        {paused ? (
          <span className="pill-error">
            <span className="pill-dot" />
            New builds paused
          </span>
        ) : (
          <span className="pill-live">
            <span className="pill-dot" />
            Builds running normally
          </span>
        )}
      </SectionHead>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] gap-x-7 gap-y-5">
        <Form method="post" preventScrollReset className="relative flex flex-col gap-[14px]">
          {/* first submit button = what Enter does in the message field: save the text, never pause or resume */}
          <button name="intent" value="save-pause-message" tabIndex={-1} aria-hidden="true" className={srOnly} />
          <div role="note" className="flex items-start gap-[10px] rounded-[10px] border border-solid border-error-border bg-error-bg px-[14px] py-3 text-[13px]">
            <Icon.Warning className="mt-[2px] flex-none text-error" />
            <p className="m-0 text-ink [text-wrap:pretty]">
              <strong className="font-semibold text-error">This stops every team at once.</strong> New messages are refused until you switch it off. Builds
              already running finish, and nobody loses saved work.
            </p>
          </div>
          <div className="flex items-center justify-between gap-4 border-y border-rule2 py-[10px]">
            <div className="flex flex-col">
              <span id="a-pause-l" className="text-[14px] font-semibold">
                Pause new builds
              </span>
              <span className="text-[13px] text-pencil">{paused ? 'On · new messages are refused' : 'Off · teams can send messages'}</span>
            </div>
            <Switch on={paused} label="a-pause-l" onClick={toggle} disabled={busy('save-pause')} />
          </div>
          <div className="flex flex-col gap-[6px]">
            <label htmlFor="a-pause-msg" className="input-label">
              Message teams see while paused
            </label>
            <input
              id="a-pause-msg"
              name="pause_message"
              type="text"
              maxLength={200}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              aria-describedby="a-pause-help"
              className="input"
            />
            <span id="a-pause-help" className="input-help">
              Up to 200 characters. Shown in the chat and on the prompt box.
            </span>
          </div>
          <div className="flex flex-wrap gap-[10px]">
            {paused ? (
              <button name="intent" value="save-pause" className="btn-secondary btn-md" aria-busy={busy('save-pause')} disabled={busy('save-pause')}>
                <Icon.ArrowRight size={15} />
                Resume builds
              </button>
            ) : (
              <button name="intent" value="pause-on" className="btn-danger btn-md" aria-busy={busy('pause-on')} disabled={busy('pause-on')}>
                <Icon.Pause size={15} />
                Pause and apply message
              </button>
            )}
            <button name="intent" value="save-pause-message" className="btn-secondary btn-md" aria-busy={busy('save-pause-message')} disabled={busy('save-pause-message')}>
              Save message only
            </button>
          </div>
        </Form>
        <figure className="m-0 flex flex-col gap-[10px] rounded-[12px] border border-dashed border-field bg-paper p-[14px]">
          <figcaption className="eyebrow">What teams see while paused</figcaption>
          <img
            src="/art/paused.webp"
            alt="Foldo asleep under a yellow paper blanket beside a tipped alarm clock"
            className="block max-h-[170px] w-full rounded-[12px] object-cover [object-position:50%_55%]"
          />
          <div className="flex items-start gap-[10px] rounded-[10px] border border-solid border-ink bg-sheet px-3 py-[10px] text-[13px]">
            <Icon.Pause className="mt-[2px] flex-none" />
            <p className="m-0">
              <strong className="font-semibold">Paused.</strong> {message.trim() || pauseFallback}
            </p>
          </div>
        </figure>
      </div>
    </section>
  );
}

function ProviderStatus({ p, now }: { p: any; now: number }) {
  if (!p.enabled) {
    return (
      <span className="pill border-rule bg-paper text-ink2">
        <span className="h-[6px] w-[6px] rounded-full border border-solid border-pencil" />
        Disabled
      </span>
    );
  }

  if (p.keySource === 'none') {
    return <span className="pill-muted bg-sheet">No key</span>;
  }

  if (p.failed) {
    return (
      <span className="inline-flex flex-col gap-[2px]">
        <span className="pill-error self-start">
          <span className="pill-dot" />
          Test failed
        </span>
        <span className="max-w-[200px] text-[12px] text-pencil">
          {p.failed.note}, {ago(p.failed.at, now)}
        </span>
      </span>
    );
  }

  if (!p.usable) {
    return (
      <span className="pill-warning">
        <span className="pill-dot" />
        Needs base URL
      </span>
    );
  }

  return (
    <span className="pill-live">
      <span className="pill-dot" />
      Ready
    </span>
  );
}

function ProviderEditor({ p, d, busy, onClose }: { p: any; d: any; busy: Busy; onClose: () => void }) {
  const [enabled, setEnabled] = useState<boolean>(p.enabled);

  return (
    <Form method="post" preventScrollReset className="flex flex-col gap-3 rounded-[10px] border border-solid border-rule bg-sheet px-[14px] py-3" onSubmit={() => setTimeout(onClose, 0)}>
      <input type="hidden" name="id" value={p.id} />
      <input type="hidden" name="enabled" value={enabled ? 'on' : ''} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-x-4 gap-y-3">
        <label className="flex flex-col gap-1 text-[13px] font-medium">
          API key
          <input
            className={smallInput}
            name="key"
            type="password"
            autoComplete="off"
            autoFocus
            placeholder={p.keySource === 'none' ? 'Paste a key (several: comma-separated)' : 'New key (blank keeps the current one)'}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium">
          Base URL
          <input className={smallInput} name="base_url" defaultValue={p.baseURL} placeholder="https://…/v1" />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium">
          Model id
          <input className={smallInput} name="model" defaultValue={p.model} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium">
          Max tokens for this model
          <input className={smallInput} name="max_tokens" type="number" min={256} defaultValue={p.maxTokens} placeholder="Default" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
        <span className="inline-flex items-center gap-2">
          <span id={`a-en-${p.id}`}>Enabled</span>
          <Switch on={enabled} label={`a-en-${p.id}`} onClick={() => setEnabled(!enabled)} />
        </span>
        {p.keySource === 'admin' && (
          <label className="inline-flex items-center gap-[6px] text-ink2">
            <input type="checkbox" name="clear_key" className="m-0 h-4 w-4" style={{ accentColor: "#16140F" }} /> Remove the stored key
          </label>
        )}
        {!d.canStoreKeys && <span className="text-pencil">Set APP_SECRET in the environment to store keys here (env var keys still work).</span>}
        <span className="ml-auto flex gap-2">
          <button type="button" className={cx('btn-ghost', tableBtn)} onClick={onClose}>
            Cancel
          </button>
          <button name="intent" value="save-provider" className={cx('btn-dark', tableBtn)} aria-busy={busy('save-provider', p.id)} disabled={busy('save-provider', p.id)}>
            Save {p.name}
          </button>
        </span>
      </div>
    </Form>
  );
}

const providerRank = (p: any) => (p.isDefault ? 0 : p.reserve ? 1 : !p.enabled ? 4 : p.keySource === 'none' ? 5 : p.failed || !p.usable ? 3 : 2);

function Models({ d, busy, post }: { d: any; busy: Busy; post: (f: Record<string, string>) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const rows = useMemo(() => [...d.providers].sort((a: any, b: any) => providerRank(a) - providerRank(b)), [d.providers]);
  const btn = cx('btn-secondary', tableBtn);

  return (
    <section id="models" aria-labelledby="a-models" className={cx(cardClass, 'gap-4')}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[620px] flex-col gap-1">
          <h2 id="a-models" className={h2Class}>
            AI models
          </h2>
          <p className="m-0 text-[13px] text-ink2 [text-wrap:pretty]">
            Paste an API key to switch a provider on. Keys are encrypted at rest and never shown again. Several keys separated by commas are used in turn.
          </p>
        </div>
        <div className="flex flex-col gap-[6px]" data-testid="foldo-admin-harness">
          <span id="a-harness-l" className="text-[13px] font-medium">
            Harness
          </span>
          <div role="group" aria-labelledby="a-harness-l" className="seg">
            {d.controls.harnesses.map((h: any) => (
              <button
                key={h.id}
                type="button"
                aria-pressed={h.id === d.controls.harness}
                title={h.note}
                className="seg-item h-[30px]"
                disabled={busy('apply-harness')}
                onClick={() => h.id !== d.controls.harness && post({ intent: 'apply-harness', harness: h.id })}
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-[10px] border border-solid border-rule">
        <table className="w-full min-w-[820px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-paper text-left">
              <th scope="col" className={thClass}>Provider</th>
              <th scope="col" className={thClass}>Model</th>
              <th scope="col" className={thClass}>Status</th>
              <th scope="col" className={thClass}>Default</th>
              <th scope="col" className={thClass}>Key</th>
              <th scope="col" className={cx(thClass, 'text-right')}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p: any, i: number) => {
              const canDefault = p.usable && !p.failed;
              const open = editing === p.id;
              const last = i === rows.length - 1;

              return (
                <Fragment key={p.id}>
                  <tr className={cx(!(last && !open) && 'border-b border-rule2', p.failed && 'bg-[#FFFCFB]', open && 'bg-paper !border-b-0')} data-testid={`foldo-admin-provider-${p.id}`}>
                    <th scope="row" className="whitespace-nowrap px-[14px] py-[10px] text-left font-semibold">
                      {p.name}
                      {p.reserve && <span className="font-normal text-pencil"> · reserve</span>}
                    </th>
                    <td className="px-[14px] py-[10px] font-mono text-[12px] text-ink2">{p.model || '—'}</td>
                    <td className="px-[14px] py-[10px]">
                      <ProviderStatus p={p} now={d.now} />
                    </td>
                    <td className="px-[14px] py-[10px]">
                      <label className="relative inline-flex items-center gap-[6px] text-[13px]">
                        <input
                          type="radio"
                          name={`a-default-${p.id}`}
                          checked={p.isDefault}
                          disabled={!canDefault || busy('set-default')}
                          onChange={() => post({ intent: 'set-default', id: p.id })}
                          className="m-0 h-4 w-4" style={{ accentColor: "#16140F" }}
                        />
                        {p.isDefault ? (
                          'Default'
                        ) : (
                          <span className={srOnly}>
                            {canDefault ? `Make ${p.name} the default` : !p.enabled ? `${p.name} is disabled` : p.keySource === 'none' ? `${p.name} has no key` : `${p.name} can't be default until its test passes`}
                          </span>
                        )}
                      </label>
                    </td>
                    <td className="whitespace-nowrap px-[14px] py-[10px] font-mono text-[12px] text-ink2">
                      {p.last4 ? (
                        <>
                          ••••{p.last4}{' '}
                          <span className="text-pencil">
                            {p.keySource === 'admin' ? 'stored' : 'env'}
                            {p.moreKeys > 0 && ` +${p.moreKeys}`}
                          </span>
                        </>
                      ) : (
                        <span className="font-sans text-[13px] text-pencil">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-[14px] py-2 text-right">
                      <span className="inline-flex gap-[6px]">
                        {p.keySource === 'none' ? (
                          <button type="button" className={btn} aria-expanded={open} onClick={() => setEditing(open ? null : p.id)}>
                            Add key
                          </button>
                        ) : (
                          <>
                            {p.enabled ? (
                              <button
                                type="button"
                                className={btn}
                                aria-busy={busy('test-provider', p.id)}
                                disabled={busy('test-provider', p.id)}
                                onClick={() => post({ intent: 'test-provider', id: p.id })}
                              >
                                {busy('test-provider', p.id) && <Icon.Spinner size={14} />}
                                {p.failed ? 'Test again' : 'Test'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className={btn}
                                aria-busy={busy('provider-enable', p.id)}
                                disabled={busy('provider-enable', p.id)}
                                onClick={() => post({ intent: 'provider-enable', id: p.id })}
                              >
                                Enable
                              </button>
                            )}
                            <button type="button" className={cx(btn, open && '!border-ink !bg-wash')} aria-expanded={open} onClick={() => setEditing(open ? null : p.id)}>
                              {p.failed ? 'Replace key' : 'Edit'}
                            </button>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                  {open && (
                    <tr className={cx('bg-paper', !last && 'border-b border-rule2')}>
                      <td colSpan={6} className="px-[14px] pb-3">
                        <ProviderEditor p={p} d={d} busy={busy} onClose={() => setEditing(null)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <Form method="post" preventScrollReset className="grid grid-cols-[repeat(auto-fit,minmax(min(170px,100%),1fr))] items-end gap-x-4 gap-y-[14px] border-t border-rule2 pt-[14px]">
        <div className="col-span-full text-[14px] font-semibold">Reply length, failover and concurrency</div>
        <label className="flex flex-col gap-[6px] text-[13px] font-medium">
          Max tokens per reply
          <input className={smallInput} name="max_tokens" type="number" min={256} max={128000} defaultValue={d.controls.max_tokens} />
        </label>
        <label className="flex flex-col gap-[6px] text-[13px] font-medium">
          Continuations when cut off
          <input className={smallInput} name="max_segments" type="number" min={1} max={8} defaultValue={d.controls.max_segments} />
        </label>
        <label className="flex flex-col gap-[6px] text-[13px] font-medium">
          Builds at once per login
          <input className={smallInput} name="max_user_streams" type="number" min={1} max={10} defaultValue={d.controls.max_user_streams} />
        </label>
        <label className="flex flex-col gap-[6px] text-[13px] font-medium">
          Fallback model
          <select className={cx(smallInput, 'px-[10px] font-sans')} name="fallback_provider" defaultValue={d.controls.fallback_provider}>
            <option value="">None</option>
            {d.providers
              .filter((p: any) => p.usable)
              .map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.label === p.name ? p.model : p.label}
                </option>
              ))}
          </select>
        </label>
        <div className="flex justify-end">
          <button name="intent" value="save-limits" className="btn-secondary btn-md" aria-busy={busy('save-limits')} disabled={busy('save-limits')}>
            Save limits
          </button>
        </div>
        <details className="col-span-full text-[13px] text-ink2">
          <summary className="cursor-pointer select-none text-pencil hover:text-ink">Reasoning effort and spend estimate</summary>
          <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-x-4 gap-y-3">
            <label className="flex flex-col gap-[6px] font-medium text-ink">
              Reasoning effort (other OpenRouter models; a harness sets its own)
              <select className={cx(smallInput, 'px-[10px] font-sans')} name="reasoning_effort" defaultValue={d.controls.reasoning_effort}>
                {(d.controls.reasoning_levels as string[]).map((l) => (
                  <option key={l} value={l}>
                    {l === 'default' ? "default (model's own)" : l}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-[6px] font-medium text-ink">
              Est. cost per message (USD, for the spend estimate)
              <input className={smallInput} name="cost_per_message" type="number" step="0.001" min={0} defaultValue={d.controls.cost_per_message} />
            </label>
          </div>
        </details>
      </Form>
    </section>
  );
}

function EventSettings({ d, busy }: { d: any; busy: Busy }) {
  const st = d.settings;
  const [signupsPick, setSignupsPick] = useState<boolean | null>(null);
  const signups: boolean = signupsPick ?? st.signups_open;
  /*
   * null = untouched: the switch shows the live setting (the page revalidates every 10 s) and the form leaves event_mode
   * out, so saving the announcement from a console opened before another organizer flipped the mode never flips it back
   */
  const [eventPick, setEventPick] = useState<boolean | null>(null);
  const eventOn: boolean = eventPick ?? st.event_mode;

  useEffect(() => setEventPick(null), [st.event_mode]);
  useEffect(() => setSignupsPick(null), [st.signups_open]);

  return (
    <section id="event" aria-labelledby="a-event" className={cx(cardClass, 'gap-4')}>
      <SectionHead id="a-event" title="Event & limits">
        <span className="text-[13px] text-pencil">Changes apply to the next message each team sends.</span>
      </SectionHead>
      <Form
        method="post"
        preventScrollReset
        onReset={() => {
          setSignupsPick(null);
          setEventPick(null);
        }}
        className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-x-5 gap-y-4"
      >
        {signupsPick !== null && <input type="hidden" name="signups_open" value={signupsPick ? 'on' : ''} />}
        {eventPick !== null && <input type="hidden" name="event_mode" value={eventPick ? 'on' : ''} />}
        <div className="col-span-full flex items-center justify-between gap-4 rounded-[10px] border border-rule2 bg-paper px-4 py-3" data-testid="foldo-admin-event-mode">
          <div className="flex min-w-0 flex-col gap-[2px]">
            <span id="a-evmode-l" className="input-label">
              Event mode
            </span>
            <span className="input-help">On shows the event bar, tracks, team wording and the code of conduct. Off is the everyday platform.</span>
          </div>
          <Switch on={eventOn} label="a-evmode-l" onClick={() => setEventPick(!eventOn)} />
        </div>
        <div className="flex flex-col gap-[6px]">
          <label htmlFor="a-ev-name" className="input-label">
            Event name
          </label>
          <input id="a-ev-name" name="event_name" className="input" defaultValue={st.event_name} placeholder="Spring Hack 2026" maxLength={80} />
        </div>
        <div className="flex flex-col gap-[6px]">
          <label htmlFor="a-ev-end" className="input-label">
            Ends at
          </label>
          <input id="a-ev-end" name="event_ends_at" className={monoInput} defaultValue={st.event_ends_at} placeholder="2026-10-11T23:00:00Z" aria-describedby="a-ev-end-h" />
          <span id="a-ev-end-h" className="input-help">
            Shows the countdown in every header.
          </span>
        </div>
        <div className="flex flex-col gap-[6px]">
          <label htmlFor="a-ev-code" className="input-label">
            Invite code
          </label>
          <input id="a-ev-code" name="invite_code" className={monoInput} defaultValue={st.invite_code} autoComplete="off" maxLength={60} aria-describedby="a-ev-code-h" />
          <span id="a-ev-code-h" className="input-help">
            Leave blank for open sign-up.
          </span>
        </div>
        <div className="flex flex-col gap-[6px]">
          <label htmlFor="a-ev-team" className="input-label">
            Daily messages per team
          </label>
          <input id="a-ev-team" name="per_user_limit" type="number" min={0} className={monoInput} defaultValue={st.per_user_limit} />
        </div>
        <div className="flex flex-col gap-[6px]">
          <label htmlFor="a-ev-global" className="input-label">
            Global daily cap
          </label>
          <input id="a-ev-global" name="global_limit" type="number" min={0} className={monoInput} defaultValue={st.global_limit} aria-describedby="a-ev-global-h" />
          <span id="a-ev-global-h" className="input-help">
            All teams together. {n(d.stats.messagesToday)} used today.
          </span>
        </div>
        <div className="mt-[30px] flex items-center justify-between gap-4 self-start">
          <span id="a-signups-l" className="input-label">
            Sign-ups open
          </span>
          <Switch on={signups} label="a-signups-l" onClick={() => setSignupsPick(!signups)} />
        </div>
        <div className="col-span-full flex flex-col gap-[6px]">
          <label htmlFor="a-ev-ann" className="input-label">
            Announcement banner
          </label>
          <input id="a-ev-ann" name="announcement" className="input" defaultValue={st.announcement} maxLength={240} placeholder="Demos start at 17:00 in the main hall" />
        </div>
        <div className="col-span-full flex justify-end gap-[10px] border-t border-rule2 pt-[14px]">
          <button type="reset" className="btn-secondary btn-lg">
            Discard
          </button>
          <button name="intent" value="save-settings" className="btn-primary btn-lg" aria-busy={busy('save-settings')} disabled={busy('save-settings')}>
            {busy('save-settings') && <Icon.Spinner />}
            Save settings
          </button>
        </div>
      </Form>
    </section>
  );
}

// who runs Foldo, shown on /privacy, /terms and /pricing; blank fields render as marked placeholders there
function CompanySettings({ d, busy }: { d: any; busy: Busy }) {
  const legal = d.legal as { name: string; email: string; country: string };

  return (
    <section id="company" aria-labelledby="a-company" className={cx(cardClass, 'gap-4')}>
      <SectionHead id="a-company" title="Company & contact">
        <span className="text-[13px] text-pencil">Shown on Pricing, Privacy and Terms. Blank shows a placeholder.</span>
      </SectionHead>
      <Form method="post" preventScrollReset className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-x-5 gap-y-4">
        <div className="flex flex-col gap-[6px]">
          <label htmlFor="a-legal-name" className="input-label">
            Legal name
          </label>
          <input id="a-legal-name" name="legal_name" className="input" defaultValue={legal.name} maxLength={120} placeholder="Foldo Ltd" />
        </div>
        <div className="flex flex-col gap-[6px]">
          <label htmlFor="a-legal-email" className="input-label">
            Contact email
          </label>
          <input id="a-legal-email" name="contact_email" type="email" className="input" defaultValue={legal.email} maxLength={254} placeholder="hello@example.com" />
        </div>
        <div className="flex flex-col gap-[6px]">
          <label htmlFor="a-legal-country" className="input-label">
            Governing law (country)
          </label>
          <input id="a-legal-country" name="legal_country" className="input" defaultValue={legal.country} maxLength={80} placeholder="England and Wales" />
        </div>
        <div className="col-span-full flex flex-wrap items-center justify-between gap-[10px] border-t border-rule2 pt-[14px]">
          <p className="m-0 text-[13px] text-ink2" data-testid="foldo-admin-waitlist">
            Pro waitlist: <span className="font-mono">{n(d.waitlist)}</span> {d.waitlist === 1 ? 'email' : 'emails'}
            {d.waitlist > 0 && (
              <>
                {' · '}
                <a href="/api/admin-waitlist" download className="font-medium text-ink underline underline-offset-3">
                  Download CSV
                </a>
              </>
            )}
          </p>
          <button name="intent" value="save-legal" className="btn-primary btn-lg" aria-busy={busy('save-legal')} disabled={busy('save-legal')}>
            {busy('save-legal') && <Icon.Spinner />}
            Save details
          </button>
        </div>
      </Form>
    </section>
  );
}

const PAGE = 8;

function Teams({ d, busy, temp }: { d: any; busy: Busy; temp?: { email: string; password: string } }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'active' | 'new'>('active');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [extra, setExtra] = useState('20');
  const [confirmReset, setConfirmReset] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (d.users as any[]).filter((u) => !needle || `${u.name} ${u.email}`.toLowerCase().includes(needle));

    return list.sort((a, b) => (sort === 'new' ? b.created - a.created : b.today - a.today || (b.lastActive ?? 0) - (a.lastActive ?? 0)));
  }, [d.users, q, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const at = Math.min(page, pages - 1);
  const rows = filtered.slice(at * PAGE, at * PAGE + PAGE);
  const btn = cx('btn-secondary', tableBtn);
  const extraN = Math.floor(Number(extra));
  const extraOk = extraN >= 1 && extraN <= 200;

  return (
    <section id="teams" aria-labelledby="a-teams" className={cx(cardClass, 'gap-4')}>
      <SectionHead
        id="a-teams"
        align="center"
        title={
          <>
            Teams <span className="font-mono text-[14px] text-pencil">{d.stats.teams}</span>
          </>
        }
      >
        <div className="relative flex flex-wrap items-center gap-2">
          <label htmlFor="a-team-q" className={srOnly}>
            Search teams
          </label>
          <input
            id="a-team-q"
            type="search"
            placeholder="Search teams or email"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            className="h-[36px] w-[240px] max-w-full rounded-[8px] border border-solid border-field bg-sheet px-3 text-[14px] text-ink outline-none placeholder:text-placeholder focus:border-ink focus:shadow-[0_0_0_3px_rgba(255,194,26,.45)]"
          />
          <div role="group" aria-label="Sort teams" className="seg">
            {(
              [
                ['active', 'Most active'],
                ['new', 'Newest'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={sort === k}
                className="seg-item h-[30px] px-[10px]"
                onClick={() => {
                  setSort(k);
                  setPage(0);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </SectionHead>
      {temp && (
        <div role="status" className="banner-info">
          <Icon.Info className="mt-[2px] flex-none text-info" />
          <p className="m-0 flex-1">
            <strong className="font-semibold">Temporary password for {temp.email}:</strong> <code className="rounded-[4px] border border-solid border-rule2 bg-codebg px-1 font-mono text-[12px]">{temp.password}</code>. It is shown once;
            the team can change it in Settings.
          </p>
        </div>
      )}
      <div className="overflow-x-auto rounded-[10px] border border-solid border-rule">
        <table className="w-full min-w-[860px] border-collapse text-[13px]" data-testid="foldo-admin-teams">
          <thead>
            <tr className="bg-paper text-left">
              <th scope="col" className={thClass}>Team</th>
              <th scope="col" className={thClass}>Email</th>
              <th scope="col" className={thClass}>Messages today</th>
              <th scope="col" className={cx(thClass, 'text-right')}>Projects</th>
              <th scope="col" className={thClass}>Last active</th>
              <th scope="col" className={cx(thClass, 'text-right')}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-[14px] py-6 text-center text-pencil">
                  {q ? 'No team matches that search.' : 'No teams have signed up yet.'}
                </td>
              </tr>
            )}
            {rows.map((u: any, i: number) => {
              const expanded = open === u.id;
              const full = u.limit > 0 && u.today >= u.limit;
              const off = Boolean(u.disabled);
              const last = i === rows.length - 1;

              return (
                <Fragment key={u.id}>
                  <tr className={cx(expanded ? 'bg-paper' : !last && 'border-b border-rule2')} data-testid="foldo-admin-team">
                    <th scope="row" className={cx('whitespace-nowrap px-[14px] py-[10px] text-left font-semibold', off && 'text-pencil')}>
                      {u.name || u.email.split('@')[0]}
                      {off && <span className="pill-error ml-[6px] h-[22px] px-2">Disabled</span>}
                    </th>
                    <td className={cx('px-[14px] py-[10px]', off ? 'text-pencil' : 'text-ink2')}>{u.email}</td>
                    <td className="px-[14px] py-[10px]">
                      <span className={cx('flex items-center gap-[10px]', off && 'text-pencil')}>
                        <Meter pct={(u.today / Math.max(1, u.limit)) * 100} tone={off ? 'muted' : full ? 'warning' : 'ink'} />
                        <span className="whitespace-nowrap font-mono text-[12px]">
                          {u.today}/{u.limit}
                        </span>
                        {full && !off && <span className="pill-warning h-[22px] px-2">Limit reached</span>}
                      </span>
                    </td>
                    <td className={cx('px-[14px] py-[10px] text-right tabular-nums', off && 'text-pencil')}>{u.projects}</td>
                    <td className={cx('whitespace-nowrap px-[14px] py-[10px]', off ? 'text-pencil' : 'text-ink2')}>{ago(u.lastActive, d.now)}</td>
                    <td className="whitespace-nowrap px-[14px] py-2 text-right">
                      <Form method="post" preventScrollReset className="inline-flex gap-[6px]" onSubmit={() => setConfirmReset(null)}>
                        <input type="hidden" name="id" value={u.id} />
                        {confirmReset === u.id ? (
                          <>
                            <button type="button" className={cx('btn-ghost', tableBtn)} onClick={() => setConfirmReset(null)}>
                              Cancel
                            </button>
                            <button name="intent" value="user-reset" className={cx('btn-destructive', tableBtn)} disabled={busy('user-reset', u.id)} autoFocus>
                              Confirm password reset
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className={cx(btn, 'w-[32px] px-0')}
                              onClick={() => setConfirmReset(u.id)}
                              aria-label={`Reset password for ${u.name || u.email}`}
                              title="Reset password"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <circle cx="8" cy="15" r="4" />
                                <path d="M11 12l9-9M17 6l3 3M14 9l2 2" />
                              </svg>
                            </button>
                            {off ? (
                              <button name="intent" value="user-toggle" className={btn} disabled={busy('user-toggle', u.id)}>
                                Enable
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className={cx(btn, expanded && '!border-ink !bg-wash')}
                                  aria-expanded={expanded}
                                  aria-controls={`a-adj-${u.id}`}
                                  onClick={() => setOpen(expanded ? null : u.id)}
                                >
                                  Adjust quota
                                </button>
                                <button name="intent" value="user-toggle" className={cx('btn-danger', tableBtn)} disabled={busy('user-toggle', u.id)}>
                                  Disable
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </Form>
                    </td>
                  </tr>
                  {expanded && (
                    <tr id={`a-adj-${u.id}`} className={cx('bg-paper', !last && 'border-b border-rule2')}>
                      <td colSpan={6} className="px-[14px] pb-3">
                        <Form method="post" preventScrollReset className="flex w-0 min-w-full items-end gap-3 rounded-[10px] border border-solid border-rule bg-sheet px-[14px] py-3">
                          <input type="hidden" name="id" value={u.id} />
                          <div className="flex flex-col gap-1">
                            <label htmlFor={`a-adj-n-${u.id}`} className="text-[13px] font-medium">
                              Extra messages for today
                            </label>
                            <input
                              id={`a-adj-n-${u.id}`}
                              name="extra"
                              type="number"
                              min={0}
                              max={200}
                              value={extra}
                              onChange={(e) => setExtra(e.target.value)}
                              autoFocus
                              className="h-[36px] w-[120px] rounded-[8px] border border-solid border-field bg-sheet px-[10px] font-mono text-[14px] text-ink outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(255,194,26,.45)]"
                            />
                          </div>
                          <button name="intent" value="quota-add" className="btn-dark h-[36px] rounded-[7px] px-3 text-[13px]" disabled={!extraOk || busy('quota-add', u.id)} aria-busy={busy('quota-add', u.id)}>
                            Add {extraOk ? extraN : ''} for today
                          </button>
                          <button name="intent" value="quota-reset" className="btn-secondary h-[36px] rounded-[7px] px-3 text-[13px]" disabled={busy('quota-reset', u.id)}>
                            Reset today’s count
                          </button>
                          <span
                            className="min-w-0 flex-1 truncate pb-[9px] text-[13px] text-pencil"
                            title="Resets at midnight UTC; the team sees the new count straight away."
                          >
                            {extraOk ? `New limit ${u.limit + extraN} today. ` : ''}Resets at midnight UTC; the team sees the new count straight away.
                          </span>
                        </Form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-pencil">
        <span>
          {filtered.length === 0
            ? 'Showing 0 teams'
            : at === 0
              ? `Showing ${rows.length} of ${filtered.length} teams`
              : `Showing ${at * PAGE + 1}–${at * PAGE + rows.length} of ${filtered.length} teams`}
        </span>
        <div className="flex gap-2">
          <button type="button" className={btn} disabled={at === 0} onClick={() => setPage(at - 1)}>
            Previous
          </button>
          <button type="button" className={btn} disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

function Projects({ d }: { d: any }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    return (d.projects as any[]).filter((p) => !needle || `${p.name} ${p.description ?? ''}`.toLowerCase().includes(needle));
  }, [d.projects, q]);

  const pages = Math.max(1, Math.ceil(filtered.length / PROJECTS_PAGE));
  const at = Math.min(page, pages - 1);
  const rows = filtered.slice(at * PROJECTS_PAGE, at * PROJECTS_PAGE + PROJECTS_PAGE);

  return (
    <section id="projects" aria-labelledby="a-projects" className={cx(cardClass, 'gap-4')}>
      <SectionHead
        id="a-projects"
        align="center"
        title={
          <>
            Projects <span className="font-mono text-[14px] text-pencil">{d.projects.length}</span>
          </>
        }
      >
        <label className="relative">
          <span className={srOnly}>Search projects</span>
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="Search projects or teams"
            className="input h-[36px] w-[260px] text-[13px] lt-md:w-full"
          />
        </label>
      </SectionHead>
      <p className="m-0 text-[13px] text-pencil">Every team’s work, shared or not. Open runs it read-only; nothing changes for the team.</p>
      <div className="overflow-x-auto rounded-[10px] border border-solid border-rule">
        <table className="w-full min-w-[720px] border-collapse text-[13px]" data-testid="foldo-admin-projects">
          <thead>
            <tr className="bg-paper text-left">
              <th scope="col" className={thClass}>Project</th>
              <th scope="col" className={thClass}>Team</th>
              <th scope="col" className={thClass}>Status</th>
              <th scope="col" className={thClass}>Edited</th>
              <th scope="col" className={cx(thClass, 'text-right')}>Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-[14px] py-6 text-center text-pencil">
                  {q ? 'No project matches that search.' : 'No projects yet.'}
                </td>
              </tr>
            )}
            {rows.map((p: any, i: number) => (
              <tr key={p.id} className={cx(i !== rows.length - 1 && 'border-b border-rule2')} data-testid="foldo-admin-project">
                <th scope="row" className="max-w-[320px] truncate px-[14px] py-[10px] text-left font-semibold">
                  {p.description || 'Untitled'}
                </th>
                <td className="px-[14px] py-[10px] text-ink2">{p.name}</td>
                <td className="whitespace-nowrap px-[14px] py-[10px] text-ink2">{p.listed ? 'In the gallery' : p.shared ? 'Link shared' : 'Private'}</td>
                <td className="whitespace-nowrap px-[14px] py-[10px] text-ink2">{ago(p.updated, d.now)}</td>
                <td className="whitespace-nowrap px-[14px] py-2 text-right">
                  <a
                    href={`/admin/project/${p.id}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${p.description || 'Untitled'} by ${p.name}`}
                    className={cx('btn-secondary no-underline', tableBtn)}
                  >
                    Open
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between text-[13px] text-pencil">
          <span>
            Showing {at * PROJECTS_PAGE + 1}–{at * PROJECTS_PAGE + rows.length} of {filtered.length} projects
          </span>
          <span className="flex gap-[6px]">
            <button type="button" className={cx('btn-secondary', tableBtn)} disabled={at === 0} onClick={() => setPage(at - 1)}>
              Previous
            </button>
            <button type="button" className={cx('btn-secondary', tableBtn)} disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>
              Next
            </button>
          </span>
        </div>
      )}
    </section>
  );
}

const PROJECTS_PAGE = 15;

function Thumb({ g, templates }: { g: any; templates: { id: string; icon: string }[] }) {
  if (!g.listed) {
    return <span aria-hidden="true" className="h-[44px] w-[64px] flex-none rounded-[6px] border border-dashed border-field bg-wash" />;
  }

  const icon = templates.find((t) => t.id === g.template)?.icon;

  // same artwork as the gallery card (AI thumbnail, else template icon, paper fallback)
  return (
    <span aria-hidden="true" className="block h-[44px] w-[64px] flex-none overflow-hidden rounded-[6px] border border-solid border-rule bg-paper">
      {g.previewAt && g.shareId ? (
        <PreviewFrame shareId={g.shareId} version={g.previewAt} scale={0.25} />
      ) : (
        <img {...iconProps(icon)} alt="" width={64} height={44} loading="lazy" className="block h-full w-full object-cover" />
      )}
    </span>
  );
}

function Gallery({ d, busy }: { d: any; busy: Busy }) {
  const listed = d.gallery.filter((g: any) => g.listed).length;
  const hidden = d.gallery.length - listed;

  return (
    <section id="gallery" aria-labelledby="a-gal" className={cx(cardClass, 'min-w-0 gap-3')}>
      <SectionHead id="a-gal" title="Gallery moderation">
        <span className="font-mono text-[12px] text-pencil">
          {listed} listed · {hidden} hidden
        </span>
      </SectionHead>
      {d.gallery.length === 0 ? (
        <p className="m-0 border-t border-rule2 pt-3 text-[13px] text-pencil">Nothing is listed in the gallery yet.</p>
      ) : (
        <ul className="m-0 flex max-h-[520px] list-none flex-col overflow-y-auto p-0" data-testid="foldo-admin-gallery">
          {d.gallery.map((g: any, i: number) => {
            const title = g.description || 'Untitled';

            return (
              <li key={g.id} className={cx('flex items-center gap-3 border-t border-rule2 py-[10px]', i === d.gallery.length - 1 && 'border-b')}>
                <Thumb g={g} templates={d.templates} />
                <div className="flex min-w-0 flex-1 flex-col">
                  {g.listed && g.shareId ? (
                    <a href={`/p/${g.shareId}`} className="truncate text-[14px] font-semibold text-ink no-underline hover:underline">
                      {title}
                    </a>
                  ) : (
                    <span className="truncate text-[14px] font-semibold text-pencil">{title}</span>
                  )}
                  <span className="text-[13px] text-pencil">
                    {g.name}
                    {!g.listed && g.hiddenAt && ` · hidden ${ago(g.hiddenAt, d.now)}`}
                  </span>
                </div>
                {g.listed ? (
                  <span className="relative inline-flex items-center gap-1 text-[13px] tabular-nums text-ink2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
                    </svg>
                    {g.likes}
                    <span className={srOnly}> likes</span>
                  </span>
                ) : (
                  <span className="pill border-rule bg-paper h-[22px] px-2 text-ink2">Hidden</span>
                )}
                <Form method="post" preventScrollReset>
                  <input type="hidden" name="id" value={g.id} />
                  {g.listed ? (
                    <button name="intent" value="gallery-hide" aria-label={`Hide ${title} from the gallery`} className={cx('btn-danger', tableBtn)} disabled={busy('gallery-hide', g.id)}>
                      Hide
                    </button>
                  ) : (
                    <button name="intent" value="gallery-show" aria-label={`Show ${title} in the gallery again`} className={cx('btn-secondary', tableBtn)} disabled={busy('gallery-show', g.id)}>
                      Show
                    </button>
                  )}
                </Form>
              </li>
            );
          })}
        </ul>
      )}
      <a href="/gallery" className="self-start text-[13px] font-medium text-ink2 underline decoration-field underline-offset-3 hover:text-ink">
        View all {listed} in the gallery
      </a>
    </section>
  );
}

function Backups({ d, busy, post }: { d: any; busy: Busy; post: (f: Record<string, string>) => void }) {
  const every = d.backupEveryMin;
  const status = !every
    ? 'Off on this server (BACKUP_INTERVAL_MIN is 0)'
    : d.backupsPaused
      ? 'Paused · resume them before the event starts'
      : `Every ${every} min on the volume · ${d.lastBackupAt ? `last one ${ago(d.lastBackupAt, d.now)}` : 'the first one runs a minute after boot'}`;

  return (
    <section id="backups" aria-labelledby="a-bak" className={cx(cardClass, 'min-w-0 gap-3')}>
      <SectionHead id="a-bak" title="Backups" align="center">
        <Form method="post" preventScrollReset>
          <button name="intent" value="backup-now" className="btn-secondary h-[36px] gap-[6px] rounded-[7px] px-3 text-[13px]" aria-busy={busy('backup-now')} disabled={busy('backup-now')}>
            {busy('backup-now') ? (
              <Icon.Spinner size={15} />
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="5" rx="1" />
                <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
              </svg>
            )}
            Back up now
          </button>
        </Form>
      </SectionHead>
      <div className="flex items-center justify-between gap-4 border-t border-rule2 py-[10px]">
        <div className="flex flex-col">
          <span id="a-auto-l" className="text-[14px] font-semibold">
            Automatic backups
          </span>
          <span className="text-[13px] text-pencil">{status}</span>
        </div>
        <span data-testid="foldo-admin-backups-toggle" className="contents">
          <Switch on={Boolean(every) && !d.backupsPaused} label="a-auto-l" disabled={!every || busy('toggle-backups')} onClick={() => post({ intent: 'toggle-backups' })} />
        </span>
      </div>
      {d.backups.length === 0 ? (
        <p className="m-0 rounded-[10px] border border-solid border-rule px-[14px] py-3 text-[13px] text-pencil">No backups yet. Back up now writes the first one.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col overflow-hidden rounded-[10px] border border-solid border-rule p-0" data-testid="foldo-backups">
          {d.backups.map((b: any, i: number) => (
            <li key={b.name} className={cx('flex items-center gap-3 px-[14px] py-[10px]', i < d.backups.length - 1 && 'border-b border-rule2')}>
              <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{b.name}</span>
              <span className="whitespace-nowrap text-[13px] tabular-nums text-pencil">{(b.bytes / 1e6).toFixed(1)} MB</span>
              <a href={`/api/admin-backup?file=${b.name}`} download className="relative text-[13px] font-medium text-ink underline underline-offset-3">
                Download<span className={srOnly}> {b.name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="m-0 text-[13px] text-pencil [text-wrap:pretty]">
        To restore, set <code className="rounded-[4px] border border-solid border-rule2 bg-codebg px-1 font-mono text-[12px] text-ink">RESTORE_BACKUP</code> to a file name
        above and redeploy. See the runbook.
      </p>
    </section>
  );
}
