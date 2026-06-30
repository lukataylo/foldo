import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireUser } from '../auth.ts';
import { getStorage } from '../storage/index.ts';
import { newId } from '../util.ts';

/**
 * User-uploaded image storage for canvas image frames.
 *
 * Reuses the same Storage abstraction as recordings: local-disk by default
 * (a Railway Volume mounted at e.g. /data with FOLDO_STORAGE_DIR=/data
 * persists across deploys, no S3 bucket required), or S3-compatible if
 * FOLDO_S3_BUCKET is set.
 *
 * Wire path is base64 JSON rather than multipart — it keeps the client
 * trivial and matches how image frames already carry their bytes elsewhere
 * (dataUrl) before we landed dedicated storage.
 *
 * Public on GET: the key is unguessable and image frames need a plain URL
 * the browser can fetch without bearer auth.
 */

interface UploadBody {
  filename: string;
  contentType: string;
  /** base64-encoded bytes (no `data:...;base64,` prefix). */
  dataBase64: string;
}

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB — generous for screenshots, sane for DB-free hosting
const ALLOWED = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

function extFor(filename: string, contentType: string): string {
  const fromName = /\.([a-z0-9]{1,5})$/i.exec(filename)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  if (contentType === 'image/jpeg') return 'jpg';
  const sub = contentType.split('/')[1] ?? 'bin';
  return sub.replace(/[^a-z0-9]/gi, '');
}

export async function registerUploadRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: UploadBody }>('/api/uploads', {
    // Default Fastify JSON limit is 1 MB; raise it for image uploads so a
    // typical PNG (which base64-bloats by ~33%) fits comfortably.
    bodyLimit: 16 * 1024 * 1024,
  }, async (req, reply) => {
    requireUser(req);
    const body = req.body ?? ({} as UploadBody);
    if (!body.filename || !body.contentType || !body.dataBase64) {
      return reply.code(400).send({
        error: 'filename, contentType, dataBase64 required',
        code: 'BAD_REQUEST',
      });
    }
    // Filename never touches the storage path (we mint a fresh `uploads/<newId>.<ext>`
    // key below) but it does feed extFor() and is echoed back in some clients.
    // Reject path-traversal characters defensively so a malicious filename
    // can never sneak into a future code path that uses it as a path component.
    if (
      body.filename.includes('..') ||
      body.filename.includes('/') ||
      body.filename.includes('\\')
    ) {
      return reply.code(400).send({
        error: 'Invalid filename',
        code: 'BAD_REQUEST',
      });
    }
    if (!ALLOWED.has(body.contentType)) {
      return reply.code(415).send({
        error: `Unsupported contentType: ${body.contentType}`,
        code: 'UNSUPPORTED_MEDIA_TYPE',
      });
    }
    let buf: Buffer;
    try {
      buf = Buffer.from(body.dataBase64, 'base64');
    } catch {
      return reply.code(400).send({ error: 'Invalid base64', code: 'BAD_REQUEST' });
    }
    if (buf.length === 0 || buf.length > MAX_BYTES) {
      return reply.code(413).send({
        error: `Payload size ${buf.length} out of bounds`,
        code: 'PAYLOAD_TOO_LARGE',
      });
    }
    const ext = extFor(body.filename, body.contentType);
    const key = `uploads/${newId('up')}.${ext}`;
    await getStorage().put(key, buf, body.contentType);
    const url = `/api/uploads/${encodeURIComponent(key.slice('uploads/'.length))}`;
    return reply.send({ url, key, size: buf.length, contentType: body.contentType });
  });

  app.get<{ Params: { '*': string } }>(
    '/api/uploads/*',
    async (req: FastifyRequest<{ Params: { '*': string } }>, reply: FastifyReply) => {
      const tail = decodeURIComponent(req.params['*'] ?? '');
      if (!tail || tail.includes('..')) {
        return reply.code(400).send({ error: 'Bad key', code: 'BAD_REQUEST' });
      }
      const storage = getStorage();
      const key = `uploads/${tail}`;
      if (storage.signedUrl) {
        const u = await storage.signedUrl(key);
        if (u) {
          return reply.header('Cache-Control', 'public, max-age=300').redirect(u, 302);
        }
      }
      const obj = await storage.get(key);
      if (!obj) {
        return reply.code(404).send({ error: 'Upload not found', code: 'NOT_FOUND' });
      }
      return reply
        .header('Content-Type', obj.contentType)
        .header('Cache-Control', 'public, max-age=31536000, immutable')
        .send(obj.body);
    },
  );
}
