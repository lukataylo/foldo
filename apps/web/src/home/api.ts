import { API_BASE, readToken, type AuthUser } from '../marketing/auth';
import { handleExpiredSession } from '../lib/session';

export interface HomeBoardSummary {
  id: string;
  name: string;
  repoSlug: string;
  devUrl?: string;
  createdAt: string;
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

function authHeaders(): Record<string, string> {
  const token = readToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // A dead session → clear it and redirect to /login (the home dashboard
    // only ever calls authenticated endpoints, so any 401 here is that).
    if (res.status === 401) handleExpiredSession();
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

export async function fetchHomeBoards(): Promise<HomeBoardSummary[]> {
  const res = await fetch(`${API_BASE}/api/home`, { headers: authHeaders() });
  const data = await asJson<{ boards: HomeBoardSummary[] }>(res);
  return data.boards;
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

// ---------- Board rename / delete ----------

export async function renameBoard(
  boardId: string,
  name: string,
): Promise<HomeBoardSummary['name']> {
  const res = await fetch(
    `${API_BASE}/api/boards/${encodeURIComponent(boardId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name }),
    },
  );
  const data = await asJson<{ board: { name: string } }>(res);
  return data.board.name;
}

export async function deleteBoard(boardId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/boards/${encodeURIComponent(boardId)}`,
    { method: 'DELETE', headers: authHeaders() },
  );
  await asJson<{ ok: boolean }>(res);
}

// ---------- Board members ----------

export type BoardRole = 'owner' | 'editor' | 'viewer';

export interface BoardMember {
  userId: string;
  name: string;
  initial: string;
  color: string;
  email?: string;
  kind: 'human' | 'agent';
  role: BoardRole;
  joinedAt: string;
}

export async function listBoardMembers(
  boardId: string,
): Promise<BoardMember[]> {
  const res = await fetch(
    `${API_BASE}/api/boards/${encodeURIComponent(boardId)}/members`,
    { headers: authHeaders() },
  );
  const data = await asJson<{ members: BoardMember[] }>(res);
  return data.members;
}

export async function inviteBoardMember(
  boardId: string,
  email: string,
  role: 'editor' | 'viewer',
): Promise<BoardMember> {
  const res = await fetch(
    `${API_BASE}/api/boards/${encodeURIComponent(boardId)}/members`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ email, role }),
    },
  );
  const data = await asJson<{ member: BoardMember }>(res);
  return data.member;
}

export async function changeMemberRole(
  boardId: string,
  userId: string,
  role: BoardRole,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/boards/${encodeURIComponent(boardId)}/members/${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ role }),
    },
  );
  await asJson<{ ok: boolean }>(res);
}

export async function removeBoardMember(
  boardId: string,
  userId: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/boards/${encodeURIComponent(boardId)}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE', headers: authHeaders() },
  );
  await asJson<{ ok: boolean }>(res);
}

// ---------- Comment search ----------

export interface CommentSearchResult {
  id: string;
  boardId: string;
  text: string;
}

export async function searchComments(
  q: string,
  signal?: AbortSignal,
): Promise<CommentSearchResult[]> {
  const res = await fetch(
    `${API_BASE}/api/boards/search/comments?q=${encodeURIComponent(q)}`,
    { headers: authHeaders(), signal },
  );
  const data = await asJson<{ results: CommentSearchResult[] }>(res);
  return data.results;
}
