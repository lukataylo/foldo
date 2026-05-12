// Injected into the active tab via chrome.scripting.executeScript when the
// user clicks "Freeze this state". Returns a serialised snapshot of the page
// — viewport, title, URL, and a truncated `outerHTML` blob. The service worker
// pairs this with `chrome.tabs.captureVisibleTab` to produce the screenshot.
//
// This file is loaded as a function body — not as a content_scripts manifest
// entry — so it must be self-contained (no imports). We keep the shape
// compatible with PageProbe from shared/types.ts.

export interface InlinePageProbe {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  domSnapshot?: string;
}

/** Maximum bytes of serialised HTML we ship to the cloud. */
const MAX_DOM_SNAPSHOT_BYTES = 500_000;

/**
 * The body that runs inside the target page. Exported so the service worker
 * can pass it as the `func` to `chrome.scripting.executeScript`.
 */
export function probePage(): InlinePageProbe {
  const width =
    Math.max(
      document.documentElement.clientWidth || 0,
      window.innerWidth || 0,
    ) || 1280;
  const height =
    Math.max(
      document.documentElement.clientHeight || 0,
      window.innerHeight || 0,
    ) || 800;

  let domSnapshot: string | undefined;
  try {
    const raw = document.documentElement.outerHTML;
    domSnapshot =
      raw.length > 500_000 ? raw.slice(0, 500_000) + '\n<!-- truncated -->' : raw;
  } catch {
    // Some pages with restrictive CSP / sandboxing throw — that's fine, we
    // ship the screenshot only.
    domSnapshot = undefined;
  }

  return {
    url: location.href,
    title: document.title,
    viewport: { width, height },
    domSnapshot,
  };
}

// Re-export the constant for the service worker's bookkeeping.
export const __MAX_DOM_SNAPSHOT_BYTES = MAX_DOM_SNAPSHOT_BYTES;
