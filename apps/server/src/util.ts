import { nanoid } from 'nanoid';

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}-${nanoid(10)}`;
}

export function newCommitSha(): string {
  // 7-char hex-ish pseudo-sha
  return nanoid(7).toLowerCase().replace(/[^a-z0-9]/g, 'a');
}

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
