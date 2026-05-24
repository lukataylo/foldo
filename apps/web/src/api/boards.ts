import type {
  GetBoardResponse,
  ListBoardsResponse,
  MeResponse,
} from '@foldo/protocol';
import { api } from './client';

export function listBoards(signal?: AbortSignal, opts?: { includeArchived?: boolean }) {
  return api<ListBoardsResponse>('/api/boards', {
    signal,
    query: opts?.includeArchived ? { includeArchived: 'true' } : undefined,
  });
}

export function getBoard(boardId: string, signal?: AbortSignal) {
  return api<GetBoardResponse>(`/api/boards/${encodeURIComponent(boardId)}`, {
    signal,
  });
}

export function getMe(signal?: AbortSignal) {
  return api<MeResponse>('/api/me', { signal });
}

/**
 * Soft-delete a board (sets archived_at on the server). The row stays in
 * Postgres so child frames / comments / dispatches survive; callers should
 * optimistically remove the card from the active list and let the user
 * recover via apiRestoreBoard if they toggle "Show archived" on.
 */
export function apiArchiveBoard(boardId: string, signal?: AbortSignal) {
  return api<{ ok: true; archived: true }>(
    `/api/boards/${encodeURIComponent(boardId)}`,
    { method: 'DELETE', signal },
  );
}

/**
 * Clear archived_at on a previously-archived board. Pairs with the home
 * grid's "Show archived" toggle so a user can un-do an accidental archive.
 */
export function apiRestoreBoard(boardId: string, signal?: AbortSignal) {
  return api<{ ok: true; restored: true }>(
    `/api/boards/${encodeURIComponent(boardId)}/restore`,
    { method: 'POST', signal },
  );
}

// ---------- Shares ----------

export interface BoardShareSummary {
  token: string;
  boardId: string;
  createdByUserId: string;
  createdAt: string;
  revokedAt: string | null;
  url: string;
}

/** List the (active, non-revoked) share links for a board. */
export function apiListShares(boardId: string, signal?: AbortSignal) {
  return api<{ shares: BoardShareSummary[] }>(
    `/api/boards/${encodeURIComponent(boardId)}/shares`,
    { signal },
  );
}

/** Mint a fresh share link on the board; returns the token + canonical URL. */
export function apiCreateShare(boardId: string, signal?: AbortSignal) {
  return api<{ token: string; url: string; share: BoardShareSummary }>(
    `/api/boards/${encodeURIComponent(boardId)}/shares`,
    { method: 'POST', signal },
  );
}

/**
 * Revoke a single share link. The server stamps revoked_at — the public
 * /api/share/:token endpoint then 404s, so any link a user has handed out
 * dies the moment this call resolves.
 */
export function apiRevokeShare(boardId: string, token: string, signal?: AbortSignal) {
  return api<{ ok: true }>(
    `/api/boards/${encodeURIComponent(boardId)}/shares/${encodeURIComponent(token)}`,
    { method: 'DELETE', signal },
  );
}
