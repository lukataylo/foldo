import { useEffect, useState, type FormEvent } from 'react';
import { API_BASE, readToken } from '../marketing/auth';
import { INK, SOFT_GREY } from '../marketing/shared';
import type { HomeBoardSummary } from './api';

interface NewBoardModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (board: HomeBoardSummary) => void;
}

interface ApiBoard {
  id: string;
  name: string;
  repoSlug: string;
  devUrl?: string;
  createdAt: string;
}

export function NewBoardModal({ open, onClose, onCreated }: NewBoardModalProps) {
  const [name, setName] = useState('');
  const [repoSlug, setRepoSlug] = useState('');
  const [devUrl, setDevUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName('');
      setRepoSlug('');
      setDevUrl('');
      setBusy(false);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!name.trim()) {
      setError('Board name is required.');
      return;
    }
    if (!/^[\w.-]+\/[\w.-]+$/.test(repoSlug.trim())) {
      setError('Repo must look like owner/repo (e.g. acme/landing).');
      return;
    }
    setBusy(true);
    try {
      const token = readToken();
      const res = await fetch(`${API_BASE}/api/boards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: name.trim(),
          repoSlug: repoSlug.trim(),
          devUrl: devUrl.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Couldn't create board (${res.status}).`);
        return;
      }
      const data = (await res.json()) as { board: ApiBoard };
      const b = data.board;
      const summary: HomeBoardSummary = {
        id: b.id,
        name: b.name,
        repoSlug: b.repoSlug,
        devUrl: b.devUrl,
        createdAt: b.createdAt,
        branchCount: 1,
        frameCount: 0,
        commentCount: 0,
        lastActivity: b.createdAt,
        branchColors: ['#9a9a9a'],
      };
      onCreated(summary);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create a new board"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(17,17,17,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 80,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          border: `1.5px solid ${SOFT_GREY}`,
          borderRadius: 18,
          padding: '28px 30px',
          width: '100%',
          maxWidth: 460,
          boxShadow: '0 30px 60px -20px rgba(17,17,17,0.4)',
        }}
      >
        <h2
          className="display"
          style={{ fontSize: 26, margin: '0 0 6px', letterSpacing: '0.02em' }}
        >
          New board
        </h2>
        <p style={{ color: '#666', fontSize: 14, lineHeight: 1.55, margin: '0 0 18px' }}>
          Connect a repo to a fresh canvas. You'll own it. Invite the rest of
          the pack from the board itself.
        </p>
        <form onSubmit={handleSubmit}>
          <Field label="Board name">
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="acme landing"
              maxLength={80}
              required
              disabled={busy}
              style={inputStyle}
              data-testid="foldo-home-newboard-name"
            />
          </Field>
          <Field label="Repo (owner / repo)">
            <input
              type="text"
              value={repoSlug}
              onChange={(e) => setRepoSlug(e.target.value)}
              placeholder="acme/landing"
              required
              disabled={busy}
              style={inputStyle}
              data-testid="foldo-home-newboard-repo"
            />
          </Field>
          <Field
            label="Dev URL"
            hint="Optional · where your local app runs (https://staging.acme.dev, http://localhost:3000)."
          >
            <input
              type="url"
              value={devUrl}
              onChange={(e) => setDevUrl(e.target.value)}
              placeholder="https://"
              disabled={busy}
              style={inputStyle}
            />
          </Field>

          {error && (
            <div
              role="alert"
              style={{
                marginTop: 4,
                marginBottom: 14,
                padding: '10px 14px',
                borderRadius: 10,
                background: '#fff0f0',
                border: '1px solid #ffd2d2',
                color: '#a02020',
                fontSize: 13.5,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
            <button
              type="button"
              className="btn-ghost compact"
              onClick={onClose}
              disabled={busy}
              style={{ padding: '10px 16px', fontSize: 13 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary compact"
              disabled={busy}
              style={{
                padding: '10px 18px',
                fontSize: 14,
                opacity: busy ? 0.6 : 1,
              }}
              data-testid="foldo-home-newboard-submit"
            >
              {busy ? 'Creating…' : 'Create board'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#444', marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {hint && (
        <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{hint}</div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#fff',
  border: `1.5px solid ${SOFT_GREY}`,
  borderRadius: 10,
  padding: '11px 14px',
  fontSize: 14,
  color: INK,
  outline: 'none',
};
