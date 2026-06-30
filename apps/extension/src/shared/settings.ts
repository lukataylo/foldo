// chrome.storage.local-backed settings persistence. The popup uses this when
// the gear icon is open; the service worker reads it on every capture.

import { DEFAULTS, STORAGE_KEYS } from '../config.ts';
import type { Settings } from './types.ts';

export async function readSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.cloudUrl,
    STORAGE_KEYS.webUrl,
    STORAGE_KEYS.bearerToken,
    STORAGE_KEYS.boardId,
  ]);
  return {
    cloudUrl: (stored[STORAGE_KEYS.cloudUrl] as string) ?? DEFAULTS.cloudUrl,
    webUrl: (stored[STORAGE_KEYS.webUrl] as string) ?? DEFAULTS.webUrl,
    bearerToken:
      (stored[STORAGE_KEYS.bearerToken] as string) ?? DEFAULTS.bearerToken,
    boardId: (stored[STORAGE_KEYS.boardId] as string) ?? DEFAULTS.boardId,
  };
}

export async function writeSettings(partial: Partial<Settings>): Promise<void> {
  const patch: Record<string, string> = {};
  if (partial.cloudUrl !== undefined) {
    patch[STORAGE_KEYS.cloudUrl] = partial.cloudUrl;
  }
  if (partial.webUrl !== undefined) {
    patch[STORAGE_KEYS.webUrl] = partial.webUrl;
  }
  if (partial.bearerToken !== undefined) {
    patch[STORAGE_KEYS.bearerToken] = partial.bearerToken;
  }
  if (partial.boardId !== undefined) {
    patch[STORAGE_KEYS.boardId] = partial.boardId;
  }
  if (Object.keys(patch).length > 0) {
    await chrome.storage.local.set(patch);
  }
}
