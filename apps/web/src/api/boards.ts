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

// ---------- Shares ----------
// (Archive/restore + share-mint clients live in home/api.ts, where their
// only callers are. This file keeps the list/manage/revoke share calls.)

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
