import type {
  CreateFrameRequest,
  Frame,
  MoveFrameRequest,
  SuccessResponse,
  UpdateFrameRequest,
} from '@foldo/protocol';
import { api } from './client';

export function createFrame(body: CreateFrameRequest) {
  return api<Frame>('/api/frames', { method: 'POST', body });
}

export function moveFrame(frameId: string, body: MoveFrameRequest) {
  return api<Frame>(`/api/frames/${encodeURIComponent(frameId)}/move`, {
    method: 'POST',
    body,
  });
}

export function updateFrame(frameId: string, body: UpdateFrameRequest) {
  return api<Frame>(`/api/frames/${encodeURIComponent(frameId)}`, {
    method: 'PATCH',
    body,
  });
}

export function deleteFrame(frameId: string) {
  return api<SuccessResponse>(`/api/frames/${encodeURIComponent(frameId)}`, {
    method: 'DELETE',
  });
}
