import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { db } from './db';

// ---------- settings (admin-editable, env as fallback) ----------

export function getSetting(key: string, fallback = ''): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;

  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string) {
  if (value === '') {
    db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  } else {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(
      key,
      value,
    );
  }
}

const num = (v: string, d: number) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : d);

export const perUserLimit = () => num(getSetting('per_user_limit'), num(process.env.DAILY_MESSAGE_LIMIT ?? '', 50));
export const globalLimit = () => num(getSetting('global_limit'), num(process.env.GLOBAL_DAILY_LIMIT ?? '', 5000));
export const inviteCode = () => getSetting('invite_code', process.env.INVITE_CODE ?? '');
export const signupsOpen = () => getSetting('signups_open', '1') !== '0';

// output length: one model reply can be up to maxTokens, continued up to maxSegments times
// (16000 is safe across DeepSeek/GLM-class caps; raise per model in /admin, e.g. 32000 for gpt-4.1)
export const defaultMaxTokens = () => num(getSetting('max_tokens'), 16000);
export const maxSegments = () => Math.max(1, num(getSetting('max_segments'), 3));
export const maxUserStreams = () => Math.max(1, num(getSetting('max_user_streams'), 2));
export const costPerMessage = () => num(getSetting('cost_per_message'), 0.01);
export const fallbackProviderId = () => getSetting('fallback_provider');

export function pauseState() {
  return { paused: getSetting('paused') === '1', message: getSetting('pause_message') };
}

export interface EventInfo {
  name: string;
  endsAt: number | null;
  announcement: string;
}

export function getEvent(): EventInfo | null {
  const name = getSetting('event_name', process.env.EVENT_NAME ?? '');
  const announcement = getSetting('announcement');

  if (!name && !announcement) {
    return null;
  }

  const ends = Date.parse(getSetting('event_ends_at', process.env.EVENT_ENDS_AT ?? ''));

  return { name, endsAt: Number.isNaN(ends) ? null : ends, announcement };
}

export const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

// ---------- encryption for provider keys stored in the DB ----------

const secret = process.env.APP_SECRET;
export const canStoreKeys = Boolean(secret) || process.env.NODE_ENV !== 'production';

if (!secret && process.env.NODE_ENV === 'production') {
  console.warn('APP_SECRET is not set: provider keys can only come from environment variables.');
}

const aesKey = () => scryptSync(secret || 'foldo-dev-secret', 'foldo-provider-keys', 32);

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', aesKey(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);

  return [iv, c.getAuthTag(), ct].map((b) => b.toString('hex')).join(':');
}

export function decrypt(blob: string): string | undefined {
  try {
    const [iv, tag, ct] = blob.split(':').map((h) => Buffer.from(h, 'hex'));
    const d = createDecipheriv('aes-256-gcm', aesKey(), iv);
    d.setAuthTag(tag);

    return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
  } catch {
    return undefined; // APP_SECRET changed: treat as no key rather than crash
  }
}

// ---------- model providers ----------
// Everything below speaks the OpenAI chat-completions protocol. Base URLs and model ids are defaults the admin
// can override in /admin without a redeploy (the Chinese-provider defaults in particular should be verified).

export const CATALOG = [
  // OpenRouter fronts many models behind one key with pooled rate limits, which suits many teams at once
  { id: 'openrouter', label: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4.1-nano', env: 'OPENROUTER_API_KEY' },
  { id: 'deepseek', label: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat', env: 'DEEPSEEK_API_KEY' },
  { id: 'openai', label: 'OpenAI', baseURL: 'https://api.openai.com/v1', model: 'gpt-4.1-nano', env: 'OPENAI_API_KEY' },
  { id: 'mimo', label: 'Xiaomi MiMo', baseURL: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2-flash', env: 'MIMO_API_KEY' },
  { id: 'qwen', label: 'Alibaba Qwen', baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', model: 'qwen3-coder-plus', env: 'QWEN_API_KEY' },
  { id: 'moonshot', label: 'Moonshot Kimi', baseURL: 'https://api.moonshot.ai/v1', model: 'kimi-k2-0905-preview', env: 'MOONSHOT_API_KEY' },
  { id: 'zhipu', label: 'Zhipu GLM', baseURL: 'https://api.z.ai/api/paas/v4', model: 'glm-4.6', env: 'ZHIPU_API_KEY' },
  { id: 'minimax', label: 'MiniMax', baseURL: 'https://api.minimax.io/v1', model: 'MiniMax-M2', env: 'MINIMAX_API_KEY' },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', baseURL: '', model: '', env: 'CUSTOM_API_KEY' },
] as const;

export interface Provider {
  id: string;
  label: string;
  baseURL: string;
  model: string;
  key?: string;
  maxTokens?: number;
  keySource: 'admin' | 'env' | 'none';
  enabled: boolean;
}

export function listProviders(): Provider[] {
  const rows = new Map((db.prepare('SELECT * FROM providers').all() as any[]).map((r) => [r.id, r]));

  return CATALOG.map((c) => {
    const row = rows.get(c.id);
    const stored = row?.key_enc ? decrypt(row.key_enc) : undefined;
    const envKey = process.env[c.env] || undefined;
    const key = stored || envKey;

    return {
      id: c.id,
      label: c.label,
      // LLM_BASE_URL is a global override for proxies and tests
      baseURL: process.env.LLM_BASE_URL || row?.base_url || c.baseURL,
      model: row?.model || (c.id === (process.env.LLM_PROVIDER || '') && process.env.LLM_MODEL) || c.model,
      key,
      maxTokens: row?.max_tokens || undefined,
      keySource: stored ? 'admin' : envKey ? 'env' : 'none',
      enabled: row ? row.enabled === 1 : true,
    };
  });
}

export const usableProviders = () => listProviders().filter((p) => p.key && p.enabled && p.baseURL && p.model);

export function defaultProviderId(): string | undefined {
  const usable = usableProviders();
  const wanted = getSetting('default_provider') || process.env.LLM_PROVIDER;

  return usable.find((p) => p.id === wanted)?.id ?? usable[0]?.id;
}

// the admin-chosen backup model, only if it is usable and not the one that just failed
export function fallbackFor(primaryId: string): Provider | undefined {
  const id = fallbackProviderId();

  return id && id !== primaryId ? usableProviders().find((p) => p.id === id) : undefined;
}

export function resolveProvider(requested?: string): Provider | undefined {
  const usable = usableProviders();

  return usable.find((p) => p.id === requested) ?? usable.find((p) => p.id === defaultProviderId());
}

// safe to send to the browser: no keys, no base URLs
export function publicModels() {
  return { paused: pauseState(), models: usableProviders().map((p) => ({ id: p.id, label: p.label })), defaultModel: defaultProviderId() };
}
