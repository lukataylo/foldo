import { useState } from 'react';
import type { Comment } from '@foldo/protocol';

interface Props {
  comment: Comment;
  screenPosition: { x: number; y: number };
  onClose: () => void;
  onMakeEdit: () => void;
  onReply?: (text: string) => Promise<void> | void;
  onResolve?: () => void;
}

export function CommentPopover({
  comment,
  screenPosition,
  onClose,
  onMakeEdit,
  onReply,
  onResolve,
}: Props) {
  const [replyText, setReplyText] = useState('');
  const [replyOpen, setReplyOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submitReply = async () => {
    const text = replyText.trim();
    if (!text || !onReply) return;
    setSubmitting(true);
    try {
      await onReply(text);
      setReplyText('');
      setReplyOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  // Clamp the popover position to the viewport so it doesn't clip off-screen.
  const W = 320; // matches w-80
  const H = 280; // approximate; popover grows with replies
  const margin = 12;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
  let left = screenPosition.x + 12;
  let top = screenPosition.y - 8;
  if (left + W + margin > vw) left = Math.max(margin, screenPosition.x - W - margin);
  if (top + H + margin > vh) top = Math.max(margin, vh - H - margin);
  if (top < margin) top = margin;
  if (left < margin) left = margin;

  return (
    <div
      className="fade-in pointer-events-auto absolute z-[60] w-80 rounded-xl border border-hairline bg-panel shadow-panel"
      style={{ left, top }}
    >
      <div className="flex items-center justify-between border-b border-hairlineSoft px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div
            className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
            style={{ background: comment.authorColor }}
          >
            {comment.authorInitial}
          </div>
          <div>
            <div className="text-[12px] font-medium text-ink">
              {comment.authorName}
            </div>
            <div className="text-[10.5px] text-inkFaint">
              {formatTime(comment.createdAt)}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-inkMute hover:bg-white/5 hover:text-ink"
        >
          <svg width="11" height="11" viewBox="0 0 16 16">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="px-3 py-2.5">
        <div className="text-[12.5px] leading-relaxed text-ink">
          {comment.text}
        </div>
        {comment.target?.elementLabel && (
          <div className="mt-2 rounded-md border border-hairlineSoft bg-canvas/80 px-2 py-1.5 font-mono text-[10.5px] text-inkMute">
            <span className="text-inkFaint">target · </span>
            {comment.target.elementLabel}
            {comment.target.elementFile && (
              <div className="mt-0.5 text-inkFaint">
                {comment.target.elementFile}:{comment.target.elementLine}
              </div>
            )}
          </div>
        )}

        {comment.replies.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-hairlineSoft pt-2">
            {comment.replies.map((r) => (
              <div key={r.id} className="flex items-start gap-2">
                <div
                  className="mt-[2px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                  style={{ background: r.authorColor }}
                >
                  {r.authorInitial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[11.5px] font-medium text-ink">
                      {r.authorName}
                    </span>
                    <span className="text-[10px] text-inkFaint">
                      {formatTime(r.createdAt)}
                    </span>
                  </div>
                  <div className="text-[12px] text-inkMute">{r.text}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {replyOpen && (
          <div className="mt-2">
            <textarea
              autoFocus
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={2}
              placeholder="Reply…"
              className="w-full resize-none rounded-md border border-hairlineSoft bg-canvas px-2 py-1.5 text-[12px] text-ink placeholder:text-inkFaint focus:border-accent/60 focus:outline-none"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void submitReply();
                }
              }}
            />
            <div className="mt-1 flex items-center justify-end gap-2">
              <button
                disabled={submitting}
                onClick={() => setReplyOpen(false)}
                className="rounded-md px-2 py-1 text-[11px] text-inkMute hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                disabled={submitting || !replyText.trim()}
                onClick={() => void submitReply()}
                className="rounded-md bg-accent/15 px-2 py-1 text-[11.5px] font-medium text-accent hover:bg-accent/25 disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Reply'}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-hairlineSoft px-3 py-2">
        <button
          onClick={() => setReplyOpen((o) => !o)}
          className="text-[11.5px] text-inkMute hover:text-ink"
        >
          Reply
        </button>
        <button
          onClick={onResolve}
          className="text-[11.5px] text-inkMute hover:text-ink"
        >
          {comment.resolved ? 'Unresolve' : 'Resolve'}
        </button>
        <button
          onClick={onMakeEdit}
          className="flex items-center gap-1.5 rounded-md bg-accent/15 px-2 py-1 text-[11.5px] font-medium text-accent hover:bg-accent/25"
        >
          <Sparkle /> Make this an edit
        </button>
      </div>
    </div>
  );
}

function formatTime(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const diff = Date.now() - t;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

function Sparkle() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 2.5l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />
    </svg>
  );
}
