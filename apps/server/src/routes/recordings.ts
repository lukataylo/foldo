import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getStorage } from '../storage/index.ts';

/**
 * Serves stored recordings back to the browser. Public on purpose — a
 * recording key is an unguessable per-session path, and playback frames on
 * the canvas need a plain URL.
 *
 * Two paths:
 *  - Object storage (S3/R2): `signedUrl()` returns a presigned GET URL and we
 *    302-redirect to it. S3 handles HTTP range requests natively, so video
 *    seeking just works.
 *  - Local disk: we serve the bytes ourselves *with* range support — parse the
 *    `Range:` header and reply `206 Partial Content` so `<video>` can seek.
 */

/** Parse a single-range `bytes=start-end` header against a known size. */
function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  let start: number;
  let end: number;
  if (rawStart === '') {
    // Suffix range: last N bytes.
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end < start || start >= size) return null;
  if (end >= size) end = size - 1;
  return { start, end };
}

export async function registerRecordingRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get<{ Params: { '*': string } }>(
    '/api/recordings/*',
    async (req: FastifyRequest<{ Params: { '*': string } }>, reply: FastifyReply) => {
      const key = decodeURIComponent(req.params['*'] ?? '');
      // All recording keys live under the `recordings/` namespace. Enforcing
      // the prefix matters on S3 deploys: `signedUrl()` will happily presign
      // ANY bucket key, so without this check the route doubles as an open
      // "presign anything" oracle (e.g. /api/recordings/uploads/<id>.png).
      if (!key.startsWith('recordings/') || key.includes('..')) {
        return reply
          .code(400)
          .send({ error: 'Bad recording key', code: 'BAD_REQUEST' });
      }

      const storage = getStorage();

      // Object-storage path: redirect to a presigned URL, let S3 do ranges.
      if (storage.signedUrl) {
        const url = await storage.signedUrl(key);
        if (url) {
          return reply
            .header('Cache-Control', 'private, max-age=300')
            .redirect(url, 302);
        }
      }

      const obj = await storage.get(key);
      if (!obj) {
        return reply
          .code(404)
          .send({ error: 'Recording not found', code: 'NOT_FOUND' });
      }

      const total = obj.body.length;
      const range = parseRange(
        Array.isArray(req.headers.range)
          ? req.headers.range[0]
          : req.headers.range,
        total,
      );

      reply
        .header('Content-Type', obj.contentType)
        .header('Cache-Control', 'private, max-age=3600')
        .header('Accept-Ranges', 'bytes');

      if (range) {
        const { start, end } = range;
        const chunk = obj.body.subarray(start, end + 1);
        return reply
          .code(206)
          .header('Content-Range', `bytes ${start}-${end}/${total}`)
          .header('Content-Length', String(chunk.length))
          .send(chunk);
      }

      return reply.header('Content-Length', String(total)).send(obj.body);
    },
  );
}
