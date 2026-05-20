// Thin fetch wrapper with bearer auth + shared error shape.
// Demo auth: the "token" is the userId; the server accepts it as `Bearer <userId>`.

import type { ApiError } from '@foldo/protocol';
import { handleExpiredSession } from '../lib/session';

export const API_BASE =
  (typeof window !== 'undefined' &&
    (window as unknown as { __FOLDO_API__?: string }).__FOLDO_API__) ||
  (import.meta.env.VITE_API_URL as string | undefined) ||
  'http://localhost:4000';

let authToken: string | null = null;
let authUserId: string | null = null;

export function setAuth(userId: string, token: string) {
  authUserId = userId;
  authToken = token;
}

export function getAuth(): { userId: string | null; token: string | null } {
  return { userId: authUserId, token: authToken };
}

export class ApiClientError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  constructor(status: number, body: ApiError) {
    super(body.error || `HTTP ${status}`);
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown;
  signal?: AbortSignal;
  query?: Record<string, string | number | undefined>;
  /** Extra request headers, merged over the defaults. */
  headers?: Record<string, string>;
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const url = new URL(path.startsWith('http') ? path : `${API_BASE}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  // Only declare a JSON content-type when we're actually sending a body —
  // Fastify rejects `Content-Type: application/json` with an empty body, which
  // would otherwise break every body-less request (DELETE, some POSTs).
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (opts.headers) Object.assign(headers, opts.headers);

  const res = await fetch(url.toString(), {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  if (!res.ok) {
    // A 401 on an authenticated request means the stored session is dead —
    // clear it and bounce to /login rather than leaving the app stuck
    // showing logged-in chrome. Auth endpoints (login etc.) 401 legitimately.
    if (res.status === 401 && !path.includes('/api/auth/')) {
      handleExpiredSession();
    }
    let bodyJson: ApiError = { error: res.statusText, code: 'http_error' };
    try {
      bodyJson = (await res.json()) as ApiError;
    } catch {
      /* swallow */
    }
    throw new ApiClientError(res.status, bodyJson);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
