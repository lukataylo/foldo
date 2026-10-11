/*
 * Gallery thumbnails are HTML written by a model that read user-controlled code, so the output is hostile until proven
 * otherwise. This rebuilds it from an allowlist (tags, attributes, CSS; text is dropped) instead of patching the input, then refuses the
 * result outright if anything that looks dangerous survived. The browser adds a second wall: the fragment only ever
 * renders in `<iframe sandbox="">` with a `default-src 'none'` CSP (ProjectCard.tsx).
 */

export const MAX_PREVIEW_CHARS = 5000; // the prompt asks for 3000; a little overshoot is fine, a page is not
const MAX_INPUT_CHARS = 20_000;

// html layout elements and the basic svg shapes; anything else is dropped (its text content too, for raw-text tags)
const HTML_TAGS = new Set(['div', 'span', 'p', 'section', 'header', 'footer', 'main', 'nav', 'aside', 'ul', 'ol', 'li', 'b', 'strong', 'i', 'em', 'small']);
const VOID_TAGS = new Set(['br', 'hr']);
const SVG_TAGS = new Map(
  ['svg', 'g', 'rect', 'circle', 'ellipse', 'line', 'path', 'polygon', 'polyline'].map((t) => [t, t] as const),
);

// elements whose content is not markup: dropped whole (style is kept, but cleaned as CSS)
const RAW_DROP = new Set(['script', 'iframe', 'object', 'embed', 'noscript', 'noembed', 'noframes', 'textarea', 'title', 'xmp', 'template', 'math', 'foreignobject', 'select', 'option']);

const HTML_ATTRS = new Set(['class', 'style']);
const SVG_ATTRS = new Map(
  [
    'class', 'style', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points',
    'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'opacity',
    'fill-opacity', 'stroke-opacity', 'fill-rule', 'transform', 'preserveAspectRatio', 'xmlns',
  ].map((a) => [a.toLowerCase(), a] as const),
);

// anything here in the final output means the cleaning missed something: the whole result is thrown away
const SUSPICIOUS =
  /<\s*\/?\s*(script|iframe|object|embed|link|meta|base|form|img|image|video|audio|source|a|use|foreignobject|animate|set|frame|svg:)\b|\son[a-z]+\s*=|javascript:|vbscript:|data:|url\s*\(|@import|@font-face|\b(href|src|srcset|srcdoc|action|formaction|xlink)\s*=|expression\s*\(|-moz-binding|behavior\s*:|&#|\\|<!--|<!\[cdata\[/i;

// CSS from a <style> element or a style attribute: no fetching, no escapes that could spell a blocked word
export function cleanCss(css: string): string {
  return (
    css
      .replace(/\/\*[\s\S]*?(\*\/|$)/g, '')
      .replace(/[\\&<]/g, '')
      // at-rules that fetch something: dropped whole
      .replace(/@(import|namespace)[^;{}]*;?/gi, '')
      .replace(/@font-face\s*\{[^}]*\}?/gi, '')
      // a declaration that calls a fetching or scripting function, or names a scheme or a host: dropped whole
      .replace(/[^;{}]*(\b(url|image-set|image|cross-fade|element|expression|paint|src)\s*\(|javascript:|vbscript:|data:|-moz-binding|behavior\s*:|\/\/)[^;{}]*/gi, '')
  );
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

    if (name !== 'xmlns' && /url\s*\(|javascript:|data:|:\/\//i.test(clean)) {
      continue;
    }

    out += ` ${canonical}="${escapeAttr(clean)}"`;
  }

  return out;
}

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

    const tag = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)(?=[\s\/>])((?:[^>"']|"[^"]*"|'[^']*')*)>/.exec(src.slice(i));

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
    if (name === 'style' || RAW_DROP.has(name) || name === 'plaintext') {
      const endTag = new RegExp(`</${name}\\s*>`, 'i').exec(src.slice(i));
      const body = endTag ? src.slice(i, i + endTag.index) : src.slice(i);
      i = endTag ? i + endTag.index + endTag[0].length : src.length;

      if (name === 'style' && !selfClosing) {
        out += `<style>${cleanCss(body)}</style>`;
      }

      continue;
    }

    if (VOID_TAGS.has(name)) {
      out += `<${name}${cleanAttrs(attrs, false)}>`;
      continue;
    }

    const svg = name === 'svg' || svgDepth > 0;
    const allowed = svg ? SVG_TAGS.get(name) : HTML_TAGS.has(name) ? name : undefined;

    if (!allowed) {
      continue; // unknown or forbidden element: drop the tag (its children are still cleaned)
    }

    out += `<${allowed}${cleanAttrs(attrs.replace(/\/\s*$/, ''), svg)}>`;

    if (selfClosing) {
      out += `</${allowed}>`;
      continue;
    }

    stack.push(allowed);

    if (allowed === 'svg') {
      svgDepth++;
    }
  }

  while (stack.length) {
    close(stack[stack.length - 1]);
  }

  out = out.trim();

  if (!out || out.length > MAX_PREVIEW_CHARS || SUSPICIOUS.test(out) || !/<(div|svg|span|section|main)\b/.test(out)) {
    return null;
  }

  return out;
}

/** The iframe document around a sanitized fragment: nothing may load, nothing may run. */
export const PREVIEW_CSP = "default-src 'none'; style-src 'unsafe-inline'";
