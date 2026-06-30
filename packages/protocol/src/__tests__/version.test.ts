// Wire-protocol version compat is a hard-fail boundary — a mistake here
// silently breaks every browser tab on a deploy. These tests pin the rules.

import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, isCompatibleProtocolVersion } from '../ws.ts';

describe('isCompatibleProtocolVersion', () => {
  it('treats an unversioned (pre-1.0) client as compatible', () => {
    expect(isCompatibleProtocolVersion(undefined)).toBe(true);
    expect(isCompatibleProtocolVersion('')).toBe(true);
  });

  it('accepts the current version', () => {
    expect(isCompatibleProtocolVersion(PROTOCOL_VERSION)).toBe(true);
  });

  it('accepts minor and patch differences within the same major', () => {
    expect(isCompatibleProtocolVersion('1.99.0', '1.0.0')).toBe(true);
    expect(isCompatibleProtocolVersion('1.0.0', '1.99.99')).toBe(true);
    expect(isCompatibleProtocolVersion('1.5.7', '1.2.3')).toBe(true);
  });

  it('rejects a major mismatch in either direction', () => {
    expect(isCompatibleProtocolVersion('2.0.0', '1.0.0')).toBe(false);
    expect(isCompatibleProtocolVersion('0.9.0', '1.0.0')).toBe(false);
  });

  it('matches by the first dotted segment, not by lexicographic prefix', () => {
    // "10.0.0" must NOT be considered compatible with "1.0.0" just because
    // the string starts with "1" — the major is 10, not 1.
    expect(isCompatibleProtocolVersion('10.0.0', '1.0.0')).toBe(false);
  });
});
