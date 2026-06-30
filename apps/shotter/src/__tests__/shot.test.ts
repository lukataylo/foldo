// Vitest coverage of the shotter's /shot endpoint. We pass `buildApp` a
// fake browser launcher so the suite never touches real Chromium — no
// `npx playwright install`, no spawning, no flake. The fake exercises the
// happy path (a 1×1 PNG round-trips back), the timeout path (newContext
// throws), and the auth path (bearer required when configured).

import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../index.ts';

// Minimal pixel — a 1×1 PNG. Good enough to assert "this came back as a
// PNG body, not the error JSON".
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8ffff3f00050001fef9c7b00000000049454e44ae426082',
  'hex',
);

/**
 * Build a fake `Browser` whose `newContext().newPage().screenshot()` returns
 * the supplied bytes. Lets each test wire the "Chromium did X" outcome
 * without booting Chromium.
 */
function fakeBrowser({
  screenshot = async () => TINY_PNG,
  goto = async () => undefined,
}: {
  screenshot?: () => Promise<Buffer>;
  goto?: () => Promise<unknown>;
} = {}) {
  let connected = true;
  const browser = {
    isConnected: () => connected,
    close: async () => {
      connected = false;
    },
    newContext: vi.fn(async () => ({
      newPage: vi.fn(async () => ({
        goto: vi.fn(goto),
        screenshot: vi.fn(screenshot),
      })),
      close: vi.fn(async () => undefined),
    })),
  };
  return browser as unknown as Awaited<ReturnType<typeof import('playwright-core').chromium.launch>>;
}

describe('shotter /shot', () => {
  it('returns 400 when ?url is missing', async () => {
    const { app, closeBrowser } = buildApp({
      allowPrivate: true,
      logger: false,
      launchBrowser: async () => fakeBrowser(),
    });
    try {
      const res = await app.inject({ method: 'GET', url: '/shot' });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'BAD_REQUEST' });
    } finally {
      await app.close();
      await closeBrowser();
    }
  });

  it('returns 400 for a non-absolute url', async () => {
    const { app, closeBrowser } = buildApp({
      allowPrivate: true,
      logger: false,
      launchBrowser: async () => fakeBrowser(),
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/shot?url=not-a-url',
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
      await closeBrowser();
    }
  });

  it('rejects private hostnames when allowPrivate is off', async () => {
    const { app, closeBrowser } = buildApp({
      allowPrivate: false,
      logger: false,
      launchBrowser: async () => fakeBrowser(),
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/shot?url=' + encodeURIComponent('http://localhost:5174'),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'BAD_REQUEST' });
    } finally {
      await app.close();
      await closeBrowser();
    }
  });

  it('requires bearer auth when a shared secret is configured', async () => {
    const { app, closeBrowser } = buildApp({
      sharedSecret: 's3cret',
      allowPrivate: true,
      logger: false,
      launchBrowser: async () => fakeBrowser(),
    });
    try {
      // No header → 401
      const noAuth = await app.inject({
        method: 'GET',
        url: '/shot?url=' + encodeURIComponent('https://example.com'),
      });
      expect(noAuth.statusCode).toBe(401);

      // Wrong header → 401
      const wrong = await app.inject({
        method: 'GET',
        url: '/shot?url=' + encodeURIComponent('https://example.com'),
        headers: { authorization: 'Bearer not-the-right-one' },
      });
      expect(wrong.statusCode).toBe(401);

      // Right header → 200
      const ok = await app.inject({
        method: 'GET',
        url: '/shot?url=' + encodeURIComponent('https://example.com'),
        headers: { authorization: 'Bearer s3cret' },
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.headers['content-type']).toContain('image/png');
    } finally {
      await app.close();
      await closeBrowser();
    }
  });

  it('returns a PNG buffer on the happy path', async () => {
    const { app, closeBrowser } = buildApp({
      allowPrivate: false,
      logger: false,
      launchBrowser: async () => fakeBrowser(),
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/shot?url=' + encodeURIComponent('https://example.com'),
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('image/png');
      expect(res.rawPayload.equals(TINY_PNG)).toBe(true);
    } finally {
      await app.close();
      await closeBrowser();
    }
  });

  it('returns 502 when navigation times out', async () => {
    const { app, closeBrowser } = buildApp({
      allowPrivate: true,
      logger: false,
      navTimeoutMs: 50,
      launchBrowser: async () =>
        fakeBrowser({
          goto: async () => {
            throw new Error('Timeout 50ms exceeded');
          },
        }),
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/shot?url=' + encodeURIComponent('http://localhost:5174'),
      });
      expect(res.statusCode).toBe(502);
      const body = res.json() as { code?: string; error?: string };
      expect(body.code).toBe('UPSTREAM');
      expect(body.error).toMatch(/timeout/i);
    } finally {
      await app.close();
      await closeBrowser();
    }
  });

  it('/health returns ok=true', async () => {
    const { app, closeBrowser } = buildApp({
      logger: false,
      launchBrowser: async () => fakeBrowser(),
    });
    try {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true });
    } finally {
      await app.close();
      await closeBrowser();
    }
  });
});
