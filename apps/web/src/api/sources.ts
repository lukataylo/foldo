import type { GetSourceResponse } from '@foldo/protocol';
import { api } from './client';

export function getSource(args: {
  repoSlug: string;
  commitSha: string;
  path: string;
}) {
  return api<GetSourceResponse>('/api/sources', { query: args });
}
