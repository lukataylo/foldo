import { API_BASE, readToken, type AuthUser } from '../marketing/auth';

export interface HomeBoardSummary {
  id: string;
  name: string;
  repoSlug: string;
  devUrl?: string;
  createdAt: string;
  /**
   * ISO timestamp when the board was soft-deleted via DELETE /api/boards/:id.
   * NULL for live boards. The home grid only sees archived boards when the
   * "Show archived" toggle calls /api/home?includeArchived=true.
   */
  archivedAt?: string | null;
  /** Membership role: 'owner' lets you delete/share, 'editor' can write, 'viewer' read-only. */
  role?: 'owner' | 'editor' | 'viewer';
  branchCount: number;
  frameCount: number;
  commentCount: number;
  lastActivity: string | null;
  branchColors: string[];
}

export interface MeResponse {
  user: AuthUser;
  token: string;
}

export interface SessionSummary {
  token: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export function authHeaders(): Record<string, string> {
  const token = readToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) msg = data.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function fetchMe(): Promise<MeResponse> {
  const res = await fetch(`${API_BASE}/api/me`, { headers: authHeaders() });
  return asJson<MeResponse>(res);
}

export async function fetchHomeBoards(opts?: {
  includeArchived?: boolean;
}): Promise<HomeBoardSummary[]> {
  const qs = opts?.includeArchived ? '?includeArchived=true' : '';
  const res = await fetch(`${API_BASE}/api/home${qs}`, { headers: authHeaders() });
  const data = await asJson<{ boards: HomeBoardSummary[] }>(res);
  return data.boards;
}

/**
 * Soft-delete a board on the server. Caller should optimistically remove
 * the card from the active list. Restorable via restoreBoard() while the
 * archived view is visible.
 */
export async function archiveBoard(boardId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/boards/${encodeURIComponent(boardId)}`,
    { method: 'DELETE', headers: authHeaders() },
  );
  await asJson<{ ok: boolean }>(res);
}

/** Inverse of archiveBoard — un-soft-delete on the server. */
export async function restoreBoard(boardId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/boards/${encodeURIComponent(boardId)}/restore`,
    { method: 'POST', headers: authHeaders() },
  );
  await asJson<{ ok: boolean }>(res);
}

export async function updateProfile(patch: {
  name?: string;
  email?: string;
  color?: string;
}): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/api/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(patch),
  });
  const data = await asJson<{ user: AuthUser }>(res);
  return data.user;
}

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ revokedSessions: number }> {
  const res = await fetch(`${API_BASE}/api/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(input),
  });
  return asJson<{ revokedSessions: number }>(res);
}

export async function fetchSessions(): Promise<SessionSummary[]> {
  const res = await fetch(`${API_BASE}/api/auth/sessions`, { headers: authHeaders() });
  const data = await asJson<{ sessions: SessionSummary[] }>(res);
  return data.sessions;
}

export async function revokeSession(token: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/auth/sessions/${encodeURIComponent(token)}`,
    { method: 'DELETE', headers: authHeaders() },
  );
  await asJson<{ ok: boolean }>(res);
}

// ---------- API tokens (long-lived, for MCP / agents) ----------

export interface ApiTokenSummary {
  id: string;
  preview: string;
  label: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export interface MintApiTokenResponse {
  token: string;
  label: string;
  createdAt: string;
}

export async function fetchApiTokens(): Promise<ApiTokenSummary[]> {
  const res = await fetch(`${API_BASE}/api/auth/tokens`, { headers: authHeaders() });
  const data = await asJson<{ tokens: ApiTokenSummary[] }>(res);
  return data.tokens;
}

export async function mintApiToken(label: string): Promise<MintApiTokenResponse> {
  const res = await fetch(`${API_BASE}/api/auth/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ label }),
  });
  return asJson<MintApiTokenResponse>(res);
}

export async function revokeApiToken(token: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/auth/tokens/${encodeURIComponent(token)}`,
    { method: 'DELETE', headers: authHeaders() },
  );
  await asJson<{ ok: boolean }>(res);
}

// ---------- Shares ----------

export interface BoardShare {
  token: string;
  boardId: string;
  createdByUserId: string;
  createdAt: string;
  revokedAt: string | null;
  url: string;
}

export async function createBoardShare(
  boardId: string,
): Promise<{ token: string; url: string; share: BoardShare }> {
  const res = await fetch(
    `${API_BASE}/api/boards/${encodeURIComponent(boardId)}/shares`,
    { method: 'POST', headers: authHeaders() },
  );
  return asJson<{ token: string; url: string; share: BoardShare }>(res);
}

export async function listBoardShares(boardId: string): Promise<BoardShare[]> {
  const res = await fetch(
    `${API_BASE}/api/boards/${encodeURIComponent(boardId)}/shares`,
    { headers: authHeaders() },
  );
  const data = await asJson<{ shares: BoardShare[] }>(res);
  return data.shares;
}

export async function revokeBoardShare(
  boardId: string,
  token: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/boards/${encodeURIComponent(boardId)}/shares/${encodeURIComponent(token)}`,
    { method: 'DELETE', headers: authHeaders() },
  );
  await asJson<{ ok: boolean }>(res);
}

// ---------- Account export + delete (GDPR) ----------

/**
 * Trigger /api/me/export and return the parsed JSON body. Callers usually
 * wrap this in a Blob + anchor click to trigger a browser download.
 */
export async function exportMyData(): Promise<unknown> {
  const res = await fetch(`${API_BASE}/api/me/export`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return asJson<unknown>(res);
}

/**
 * Permanently soft-delete the current account. Caller MUST clear local auth
 * state on success — the server kills every session as part of the flow, so
 * any cached token is dead the moment this returns.
 */
export async function deleteMyAccount(currentPassword: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/me/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ currentPassword }),
  });
  await asJson<{ ok: boolean }>(res);
}
