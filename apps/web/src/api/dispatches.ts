import type {
  CreateDispatchRequest,
  Dispatch,
  ListDispatchesResponse,
} from '@foldo/protocol';
import { api } from './client';

export function createDispatch(body: CreateDispatchRequest) {
  return api<Dispatch>('/api/dispatches', { method: 'POST', body });
}

export function listDispatches(boardId: string) {
  return api<ListDispatchesResponse>('/api/dispatches', {
    query: { boardId },
  });
}

export function getDispatch(id: string) {
  return api<Dispatch>(`/api/dispatches/${encodeURIComponent(id)}`);
}
