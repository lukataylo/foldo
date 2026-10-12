import type { AppLoadContext, EntryContext } from '@remix-run/node';
import { RemixServer } from '@remix-run/react';
import { isbot } from 'isbot';
// ponytail: React 18's node build lacks renderToReadableStream; the browser build runs fine on Node 18+ web streams
import { renderToReadableStream } from 'react-dom/server.browser';
import { renderHeadToString } from 'remix-island';
import { Head } from './root';
import { coepFor } from '~/lib/coep';

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
  _loadContext: AppLoadContext,
) {
  /*
   * A closed tab stops the render, but only while it is still rendering: React 18 closes its stream again on an abort
   * that arrives after it finished (or after we cancelled it), which throws ERR_INVALID_STATE.
   */
  const stop = new AbortController();
  let rendered = false;
  request.signal.addEventListener('abort', () => !rendered && stop.abort(), { once: true });

  const readable = await renderToReadableStream(<RemixServer context={remixContext} url={request.url} />, {
    signal: stop.signal,
    onError(error: unknown) {
      console.error(error);
      responseStatusCode = 500;
    },
  });

  const body = new ReadableStream({
    start(controller) {
      /*
       * When a loader threw (a dead share link, a server error), remix-island renders Remix's fallback document into the
       * head, and the browser moves its <main> into the body as a 64px gap above the error page. The error boundary
       * brings its own <Links />, so a plain head is enough there.
       */
      const head = remixContext.staticHandlerContext.errors
        ? `<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="theme-color" content="#FBF8F1"/><title>${responseStatusCode === 404 ? 'Page not found' : 'Something went wrong'} · Foldo</title>`
        : renderHeadToString({ request, remixContext, Head });

      controller.enqueue(
        new Uint8Array(
          new TextEncoder().encode(
            `<!DOCTYPE html><html lang="en"><head>${head}</head><body><div id="root" class="w-full h-full">`,
          ),
        ),
      );

      const reader = readable.getReader();

      function read() {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              rendered = true;
              controller.enqueue(new Uint8Array(new TextEncoder().encode(`</div></body></html>`)));
              controller.close();

              return;
            }

            controller.enqueue(value);
            read();
          })
          .catch((error) => {
            controller.error(error);
            readable.cancel();
          });
      }
      read();
    },

    cancel() {
      if (!rendered) {
        rendered = true;
        stop.abort();
      }
    },
  });

  if (isbot(request.headers.get('user-agent') || '')) {
    await readable.allReady;
  }

  responseHeaders.set('Content-Type', 'text/html');

  responseHeaders.set('Cross-Origin-Embedder-Policy', coepFor(request.headers.get('user-agent') || ''));
  responseHeaders.append('Vary', 'User-Agent');
  responseHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
