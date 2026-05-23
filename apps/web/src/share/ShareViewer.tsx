import { useEffect, useMemo, useState } from 'react';
import type {
  Board,
  Branch,
  Comment,
  Frame,
  User,
} from '@foldo/protocol';
import { API_BASE } from '../marketing/auth';
import {
  FoldoMark,
  INK,
  MarketingStyles,
  PAPER,
  SOFT_GREY,
  YELLOW,
  useMarketingTheme,
} from '../marketing/shared';

// Read-only public viewer for `/share/:token`. Intentionally lightweight: it
// avoids the live-WS bound canvas in App.tsx and renders a static grid of
// frame thumbnails grouped by branch.

interface SharePayload {
  board: Board;
  branches: Branch[];
  frames: Frame[];
  comments: Comment[];
  users: User[];
  readOnly: true;
}

function getTokenFromPath(): string | null {
  if (typeof location === 'undefined') return null;
  // Both `/s/<token>` (current) and `/share/<token>` (legacy) are accepted.
  const match = /^\/(?:s|share)\/([^/?#]+)/.exec(location.pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function ShareViewer() {
  useMarketingTheme('Foldo · Shared board');
  const token = useMemo(() => getTokenFromPath(), []);
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; data: SharePayload }
  >({ status: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({ status: 'error', message: 'Missing share token.' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/share/${encodeURIComponent(token)}`,
        );
        if (res.status === 404) {
          if (!cancelled) {
            setState({
              status: 'error',
              message: 'This share link is no longer active.',
            });
          }
          return;
        }
        if (!res.ok) {
          if (!cancelled) {
            setState({
              status: 'error',
              message: `Couldn't load this board (${res.status}).`,
            });
          }
          return;
        }
        const data = (await res.json()) as SharePayload;
        if (!cancelled) setState({ status: 'ready', data });
      } catch (err) {
        if (cancelled) return;
        const raw = err instanceof Error ? err.message : String(err);
        // Common fetch failures: "Failed to fetch", "NetworkError", etc.
        // Translate to a friendlier line that doesn't blame the user.
        const friendly = /failed to fetch|networkerror|load failed/i.test(raw)
          ? 'Couldn’t reach the Foldo server. Check your connection and try again.'
          : raw;
        setState({
          status: 'error',
          message: friendly,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: PAPER,
        color: INK,
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <MarketingStyles />
      <style>{`
        .share-shell { max-width: 1180px; margin: 0 auto; padding: 0 24px 96px; }
        .share-cta {
          background: ${YELLOW}; border-bottom: 1.5px solid ${INK};
          padding: 10px 20px; display: flex; align-items: center; gap: 14px;
          flex-wrap: wrap; font-size: 13.5px;
        }
        .share-cta a {
          color: ${INK}; text-decoration: none;
          background: ${INK}; color: #fff; padding: 7px 12px;
          border-radius: 999px; font-weight: 600; font-size: 12.5px;
        }
        .share-cta a:hover { opacity: 0.85; }
        .share-header { display:flex; align-items:center; gap:14px; padding: 22px 0 8px; }
        .share-title { font-family: "Luckiest Guy", system-ui, sans-serif; font-size: 30px; margin: 0; }
        .share-sub { color: #666; font-size: 13.5px; }
        .branch-pill {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 6px 12px; border-radius: 999px;
          background: #fff; border: 1.5px solid ${SOFT_GREY};
          font-size: 12.5px; font-weight: 600;
        }
        .branch-pill .dot { width: 9px; height: 9px; border-radius: 50%; }
        .branch-section { margin-top: 28px; }
        .branch-section h2 { font-size: 15px; margin: 0 0 14px; display:flex; align-items:center; gap:10px; }
        .frame-grid {
          display: grid; gap: 18px;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        }
        .frame-tile {
          background: #fff; border: 1.5px solid ${SOFT_GREY};
          border-radius: 14px; overflow: hidden;
          display: flex; flex-direction: column;
        }
        .frame-tile .preview {
          aspect-ratio: 5/3; background: ${PAPER};
          border-bottom: 1.5px solid ${SOFT_GREY};
          display:flex; align-items:center; justify-content:center;
          padding: 14px;
        }
        .frame-tile .preview .chip {
          padding: 6px 10px; border-radius: 999px;
          background: rgba(0,0,0,0.05); font-size: 11.5px; font-weight: 600;
          color: #555;
        }
        .frame-tile .body { padding: 12px 14px 14px; display:flex; flex-direction:column; gap:6px; }
        .frame-tile .commit { font-weight: 600; font-size: 13.5px; line-height: 1.35; }
        .frame-tile .meta { font-size: 12px; color: #777; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .frame-tile .sha {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 11.5px; color: #888;
        }
        .share-empty {
          background: #fff; border: 1.5px solid ${SOFT_GREY};
          border-radius: 18px; padding: 32px;
          color: #666; font-size: 14px;
        }
      `}</style>

      <div className="share-cta" data-testid="foldo-share-readonly-badge">
        <FoldoMark size={22} />
        <span>
          You're viewing a read-only share of <strong>this board</strong>.
        </span>
        <span style={{ flex: 1 }} />
        <a href="/signup">Sign up to comment</a>
      </div>

      <div className="share-shell">
        {state.status === 'loading' && (
          <div style={{ padding: '60px 0', color: '#777' }}>Loading shared board…</div>
        )}
        {state.status === 'error' && (
          <div className="share-empty" role="alert" style={{ marginTop: 40 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Can't open this share.</div>
            <div>{state.message}</div>
          </div>
        )}
        {state.status === 'ready' && (
          <ShareContent data={state.data} />
        )}
      </div>
    </div>
  );
}

function ShareContent({ data }: { data: SharePayload }) {
  const { board, branches, frames, users } = data;
  const userById = useMemo(() => {
    const m = new Map<string, User>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  const framesByBranch = useMemo(() => {
    const m = new Map<string, Frame[]>();
    for (const f of frames) {
      const list = m.get(f.branchId) ?? [];
      list.push(f);
      m.set(f.branchId, list);
    }
    for (const list of m.values()) {
      list.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    }
    return m;
  }, [frames]);

  return (
    <>
      <div className="share-header">
        <div>
          <h1 className="share-title">{board.name}</h1>
          <div className="share-sub">
            {board.repoSlug} · {frames.length} frame{frames.length === 1 ? '' : 's'} ·{' '}
            {branches.length} branch{branches.length === 1 ? '' : 'es'}
          </div>
        </div>
      </div>

      {branches.length === 0 && (
        <div className="share-empty" style={{ marginTop: 24 }}>
          No branches on this board yet.
        </div>
      )}

      {branches.map((branch) => {
        const branchFrames = framesByBranch.get(branch.id) ?? [];
        const author = userById.get(branch.authorUserId);
        return (
          <section key={branch.id} className="branch-section">
            <h2>
              <span className="branch-pill">
                <span
                  className="dot"
                  style={{ background: branch.color }}
                />
                {branch.name}
              </span>
              <span style={{ color: '#777', fontSize: 12.5, fontWeight: 400 }}>
                {author ? `by ${author.name}` : ''}
                {branchFrames.length > 0
                  ? ` · ${branchFrames.length} frame${branchFrames.length === 1 ? '' : 's'}`
                  : ''}
              </span>
            </h2>
            {branchFrames.length === 0 ? (
              <div className="share-empty">No frames on this branch.</div>
            ) : (
              <div className="frame-grid">
                {branchFrames.map((f) => (
                  <FrameTile key={f.id} frame={f} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

function FrameTile({ frame }: { frame: Frame }) {
  const c = frame.content;
  const kindLabel =
    c.kind === 'markdown'
      ? 'Doc frame'
      : c.kind === 'app'
        ? 'App frame'
        : c.kind === 'sticky'
          ? 'Sticky note'
          : c.kind === 'arrow'
            ? 'Arrow'
            : c.kind === 'image'
              ? 'Image'
              : 'Frame';
  const previewDetail =
    c.kind === 'markdown'
      ? c.title || c.docPath
      : c.kind === 'app'
        ? `${c.variant} · ${c.route}`
        : c.kind === 'sticky'
          ? (c.body ?? '').slice(0, 80)
          : c.kind === 'image'
            ? c.caption || c.alt || 'Image'
            : '';
  return (
    <div className="frame-tile">
      <div className="preview">
        <span className="chip">{kindLabel}</span>
      </div>
      <div className="body">
        <div className="commit" title={frame.commitMessage}>
          {frame.commitMessage}
        </div>
        <div className="meta">
          <span className="sha">{frame.commitSha.slice(0, 7)}</span>
          <span aria-hidden style={{ color: '#ccc' }}>·</span>
          <span>{frame.age}</span>
        </div>
        <div className="meta" style={{ color: '#999' }}>{previewDetail}</div>
      </div>
    </div>
  );
}
