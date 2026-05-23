// Pin the email-verification token rules.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool, initSchema } from '../db.ts';
import { upsertUser } from '../repo/users.ts';
import {
  _clearEmailVerificationsForTests,
  consumeEmailVerificationToken,
  deleteExpiredEmailVerifications,
  mintEmailVerificationToken,
} from '../repo/emailVerifications.ts';

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

const USER_ID = 'u-test-emailverif-' + Date.now().toString(36);
const EMAIL = 'verify-' + Date.now().toString(36) + '@foldo.test';

d('emailVerifications repo', () => {
  beforeAll(async () => {
    await initSchema();
    await upsertUser({
      id: USER_ID,
      name: 'Verif Test',
      initial: 'V',
      color: '#999',
      email: EMAIL,
      kind: 'human',
    });
  });
  beforeEach(async () => {
    await _clearEmailVerificationsForTests();
  });
  afterAll(async () => {
    await _clearEmailVerificationsForTests();
    await closePool();
  });

  it('mints a 64-char hex token with a 24h-ish TTL', async () => {
    const before = Date.now();
    const { token, expiresAt } = await mintEmailVerificationToken(USER_ID, EMAIL);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(before + 23 * 3600_000);
    expect(expiresAt.getTime()).toBeLessThan(before + 25 * 3600_000);
  });

  it('consume returns the userId + email exactly once', async () => {
    const { token } = await mintEmailVerificationToken(USER_ID, EMAIL);
    const first = await consumeEmailVerificationToken(token);
    expect(first).toEqual({ userId: USER_ID, email: EMAIL });
    const second = await consumeEmailVerificationToken(token);
    expect(second).toBeNull();
  });

  it('rejects malformed and unknown tokens', async () => {
    expect(await consumeEmailVerificationToken('')).toBeNull();
    expect(await consumeEmailVerificationToken('xx')).toBeNull();
    expect(await consumeEmailVerificationToken('a'.repeat(64))).toBeNull();
  });

  it('rejects expired tokens', async () => {
    const { token } = await mintEmailVerificationToken(USER_ID, EMAIL, 0);
    expect(await consumeEmailVerificationToken(token)).toBeNull();
  });

  it('consuming one token invalidates other outstanding tokens for the same user', async () => {
    const a = await mintEmailVerificationToken(USER_ID, EMAIL);
    const b = await mintEmailVerificationToken(USER_ID, EMAIL);
    const c = await mintEmailVerificationToken(USER_ID, EMAIL);
    expect(await consumeEmailVerificationToken(b.token)).toMatchObject({
      userId: USER_ID,
    });
    expect(await consumeEmailVerificationToken(a.token)).toBeNull();
    expect(await consumeEmailVerificationToken(c.token)).toBeNull();
  });

  it('GC sweep removes expired rows', async () => {
    await mintEmailVerificationToken(USER_ID, EMAIL, 0);
    await mintEmailVerificationToken(USER_ID, EMAIL, 24);
    const removed = await deleteExpiredEmailVerifications();
    expect(removed).toBeGreaterThanOrEqual(1);
  });
});
