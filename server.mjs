import { createRequestHandler } from '@remix-run/express';
import { installGlobals } from '@remix-run/node';
import compression from 'compression';
import express from 'express';

// remix-serve's default polyfilled fetch breaks the AI SDK's streams; use Node's native one
installGlobals({ nativeFetch: true });

const MAX_BODY = 6_000_000;
const app = express();
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
  });

  // CSRF defence in depth on top of SameSite=Lax: a browser-sent Origin must match this host on every write
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    const host = req.get('x-forwarded-host') || req.get('host');

    if (origin && new URL(origin).host !== host) {
      return res.status(403).type('text').send('Cross-origin request blocked');
    }

    if (!req.path.startsWith('/api/admin-snapshot') && Number(req.get('content-length') || 0) > MAX_BODY) {
      return res.status(413).type('text').send('Request too large');
    }
  }

  next();
});

// gzip pages and assets (venue wifi is slow) but never the streamed LLM responses, which must flush per chunk
app.use(compression({ filter: (req, res) => !req.path.startsWith('/api/') && compression.filter(req, res) }));
app.use('/assets', express.static('build/client/assets', { immutable: true, maxAge: '1y' }));
// template files change with every deploy and are small: always revalidate (ETag), never serve a stale copy from the browser cache
app.use('/templates', express.static('build/client/templates', { maxAge: 0 }));
app.use(express.static('build/client', { maxAge: '1h' }));
app.use(createRequestHandler({ build: await import('./build/server/index.js') }));

const port = process.env.PORT || 3000;
const server = app.listen(port, () => console.log(`Foldo listening on :${port}`));

// Railway sends SIGTERM on deploy: stop accepting, let in-flight streams finish (briefly), then exit
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 15_000).unref();
});
