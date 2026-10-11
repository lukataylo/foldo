/*
 * Gallery thumbnails are HTML written by a model that read user-controlled code, so the output is hostile until proven
 * otherwise. This rebuilds it from an allowlist (tags, attributes, CSS) instead of patching the input, then refuses the
 * result outright if anything that looks dangerous survived. No words may reach the card in any form (text nodes, CSS
 * `content`, list markers, counters), so a prompt-injected model can't put a phishing notice on the public gallery.
 * The browser adds a second wall: the fragment is served by /preview/:shareId with a `default-src 'none'` CSP header and
 * only ever shown in `<iframe sandbox="">` (ProjectCard.tsx).
 */

export const MAX_PREVIEW_CHARS = 3000; // what the prompt asks for (2500) plus a little overshoot
const MAX_INPUT_CHARS = 20_000;
const MAX_CSS_CHARS = 8000;

// html layout elements and the basic svg shapes; anything else is dropped (lists are out: their markers are text)
const HTML_TAGS = new Set(['div', 'span', 'p', 'section', 'header', 'footer', 'main', 'nav', 'aside', 'b', 'strong', 'i', 'em', 'small']);
const VOID_TAGS = new Set(['br', 'hr']);
const SVG_TAGS = new Set(['svg', 'g', 'rect', 'circle', 'ellipse', 'line', 'path', 'polygon', 'polyline']);

// elements whose content is not markup: dropped whole (style is kept, but cleaned as CSS)
const RAW_DROP = new Set(['script', 'iframe', 'object', 'embed', 'noscript', 'noembed', 'noframes', 'textarea', 'title', 'xmp', 'template', 'math', 'foreignobject', 'select', 'option', 'plaintext']);

const HTML_ATTRS = new Set(['class', 'style']);
const SVG_ATTRS = new Map(
  [
    'class', 'style', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points',
    'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'opacity',
    'fill-opacity', 'stroke-opacity', 'fill-rule', 'transform', 'preserveAspectRatio', 'xmlns',
  ].map((a) => [a.toLowerCase(), a] as const),
);

/*
 * A CSS declaration, selector or at-rule prelude containing any of these is dropped (with its block, for a prelude):
 * strings (the only way CSS spells words), generated text and markers, anything that fetches or runs, schemes and hosts.
 */
const CSS_BAD =
  /["'`]|(^|[^\w-])(content|quotes|counter-[\w-]*|list-style[\w-]*|text-overflow)\s*:|list-item|\b(url|image-set|image|cross-fade|element|expression|paint|src|attr|counter|counters)\s*\(|@(import|namespace|font-face|counter-style)|javascript:|vbscript:|data:|-moz-binding|behavior\s*:|\/\//i;

// anything here in the final output means the cleaning missed something: the whole result is thrown away
const SUSPICIOUS =
  /<\s*\/?\s*(script|iframe|object|embed|link|meta|base|form|img|image|video|audio|source|a|use|foreignobject|animate|set|frame|text|ul|ol|li|svg:)\b|\son[a-z]+\s*=|javascript:|vbscript:|data:|url\s*\(|@import|@font-face|@counter-style|\b(href|src|srcset|srcdoc|action|formaction|xlink)\s*=|expression\s*\(|-moz-binding|behavior\s*:|&#|\\|<!--|<!\[cdata\[/i;

// in the CSS that survived (style elements and attributes): no strings, no generated text
const CSS_TEXT = /["'`]|&quot;|(^|[^\w-])content\s*:|attr\s*\(|quotes\s*:|counter|list-style|list-item|text-overflow/i;

/** CSS from a <style> element or a style attribute: split on `;`, `{`, `}` and judged piece by piece (linear time). */
export function cleanCss(css: string): string {
  if (css.length > MAX_CSS_CHARS) {
    return '';
  }

  const parts = css
    .replace(/\/\*[\s\S]*?(\*\/|$)/g, '')
    .replace(/[\\&<]/g, '')
    .split(/([;{}])/);
  let out = '';
  let skip = 0; // depth inside a dropped rule's block

  for (let k = 0; k < parts.length; k++) {
    const p = parts[k];

    if (skip) {
      skip += p === '{' ? 1 : p === '}' ? -1 : 0;
      continue;
    }

    if (p === ';' || p === '{' || p === '}') {
      out += p;
      continue;
    }

    if (CSS_BAD.test(p)) {
      // a bad selector or at-rule takes its whole block with it
      if (parts[k + 1] === '{') {
        skip = 1;
        k++;
      }

      continue;
    }

    out += p;
  }

  return out;
}

const escapeAttr = (s: string) => s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ATTR = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function cleanAttrs(raw: string, svg: boolean): string {
  let out = '';

  for (const m of raw.matchAll(ATTR)) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4];
    const canonical = svg ? SVG_ATTRS.get(name) : HTML_ATTRS.has(name) ? name : undefined;

    // no handlers, links or entity-encoded values (entities in attributes are decoded by the browser)
    if (!canonical || value === undefined || /^on/.test(name) || /[&\\]/.test(value)) {
      continue;
    }

    const clean = name === 'style' ? cleanCss(value) : value;

    if (name === 'xmlns' && clean !== 'http://www.w3.org/2000/svg') {
      continue;
    }

    if (name !== 'xmlns' && /url\s*\(|javascript:|data:|:\/\/|["'`]/i.test(clean)) {
      continue;
    }

    out += ` ${canonical}="${escapeAttr(clean)}"`;
  }

  return out;
}

// the CSS in a finished fragment: <style> bodies and style="" values
const cssOf = (html: string) =>
  [...html.matchAll(/<style>([\s\S]*?)<\/style>/g), ...html.matchAll(/\sstyle="([^"]*)"/g)].map((m) => m[1]).join('\n');

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)(?=[\s\/>])((?:[^>"']|"[^"]*"|'[^']*')*)>/y;

/** Model output -> safe fragment, or null when there is nothing usable or something suspicious survives. */
export function sanitizePreviewHtml(input: unknown): string | null {
  if (typeof input !== 'string' || !input.trim() || input.length > MAX_INPUT_CHARS) {
    return null;
  }

  // models like to wrap the answer in a fence or a sentence: keep from the first tag to the last
  const start = input.indexOf('<');
  const end = input.lastIndexOf('>');

  if (start < 0 || end < start) {
    return null;
  }

  const src = input.slice(start, end + 1);
  const lower = src.toLowerCase();
  const stack: string[] = [];
  let out = '';
  let svgDepth = 0;
  let i = 0;

  const close = (name: string) => {
    const at = stack.lastIndexOf(name);

    if (at < 0) {
      return;
    }

    while (stack.length > at) {
      const t = stack.pop()!;
      out += `</${t}>`;

      if (t === 'svg') {
        svgDepth--;
      }
    }
  };

  while (i < src.length) {
    const lt = src.indexOf('<', i);

    // text is dropped: a thumbnail has no words, and a hostile one can't show a message or a link
    if (lt < 0) {
      break;
    }

    i = lt;

    // comments, doctypes, CDATA, processing instructions: dropped
    if (src.startsWith('<!--', i)) {
      const e = src.indexOf('-->', i + 4);
      i = e < 0 ? src.length : e + 3;
      continue;
    }

    if (src[i + 1] === '!' || src[i + 1] === '?') {
      const e = src.indexOf('>', i);
      i = e < 0 ? src.length : e + 1;
      continue;
    }

    TAG.lastIndex = i;

    const tag = TAG.exec(src);

    if (!tag) {
      i++;
      continue;
    }

    i += tag[0].length;

    const closing = tag[1] === '/';
    const name = tag[2].toLowerCase();
    const attrs = tag[3];
    const selfClosing = /\/\s*$/.test(attrs);

    if (closing) {
      close(name);
      continue;
    }

    // a raw-text element: skip to its end tag (or the end of input), keeping only a cleaned <style>
    if (name === 'style' || RAW_DROP.has(name)) {
      const e = name === 'plaintext' ? -1 : lower.indexOf(`</${name}`, i);
      const body = e < 0 ? src.slice(i) : src.slice(i, e);
      const gt = e < 0 ? -1 : src.indexOf('>', e);
      i = gt < 0 ? src.length : gt + 1;

      if (name === 'style' && !selfClosing) {
        out += `<style>${cleanCss(body)}</style>`;
      }

      continue;
    }

    // inside <svg> only svg shapes; outside it only html layout tags (no strays from the other namespace)
    if (svgDepth > 0 ? !SVG_TAGS.has(name) : name !== 'svg' && !HTML_TAGS.has(name) && !VOID_TAGS.has(name)) {
      continue; // unknown, forbidden or out-of-place element: drop the tag (its children are still cleaned)
    }

    const svg = svgDepth > 0 || name === 'svg';

    if (!svg && VOID_TAGS.has(name)) {
      out += `<${name}${cleanAttrs(attrs, false)}>`;
      continue;
    }

    out += `<${name}${cleanAttrs(attrs.replace(/\/\s*$/, ''), svg)}>`;

    if (selfClosing) {
      out += `</${name}>`;
      continue;
    }

    stack.push(name);

    if (name === 'svg') {
      svgDepth++;
    }
  }

  while (stack.length) {
    close(stack[stack.length - 1]);
  }

  out = out.trim();

  if (
    !out ||
    out.length > MAX_PREVIEW_CHARS ||
    SUSPICIOUS.test(out) ||
    CSS_TEXT.test(cssOf(out)) ||
    !/<(div|svg|span|section|main)\b/.test(out)
  ) {
    return null;
  }

  return out;
}

/** Sent as a header and as a meta tag with every thumbnail: nothing may load, nothing may run. */
export const PREVIEW_CSP = "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'";

/** The document served for a thumbnail (the fragment was sanitized when it was stored). */
export const previewDocument = (html: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><meta name="referrer" content="no-referrer"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#FFFFFF}</style></head><body>${html}</body></html>`;
