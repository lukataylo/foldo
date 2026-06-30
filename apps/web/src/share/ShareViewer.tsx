import { useEffect, useMemo, useState } from 'react';
import type {
  Board,
  Branch,
  Comment,
  Frame,
  User,
} from '@foldo/protocol';
/* A+W1 features — comment rendering on the share viewer. */
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
      data-testid="foldo-share-viewer-root"
      data-foldo-share-status={state.status}
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
        /* A+W1 touch: phone-friendly margins + frame grid so the shared view
           reads cleanly when a colleague opens the URL on an iPhone. */
        @media (max-width: 600px) {
          .share-shell { padding: 0 14px 64px; }
          .share-cta { padding: 10px 14px; font-size: 13px; }
          .frame-grid { grid-template-columns: 1fr !important; gap: 12px !important; }
          .share-title { font-size: 24px !important; }
        }
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

      {/* A+W1 features — keep the read-only CTA but soften the "sign up to
          comment" copy now that comments are actually rendered. */}
      <div className="share-cta" data-testid="foldo-share-readonly-badge">
        <FoldoMark size={22} />
        <span>
          You're viewing a read-only share of <strong>this board</strong>.
        </span>
        <span style={{ flex: 1 }} />
        <a href="/signup">Sign up to join the conversation</a>
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
  const { board, branches, frames, comments, users } = data;
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

  /* A+W1 features — group comments by frame for the markers. */
  const commentsByFrame = useMemo(() => {
    const m = new Map<string, Comment[]>();
    for (const c of comments) {
      const arr = m.get(c.frameId) ?? [];
      arr.push(c);
      m.set(c.frameId, arr);
    }
    for (const list of m.values()) {
      list.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    }
    return m;
  }, [comments]);

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
                  <FrameTile
                    key={f.id}
                    frame={f}
                    comments={commentsByFrame.get(f.id) ?? []}
                    userById={userById}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

function FrameTile({
  frame,
  comments,
  userById,
}: {
  frame: Frame;
  comments: Comment[];
  userById: Map<string, User>;
}) {
  const c = frame.content;
  /* A+W1 features — open the read-only comment list panel when the badge
     is clicked. Filtered to unresolved by default so the badge count
     matches what the viewer sees on the canvas. */
  const [panelOpen, setPanelOpen] = useState(false);
  const unresolved = useMemo(
    () => comments.filter((c) => !c.resolved),
    [comments],
  );

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
    <div
      className="frame-tile"
      data-testid="foldo-share-viewer-frame-tile"
      data-foldo-frame-id={frame.id}
      data-foldo-frame-kind={c.kind}
      style={{ position: 'relative' }}
    >
      <div className="preview" style={{ position: 'relative' }}>
        <span className="chip">{kindLabel}</span>
        {unresolved.length > 0 && (
          <CommentMarkers
            count={unresolved.length}
            onClick={() => setPanelOpen((o) => !o)}
            frameId={frame.id}
          />
        )}
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
      {panelOpen && (
        <CommentList
          comments={comments}
          userById={userById}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
}

/* A+W1 features — small badge layered on a frame thumbnail showing the
   count of unresolved comments. Click toggles the read-only list. */
function CommentMarkers({
  count,
  onClick,
  frameId,
}: {
  count: number;
  onClick: () => void;
  frameId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="foldo-share-comment-badge"
      data-foldo-comment-frame-id={frameId}
      title={`${count} comment${count === 1 ? '' : 's'} on this frame`}
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: '#ff7849',
        color: '#fff',
        border: 'none',
        borderRadius: 999,
        padding: '4px 9px',
        fontSize: 11.5,
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 2px 6px rgba(17,17,17,0.18)',
        lineHeight: 1,
      }}
    >
      <CommentDot /> {count}
    </button>
  );
}

function CommentDot() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H6.4l-3.2 2.7A.5.5 0 0 1 2.4 13V4z" />
    </svg>
  );
}

/* A+W1 features — read-only comment list. No reply/resolve actions; this
   is intentionally just a viewer (signed-out users land here). */
function CommentList({
  comments,
  userById,
  onClose,
}: {
  comments: Comment[];
  userById: Map<string, User>;
  onClose: () => void;
}) {
  return (
    <div
      data-testid="foldo-share-comment-panel"
      role="dialog"
      aria-label="Comments on this frame"
      style={{
        position: 'absolute',
        zIndex: 5,
        top: 8,
        right: 8,
        width: 280,
        maxHeight: 320,
        overflowY: 'auto',
        background: '#fff',
        border: `1.5px solid #E6E3DE`,
        borderRadius: 12,
        boxShadow: '0 20px 50px -20px rgba(17,17,17,0.35)',
        padding: '10px 12px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <strong style={{ fontSize: 12.5 }}>
          {comments.length} comment{comments.length === 1 ? '' : 's'}
        </strong>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close comments"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: '#666',
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>
      {comments.length === 0 ? (
        <div style={{ fontSize: 12, color: '#888' }}>
          No comments on this frame yet.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {comments.map((c) => {
            const author = userById.get(c.authorUserId);
            return (
              <li
                key={c.id}
                data-testid="foldo-share-comment-item"
                data-foldo-comment-id={c.id}
                style={{
                  padding: '6px 0',
                  borderTop: '1px solid #f0ece6',
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 2,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: c.authorColor,
                      color: '#fff',
                      fontSize: 9.5,
                      fontWeight: 700,
                    }}
                  >
                    {c.authorInitial}
                  </span>
                  <strong style={{ fontSize: 12 }}>
                    {author?.name ?? c.authorName}
                  </strong>
                  {c.resolved && (
                    <span
                      style={{
                        color: '#5a8a4a',
                        fontSize: 10.5,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      resolved
                    </span>
                  )}
                </div>
                <div style={{ color: '#333' }}>{c.text || <em style={{ color: '#aaa' }}>empty</em>}</div>
                {c.replies.length > 0 && (
                  <div
                    style={{
                      marginTop: 4,
                      paddingLeft: 10,
                      borderLeft: '2px solid #f0ece6',
                      color: '#555',
                    }}
                  >
                    {c.replies.map((r) => (
                      <div key={r.id} style={{ fontSize: 12, marginTop: 4 }}>
                        <strong>{r.authorName}: </strong>
                        {r.text}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
