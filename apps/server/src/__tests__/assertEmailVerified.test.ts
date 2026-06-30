// Unit test for the gating helper. Pure logic — no DB needed.

import { describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import type { User } from '@foldo/protocol';
import { assertEmailVerified } from '../auth.ts';

function req(user: User | undefined): FastifyRequest {
  return { user } as unknown as FastifyRequest;
}

const HUMAN: User = {
  id: 'u-anna',
  name: 'Anna',
  initial: 'A',
  color: '#999',
  email: 'anna@foldo.test',
  kind: 'human',
};
const AGENT: User = {
  ...HUMAN,
  id: 'u-claude',
  name: 'Claude',
  initial: 'C',
  email: undefined,
  kind: 'agent',
};
const DEMO: User = { ...HUMAN, id: 'u-you', email: undefined };

describe('assertEmailVerified', () => {
  it('throws 401 if there is no user (unauthenticated)', () => {
    let thrown: unknown;
    try {
      assertEmailVerified(req(undefined));
    } catch (e) {
      thrown = e;
    }
    expect((thrown as Error & { statusCode?: number })?.statusCode).toBe(401);
  });

  it('throws 403 EMAIL_NOT_VERIFIED for a human with email but no verification', () => {
    let thrown: unknown;
    try {
      assertEmailVerified(req(HUMAN));
    } catch (e) {
      thrown = e;
    }
    const err = thrown as Error & { statusCode?: number; code?: string };
    expect(err?.statusCode).toBe(403);
    expect(err?.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('passes for a human whose emailVerifiedAt is set', () => {
    const verified: User = { ...HUMAN, emailVerifiedAt: '2026-01-01T00:00:00.000Z' };
    expect(assertEmailVerified(req(verified))).toBe(verified);
  });

  it('grandfathers agent accounts (no email by design)', () => {
    expect(assertEmailVerified(req(AGENT))).toBe(AGENT);
  });

  it('grandfathers demo accounts (no email on the row)', () => {
    expect(assertEmailVerified(req(DEMO))).toBe(DEMO);
  });
});
