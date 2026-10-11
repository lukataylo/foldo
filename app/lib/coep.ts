/*
 * `credentialless` lets generated apps load images, maps and CDN files that don't send a CORP header (with `require-corp`
 * they silently fail in the preview). WebKit (Safari, every iOS browser) has no `credentialless`, so it keeps
 * `require-corp`: anything else would leave the page without cross-origin isolation and the WebContainer wouldn't boot.
 * The page header and the WebContainer boot option must agree, so both come from here.
 */
export type Coep = 'credentialless' | 'require-corp';

export function coepFor(userAgent: string): Coep {
  const webkitOnly = /iPhone|iPad|iPod/.test(userAgent) || (/Safari\//.test(userAgent) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(userAgent));

  return webkitOnly ? 'require-corp' : 'credentialless';
}
