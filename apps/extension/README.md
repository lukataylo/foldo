# @foldo/extension

Chrome extension (Manifest V3) for the "capture from URL" path. Freezes any
deployed app — Vercel preview, staging, localhost — into a Foldo canvas frame
without running the in-directory MCP.

The extension cannot receive edit dispatches. Editing only loops back through
MCP because that's where the repository lives.

## Develop

```bash
# from the repo root
npm install
npm run build:extension          # one-shot build → apps/extension/dist
npm run dev --workspace apps/extension   # watch build → apps/extension/dist
```

## Load in Chrome

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked**.
4. Select `apps/extension/dist/`.

The extension icon appears in the toolbar. Pin it for quick access.

## Use

1. Browse to any URL — e.g. `https://acme-landing-git-feat-cta.vercel.app/pricing`.
2. Click the Foldo icon → popup opens.
3. Click **Freeze this state**.
4. On success the popup shows a link to the new frame on the canvas and the
   page itself flashes a small toast at the bottom-right.

The capture pipeline runs in the service worker:

1. Read the active tab (`chrome.tabs.query`).
2. Inject a small DOM probe (`chrome.scripting.executeScript`) to gather
   `document.documentElement.outerHTML` (truncated to 500KB) and the viewport.
3. `chrome.tabs.captureVisibleTab` for the PNG.
4. `POST {cloudUrl}/api/captures` with a `CreateCaptureRequest` payload.
5. Inject a success banner back into the page.

## Settings

Open the gear icon in the popup. All values persist in `chrome.storage.local`.

| Field            | Default                   |
| ---------------- | ------------------------- |
| Foldo cloud URL  | `http://localhost:4000`   |
| Canvas web URL   | `http://localhost:5173`   |
| Bearer token     | `demo-user`               |
| Default board id | `board-acme-landing`      |

## Restrictions

Chrome blocks content-script injection on `chrome://*`, the Chrome Web Store,
and other reserved URLs. The popup detects these and surfaces a friendly
error instead of failing silently.

## Scripts

| Script             | What                                              |
| ------------------ | ------------------------------------------------- |
| `npm run dev`      | `vite build --watch` — keeps `dist/` fresh        |
| `npm run build`    | one-shot production build                         |
| `npm run typecheck`| `tsc -b --noEmit`                                 |
