import { describe, expect, it } from 'vitest';
import { normalizeEmail } from './email';

describe('normalizeEmail', () => {
  it('accepts ordinary addresses, trimmed and lower-cased', () => {
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com');
    expect(normalizeEmail('first.last+tag@mail.example.co.uk')).toBe('first.last+tag@mail.example.co.uk');
    expect(normalizeEmail('a_b-c@sub-domain.example.io')).toBe('a_b-c@sub-domain.example.io');
  });

  it('rejects things that are not one address', () => {
    for (const bad of [
      '',
      'ada',
      'ada@',
      '@example.com',
      'ada@example',
      'ada@example.c',
      'ada@@example.com',
      'ada lovelace@example.com',
      'ada@exa mple.com',
      'ada@example..com',
      'ada@.example.com',
      'ada@-example.com',
      'ada@example-.com',
      '.ada@example.com',
      'ada.@example.com',
      'a..da@example.com',
      '<ada@example.com>',
      'ada@example.com, bob@example.com',
      'ada@example.com\nbcc:bob@example.com',
    ]) {
      expect(normalizeEmail(bad), bad).toBeUndefined();
    }
  });

  it('rejects non-strings and overlong input', () => {
    expect(normalizeEmail(undefined)).toBeUndefined();
    expect(normalizeEmail(42)).toBeUndefined();
    expect(normalizeEmail(['a@b.co'])).toBeUndefined();
    expect(normalizeEmail(`${'a'.repeat(65)}@example.com`)).toBeUndefined();
    expect(normalizeEmail(`a@${'b'.repeat(250)}.com`)).toBeUndefined();
  });
});
