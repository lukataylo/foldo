// Walkthroughs ("living documentation") REST client — thin wrappers over
// the server's walkthrough endpoints, mirroring apps/server/src/routes/walkthroughs.ts.

import type {
  CreateWalkthroughRequest,
  CreateWalkthroughResponse,
  GetWalkthroughResponse,
  ListWalkthroughsResponse,
  RenderTakeRequest,
  RenderTakeResponse,
  UpdateWalkthroughRequest,
  Walkthrough,
} from '@foldo/protocol';
import { api } from './client';

export function listWalkthroughs(boardId: string) {
  return api<ListWalkthroughsResponse>(
    `/api/boards/${encodeURIComponent(boardId)}/walkthroughs`,
  );
}

export function createWalkthrough(body: CreateWalkthroughRequest) {
  return api<CreateWalkthroughResponse>('/api/walkthroughs', {
    method: 'POST',
    body,
  });
}

export function getWalkthrough(id: string) {
  return api<GetWalkthroughResponse>(
    `/api/walkthroughs/${encodeURIComponent(id)}`,
  );
}

export function updateWalkthrough(id: string, body: UpdateWalkthroughRequest) {
  // The PATCH route replies `{ walkthrough }` — same shape as create; the
  // protocol has no dedicated Update*Response alias yet.
  return api<{ walkthrough: Walkthrough }>(
    `/api/walkthroughs/${encodeURIComponent(id)}`,
    { method: 'PATCH', body },
  );
}

/** Manual render trigger — same path a merged PR takes. `{}` films every step. */
export function renderTake(id: string, body: RenderTakeRequest = {}) {
  return api<RenderTakeResponse>(
    `/api/walkthroughs/${encodeURIComponent(id)}/takes`,
    { method: 'POST', body },
  );
}
