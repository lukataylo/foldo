// `/verify?token=…` — landing for the email-verification link. Calls the
// server's verify endpoint and renders a success / failure state.
// Anonymous (no auth required) so a user can click the link from any browser.

import { useEffect, useState } from 'react';
import SimplePage from './SimplePage';
import { API_BASE } from './auth';

type State =
  | { kind: 'verifying' }
  | { kind: 'success'; email: string }
  | { kind: 'failed'; message: string };

// Module-level cache of in-flight + settled verification calls keyed by token.
// The verify endpoint is single-use, so StrictMode's double-mount in dev would
// otherwise fire two requests — first consumes the token (200), second 400s.
// Cache means subsequent mounts share the same Promise + final state instead
// of starting a fresh request.
type VerifyOutcome =
  | { ok: true; email: string }
  | { ok: false; message: string };
const inflight: Map<string, Promise<VerifyOutcome>> = new Map();

async function verifyToken(token: string): Promise<VerifyOutcome> {
  const cached = inflight.get(token);
  if (cached) return cached;
  const p = (async (): Promise<VerifyOutcome> => {
    const res = await fetch(
      `${API_BASE}/api/auth/verify-email?token=${encodeURIComponent(token)}`,
    );
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      email?: string;
      error?: string;
    };
    if (res.ok && body.ok) {
      return { ok: true, email: body.email ?? '' };
    }
    return {
      ok: false,
      message: body.error ?? 'Verification failed — request a new link.',
    };
  })();
  inflight.set(token, p);
  return p;
}

export default function Verify() {
  const [state, setState] = useState<State>({ kind: 'verifying' });

  useEffect(() => {
    let cancelled = false;
    const token = (() => {
      try {
        return new URLSearchParams(location.search).get('token') ?? '';
      } catch {
        return '';
      }
    })();
    if (!token) {
      setState({
        kind: 'failed',
        message: 'This link is missing its verification token.',
      });
      return;
    }
    (async () => {
      try {
        const outcome = await verifyToken(token);
        if (cancelled) return;
        if (outcome.ok) {
          setState({ kind: 'success', email: outcome.email });
        } else {
          setState({ kind: 'failed', message: outcome.message });
        }
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: 'failed',
          message: err instanceof Error ? err.message : 'Network error',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SimplePage
      title="Verify email"
      chip="🐕 Verify"
      intro="Confirming your email address with Foldo."
    >
      {state.kind === 'verifying' && (
        <div
          data-testid="foldo-verify-pending"
          style={{ color: '#555', fontSize: 14 }}
        >
          Verifying…
        </div>
      )}
      {state.kind === 'success' && (
        <div
          data-testid="foldo-verify-success"
          style={{
            background: '#f1faef',
            border: '1px solid #c9ebbf',
            padding: '14px 16px',
            borderRadius: 10,
            color: '#1f6b1f',
            maxWidth: 420,
          }}
        >
          <strong>Verified.</strong>{' '}
          {state.email
            ? `${state.email} is now confirmed. `
            : 'Your email is now confirmed. '}
          You can close this tab — or jump back to <a href="/home">/home</a>.
        </div>
      )}
      {state.kind === 'failed' && (
        <div
          data-testid="foldo-verify-error"
          role="alert"
          style={{
            background: '#fff0f0',
            border: '1px solid #ffd2d2',
            padding: '14px 16px',
            borderRadius: 10,
            color: '#a02020',
            maxWidth: 420,
          }}
        >
          <strong>That didn't work.</strong>
          <p style={{ marginTop: 6, lineHeight: 1.55 }}>{state.message}</p>
          <p style={{ marginTop: 10, fontSize: 13 }}>
            Open Foldo, click the "Verify your email" banner, and request a
            fresh link.
          </p>
        </div>
      )}
    </SimplePage>
  );
}
