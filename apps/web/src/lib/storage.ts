// Typed, exception-safe localStorage wrapper.
//
// Browser localStorage throws in private-mode Safari, when the quota is
// exceeded, and when storage is disabled — so every call site otherwise needs
// its own try/catch. These helpers swallow those failures (storage is always
// a cache/convenience here, never the source of truth) and centralise the
// key namespace.

/** Read a string value. Returns `fallback` when absent or on any failure. */
export function storageGet(key: string, fallback: string | null = null): string | null {
  try {
    const v = localStorage.getItem(key);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

/** Write a string value. No-ops on failure. */
export function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / quota / disabled — storage is best-effort */
  }
}

/** Remove a key. No-ops on failure. */
export function storageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Read + JSON.parse a value. Returns `fallback` on absence or parse failure. */
export function storageGetJSON<T>(key: string, fallback: T): T {
  const raw = storageGet(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** JSON.stringify + write a value. No-ops on failure. */
export function storageSetJSON(key: string, value: unknown): void {
  try {
    storageSet(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** Read a boolean stored as "1"/"0". */
export function storageGetBool(key: string, fallback: boolean): boolean {
  const raw = storageGet(key);
  if (raw == null) return fallback;
  return raw === '1';
}

/** Write a boolean as "1"/"0". */
export function storageSetBool(key: string, value: boolean): void {
  storageSet(key, value ? '1' : '0');
}
