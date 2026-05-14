// Thin fetch wrapper for POST /api/captures. The cloud is a peer that
// trusts the bearer token to attribute the capture; the extension never holds
// repository state, so this is the only outbound endpoint it talks to.

import type {
  CreateCaptureRequest,
  CreateCaptureResponse,
} from '@foldo/protocol';

export interface CreateCaptureOpts {
  cloudUrl: string;
  bearerToken: string;
  body: CreateCaptureRequest;
  signal?: AbortSignal;
}

export async function createCapture(
  opts: CreateCaptureOpts,
): Promise<CreateCaptureResponse> {
  const url = `${stripTrailingSlash(opts.cloudUrl)}/api/captures`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${opts.bearerToken}`,
    },
    body: JSON.stringify(opts.body),
    signal: opts.signal,
  });
  if (!res.ok) {
    const text = await safeText(res);
    throw new Error(
      `Foldo cloud responded ${res.status} ${res.statusText}${
        text ? `, ${text}` : ''
      }`,
    );
  }
  return (await res.json()) as CreateCaptureResponse;
}

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

async function safeText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    // Surface JSON error shapes, see ApiError in @foldo/protocol.
    try {
      const parsed = JSON.parse(t) as { error?: string };
      if (parsed && typeof parsed.error === 'string') return parsed.error;
    } catch {
      /* not JSON */
    }
    return t.slice(0, 280);
  } catch {
    return '';
  }
}
