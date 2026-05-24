// Coverage for the CSS validator used by the DOM Editor panel. The
// validator is best-effort: it catches the common gotchas (bare
// numbers, malformed colors, unknown transforms) without trying to
// be a full CSS parser. Each case below documents which class of
// error it's defending against.

import { describe, expect, it } from 'vitest';
import { validateCssValue } from '../cssValidate';

describe('validateCssValue — lengths', () => {
  it('accepts a length with a known unit', () => {
    expect(validateCssValue('padding-top', '12px')).toEqual({ ok: true });
    expect(validateCssValue('width', '1.4rem')).toEqual({ ok: true });
    expect(validateCssValue('font-size', '100%')).toEqual({ ok: true });
    expect(validateCssValue('gap', '-4em')).toEqual({ ok: true });
  });

  it('accepts 0 with no unit, and the auto keyword', () => {
    expect(validateCssValue('width', '0')).toEqual({ ok: true });
    expect(validateCssValue('width', 'auto')).toEqual({ ok: true });
    expect(validateCssValue('top', 'auto')).toEqual({ ok: true });
  });

  it('rejects a bare number with a useful "missing unit" message', () => {
    const r = validateCssValue('padding-top', '12');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/missing unit/i);
  });

  it('rejects a number with an unknown unit suffix', () => {
    const r = validateCssValue('width', '10pq');
    expect(r.ok).toBe(false);
  });

  it('accepts calc() / var() / clamp() and balances parens', () => {
    expect(validateCssValue('width', 'calc(100% - 16px)')).toEqual({ ok: true });
    expect(validateCssValue('width', 'var(--foo)')).toEqual({ ok: true });
    expect(validateCssValue('width', 'clamp(10px, 5vw, 100px)')).toEqual({ ok: true });
    const r = validateCssValue('width', 'calc(100% - 16px');
    expect(r.ok).toBe(false);
  });
});

describe('validateCssValue — colors', () => {
  it('accepts named colors and the transparent / currentColor keywords', () => {
    expect(validateCssValue('color', 'red')).toEqual({ ok: true });
    expect(validateCssValue('color', 'transparent')).toEqual({ ok: true });
    expect(validateCssValue('color', 'currentColor')).toEqual({ ok: true });
  });

  it('accepts hex 3 / 4 / 6 / 8 forms', () => {
    expect(validateCssValue('color', '#fff')).toEqual({ ok: true });
    expect(validateCssValue('color', '#ffff')).toEqual({ ok: true });
    expect(validateCssValue('color', '#ffffff')).toEqual({ ok: true });
    expect(validateCssValue('color', '#ffffffff')).toEqual({ ok: true });
  });

  it('rejects malformed hex', () => {
    const r1 = validateCssValue('color', '#fffff'); // 5 chars
    const r2 = validateCssValue('color', '#zzz');
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
  });

  it('accepts rgb() / rgba() / hsl() / oklch() with arguments', () => {
    expect(validateCssValue('color', 'rgb(0,0,0)')).toEqual({ ok: true });
    expect(validateCssValue('color', 'rgba(0,0,0,0.5)')).toEqual({ ok: true });
    expect(validateCssValue('color', 'hsl(120, 50%, 50%)')).toEqual({ ok: true });
    expect(validateCssValue('color', 'oklch(0.6 0.18 250)')).toEqual({ ok: true });
  });

  it('rejects an unknown color function', () => {
    const r = validateCssValue('color', 'frogcolor(1,2,3)');
    expect(r.ok).toBe(false);
  });
});

describe('validateCssValue — transforms', () => {
  it('accepts a single transform function', () => {
    expect(validateCssValue('transform', 'rotate(45deg)')).toEqual({ ok: true });
    expect(validateCssValue('transform', 'scale(1.5)')).toEqual({ ok: true });
    expect(validateCssValue('transform', 'translate(10px, 20px)')).toEqual({ ok: true });
  });

  it('accepts chained transforms', () => {
    expect(
      validateCssValue('transform', 'rotate(45deg) scale(1.2) translate(10px)'),
    ).toEqual({ ok: true });
  });

  it('accepts the none keyword', () => {
    expect(validateCssValue('transform', 'none')).toEqual({ ok: true });
  });

  it('rejects an unknown transform function', () => {
    const r = validateCssValue('transform', 'flubber(1)');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unknown transform/i);
  });

  it('rejects unbalanced parens', () => {
    expect(validateCssValue('transform', 'rotate(45deg').ok).toBe(false);
  });
});

describe('validateCssValue — opacity / z-index / numeric props', () => {
  it('accepts opacity 0..1', () => {
    expect(validateCssValue('opacity', '0')).toEqual({ ok: true });
    expect(validateCssValue('opacity', '0.5')).toEqual({ ok: true });
    expect(validateCssValue('opacity', '1')).toEqual({ ok: true });
  });

  it('accepts opacity as a percentage', () => {
    expect(validateCssValue('opacity', '50%')).toEqual({ ok: true });
  });

  it('rejects out-of-range opacity', () => {
    expect(validateCssValue('opacity', '1.5').ok).toBe(false);
    expect(validateCssValue('opacity', '-0.1').ok).toBe(false);
    expect(validateCssValue('opacity', '150%').ok).toBe(false);
  });

  it('accepts integer z-index and the auto keyword', () => {
    expect(validateCssValue('z-index', '10')).toEqual({ ok: true });
    expect(validateCssValue('z-index', '-1')).toEqual({ ok: true });
    expect(validateCssValue('z-index', 'auto')).toEqual({ ok: true });
  });

  it('rejects fractional z-index', () => {
    expect(validateCssValue('z-index', '1.5').ok).toBe(false);
  });
});

describe('validateCssValue — enum-style props', () => {
  it('accepts known display / position / flex-direction / border-style values', () => {
    expect(validateCssValue('display', 'flex')).toEqual({ ok: true });
    expect(validateCssValue('display', 'GRID')).toEqual({ ok: true }); // case-insensitive
    expect(validateCssValue('position', 'absolute')).toEqual({ ok: true });
    expect(validateCssValue('flex-direction', 'column-reverse')).toEqual({ ok: true });
    expect(validateCssValue('border-style', 'dashed')).toEqual({ ok: true });
  });

  it('rejects unknown enum values', () => {
    expect(validateCssValue('display', 'spaghetti').ok).toBe(false);
    expect(validateCssValue('position', 'fluid').ok).toBe(false);
  });
});

describe('validateCssValue — passthrough', () => {
  it('treats an empty value as "no override"', () => {
    expect(validateCssValue('padding-top', '')).toEqual({ ok: true });
    expect(validateCssValue('color', '   ')).toEqual({ ok: true });
  });

  it('passes unknown properties through unchecked', () => {
    expect(validateCssValue('this-prop-doesnt-exist', 'whatever-value')).toEqual({
      ok: true,
    });
  });

  it('accepts font-weight as keyword or 100..900', () => {
    expect(validateCssValue('font-weight', 'bold')).toEqual({ ok: true });
    expect(validateCssValue('font-weight', '500')).toEqual({ ok: true });
    expect(validateCssValue('font-weight', 'wobbly').ok).toBe(false);
  });

  it('accepts unitless line-height', () => {
    expect(validateCssValue('line-height', '1.5')).toEqual({ ok: true });
    expect(validateCssValue('line-height', '20px')).toEqual({ ok: true });
    expect(validateCssValue('line-height', 'normal')).toEqual({ ok: true });
  });
});
