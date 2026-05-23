import { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE, readToken } from '../marketing/auth';
import { FoldoMark, INK, MarketingStyles, PAPER, PILLOW, SOFT_GREY, YELLOW, useMarketingTheme } from '../marketing/shared';

/**
 * Public route at `/c/<encoded-url>` or `/c/<host>/<path>` that loads any
 * public URL in an iframe and offers two next-step actions:
 *
 *   - "Save to a board" (if signed in) ships it to /api/captures.
 *   - "Discuss this" deep-links into /signup with the URL preserved so the
 *     follow-up flow ends on the board.
 *
 * If the target page blocks framing (X-Frame-Options DENY / CSP frame-ancestors)
 * we surface a clear next-step (install extension, request screenshot) instead
 * of leaving the user with a blank rectangle.
 */
export default function CaptureViewer() {
  useMarketingTheme('Capture · Foldo');

  const targetUrl = useMemo(() => decodeTargetFromPath(), []);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [frameStatus, setFrameStatus] = useState<'loading' | 'ok' | 'blocked'>(
    'loading',
  );
  const [savingState, setSavingState] = useState<
    | { kind: 'idle' }
    | { kind: 'saving' }
    | { kind: 'saved'; boardId: string; frameId: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  // Heuristic: if the iframe never fires `load` within 4s, treat it as blocked.
  // Sites that respond with X-Frame-Options: DENY raise no load event in any
  // current browser (security-by-silence). Real loads fire well under 4s.
  useEffect(() => {
    if (!targetUrl) return;
    const handle = window.setTimeout(() => {
      setFrameStatus((s) => (s === 'loading' ? 'blocked' : s));
    }, 4500);
    return () => window.clearTimeout(handle);
  }, [targetUrl]);

  if (!targetUrl) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: PAPER,
          color: INK,
          fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
          padding: '60px 24px',
          textAlign: 'center',
        }}
      >
        <MarketingStyles />
        <h1 className="display" style={{ fontSize: 36, marginBottom: 14 }}>
          Hmm, no URL.
        </h1>
        <p style={{ color: '#666' }}>
          Prepend{' '}
          <code style={{ background: '#fff', padding: '2px 8px', borderRadius: 6 }}>
            foldo.dev/c/
          </code>{' '}
          to any public URL to capture it for review.
        </p>
        <p style={{ marginTop: 18 }}>
          <a className="btn-primary" href="/">
            Back home
          </a>
        </p>
      </div>
    );
  }

  async function saveToBoard(): Promise<void> {
    if (!targetUrl) return;
    setSavingState({ kind: 'saving' });
    const token = readToken();
    if (!token) {
      // Anonymous user. Pin the URL into ?next= so the post-signup flow can
      // come back here and try again.
      const nextUrl = encodeURIComponent(location.href);
      window.location.assign(`/signup?next=${nextUrl}`);
      return;
    }
    try {
      // Fetch the user's boards, pick the first one (MVP). Future iteration:
      // a board picker modal.
      const me = await fetch(`${API_BASE}/api/home`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!me.ok) throw new Error(`Couldn't load your boards (${me.status})`);
      const data = (await me.json()) as { boards: Array<{ id: string }> };
      const board = data.boards[0];
      if (!board) throw new Error('You have no boards yet. Create one first.');

      const res = await fetch(`${API_BASE}/api/captures`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          boardId: board.id,
          url: targetUrl,
          title: niceHost(targetUrl),
          viewport: { width: 1280, height: 900 },
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Capture failed (${res.status})`);
      }
      const payload = (await res.json()) as { frame: { id: string; boardId: string } };
      setSavingState({
        kind: 'saved',
        boardId: payload.frame.boardId,
        frameId: payload.frame.id,
      });
      /* A+W1 features — auto-redirect to the board after a brief "Saved to
         board" affordance. Previously the user had to click "Open on canvas",
         which was an unnecessary extra step for the happy path. */
      try {
        window.setTimeout(() => {
          window.location.href = `/board/${payload.frame.boardId}#frame=${payload.frame.id}`;
        }, 1000);
      } catch {
        /* ignore — fallback button still works */
      }
    } catch (err) {
      setSavingState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to save',
      });
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: PAPER,
        color: INK,
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <MarketingStyles />

      {/* Toolbar */}
      <header
        style={{
          background: '#fff',
          borderBottom: `1.5px solid ${SOFT_GREY}`,
          padding: '10px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: INK }}>
          <FoldoMark size={26} />
          <span className="display" style={{ fontSize: 18, lineHeight: 1, marginTop: 2 }}>Foldo</span>
        </a>
        <span style={{ color: '#bbb' }}>/</span>
        <code
          style={{
            background: '#f4efe6',
            color: INK,
            padding: '4px 10px',
            borderRadius: 8,
            fontSize: 12.5,
            maxWidth: '50vw',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={targetUrl}
        >
          {targetUrl}
        </code>
        <span style={{ flex: 1 }} />
        {savingState.kind === 'saved' ? (
          /* A+W1 features — surface the redirect intent so the user knows
             the page is about to navigate. The href is still clickable as
             an immediate-take, in case the 1s timer is intercepted. */
          <a
            href={`/board/${savingState.boardId}`}
            className="btn-primary"
            data-testid="foldo-capture-saved-redirect"
            style={{ padding: '8px 14px', fontSize: 13 }}
          >
            Saved to board · opening…
          </a>
        ) : (
          <button
            type="button"
            onClick={() => void saveToBoard()}
            className="btn-primary"
            disabled={savingState.kind === 'saving'}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              opacity: savingState.kind === 'saving' ? 0.6 : 1,
            }}
          >
            {savingState.kind === 'saving' ? 'Saving…' : 'Save to a board'}
          </button>
        )}
        <a href={targetUrl} target="_blank" rel="noreferrer" className="btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }}>
          Open original
        </a>
      </header>

      {savingState.kind === 'error' && (
        <div
          role="alert"
          style={{
            background: '#fff0f0',
            border: '1px solid #ffd2d2',
            color: '#a02020',
            padding: '10px 18px',
            fontSize: 13.5,
          }}
        >
          {savingState.message}
        </div>
      )}

      {/* Viewer */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          background: '#1a1814',
          display: 'flex',
        }}
      >
        <iframe
          ref={iframeRef}
          src={targetUrl}
          title="Foldo capture"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          style={{
            width: '100%',
            height: '100%',
            border: 0,
            background: '#fff',
          }}
          onLoad={() => setFrameStatus('ok')}
        />
        {frameStatus !== 'ok' && (
          <BlockedOverlay
            url={targetUrl}
            stillTrying={frameStatus === 'loading'}
          />
        )}
      </div>
    </div>
  );
}

function BlockedOverlay({
  url,
  stillTrying,
}: {
  url: string;
  stillTrying: boolean;
}) {
  // Try a server-side screenshot fallback. The shotter origin is exposed via
  // a build-time env var; when unset we just skip the offer.
  const shotter =
    (import.meta.env.VITE_SHOTTER_URL as string | undefined) ?? '';
  const shotUrl = shotter
    ? `${shotter}/shot?url=${encodeURIComponent(url)}&w=1280&h=900`
    : null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(17,17,17,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        pointerEvents: stillTrying ? 'none' : 'auto',
      }}
    >
      <div
        style={{
          background: '#fff',
          maxWidth: 480,
          width: '100%',
          borderRadius: 18,
          padding: '28px 30px',
          boxShadow: '0 30px 60px -20px rgba(17,17,17,0.4)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            margin: '0 auto 14px',
            borderRadius: '50%',
            background: PILLOW,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
          }}
        >
          🔒
        </div>
        <h2 className="display" style={{ fontSize: 28, margin: '0 0 8px' }}>
          {stillTrying ? 'Loading…' : 'This site blocks embedding'}
        </h2>
        <p
          style={{
            color: '#555',
            fontSize: 14.5,
            lineHeight: 1.55,
            marginBottom: 18,
          }}
        >
          {stillTrying
            ? 'Hold tight while the page renders…'
            : 'The owner of this page set X-Frame-Options, so Foldo can\'t iframe it. Two ways forward:'}
        </p>
        {!stillTrying && (
          <div style={{ display: 'grid', gap: 10, textAlign: 'left' }}>
            {shotUrl && (
              <a
                href={shotUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-primary"
                style={{ justifyContent: 'center' }}
              >
                Open a server-side screenshot
              </a>
            )}
            <a
              href="/extension"
              className={shotUrl ? 'btn-ghost' : 'btn-primary'}
              style={{ justifyContent: 'center' }}
            >
              Install the Chrome extension
            </a>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost"
              style={{ justifyContent: 'center' }}
            >
              Open the page in a new tab
            </a>
          </div>
        )}
        <p style={{ marginTop: 16, fontSize: 12, color: '#888' }}>
          {shotUrl
            ? 'Static screenshot uses our headless Chromium service. Good for read-only previews. Use the extension for auth-walled pages.'
            : 'A server-side screenshot fallback is coming. Until then, the extension grabs auth-walled pages too.'}
        </p>
      </div>
    </div>
  );
}

function decodeTargetFromPath(): string | null {
  if (typeof location === 'undefined') return null;
  // /c/<rest> — rest is either a fully-encoded URL or "host/path?query".
  const m = /^\/c\/(.+)$/.exec(location.pathname + location.search + location.hash);
  if (!m) return null;
  let raw = m[1];
  // If it doesn't look like a URL, prepend https://.
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // ignore decode errors, treat as-is
  }
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).toString();
    } catch {
      return null;
    }
  }
  // Heuristic: looks like a host (has a dot, no spaces).
  if (/^[^/\s]+\.[^/\s]+/.test(raw)) {
    try {
      return new URL('https://' + raw).toString();
    } catch {
      return null;
    }
  }
  return null;
}

function niceHost(url: string): string {
  try {
    const u = new URL(url);
    return u.host + (u.pathname && u.pathname !== '/' ? u.pathname : '');
  } catch {
    return url;
  }
}

// Avoid an unused-import warning until we surface the colour token in a hover
// state below. Cheap, removes a lint flake without touching the import block.
void YELLOW;
