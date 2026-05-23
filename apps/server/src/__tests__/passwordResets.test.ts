// Token mint/verify rules pinned. These run against a real Postgres in
// `process.env.DATABASE_URL` — set DATABASE_URL to a test DB before vitest
// (CI provides one; locally, the same dev DB works because each test wipes
// its own rows).
//
// Skipped in environments without a DB so unit-only runs (e.g. `npm test`
// without a Postgres on PATH) still pass — flipped on with TEST_DB=1.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool, initSchema } from '../db.ts';
import { upsertUser } from '../repo/users.ts';
import {
  _clearPasswordResetTokensForTests,
  consumePasswordResetToken,
  deleteExpiredPasswordResetTokens,
  mintPasswordResetToken,
} from '../repo/passwordResets.ts';

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

const USER_ID = 'u-test-pwreset-' + Date.now().toString(36);

d('passwordResets repo', () => {
  beforeAll(async () => {
    await initSchema();
    await upsertUser({
      id: USER_ID,
      name: 'PwReset Test',
      initial: 'P',
      color: '#999',
      kind: 'human',
    });
  });

  beforeEach(async () => {
    await _clearPasswordResetTokensForTests();
  });

  afterAll(async () => {
    await _clearPasswordResetTokensForTests();
    await closePool();
  });

  it('mints a fresh token with the expected TTL', async () => {
    const before = Date.now();
    const { token, expiresAt } = await mintPasswordResetToken(USER_ID, 15);
    expect(token).toMatch(/^[a-f0-9]{64}$/); // 32 bytes hex
    expect(expiresAt.getTime()).toBeGreaterThan(before + 14 * 60_000);
    expect(expiresAt.getTime()).toBeLessThan(before + 16 * 60_000);
  });

  it('consume() succeeds once and then refuses replay', async () => {
    const { token } = await mintPasswordResetToken(USER_ID);
    const first = await consumePasswordResetToken(token);
    expect(first?.userId).toBe(USER_ID);
    const second = await consumePasswordResetToken(token);
    expect(second).toBeNull();
  });

  it('rejects an unknown / malformed token', async () => {
    expect(await consumePasswordResetToken('')).toBeNull();
    expect(await consumePasswordResetToken('xx')).toBeNull();
    expect(await consumePasswordResetToken('a'.repeat(64))).toBeNull();
  });

  it('rejects an expired token', async () => {
    // ttlMinutes=0 → expires immediately. The validation clause uses
    // `expires_at > now()` so the just-minted row fails consume.
    const { token } = await mintPasswordResetToken(USER_ID, 0);
    const result = await consumePasswordResetToken(token);
    expect(result).toBeNull();
  });

  it('consuming one token invalidates every other outstanding token for that user', async () => {
    const a = await mintPasswordResetToken(USER_ID);
    const b = await mintPasswordResetToken(USER_ID);
    const c = await mintPasswordResetToken(USER_ID);
    expect(await consumePasswordResetToken(b.token)).toEqual({ userId: USER_ID });
    expect(await consumePasswordResetToken(a.token)).toBeNull();
    expect(await consumePasswordResetToken(c.token)).toBeNull();
  });

  it('GC sweep deletes expired rows', async () => {
    await mintPasswordResetToken(USER_ID, 0); // expired immediately
    await mintPasswordResetToken(USER_ID, 30); // alive
    const removed = await deleteExpiredPasswordResetTokens();
    expect(removed).toBeGreaterThanOrEqual(1);
  });
});
