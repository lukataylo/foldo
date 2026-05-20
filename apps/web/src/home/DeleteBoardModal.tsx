import { useEffect, useState } from 'react';
import { INK, SOFT_GREY } from '../marketing/shared';
import { deleteBoard } from './api';

interface DeleteBoardModalProps {
  boardId: string;
  boardName: string;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteBoardModal({
  boardId,
  boardName,
  onClose,
  onDeleted,
}: DeleteBoardModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const handleDelete = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteBoard(boardId);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the board.');
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Delete board"
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
      onClick={() => !busy && onClose()}
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
          style={{ fontSize: 24, margin: '0 0 8px', letterSpacing: '0.02em' }}
        >
          Delete board
        </h2>
        <p style={{ color: '#555', fontSize: 14, lineHeight: 1.55, margin: '0 0 4px' }}>
          Delete <strong>{boardName}</strong> and everything on it — branches,
          frames, comments. This can't be undone.
        </p>
        {error && (
          <div
            role="alert"
            style={{
              marginTop: 12,
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
          style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}
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
            type="button"
            onClick={() => void handleDelete()}
            disabled={busy}
            style={{
              padding: '10px 18px',
              fontSize: 14,
              borderRadius: 10,
              border: 0,
              background: '#c0392b',
              color: '#fff',
              fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? 'Deleting…' : 'Delete board'}
          </button>
        </div>
      </div>
    </div>
  );
}
