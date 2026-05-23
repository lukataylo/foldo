// Marketing-side auth: thin fetch wrappers + localStorage persistence.

export const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:4000';

export interface AuthUser {
  id: string;
  name: string;
  initial: string;
  color: string;
  email?: string;
  /** ISO timestamp when the user clicked the verify-email link; undefined if not yet. */
  emailVerifiedAt?: string;
  kind: 'human' | 'agent';
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

const TOKEN_KEY = 'foldo:token';
const USER_KEY = 'foldo:user';

export function storeAuth(token: string, user: AuthUser): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // localStorage unavailable, non-fatal
  }
}

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

interface ApiErrorBody {
  error?: string;
  code?: string;
}

async function parseErr(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as ApiErrorBody;
    return data.error || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export async function apiSignup(input: {
  email: string;
  password: string;
  name: string;
}): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return (await res.json()) as AuthResponse;
}

export async function apiLogin(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return (await res.json()) as AuthResponse;
}

export async function apiLogout(): Promise<void> {
  const token = readToken();
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
}
