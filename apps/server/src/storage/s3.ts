import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Storage, StoredObject } from './index.ts';

/**
 * S3-compatible blob storage for test-session recordings.
 *
 * Works against AWS S3 *and* Cloudflare R2 (and Backblaze B2's S3 API): R2 just
 * needs `FOLDO_S3_ENDPOINT` pointed at the account endpoint and a region of
 * `auto`. Recordings are referenced everywhere by `key`, so swapping
 * `LocalStorage` for this is transparent to callers — the one extra capability
 * is `signedUrl()`, which lets the recordings route 302-redirect playback
 * straight at the bucket (so range requests / seeking are handled by S3).
 */
function contentTypeForKey(key: string): string {
  if (key.endsWith('.webm')) return 'video/webm';
  if (key.endsWith('.mp4')) return 'video/mp4';
  if (key.endsWith('.ogg')) return 'audio/ogg';
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.html')) return 'text/html';
  return 'application/octet-stream';
}

export interface S3StorageConfig {
  bucket: string;
  region: string;
  /** Optional custom endpoint — required for Cloudflare R2 / Backblaze. */
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Seconds a presigned GET URL stays valid. Default 1 hour. */
  signedUrlTtlSeconds?: number;
}

export class S3Storage implements Storage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly signedUrlTtlSeconds: number;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.signedUrlTtlSeconds = config.signedUrlTtlSeconds ?? 3600;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      // R2 and most S3-compatible providers require path-style addressing.
      forcePathStyle: Boolean(config.endpoint),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return { key, size: body.length, contentType };
  }

  async get(
    key: string,
  ): Promise<{ body: Buffer; contentType: string } | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!res.Body) return null;
      const bytes = await res.Body.transformToByteArray();
      return {
        body: Buffer.from(bytes),
        contentType: res.ContentType ?? contentTypeForKey(key),
      };
    } catch {
      return null;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  pathFor(key: string): string {
    // Browsers still hit our API; the route 302-redirects to `signedUrl(key)`.
    const encoded = key
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    return `/api/recordings/${encoded}`;
  }

  async signedUrl(key: string): Promise<string | null> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn: this.signedUrlTtlSeconds },
      );
    } catch {
      return null;
    }
  }
}
