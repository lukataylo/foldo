// Static defaults for the extension. Anything user-tweakable lives in
// chrome.storage.local under the same keys — see shared/settings.ts.

export const DEFAULTS = {
  cloudUrl: 'http://localhost:4000',
  webUrl: 'http://localhost:5173',
  bearerToken: 'demo-user',
  boardId: 'board-acme-landing',
  /** The userId attributed to captures. For demo, the token doubles as the id. */
  capturedByUserId: 'demo-user',
} as const;

export const STORAGE_KEYS = {
  cloudUrl: 'foldo.cloudUrl',
  webUrl: 'foldo.webUrl',
  bearerToken: 'foldo.bearerToken',
  boardId: 'foldo.boardId',
} as const;

/** Cap DOM serialisation to avoid pushing megabytes through the API. */
export const MAX_DOM_SNAPSHOT_BYTES = 500_000;
