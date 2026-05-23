// Per-line authorship is what makes the "tints" view on a markdown frame
// meaningful — every contributor sees who touched what. The rules are easy
// to misimplement; these tests pin the exact behaviour.

import { describe, expect, it } from 'vitest';
import type { MarkdownFrameContent } from '@foldo/protocol';
import { stampMarkdownAuthorship } from '../routes/frames.ts';

const FIXED_TS = '2026-05-23T18:00:00.000Z';
const nowFn = () => FIXED_TS;

function md(body: string, lineAuthors?: MarkdownFrameContent['lineAuthors']): MarkdownFrameContent {
  return { kind: 'markdown', docPath: 'x.md', title: 'x.md', body, lineAuthors };
}

describe('stampMarkdownAuthorship', () => {
  it('returns the next content untouched when body is identical', () => {
    const prev = md('a\nb');
    const next = md('a\nb');
    const result = stampMarkdownAuthorship(prev, next, 'u-anna', nowFn);
    // Same object reference — no allocation when nothing changed.
    expect(result).toBe(next);
  });

  it('stamps only the line that changed', () => {
    const prev = md('line one\nline two\nline three');
    const next = md('line one\nLINE TWO\nline three');
    const result = stampMarkdownAuthorship(prev, next, 'u-anna', nowFn);
    expect(result.lineAuthors).toEqual({
      1: { authorUserId: 'u-anna', editedAt: FIXED_TS },
    });
    expect(result.lastEditedBy).toBe('u-anna');
    expect(result.lastEditedAt).toBe(FIXED_TS);
  });

  it('keeps prior authorship on unchanged lines', () => {
    const priorAuthors = {
      '0': { authorUserId: 'u-mateo', editedAt: '2026-01-01T00:00:00.000Z' },
      '1': { authorUserId: 'u-priya', editedAt: '2026-02-01T00:00:00.000Z' },
    };
    const prev = md('original\nuntouched\nsecond original', priorAuthors);
    const next = md('rewritten\nuntouched\nsecond original');
    const result = stampMarkdownAuthorship(prev, next, 'u-anna', nowFn);
    // Line 0 was rewritten → new stamp.
    expect(result.lineAuthors?.[0]).toEqual({
      authorUserId: 'u-anna',
      editedAt: FIXED_TS,
    });
    // Line 1 was untouched → prior stamp preserved.
    expect(result.lineAuthors?.[1]).toEqual(priorAuthors[1]);
    // Line 2 had no prior author and didn't change → no entry.
    expect(result.lineAuthors?.[2]).toBeUndefined();
  });

  it('treats added lines as edits', () => {
    const prev = md('a');
    const next = md('a\nb\nc');
    const result = stampMarkdownAuthorship(prev, next, 'u-anna', nowFn);
    expect(result.lineAuthors).toEqual({
      1: { authorUserId: 'u-anna', editedAt: FIXED_TS },
      2: { authorUserId: 'u-anna', editedAt: FIXED_TS },
    });
  });

  it('drops authorship for removed lines (they no longer exist in next)', () => {
    const priorAuthors = {
      '0': { authorUserId: 'u-anna', editedAt: '2026-01-01T00:00:00.000Z' },
      '1': { authorUserId: 'u-mateo', editedAt: '2026-01-02T00:00:00.000Z' },
    };
    const prev = md('a\nb', priorAuthors);
    const next = md('a');
    const result = stampMarkdownAuthorship(prev, next, 'u-priya', nowFn);
    expect(Object.keys(result.lineAuthors ?? {}).sort()).toEqual(['0']);
    expect(result.lineAuthors?.[0]).toEqual(priorAuthors[0]);
  });

  it('handles empty bodies on both sides', () => {
    const prev = md('');
    const next = md('');
    const result = stampMarkdownAuthorship(prev, next, 'u-anna', nowFn);
    expect(result).toBe(next);
  });

  it('handles missing body fields without throwing', () => {
    const prev = md('something');
    // Explicit undefined body — protocol allows it.
    const next: MarkdownFrameContent = {
      kind: 'markdown',
      docPath: 'x.md',
      title: 'x.md',
    };
    const result = stampMarkdownAuthorship(prev, next, 'u-anna', nowFn);
    // next.body is undefined → equivalent to '' for the diff. prev has one
    // non-empty line, next has zero — that's a change.
    expect(result.lastEditedBy).toBe('u-anna');
  });
});
