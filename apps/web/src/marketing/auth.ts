// Marketing-side auth: thin fetch wrappers + localStorage persistence.

export const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:4000';

export interface AuthUser {
  id: string;
  name: string;
  initial: string;
  color: string;
  email?: string;
  kind: 'human' | 'agent';
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
  /** Whether the account's email is confirmed. Drives the verify banner. */
  emailVerified?: boolean;
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

// -------- account lifecycle: password reset & email verification --------

/**
 * Request a password-reset email. The server always responds 200 (it never
 * reveals whether the email maps to an account), so callers should show the
 * same confirmation regardless of outcome.
 */
export async function apiRequestPasswordReset(email: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/request-password-reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(await parseErr(res));
}

/** Complete a password reset using the token from the emailed link. */
export async function apiResetPassword(input: {
  token: string;
  password: string;
}): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseErr(res));
}

/** Confirm an email address using the token from the verification link. */
export async function apiVerifyEmail(token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error(await parseErr(res));
}

/** Resend the verification email to the logged-in user. */
export async function apiResendVerification(): Promise<void> {
  const token = readToken();
  const res = await fetch(`${API_BASE}/api/auth/resend-verification`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(await parseErr(res));
}

/** The authenticated user plus their email-verification status. */
export async function apiMe(): Promise<{
  user: AuthUser;
  emailVerified: boolean;
} | null> {
  const token = readToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as { user: AuthUser; emailVerified: boolean };
  } catch {
    return null;
  }
}
