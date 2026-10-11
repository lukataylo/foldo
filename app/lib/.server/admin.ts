import { adminEmails } from './config';

// server helpers for the organizer console (routes/admin.tsx)

export const isAdminRow = (u: { role: string; email: string }) => u.role === 'admin' || adminEmails().includes(u.email);

// why a provider test failed, in a few words for the status column ("401 · key rejected")
export function testNote(e: any) {
  // the AI SDK retries and wraps the last failure
  const err = e?.lastError ?? e;

  if (err?.name === 'TimeoutError' || err?.name === 'AbortError' || err?.cause?.name === 'TimeoutError') {
    return 'timed out after 15 s';
  }

  const status: number | undefined = err?.statusCode ?? err?.status;
  const message = String(err?.message ?? 'no reply');
  const reason =
    status === 401 || status === 403
      ? 'key rejected'
      : status === 404
        ? 'model or URL not found'
        : status === 429
          ? 'rate limited'
          : /connect|ECONNREFUSED|fetch failed|ENOTFOUND/i.test(message)
            ? "can't reach the provider"
            : message.slice(0, 60);

  return status ? `${status} · ${reason}` : reason;
}
