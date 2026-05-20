// Manifest V3 service worker. Acts as the message broker between the popup
// and the target tab: the popup never talks to the page directly because
// (a) the popup window closes if the user clicks away, and (b) the service
// worker owns the bearer token / settings storage.
//
// Capture pipeline:
//   popup → 'capture/run' → SW
//     1. read settings + active tab — fail early if token/boardId not set
//     2. inject probePage() to gather DOM + viewport
//     3. tabs.captureVisibleTab() for the PNG
//     4. POST /api/captures with Authorization: Bearer <token>
//     5. inject showBanner() in the captured tab
//     6. stream phase events back to the popup port

import { probePage, type InlinePageProbe } from '../content/capture.ts';
import { showBanner } from '../content/overlay.ts';
import { createCapture } from '../shared/api.ts';
import { readSettings, writeSettings } from '../shared/settings.ts';
import type {
  CaptureEvent,
  ExtensionCommand,
  Phase,
  Settings,
} from '../shared/types.ts';

const POPUP_PORT = 'foldo-popup';

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== POPUP_PORT) return;
  port.onMessage.addListener(async (msg: ExtensionCommand) => {
    try {
      if (msg.type === 'capture/run') {
        await runCapture(port);
      } else if (msg.type === 'settings/read') {
        const settings = await readSettings();
        port.postMessage({ type: 'settings/value', settings });
      } else if (msg.type === 'settings/write') {
        await writeSettings(msg.settings);
        const settings = await readSettings();
        port.postMessage({ type: 'settings/value', settings });
      }
    } catch (err) {
      port.postMessage({
        type: 'capture/failure',
        message: errorMessage(err),
      } satisfies CaptureEvent);
    }
  });
});

async function runCapture(port: chrome.runtime.Port): Promise<void> {
  const emit = (phase: Phase, detail?: string) => {
    port.postMessage({
      type: 'capture/progress',
      phase,
      detail,
    } satisfies CaptureEvent);
  };

  emit('reading-tab');
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (!tab || tab.id === undefined) {
    port.postMessage({
      type: 'capture/failure',
      message: 'No active tab found.',
    } satisfies CaptureEvent);
    return;
  }
  if (!isCapturableUrl(tab.url)) {
    port.postMessage({
      type: 'capture/failure',
      message:
        'This page cannot be captured (chrome://, the Chrome Web Store, and similar URLs are restricted by the browser).',
    } satisfies CaptureEvent);
    return;
  }

  const settings = await readSettings();

  // Guard: require a real session token and board id before touching the page.
  if (!settings.bearerToken) {
    port.postMessage({
      type: 'capture/failure',
      message:
        'No Foldo session token set. Open the extension options (or the gear in the popup) and paste your token from the Foldo app.',
    } satisfies CaptureEvent);
    return;
  }
  if (!settings.boardId) {
    port.postMessage({
      type: 'capture/failure',
      message:
        'No board id set. Open the extension options (or the gear in the popup) and enter the target board id.',
    } satisfies CaptureEvent);
    return;
  }

  emit('injecting', 'Reading DOM…');
  let probe: InlinePageProbe;
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: probePage,
    });
    probe = result ?? {
      url: tab.url ?? '',
      title: tab.title ?? '',
      viewport: { width: 1280, height: 800 },
    };
  } catch (err) {
    // Some pages (e.g. cross-origin iframes you don't own) refuse injection.
    // Fall back to tab metadata only, we can still ship the screenshot.
    probe = {
      url: tab.url ?? '',
      title: tab.title ?? '',
      viewport: { width: 1280, height: 800 },
    };
    console.warn('[foldo] DOM probe failed, continuing without snapshot:', err);
  }

  emit('snapping', 'Taking screenshot…');
  let screenshot: string | undefined;
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(
      tab.windowId ?? chrome.windows.WINDOW_ID_CURRENT,
      { format: 'png' },
    );
    // strip the "data:image/png;base64," prefix, the CaptureRequest contract
    // is the raw base64 payload.
    screenshot = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  } catch (err) {
    console.warn('[foldo] screenshot failed:', err);
  }

  emit('uploading', 'Sending to Foldo cloud…');
  let response;
  try {
    response = await createCapture({
      cloudUrl: settings.cloudUrl,
      bearerToken: settings.bearerToken,
      body: {
        url: probe.url,
        title: probe.title,
        viewport: probe.viewport,
        domSnapshot: probe.domSnapshot,
        screenshot,
        // capturedByUserId is kept in the protocol type for compatibility but
        // the server attributes the capture to the authenticated user derived
        // from the Bearer token — we still pass it to satisfy the type contract.
        capturedByUserId: '',
        boardId: settings.boardId,
      },
    });
  } catch (err) {
    port.postMessage({
      type: 'capture/failure',
      message: errorMessage(err),
    } satisfies CaptureEvent);
    return;
  }

  const viewUrl = buildViewUrl(settings, response.frame.boardId, response.frame.id);

  // Fire-and-forget banner, the capture is already done; if injection
  // fails (e.g. the user navigated away) we don't fail the whole flow.
  try {
    const logoUrl = chrome.runtime.getURL('public/logo.png');
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: showBanner,
      args: [{ viewUrl, logoUrl }],
    });
  } catch (err) {
    console.warn('[foldo] banner injection failed:', err);
  }

  port.postMessage({
    type: 'capture/success',
    frame: response.frame,
    viewUrl,
  } satisfies CaptureEvent);
}

function buildViewUrl(
  settings: Settings,
  boardId: string,
  frameId: string,
): string {
  const base = settings.webUrl.endsWith('/')
    ? settings.webUrl.slice(0, -1)
    : settings.webUrl;
  return `${base}/board/${boardId}/frame/${frameId}`;
}

function isCapturableUrl(url: string | undefined): boolean {
  if (!url) return false;
  return !(
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('https://chrome.google.com/webstore') ||
    url.startsWith('https://chromewebstore.google.com')
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unknown error';
}
