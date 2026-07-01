// Thin fetch wrapper with bearer auth + shared error shape.
// Demo auth: the "token" is the userId; the server accepts it as `Bearer <userId>`.

import type { ApiError } from '@foldo/protocol';

export const API_BASE =
  (typeof window !== 'undefined' &&
    (window as unknown as { __FOLDO_API__?: string }).__FOLDO_API__) ||
  (import.meta.env.VITE_API_URL as string | undefined) ||
  'http://localhost:4000';

/**
 * Resolve a server-issued URL against the API origin. The server returns
 * paths relative to ITSELF (`/api/uploads/…`, `/api/recordings/…`); the web
 * app is served from a different origin, so a bare relative src would 404
 * against the web host. Absolute http(s)/data/blob URLs pass through.
 */
export function resolveApiUrl(url: string): string {
  if (/^(https?:)?\/\//i.test(url) || /^(data|blob):/i.test(url)) return url;
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

let authToken: string | null = null;
let authUserId: string | null = null;

export function setAuth(userId: string, token: string) {
  authUserId = userId;
  authToken = token;
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
