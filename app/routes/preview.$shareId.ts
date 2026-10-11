import type { LoaderFunctionArgs } from '@remix-run/node';
import { db } from '~/lib/.server/db';
import { PREVIEW_CSP, previewDocument } from '~/lib/.server/preview-sanitize';
import { coepFor } from '~/lib/coep';

/*
 * A gallery card's AI thumbnail, as its own document for `<iframe sandbox="" src>` (ProjectCard.tsx): the CSP is a real
 * header, and the HTML stays out of the page and its hydration data. Listed, visible projects only. The card asks for
 * `?v=<preview_at>`, so a new thumbnail is a new URL and the old one can be cached.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const row = db
    .prepare(
      `SELECT p.preview_html AS html FROM projects p JOIN users u ON u.id = p.user_id
       WHERE p.share_id = ? AND p.listed = 1 AND p.hidden_at IS NULL AND u.disabled = 0`,
    )
    .get(params.shareId ?? '') as { html: string | null } | undefined;

  if (!row?.html) {
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } });
  }

  return new Response(previewDocument(row.html), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': PREVIEW_CSP,
      'Referrer-Policy': 'no-referrer',
      // the gallery page is cross-origin isolated, so the frame must opt in too (same rule as the page itself)
      'Cross-Origin-Embedder-Policy': coepFor(request.headers.get('user-agent') || ''),
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
