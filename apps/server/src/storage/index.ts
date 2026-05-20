import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { S3Storage } from './s3.ts';

/**
 * Blob storage for test-session recordings.
 *
 * Today this is a local-disk implementation so `npm run dev` works with zero
 * configuration. It is deliberately behind a narrow interface: a production
 * `S3Storage` (S3 / Cloudflare R2 / Backblaze) is a drop-in — implement the
 * same four methods and swap it in inside `getStorage()` when
 * `FOLDO_S3_BUCKET` is set. Recordings are referenced everywhere by `key`,
 * never by absolute path, so callers don't change.
 */
export interface StoredObject {
  key: string;
  size: number;
  contentType: string;
}

export interface Storage {
  /** Persist bytes under a key (the key may contain `/` path segments). */
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  /**
   * Persist a readable stream under a key without buffering it whole in
   * memory. Used for large uploads (test-session recordings) so concurrent
   * uploads don't risk OOMing the instance. The returned `size` is the byte
   * count actually written.
   */
  putStream(
    key: string,
    body: Readable,
    contentType: string,
  ): Promise<StoredObject>;
  /** Read bytes back, or null if the key doesn't exist. */
  get(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  exists(key: string): Promise<boolean>;
  /** Delete an object. Best-effort, idempotent — missing keys are a no-op. */
  remove(key: string): Promise<void>;
  /** Path (relative to the API origin) the browser can GET to play the object. */
  pathFor(key: string): string;
  /**
   * A directly-fetchable URL for the object, when the backend can mint one
   * (e.g. an S3 presigned GET). `LocalStorage` returns `null` — the caller
   * serves the bytes itself. `S3Storage` returns a presigned URL so the
   * recordings route can 302-redirect and let S3 handle range requests.
   */
  signedUrl?(key: string): Promise<string | null>;
}

function contentTypeForKey(key: string): string {
  if (key.endsWith('.webm')) return 'video/webm';
  if (key.endsWith('.mp4')) return 'video/mp4';
  if (key.endsWith('.ogg')) return 'audio/ogg';
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.html')) return 'text/html';
  return 'application/octet-stream';
}

class LocalStorage implements Storage {
  constructor(private readonly root: string) {}

  /** Resolve a key to an absolute path, refusing anything that escapes root. */
  private resolveKey(key: string): string {
    const safe = key.replace(/\\/g, '/').replace(/^\/+/, '');
    const full = resolve(this.root, safe);
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new Error('Invalid storage key');
    }
    return full;
  }

  async put(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<StoredObject> {
    const full = this.resolveKey(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body);
    return { key, size: body.length, contentType };
  }

  async putStream(
    key: string,
    body: Readable,
    contentType: string,
  ): Promise<StoredObject> {
    const full = this.resolveKey(key);
    await mkdir(dirname(full), { recursive: true });
    let size = 0;
    body.on('data', (chunk: Buffer) => {
      size += chunk.length;
    });
    // pipeline destroys the write stream + cleans up the file handle on error.
    await pipeline(body, createWriteStream(full));
    return { key, size, contentType };
  }

  async get(
    key: string,
  ): Promise<{ body: Buffer; contentType: string } | null> {
    try {
      const body = await readFile(this.resolveKey(key));
      return { body, contentType: contentTypeForKey(key) };
    } catch {
      return null;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await rm(this.resolveKey(key), { force: true });
    } catch {
      // best-effort: a missing or already-removed file is fine
    }
  }

  pathFor(key: string): string {
    const encoded = key
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    return `/api/recordings/${encoded}`;
  }

  /** Local disk has no presigning — the caller streams the bytes itself. */
  async signedUrl(): Promise<string | null> {
    return null;
  }
}

let cached: Storage | null = null;

export function getStorage(): Storage {
  if (cached) return cached;
  // Object storage in production: any S3-compatible bucket (AWS S3 /
  // Cloudflare R2 / Backblaze). Falls back to local disk so `npm run dev`
  // works with zero configuration.
  const bucket = process.env.FOLDO_S3_BUCKET;
  if (bucket) {
    const region = process.env.FOLDO_S3_REGION ?? 'auto';
    const accessKeyId = process.env.FOLDO_S3_ACCESS_KEY ?? '';
    const secretAccessKey = process.env.FOLDO_S3_SECRET ?? '';
    cached = new S3Storage({
      bucket,
      region,
      endpoint: process.env.FOLDO_S3_ENDPOINT || undefined,
      accessKeyId,
      secretAccessKey,
    });
    return cached;
  }
  const root = process.env.FOLDO_STORAGE_DIR
    ? resolve(process.env.FOLDO_STORAGE_DIR)
    : resolve(process.cwd(), '.foldo-storage');
  cached = new LocalStorage(root);
  return cached;
}
