// CSS value validation for the DOM Editor's input fields.
//
// The DOM Editor panel accepts free-text input for every CSS property —
// users type things like `12px`, `1.4rem`, `rgb(255,255,255)`, `auto`,
// `rotate(45deg) scale(1.2)`, etc. Before we broadcast a `foldo:inspect:
// apply` message to the iframe (which would otherwise quietly drop an
// invalid declaration), we ask `validateCssValue` whether the string
// looks reasonable for the property. If it doesn't, the panel paints a
// red border + tooltip on the input and skips the broadcast.
//
// This is intentionally a pure function with no DOM dependency so it
// round-trips cleanly in vitest's node environment. It's a "best effort
// pre-flight check" — not a CSS parser — and errs on the side of
// permissiveness: anything the browser would accept (CSS variables,
// shorthand, calc(), env(), …) passes through. The goal is to catch
// the common gotchas (`12` instead of `12px`, `#ggg` typos, malformed
// rgb()) before the value gets shipped over the postMessage bridge.

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string };

const OK: ValidationResult = { ok: true };
const fail = (msg: string): ValidationResult => ({ ok: false, error: msg });

// ---------- Shared helpers ----------

// Order matters: longer suffixes first so `rem` doesn't get matched as
// `em`, `vmin` doesn't get matched as `vm`, etc. The validator walks
// this list and stops at the first endsWith() hit.
const LENGTH_UNITS = [
  'vmin',
  'vmax',
  'rem',
  'px',
  'em',
  '%',
  'vw',
  'vh',
  'pt',
  'pc',
  'cm',
  'mm',
  'in',
  'ch',
  'ex',
  'fr',
];

const KEYWORD_LENGTHS = new Set([
  'auto',
  'inherit',
  'initial',
  'unset',
  'revert',
  'normal',
  'none',
  'fit-content',
  'min-content',
  'max-content',
]);

/** Pure numeric (with optional sign, decimal, exponent) — no unit. */
function isBareNumber(s: string): boolean {
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s.trim());
}

function startsWithFn(s: string, name: string): boolean {
  // case-insensitive function-name match: `Calc(1px)`, `CALC(1px)`, `calc(1px)`
  return new RegExp(`^${name}\\s*\\(`, 'i').test(s.trim());
}

function hasBalancedParens(s: string): boolean {
  let depth = 0;
  for (const c of s) {
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

/**
 * True if the value looks like a length / size — accepts:
 *   - `12px`, `0`, `1.4rem`, `-4em`, `100%`, `auto`, `none`
 *   - calc(), env(), var(), min(), max(), clamp()
 *   - keywords (`auto`, `fit-content`, etc.)
 * False on bare numbers (`12` → "missing unit").
 */
function looksLikeLength(s: string): ValidationResult {
  const t = s.trim();
  if (t === '') return OK; // empty = "no override" — handled by caller
  if (t === '0') return OK; // zero needs no unit
  if (KEYWORD_LENGTHS.has(t.toLowerCase())) return OK;
  if (t.startsWith('var(') || t.startsWith('calc(') ||
      startsWithFn(t, 'env') || startsWithFn(t, 'min') ||
      startsWithFn(t, 'max') || startsWithFn(t, 'clamp')) {
    if (!hasBalancedParens(t)) return fail('unbalanced parentheses');
    return OK;
  }
  if (isBareNumber(t)) return fail('missing unit (px, em, %, rem, …)');
  // Must end in a known unit. Strip trailing unit and verify the rest is a number.
  for (const u of LENGTH_UNITS) {
    if (t.toLowerCase().endsWith(u)) {
      const num = t.slice(0, -u.length).trim();
      if (isBareNumber(num)) return OK;
      return fail(`expected a number before "${u}"`);
    }
  }
  return fail('not a valid length (try 12px, 1.4rem, auto, …)');
}

// ---------- Colours ----------

const COLOR_KEYWORDS = new Set([
  'transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'revert',
  // a handful of the most common named colours — full CSS list is 140+
  // and the validator is best-effort, so we accept anything that looks
  // alphabetic without spaces as a "probably a named color" pass.
  'black', 'white', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta',
  'gray', 'grey', 'orange', 'purple', 'pink', 'brown', 'silver', 'gold',
  'lime', 'navy', 'teal', 'aqua', 'maroon', 'olive', 'fuchsia',
]);

function looksLikeColor(s: string): ValidationResult {
  const t = s.trim();
  if (t === '') return OK;
  if (COLOR_KEYWORDS.has(t.toLowerCase())) return OK;
  // hex: #rgb, #rgba, #rrggbb, #rrggbbaa
  if (t.startsWith('#')) {
    const hex = t.slice(1);
    if (!/^[0-9a-fA-F]+$/.test(hex)) return fail('hex contains non-hex chars');
    if (![3, 4, 6, 8].includes(hex.length)) {
      return fail('hex must be #rgb, #rgba, #rrggbb or #rrggbbaa');
    }
    return OK;
  }
  // functional colours: rgb(), rgba(), hsl(), hsla(), hwb(), lab(), lch(),
  // oklab(), oklch(), color(). Just verify name + balanced parens + at
  // least one argument; the browser is the final arbiter on number ranges.
  const fnMatch = t.match(/^([a-zA-Z]+)\s*\((.*)\)$/);
  if (fnMatch) {
    const name = fnMatch[1].toLowerCase();
    const args = fnMatch[2].trim();
    const known = [
      'rgb', 'rgba', 'hsl', 'hsla', 'hwb',
      'lab', 'lch', 'oklab', 'oklch', 'color',
    ];
    if (!known.includes(name)) return fail(`unknown color function "${name}"`);
    if (args.length === 0) return fail(`${name}() needs arguments`);
    if (!hasBalancedParens(t)) return fail('unbalanced parentheses');
    return OK;
  }
  if (t.toLowerCase().startsWith('var(')) {
    if (!hasBalancedParens(t)) return fail('unbalanced parentheses');
    return OK;
  }
  // Permissive fall-through for any other named-color-shaped token.
  if (/^[a-zA-Z]+$/.test(t)) return OK;
  return fail('not a valid color (try #fff, rgb(0,0,0), red, …)');
}

// ---------- Transforms ----------

const TRANSFORM_FNS = [
  'translate', 'translateX', 'translateY', 'translateZ', 'translate3d',
  'scale', 'scaleX', 'scaleY', 'scaleZ', 'scale3d',
  'rotate', 'rotateX', 'rotateY', 'rotateZ', 'rotate3d',
  'skew', 'skewX', 'skewY',
  'matrix', 'matrix3d',
  'perspective',
];

function looksLikeTransform(s: string): ValidationResult {
  const t = s.trim();
  if (t === '') return OK;
  if (t.toLowerCase() === 'none') return OK;
  if (!hasBalancedParens(t)) return fail('unbalanced parentheses');
  // Split on whitespace between functions (rotate(45deg) scale(1.2))
  // — naively splits on ") " followed by an ident. Good enough to
  // validate the function names; arguments are passed through.
  const fnRe = /([a-zA-Z][a-zA-Z0-9]*)\s*\(/g;
  let m: RegExpExecArray | null;
  const fns: string[] = [];
  while ((m = fnRe.exec(t)) !== null) fns.push(m[1]);
  if (fns.length === 0) return fail('expected a transform function (rotate, scale, translate, …)');
  for (const fn of fns) {
    if (!TRANSFORM_FNS.includes(fn)) {
      return fail(`unknown transform function "${fn}"`);
    }
  }
  return OK;
}

// ---------- Opacity / numbers ----------

function looksLikeOpacity(s: string): ValidationResult {
  const t = s.trim();
  if (t === '') return OK;
  if (!isBareNumber(t)) {
    // Allow `50%` too.
    if (/^\d+(\.\d+)?%$/.test(t)) {
      const pct = parseFloat(t);
      if (pct < 0 || pct > 100) return fail('opacity must be 0–100%');
      return OK;
    }
    return fail('opacity must be a number 0–1 (or 0–100%)');
  }
  const n = parseFloat(t);
  if (n < 0 || n > 1) return fail('opacity must be between 0 and 1');
  return OK;
}

function looksLikeZIndex(s: string): ValidationResult {
  const t = s.trim();
  if (t === '') return OK;
  if (t === 'auto') return OK;
  if (!/^[+-]?\d+$/.test(t)) return fail('z-index must be an integer (or auto)');
  return OK;
}

function looksLikeFontWeight(s: string): ValidationResult {
  const t = s.trim();
  if (t === '') return OK;
  const keywords = ['normal', 'bold', 'bolder', 'lighter', 'inherit', 'initial', 'unset'];
  if (keywords.includes(t.toLowerCase())) return OK;
  if (!/^\d+$/.test(t)) return fail('font-weight must be 100–900 or a keyword');
  const n = parseInt(t, 10);
  if (n < 1 || n > 1000) return fail('font-weight out of range');
  return OK;
}

function looksLikeLineHeight(s: string): ValidationResult {
  const t = s.trim();
  if (t === '') return OK;
  if (t === 'normal') return OK;
  if (isBareNumber(t)) return OK; // unitless line-height is valid CSS
  return looksLikeLength(t);
}

// ---------- Enum-style props ----------

const DISPLAY_VALUES = new Set([
  'block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid',
  'inline-grid', 'none', 'contents', 'list-item', 'table', 'table-row',
  'table-cell', 'flow-root',
]);

const POSITION_VALUES = new Set([
  'static', 'relative', 'absolute', 'fixed', 'sticky',
]);

const FLEX_DIRECTION_VALUES = new Set([
  'row', 'row-reverse', 'column', 'column-reverse',
]);

const BORDER_STYLE_VALUES = new Set([
  'none', 'hidden', 'dotted', 'dashed', 'solid', 'double',
  'groove', 'ridge', 'inset', 'outset',
]);

function fromEnum(set: Set<string>, label: string) {
  return (s: string): ValidationResult => {
    const t = s.trim().toLowerCase();
    if (t === '') return OK;
    if (set.has(t)) return OK;
    return fail(`${label} must be one of: ${Array.from(set).slice(0, 6).join(', ')}…`);
  };
}

// ---------- Dispatch table ----------

type Validator = (s: string) => ValidationResult;

const VALIDATORS: Record<string, Validator> = {
  // Spacing
  'padding-top': looksLikeLength,
  'padding-right': looksLikeLength,
  'padding-bottom': looksLikeLength,
  'padding-left': looksLikeLength,
  'margin-top': looksLikeLength,
  'margin-right': looksLikeLength,
  'margin-bottom': looksLikeLength,
  'margin-left': looksLikeLength,
  gap: looksLikeLength,
  // Size & position
  width: looksLikeLength,
  height: looksLikeLength,
  'min-width': looksLikeLength,
  'min-height': looksLikeLength,
  'max-width': looksLikeLength,
  'max-height': looksLikeLength,
  top: looksLikeLength,
  right: looksLikeLength,
  bottom: looksLikeLength,
  left: looksLikeLength,
  // Typography
  'font-size': looksLikeLength,
  'font-weight': looksLikeFontWeight,
  'line-height': looksLikeLineHeight,
  color: looksLikeColor,
  // Fill
  'background-color': looksLikeColor,
  // Border
  'border-radius': looksLikeLength,
  'border-width': looksLikeLength,
  'border-color': looksLikeColor,
  'border-style': fromEnum(BORDER_STYLE_VALUES, 'border-style'),
  // Shadow — pass through; complex grammar, browser is final arbiter.
  'box-shadow': (s) => (s.trim() === '' || hasBalancedParens(s) ? OK : fail('unbalanced parentheses')),
  // Transform
  transform: looksLikeTransform,
  // Visibility
  opacity: looksLikeOpacity,
  'z-index': looksLikeZIndex,
  display: fromEnum(DISPLAY_VALUES, 'display'),
  position: fromEnum(POSITION_VALUES, 'position'),
  'flex-direction': fromEnum(FLEX_DIRECTION_VALUES, 'flex-direction'),
};

/**
 * Validate a CSS value for a given property name (kebab-case, e.g.
 * `padding-top`, `background-color`). Unknown properties get a
 * permissive pass — we'd rather forward an unknown declaration to the
 * browser than block a valid edit on a property we haven't taught the
 * validator about yet.
 *
 * @returns `{ ok: true }` if the value is plausibly valid, or
 *          `{ ok: false, error }` with a human-readable explanation.
 */
export function validateCssValue(
  prop: string,
  value: string,
): ValidationResult {
  // Whitespace-only / empty is "no override" — caller decides what to do.
  if (value.trim() === '') return OK;
  const v = VALIDATORS[prop];
  if (!v) return OK; // unknown prop → trust the browser
  return v(value);
}

// Re-export the helpers individually for finer-grained testing — they
// also document the matrix of property → validator that callers can rely on.
export const _internal = {
  looksLikeLength,
  looksLikeColor,
  looksLikeTransform,
  looksLikeOpacity,
  looksLikeZIndex,
  looksLikeFontWeight,
  looksLikeLineHeight,
};
