import { useEffect, useState } from 'react';
import {
  apiListShares,
  apiRevokeShare,
  type BoardShareSummary,
} from '../api/boards';

interface Props {
  open: boolean;
  boardId: string | null;
  onClose: () => void;
}

/**
 * A+ W2 product gap — surface for revoking share links.
 *
 * Lists every active share token on the current board with the token
 * prefix, when it was minted, and a Revoke button. Revoking is a single
 * DELETE call that flips revoked_at on the server; the row disappears
 * from the modal optimistically while the request is in flight.
 *
 * Mirrors the CaptureModal conventions:
 *   - Esc closes
 *   - click outside the panel closes
 *   - panel is positioned absolutely inside the App.tsx canvas root so the
 *     dim backdrop covers the whole viewport via pointer-events: auto.
 */
export function ShareManagementModal({ open, boardId, onClose }: Props) {
  const [shares, setShares] = useState<BoardShareSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);

  // Fetch shares each time the modal opens — keeps the list fresh without
  // having to subscribe to a WS event. boardId-as-key in App.tsx would also
  // remount this, but we cheap out and just refetch on open.
  useEffect(() => {
    if (!open || !boardId) return;
    let cancelled = false;
    setShares(null);
    setError(null);
    (async () => {
      try {
        const { shares } = await apiListShares(boardId);
        if (!cancelled) setShares(shares);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, boardId]);

  // Esc closes — mirrors CaptureModal + the kebab menu in BoardCard.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const onRevoke = async (token: string) => {
    if (!boardId) return;
    setRevokingToken(token);
    try {
      await apiRevokeShare(boardId, token);
      // Optimistic: drop the row from the visible list. The server has
      // already stamped revoked_at, so a subsequent re-open is consistent.
      setShares((prev) => (prev ? prev.filter((s) => s.token !== token) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke');
    } finally {
      setRevokingToken(null);
    }
  };

  return (
    <div
      data-testid="foldo-share-mgmt-modal"
      className="pointer-events-auto absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      // Click-outside dismiss: clicks on the backdrop close, clicks inside
      // the panel are stopped (see panel onClick below).
      onClick={onClose}
    >
      <div
        className="w-[520px] max-w-[92vw] overflow-hidden rounded-xl border border-hairline bg-panel shadow-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Manage share links"
      >
        <div className="flex items-center justify-between border-b border-hairlineSoft px-4 py-3">
          <div className="flex items-center gap-2 text-ink">
            <LinkIcon />
            <div>
              <div className="text-[13px] font-medium">Share links</div>
              <div className="text-[11px] text-inkFaint">
                Active links to this board · revoke to kill them
              </div>
            </div>
          </div>
          <button
            data-testid="foldo-share-mgmt-close"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-inkMute hover:bg-white/5 hover:text-ink"
            aria-label="Close"
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

        <div className="max-h-[420px] overflow-y-auto px-4 py-3">
          {error && (
            <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {error}
            </div>
          )}
          {shares == null && !error && (
            <div className="py-8 text-center text-[12px] text-inkMute">
              Loading…
            </div>
          )}
          {shares != null && shares.length === 0 && (
            <div
              data-testid="foldo-share-mgmt-empty"
              className="py-8 text-center text-[12.5px] text-inkMute"
            >
              No active share links. Mint one from the Share menu.
            </div>
          )}
          {shares != null && shares.length > 0 && (
            <ul
              data-testid="foldo-share-mgmt-list"
              className="flex flex-col gap-1"
            >
              {shares.map((s) => (
                <li
                  key={s.token}
                  data-testid="foldo-share-mgmt-row"
                  data-token={s.token}
                  className="flex items-center justify-between gap-3 rounded-md border border-hairlineSoft bg-canvas/60 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[12px] text-ink">
                      {s.token.slice(0, 6)}…{s.token.slice(-3)}
                    </div>
                    <div className="text-[10.5px] text-inkFaint">
                      Minted {formatDate(s.createdAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid="foldo-share-mgmt-revoke"
                    disabled={revokingToken === s.token}
                    onClick={() => void onRevoke(s.token)}
                    className="rounded-md border border-red-300/50 bg-white/0 px-2.5 py-1 text-[12px] text-red-500 hover:bg-red-50 disabled:opacity-50"
                  >
                    {revokingToken === s.token ? 'Revoking…' : 'Revoke'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end border-t border-hairlineSoft px-4 py-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[12px] text-inkMute hover:bg-white/5 hover:text-ink"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M6.5 9.5l3-3M6 11.5L4.5 13a2 2 0 1 1-2.8-2.8L3.2 8.7M10 4.5l1.5-1.5a2 2 0 1 1 2.8 2.8L12.8 7.3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}
