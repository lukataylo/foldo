import { createCookie, redirect } from '@remix-run/node';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { adminEmails, getEvent, globalLimit, perUserLimit, publicModels } from './config';
import { templateIndex } from './templates';
import { db, today } from './db';

const DAY = 86_400_000;
const sessionCookie = createCookie('foldo_session', {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 86_400,
  path: '/',
});

// async scrypt runs on the libuv threadpool; scryptSync would freeze every request while a team signs in
const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export interface User {
  id: string;
  email: string;
  name: string;
  admin: boolean;
}

const toUser = (row: any): User => ({
  id: row.id,
  email: row.email,
  name: row.name || row.email.split('@')[0],
  admin: row.role === 'admin' || adminEmails().includes(row.email),
});

async function hashPassword(password: string) {
  const salt = randomBytes(16);

  return `${salt.toString('hex')}:${(await scryptAsync(password, salt, 64)).toString('hex')}`;
}

export async function register(name: string, email: string, password: string): Promise<User | 'exists'> {
  const id = randomUUID();
  const hashed = await hashPassword(password);

  try {
    db.prepare('INSERT INTO users (id, email, name, password, created) VALUES (?, ?, ?, ?, ?)').run(
      id,
      email,
      name,
      hashed,
      Date.now(),
    );
  } catch {
    return 'exists';
  }

  return toUser({ id, email, name, role: 'user' });
}

// unknown emails verify against a dummy hash so response time doesn't reveal which emails exist
const DUMMY = `${'00'.repeat(16)}:${'00'.repeat(64)}`;

async function checkPassword(stored: string, password: string) {
  const [salt, key] = stored.split(':');

  return timingSafeEqual(await scryptAsync(password, Buffer.from(salt, 'hex'), 64), Buffer.from(key, 'hex'));
}

export async function verifyLogin(email: string, password: string): Promise<User | 'disabled' | undefined> {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
  const ok = await checkPassword(row?.password ?? DUMMY, password);

  if (!row || !ok) {
    return undefined;
  }

  return row.disabled ? 'disabled' : toUser(row);
}

export async function verifyPasswordFor(userId: string, password: string) {
  const row = db.prepare('SELECT password FROM users WHERE id = ?').get(userId) as any;

  return Boolean(row) && (await checkPassword(row.password, password));
}

export async function setPassword(userId: string, password: string) {
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(await hashPassword(password), userId);
}

export const endSessions = (userId: string) => db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);

export async function createSession(userId: string) {
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());

  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)').run(
    hash(token),
    userId,
    Date.now() + 30 * DAY,
  );

  return sessionCookie.serialize(token);
}

export async function destroySession(request: Request) {
  const token = await sessionCookie.parse(request.headers.get('Cookie'));

  if (token) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(token));
  }

  return sessionCookie.serialize('', { maxAge: 0 });
}

export async function getUser(request: Request): Promise<User | undefined> {
  const token = await sessionCookie.parse(request.headers.get('Cookie'));

  if (!token) {
    return undefined;
  }

  const row = db
    .prepare(
      'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires > ? AND u.disabled = 0',
    )
    .get(hash(token), Date.now());

  return row ? toUser(row) : undefined;
}

// for fetch() endpoints: answer 401 instead of redirecting to the login page
export async function requireApiUser(request: Request): Promise<User> {
  const user = await getUser(request);

  if (!user) {
    throw new Response(JSON.stringify({ error: 'Sign in to continue' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return user;
}

export async function requireUser(request: Request): Promise<User> {
  const user = await getUser(request);

  if (!user) {
    throw redirect('/login');
  }

  return user;
}

export async function requireAdmin(request: Request): Promise<User> {
  const user = await requireUser(request);

  if (!user.admin) {
    throw new Response('Not found', { status: 404 }); // don't advertise that /admin exists
  }

  return user;
}

// ---------- quota: per user per day, plus a global daily cap that protects the token budget ----------

export const dailyLimit = perUserLimit;

export function remainingQuota(userId: string): number {
  const row = db.prepare('SELECT n FROM usage WHERE user_id = ? AND day = ?').get(userId, today()) as any;

  return Math.max(0, perUserLimit() - (row?.n ?? 0));
}

export const globalUsedToday = () =>
  ((db.prepare('SELECT COALESCE(SUM(n), 0) AS n FROM usage WHERE day = ?').get(today()) as any).n as number) ?? 0;

export function spendQuota(userId: string, provider: string): 'ok' | 'user' | 'global' {
  if (globalUsedToday() >= globalLimit()) {
    return 'global';
  }

  if (remainingQuota(userId) === 0) {
    return 'user';
  }

  const day = today();
  db.prepare('INSERT INTO usage (user_id, day, n) VALUES (?, ?, 1) ON CONFLICT (user_id, day) DO UPDATE SET n = n + 1').run(
    userId,
    day,
  );
  db.prepare(
    'INSERT INTO provider_usage (day, provider, n) VALUES (?, ?, 1) ON CONFLICT (day, provider) DO UPDATE SET n = n + 1',
  ).run(day, provider);

  return 'ok';
}

// a failed generation shouldn't cost a team one of their messages
export function refundQuota(userId: string, provider: string) {
  const day = today();
  db.prepare('UPDATE usage SET n = MAX(0, n - 1) WHERE user_id = ? AND day = ?').run(userId, day);
  db.prepare('UPDATE provider_usage SET n = MAX(0, n - 1) WHERE day = ? AND provider = ?').run(day, provider);
}

// ---------- concurrency: a few generations per login (teams share one), bounded globally ----------

const active = new Map<string, number[]>();
export const activeStreams = () => [...active.values()].reduce((n, v) => n + v.length, 0);
const MAX_STREAMS = Number(process.env.MAX_CONCURRENT_STREAMS || 40);

export function acquireStream(userId: string, perUser: number): (() => void) | 'user' | 'busy' {
  // streams older than 5 minutes are considered dead (client vanished without us noticing)
  const live = (active.get(userId) ?? []).filter((t) => Date.now() - t < 300_000);

  if (live.length >= perUser) {
    return 'user';
  }

  if (activeStreams() >= MAX_STREAMS) {
    return 'busy';
  }

  const token = Date.now() + Math.random();
  active.set(userId, [...live, token]);

  let done = false;

  return () => {
    if (done) {
      return;
    }

    done = true;

    const rest = (active.get(userId) ?? []).filter((t) => t !== token);

    if (rest.length) {
      active.set(userId, rest);
    } else {
      active.delete(userId);
    }
  };
}

// when a fallback model answered instead, attribute the (single) charged message to it
export function moveProviderUsage(from: string, to: string) {
  const day = today();
  db.prepare('UPDATE provider_usage SET n = MAX(0, n - 1) WHERE day = ? AND provider = ?').run(day, from);
  db.prepare(
    'INSERT INTO provider_usage (day, provider, n) VALUES (?, ?, 1) ON CONFLICT (day, provider) DO UPDATE SET n = n + 1',
  ).run(day, to);
}

// ---------- throttling ----------

// ponytail: in-memory sliding window, resets on restart and isn't shared across instances; use Redis if we scale out
const hits = new Map<string, number[]>();

export function throttled(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  recent.push(now);
  hits.set(key, recent);

  if (hits.size > 10_000) {
    for (const [k, v] of hits) {
      if (!v.some((t) => now - t < windowMs)) {
        hits.delete(k);
      }
    }
  }

  return recent.length > max;
}

// Railway's proxy appends the real client IP; earlier entries are client-supplied
export function clientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() || 'local';
}

// ---------- shared loader data (header, event bar, model picker) ----------

export function shell(user?: User) {
  return {
    email: user?.email,
    name: user?.name,
    admin: user?.admin,
    remaining: user ? remainingQuota(user.id) : undefined,
    event: getEvent(),
    templates: templateIndex().templates.map(({ guide, ...rest }) => rest),
    ...publicModels(),
  };
}
