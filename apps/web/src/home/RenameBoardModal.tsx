import { useEffect, useState, type FormEvent } from 'react';
import { INK, SOFT_GREY } from '../marketing/shared';
import { renameBoard } from './api';

interface RenameBoardModalProps {
  boardId: string;
  currentName: string;
  onClose: () => void;
  onRenamed: (name: string) => void;
}

export function RenameBoardModal({
  boardId,
  currentName,
  onClose,
  onRenamed,
}: RenameBoardModalProps) {
  const [name, setName] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Board name is required.');
      return;
    }
    if (trimmed === currentName) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await renameBoard(boardId, trimmed);
      onRenamed(next);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename the board.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rename board"
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
          padding: '26px 28px',
          width: '100%',
          maxWidth: 420,
          boxShadow: '0 30px 60px -20px rgba(17,17,17,0.4)',
        }}
      >
        <h2
          className="display"
          style={{ fontSize: 24, margin: '0 0 14px', letterSpacing: '0.02em' }}
        >
          Rename board
        </h2>
        <form onSubmit={handleSubmit}>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            disabled={busy}
            aria-label="Board name"
            style={{
              width: '100%',
              background: '#fff',
              border: `1.5px solid ${SOFT_GREY}`,
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 14,
              color: INK,
              outline: 'none',
            }}
          />
          {error && (
            <div
              role="alert"
              style={{
                marginTop: 10,
                padding: '10px 12px',
                borderRadius: 10,
                background: '#fff0f0',
                border: '1px solid #ffd2d2',
                color: '#a02020',
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
          <div
            style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}
          >
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
              style={{ padding: '10px 18px', fontSize: 14, opacity: busy ? 0.6 : 1 }}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
