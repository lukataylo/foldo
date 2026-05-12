import type {
  GetBoardResponse,
  ListBoardsResponse,
  MeResponse,
} from '@foldo/protocol';
import { api } from './client';

export function listBoards(signal?: AbortSignal) {
  return api<ListBoardsResponse>('/api/boards', { signal });
}

export function getBoard(boardId: string, signal?: AbortSignal) {
  return api<GetBoardResponse>(`/api/boards/${encodeURIComponent(boardId)}`, {
    signal,
  });
}

export function getMe(signal?: AbortSignal) {
  return api<MeResponse>('/api/me', { signal });
}
