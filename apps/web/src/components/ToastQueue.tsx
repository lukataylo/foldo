// Toast queue. The previous implementation was a single `toast: string | null`
// slot, so when two errors arrived back-to-back only the latest was ever seen
// (the first was overwritten before the user could read it). This keeps a
// stack: each push gets its own id + 1.4s dismiss timer, and they render as a
// vertical pile bottom-centre, newest on top.
//
// Returned `push` is referentially stable so it can be passed to deps arrays
// or memoised callbacks without invalidating them.

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ToastItem {
  id: number;
  message: string;
  createdAt: number;
}

const DEFAULT_TTL_MS = 1400;
/** Cap the visible stack so a flood doesn't paint a wall of toasts. */
const MAX_VISIBLE = 4;

export interface ToastQueueApi {
  toasts: ToastItem[];
  push: (message: string) => void;
}

export function useToastQueue(ttlMs: number = DEFAULT_TTL_MS): ToastQueueApi {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(1);
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const push = useCallback(
    (message: string) => {
      if (!message) return;
      const id = nextIdRef.current++;
      setToasts((prev) => {
        const next = [...prev, { id, message, createdAt: Date.now() }];
        // Drop the oldest if we'd exceed MAX_VISIBLE so the floor doesn't grow
        // unbounded under a flood. Their timers fire harmlessly later.
        return next.length > MAX_VISIBLE ? next.slice(-MAX_VISIBLE) : next;
      });
      const t = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timersRef.current.delete(id);
      }, ttlMs);
      timersRef.current.set(id, t);
    },
    [ttlMs],
  );

  // Clear pending timers if the host unmounts.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  return { toasts, push };
}

/** Render the toast list bottom-centre. Newest sits on top of older ones. */
export function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none absolute bottom-16 left-1/2 z-50 flex -translate-x-1/2 flex-col-reverse items-center gap-1.5">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="rounded-full border border-hairline bg-panel px-4 py-1.5 text-[12px] text-ink shadow-panel fade-in"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
