# Chrome extension

`apps/extension` is the **capture-from-any-URL** path. It lets a reviewer freeze the current tab (a Vercel preview, a staging site, a localhost dev server in another tab) into a Foldo frame without running the MCP server.

It is intentionally narrow:

- **No edit dispatching.** Edits only loop back through the MCP because that's where the repo lives.
- **No persistent connection.** It POSTs `CreateCaptureRequest` to `/api/captures` and shows the resulting frame URL.

## Build & install

```bash
npm run build:extension
# Outputs to apps/extension/dist/
```

Then in Chrome:

1. `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. **Load unpacked** → select `apps/extension/dist/`

The extension icon (origami dachshund) appears in the toolbar.

## How a capture works

1. User browses to any URL.
2. Clicks the Foldo icon → popup opens.
3. Popup reads the active tab's URL, title, and viewport via `chrome.tabs`.
4. (Optional) injects `src/content/capture.ts` to grab a DOM snapshot (`document.documentElement.outerHTML`, truncated to ~500 KB) and a screenshot via `chrome.tabs.captureVisibleTab`.
5. POST to `http://localhost:4000/api/captures` with the bearer token from `chrome.storage.local`.
6. Server places the new frame on a virtual `captures` branch (orange dot in FrameMeta) and broadcasts `frame.added`.
7. Popup shows a success card with a deep link to `/board/{boardId}/frame/{frame.id}`.
8. Content script injects a fade-in banner on the captured page: *"Foldo captured this state →"*.

## Settings

Open the gear in the popup to configure:

- **Foldo cloud URL** — default `http://localhost:4000`
- **Foldo canvas URL** — default `http://localhost:5173` (where the success deep link points)
- **Bearer token** — default `demo-user`
- **Default board id** — default `board-acme-landing`

All persisted in `chrome.storage.local`.

## Manifest highlights

- Manifest V3 (`manifest_version: 3`)
- Permissions: `activeTab`, `scripting`, `tabs`, `storage`
- Host permissions: `<all_urls>` so it can capture any site
- Background: ES module service worker
- Action popup: `src/popup/index.html`

## What you don't need

You can **demo the rest of Foldo** without ever loading the extension. The canvas has its own in-app "Capture from URL" modal (top-right toolbar) that hits the same `/api/captures` endpoint — it just doesn't actually screenshot anything.
