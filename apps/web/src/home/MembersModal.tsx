import { useEffect, useState, type FormEvent } from 'react';
import { INK, SOFT_GREY } from '../marketing/shared';
import {
  changeMemberRole,
  inviteBoardMember,
  listBoardMembers,
  removeBoardMember,
  type BoardMember,
  type BoardRole,
} from './api';

interface MembersModalProps {
  boardId: string;
  boardName: string;
  /** The viewer's own role on this board — only an owner sees the edit controls. */
  myRole: BoardRole;
  myUserId: string;
  onClose: () => void;
  onToast?: (msg: string) => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#fff',
  border: `1.5px solid ${SOFT_GREY}`,
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 14,
  color: INK,
  outline: 'none',
};

export function MembersModal({
  boardId,
  boardName,
  myRole,
  myUserId,
  onClose,
  onToast,
}: MembersModalProps) {
  const isOwner = myRole === 'owner';
  const [members, setMembers] = useState<BoardMember[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  /** userIds with a mutation in flight — disables their row controls. */
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listBoardMembers(boardId);
        if (!cancelled) setMembers(list);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load members');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  const toast = (m: string) => {
    if (onToast) onToast(m);
  };

  const setBusy = (userId: string, on: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(userId);
      else next.delete(userId);
      return next;
    });
  };

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (inviting) return;
    setInviteError(null);
    const value = email.trim();
    if (!value) {
      setInviteError('Enter the email of the person you want to invite.');
      return;
    }
    setInviting(true);
    try {
      const member = await inviteBoardMember(boardId, value, inviteRole);
      setMembers((prev) => (prev ? [...prev, member] : [member]));
      setEmail('');
      toast(`${member.name} added to "${boardName}"`);
    } catch (err) {
      // Surface "user not found" plainly — in this MVP they must sign up first.
      setInviteError(
        err instanceof Error ? err.message : 'Could not send the invite.',
      );
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (m: BoardMember, role: BoardRole) => {
    if (role === m.role) return;
    const prevRole = m.role;
    setBusy(m.userId, true);
    // Optimistic — patch the row, roll back on failure.
    setMembers((prev) =>
      prev ? prev.map((x) => (x.userId === m.userId ? { ...x, role } : x)) : prev,
    );
    try {
      await changeMemberRole(boardId, m.userId, role);
      toast(`${m.name} is now ${role}`);
    } catch (err) {
      setMembers((prev) =>
        prev
          ? prev.map((x) =>
              x.userId === m.userId ? { ...x, role: prevRole } : x,
            )
          : prev,
      );
      toast(
        err instanceof Error ? `Couldn't change role: ${err.message}` : `Couldn't change role`,
      );
    } finally {
      setBusy(m.userId, false);
    }
  };

  const handleRemove = async (m: BoardMember) => {
    setBusy(m.userId, true);
    const snapshot = members;
    // Optimistic removal.
    setMembers((prev) => (prev ? prev.filter((x) => x.userId !== m.userId) : prev));
    try {
      await removeBoardMember(boardId, m.userId);
      toast(`${m.name} removed from "${boardName}"`);
    } catch (err) {
      setMembers(snapshot ?? null); // roll back
      toast(
        err instanceof Error ? `Couldn't remove: ${err.message}` : `Couldn't remove member`,
      );
    } finally {
      setBusy(m.userId, false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Members of ${boardName}`}
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
          maxWidth: 520,
          maxHeight: '86vh',
          overflowY: 'auto',
          boxShadow: '0 30px 60px -20px rgba(17,17,17,0.4)',
        }}
      >
        <h2
          className="display"
          style={{ fontSize: 26, margin: '0 0 4px', letterSpacing: '0.02em' }}
        >
          Members
        </h2>
        <p style={{ color: '#666', fontSize: 14, margin: '0 0 18px' }}>
          Who can see and work on <strong>{boardName}</strong>.
        </p>

        {isOwner && (
          <form onSubmit={handleInvite} style={{ marginBottom: 18 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12.5,
                fontWeight: 600,
                color: '#444',
                marginBottom: 6,
              }}
            >
              Invite by email
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@acme.dev"
                disabled={inviting}
                style={{ ...inputStyle, flex: 1 }}
              />
              <select
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as 'editor' | 'viewer')
                }
                disabled={inviting}
                aria-label="Invite role"
                style={{ ...inputStyle, width: 'auto' }}
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button
                type="submit"
                className="btn-primary compact"
                disabled={inviting}
                style={{ padding: '10px 16px', fontSize: 13, opacity: inviting ? 0.6 : 1 }}
              >
                {inviting ? 'Inviting…' : 'Invite'}
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>
              They need a Foldo account already — invites match an existing
              sign-up.
            </div>
            {inviteError && (
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
                {inviteError}
              </div>
            )}
          </form>
        )}

        {loadError && (
          <div
            role="alert"
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: '#fff0f0',
              border: '1px solid #ffd2d2',
              color: '#a02020',
              fontSize: 13,
            }}
          >
            {loadError}
          </div>
        )}

        {members == null && !loadError && (
          <div style={{ color: '#888', fontSize: 14, padding: '8px 0' }}>
            Loading members…
          </div>
        )}

        {members != null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {members.map((m) => {
              const busy = busyIds.has(m.userId);
              const isSelf = m.userId === myUserId;
              return (
                <div
                  key={m.userId}
                  data-testid="member-row"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 4px',
                    borderBottom: `1px solid ${SOFT_GREY}`,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      background: m.color,
                      color: INK,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 13,
                      flex: 'none',
                      border: `1.5px solid ${INK}`,
                    }}
                  >
                    {m.initial}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {m.name}
                      {isSelf && (
                        <span style={{ color: '#999', fontWeight: 400 }}> · you</span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: '#888',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {m.email ?? (m.kind === 'agent' ? 'Agent' : m.userId)}
                    </div>
                  </div>
                  {isOwner ? (
                    <select
                      value={m.role}
                      disabled={busy}
                      aria-label={`Role for ${m.name}`}
                      onChange={(e) =>
                        void handleRoleChange(m, e.target.value as BoardRole)
                      }
                      style={{
                        background: '#fff',
                        border: `1.5px solid ${SOFT_GREY}`,
                        borderRadius: 8,
                        padding: '6px 8px',
                        fontSize: 13,
                        color: INK,
                      }}
                    >
                      <option value="owner">Owner</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  ) : (
                    <span
                      style={{
                        fontSize: 12.5,
                        color: '#777',
                        textTransform: 'capitalize',
                      }}
                    >
                      {m.role}
                    </span>
                  )}
                  {isOwner && (
                    <button
                      type="button"
                      aria-label={`Remove ${m.name}`}
                      disabled={busy}
                      onClick={() => void handleRemove(m)}
                      className="btn-ghost compact"
                      style={{
                        padding: '6px 10px',
                        fontSize: 12.5,
                        opacity: busy ? 0.5 : 1,
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            type="button"
            className="btn-ghost compact"
            onClick={onClose}
            style={{ padding: '10px 16px', fontSize: 13 }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
