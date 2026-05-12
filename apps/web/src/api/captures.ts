import type {
  CreateCaptureRequest,
  CreateCaptureResponse,
} from '@foldo/protocol';
import { api } from './client';

export function createCapture(body: CreateCaptureRequest) {
  return api<CreateCaptureResponse>('/api/captures', {
    method: 'POST',
    body,
  });
}
