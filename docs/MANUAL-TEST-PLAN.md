# Foldo — Manual Test Plan

Comprehensive human-driven test plan covering everything Wave 1+2+3+4 shipped, plus the legacy surfaces. **Read this end to end before testing.** Some steps depend on earlier setup; jumping around mid-section can produce confusing failures that are actually setup issues.

**Time budget:** ~2.5 hours for the full pass. ~45 min for the "smoke" subset (every section's first 1-2 tests).

**Environment expectations:**
- `https://foldo.dev` should be on the latest `main` (verify the bundle hash; if it's still `index-BoDw3h-Q.js` then the Railway deploy is stuck — see `docs/USER-ACTIONS-REQUIRED.md` #2 first).
- Local dev: `npm install && npm run dev` brings up server (4000) + web (5173) + sample-app (5174). Optional: `FOLDO_SHOTTER_DEV=1 npm run dev` to also start the shotter.
- For multi-user tests: use two different browsers (Chrome + Firefox) OR a Chrome profile + an Incognito window.
- For iPad tests: real iPad Pro 12.9" or 11" landscape + portrait. iOS Safari 17+. Magic Keyboard optional but useful.
- For Apple Pencil: 2nd gen Pencil paired with the iPad.

**How to record results:** copy this file to a fresh `MANUAL-TEST-RUN-{date}.md`, replace each `[ ]` with `[x]` / `[FAIL]` / `[SKIP]`, and add inline notes after any failure with what you saw + reproducer steps. Commit the file at the end.

---

## Section 0 — Pre-flight (5 min)

These are "is the harness even up" checks. If any fail, stop and fix before continuing.

- [ ] `curl -s -o /dev/null -w "%{http_code}\n" https://foldo.dev/` → `200`
- [ ] `curl -s -o /dev/null -w "%{http_code}\n" https://api.foldo.dev/health` → `200`. Response body includes `{ok: true, db: {reachable: true, ...}}`. (If not, fail fast — DB unreachable.)
- [ ] `curl -s https://foldo.dev/ | grep -o 'index-[A-Za-z0-9_-]*\.js'` — note the bundle hash. If it's `index-BoDw3h-Q.js`, you're testing the stale pre-substrate image — stop, fix the Railway deploy promotion first.
- [ ] `curl -s https://api.foldo.dev/metrics | head -5` — should return Prometheus exposition format. No 404.
- [ ] Open https://foldo.dev/ in Chrome. Page loads, no console errors (Cmd-Opt-I → Console), no failed network requests in red.

---

## Section 1 — Auth & onboarding (15 min)

### 1.1 Signup → verify email → log in
- [ ] Go to `https://foldo.dev/signup`. Form renders. Inputs ≥16px font (no iOS auto-zoom triggers).
- [ ] Fill: name, email, password (≥8 chars). Click "Sign up".
- [ ] Redirected to `/home` with a verification banner at top: "Verify your email — we sent a link to {email}".
- [ ] Open the verification email (check stub outbox locally: `ls apps/server/.foldo-email-outbox/`; in prod check the actual inbox).
- [ ] Click the verify link. Lands on `/verify?token=…`. Page shows "Email verified ✓" and offers a button to continue to `/home`.
- [ ] Click continue. `/home` no longer shows the verification banner.

### 1.2 Log out → log in
- [ ] On `/home`, open the user menu (top-right avatar). Click "Sign out".
- [ ] Lands on `/`. Click "Log in".
- [ ] Enter the same email + password. Click "Log in".
- [ ] Redirected to `/home`. Avatar shows the right initial.

### 1.3 Password reset flow
- [ ] Sign out. Go to `/login`. Click "Forgot password?".
- [ ] Enter a NON-EXISTENT email (e.g. `nobody@foldo.test`). Submit. Page shows success message ("If that email exists, we sent a link…") — must NOT leak whether the account exists.
- [ ] Enter the REAL email from section 1.1. Submit. Same success message.
- [ ] Open the reset email. Click the reset link.
- [ ] On the reset page, enter a new password (≥8 chars). Submit.
- [ ] Redirected to `/login`. Log in with the NEW password. Old password should fail with "Invalid email or password".

### 1.4 Verify route error states
- [ ] Visit `/verify?token=clearly-invalid-token` directly. Page shows the error state with a "Request a new verification link" button.
- [ ] Click the button. Form to request resend. Submit. Success message.
- [ ] Visit `/verify` (no token). Same error state.

### 1.5 GDPR — data export
- [ ] Log in. Go to `/settings` (or wherever the settings page is — look in TopBar menu).
- [ ] Click "Export my data".
- [ ] Receive a JSON download with: user profile, boards owned, comments authored, dispatches, test responses.
- [ ] Open the JSON. Confirm no other users' data is present (only the requester's rows).

### 1.6 GDPR — account deletion
- [ ] Create a NEW disposable account just for this test (use 1.1 again with a fresh email like `delete-me-$(date +%s)@foldo.test`).
- [ ] As the new user, leave a comment on the seeded demo board (any frame, any text). Note the comment text.
- [ ] Log in as a DIFFERENT existing user. Open the same board. The comment from the disposable user should show as authored by them.
- [ ] Switch back to the disposable user. Go to settings → Delete account. Enter the correct password.
- [ ] Submit. Logged out + redirected to `/`.
- [ ] Try to log in as the disposable user. Should fail (account gone).
- [ ] As the other user, reload the demo board. The disposable user's comment should still be visible but author renamed to "(deleted user)" or similar — comment text intact, identity anonymised.

### 1.7 Email verification gate
- [ ] Create another fresh account but DON'T verify the email yet.
- [ ] Try to mint a share link from any board you can access. Server returns 403 with `EMAIL_NOT_VERIFIED`. UI shows a friendly message + "resend verification" CTA.
- [ ] Try to publish a user test (Tests panel → publish). Same 403.
- [ ] Verify the email via the link. Retry both — now succeeds.

### 1.8 Rate limiting
- [ ] Open DevTools → Network. Fire 6 login attempts in quick succession with a wrong password. The 6th should return `429 RATE_LIMITED` with a `Retry-After` header.
- [ ] Check `https://api.foldo.dev/metrics` (with scrape token if needed). `foldo_rate_limit_hits_total{bucket="auth-login",outcome="denied"}` should have incremented.

---

## Section 2 — Home page (10 min)

### 2.1 Board list
- [ ] On `/home`, see the seeded demo board (`board-acme-landing`). Card shows name, last activity, frame count, branch color dots.
- [ ] If you have other boards, they show too. Sorted by last-activity desc.
- [ ] Hover a card (desktop): star + kebab menu fade in.
- [ ] On a touch device (iPad), the star + kebab are visible WITHOUT hover (per the @media(hover:none) CSS).

### 2.2 Create + open
- [ ] Click "New board". Modal appears.
- [ ] Fill: name "manual-test-{date}", repo-slug "test-org/manual-{date}". Click "Create".
- [ ] Modal closes. New card appears in the grid.
- [ ] Click the card → navigates to `/board/:id`. Canvas mounts.
- [ ] Reload. URL still on the board. Canvas re-mounts cleanly.

### 2.3 Star + unstar
- [ ] Hover the new board's card. Click the star icon. Star fills (UI optimistic).
- [ ] Reload `/home`. Star persists.
- [ ] Click star again. Unstars.

### 2.4 Archive + restore (Wave 2)
- [ ] Open kebab on a board card. Click "Archive board". Confirm dialog appears. Click OK.
- [ ] Card disappears from the active list.
- [ ] Check the "Show archived" toggle at the top. Toggle ON. Card reappears with an "Archived" pill + a "Restore" button (the regular click-to-open is disabled).
- [ ] Click Restore. Card flips back to the active state (Archived pill gone).
- [ ] Toggle "Show archived" OFF. Card is back in the active list (since it's restored).

### 2.5 Board grid responsiveness
- [ ] Resize the browser to ~1024px wide. Cards reflow to 4 per row.
- [ ] Resize to ~768px. 2-3 per row.
- [ ] Resize to ~430px (iPhone width). 1 per row. Star + kebab visible (touch breakpoint kicks in).
- [ ] No horizontal scrollbar at any width.

---

## Section 3 — Canvas core (20 min)

Set up: open the demo board (`board-acme-landing`).

### 3.1 Canvas mount + initial view
- [ ] Canvas shows the seeded frames: app frame, markdown frames, sticky/arrow if present.
- [ ] Top bar shows board name + repo slug + share + capture + tests buttons.
- [ ] Left rail shows the 7 tools: select / hand / comment / edit / sticky / arrow / image.
- [ ] **Plugin slots visible:** Left panel (Layers tab), Right panel (Inspect tab), Plugin toolbar (bottom-center).
- [ ] Bottom-right zoom control: shows current zoom % + zoom-in / zoom-out / zoom-to-fit / 100% buttons.

### 3.2 Pan + zoom (mouse / trackpad)
- [ ] Drag with mouse (left-button pressed) on empty canvas area → pans.
- [ ] Hold spacebar + drag → pans (hand-tool override).
- [ ] Cmd-scroll wheel → zooms in/out at cursor anchor.
- [ ] Pinch trackpad → zooms.
- [ ] Zoom-to-fit button → canvas fits all frames in viewport.
- [ ] `Cmd+0` → zoom-to-fit (keyboard).
- [ ] `Cmd+=` and `Cmd+-` → zoom in/out (keyboard).

### 3.3 Pan + zoom (iPad touch)
**Skip if you don't have an iPad.**
- [ ] One-finger drag → does NOT pan unless hand-tool active (because one-finger drag with comment/sticky/arrow/edit/image tool should activate that tool, not pan).
- [ ] Two-finger drag → pans regardless of which tool is selected.
- [ ] Two-finger pinch → zooms at midpoint. Smooth.
- [ ] Apple Pencil hover + tap with select tool → behaves like cursor click. Pen palm-rejection: rest your palm on screen while drawing with Pencil; no spurious pan/zoom.

### 3.4 Frame selection
- [ ] Select tool active. Click on a frame → frame outlined as selected.
- [ ] Drag from selected frame's edge → frame moves. Position persists on reload.
- [ ] Click empty canvas → frame deselected.

### 3.5 Frame creation tools
- [ ] **Sticky tool:** press `S` or click sticky icon. Click on empty canvas → sticky note frame appears at click point. Type some text. Click elsewhere → sticky persists.
- [ ] **Arrow tool:** press `A`. Drag from frame A to frame B → arrow connects them. Reload → arrow persists.
- [ ] **Image tool:** press `I`. File picker opens. Select a PNG/JPG. → image frame appears. Reload → image persists.
- [ ] **Comment tool:** press `C`. Click on a frame → comment popover opens at click point. Type "manual test", press Cmd-Enter → comment pin lands. Pin visible on the frame.

### 3.6 Tool persistence (Wave 4)
- [ ] Select the sticky tool (`S`).
- [ ] Reload the page. Sticky tool is still active (the LeftRail's "S" button highlights).
- [ ] Press `V` (select). Reload. Select tool is active.

### 3.7 Plugin toolbar (Wave 4)
- [ ] Look at the bottom-center plugin toolbar. Should show the 7 tools (same as LeftRail). With visual dividers between groups (select/hand | comment/edit | sticky/arrow/image).
- [ ] Click a tool button in the plugin toolbar → activates same as LeftRail.
- [ ] Hover any button → aria-keyshortcuts visible in the title attribute (browser native tooltip shows the shortcut letter).

---

## Section 4 — Comments (15 min)

### 4.1 Drop a pin on a markdown frame
- [ ] Switch to comment tool (`C`). Click on a markdown frame body.
- [ ] CommentPopover opens, attached to the click point, with an empty textarea focused.
- [ ] Type "manual test comment 1". Press Cmd-Enter. Popover closes. Pin appears on the frame.
- [ ] Click the pin. Popover re-opens showing the comment text.

### 4.2 Reply + resolve + delete
- [ ] In the popover, type a reply. Submit. Reply appears under the comment.
- [ ] Click "Resolve". Pin styling changes (e.g. greyed out).
- [ ] Click pin → popover shows "Resolved" state. Click "Reopen" or similar.
- [ ] Delete the comment. Pin disappears.

### 4.3 Make edit from comment
- [ ] Drop a fresh comment on a markdown frame's body.
- [ ] Click "Make edit" in the popover.
- [ ] **Markdown line-anchored comment**: EditPanel slides in from the right with intent pre-filled with the comment text, file = the markdown frame's docPath, line = the line clicked.
- [ ] **Pin-only comment (no line anchor)**: Make edit still opens the EditPanel, with intent pre-filled but line = 0 (whole-frame edit). The audit found this was previously broken; Wave 2 fixed it.
- [ ] **Comment on a sticky/arrow/image frame**: Make edit does nothing visibly but a toast appears: "Comment must target an element or a markdown line to make an edit". Button disabled state may show a tooltip.

### 4.4 Comment on app frame element (DOM element targeting)
- [ ] Open a board with a live app frame.
- [ ] Switch to comment tool. Click on a specific DOM element inside the app frame iframe.
- [ ] Comment popover opens with the target element captured.
- [ ] Type a comment, submit.
- [ ] Pin appears at the click point on the iframe.
- [ ] Click "Make edit" → EditPanel opens with the element's selector pre-filled.

---

## Section 5 — Multiplayer (15 min)

Set up: open the demo board in two browser contexts (Tab A in Chrome, Tab B in Incognito, or two browsers).

### 5.1 Presence cursors
- [ ] In tab A move the mouse. In tab B you see a remote cursor following A's position. Color matches A's user color.
- [ ] In tab B move the mouse. In tab A you see B's cursor. Smooth, no jitter.
- [ ] Close tab A. Tab B's remote cursor for A disappears within ~30s.

### 5.2 Real-time pin sync
- [ ] In tab A, drop a comment pin. Pin appears in tab B within ~1s.
- [ ] In tab B, reply to that comment. Reply appears in tab A's popover within ~1s.

### 5.3 Real-time frame moves
- [ ] In tab A, drag a frame to a new position. Frame moves in tab B in near-real-time.
- [ ] Both tabs end up with the frame at the same position.

### 5.4 Follow-user
- [ ] In tab A, top bar → user menu → "Follow {B's name}". A's view jumps to wherever B is currently looking.
- [ ] In tab B, pan to a different area. A's view follows automatically.
- [ ] In tab A, click anywhere on the canvas (or the unfollow toggle). A stops following.

### 5.5 WebSocket reconnect
- [ ] In tab A, open DevTools → Network. Filter by WS.
- [ ] In Network panel, click the WS row, then "throttle" → toggle Offline.
- [ ] Top bar status indicator shows "reconnecting" or "offline".
- [ ] Restore network (Offline → No throttle).
- [ ] Status returns to "connected" within ~5s.
- [ ] Have tab B drop a comment WHILE tab A is offline. After tab A reconnects, the comment appears in tab A within a few seconds (this is the replay-buffer path).

### 5.6 Concurrent edits — no overwrites
- [ ] In tab A, edit a markdown frame's body. Don't save yet.
- [ ] In tab B, edit the SAME markdown frame's body. Save.
- [ ] In tab A, save your edit.
- [ ] Reload both tabs. The last-save-wins behavior: tab A's content is what's persisted. (This is acceptable v1 behavior; future versioning will offer merge.)

---

## Section 6 — Markdown frames (10 min)

### 6.1 Render
- [ ] Open a markdown frame on the seeded board. Body renders headings, lists, code blocks, inline links.
- [ ] Code blocks have syntax highlighting (if applicable to your seed).

### 6.2 Edit + save
- [ ] Double-click the markdown body OR click an "Edit" button on the frame header. Edit mode opens.
- [ ] Modify the text. Save (Cmd-S or click save button).
- [ ] Frame shows the new content. Reload — content persisted.

### 6.3 Cancel
- [ ] Edit mode. Type something. Click cancel (or Esc).
- [ ] Content reverts to pre-edit state.

### 6.4 Multi-user markdown edit
- [ ] In tab A, save a markdown edit.
- [ ] In tab B (already on the board), the new content appears within ~1s.

---

## Section 7 — App frames + DOM Editor (Wave 4) (20 min)

Set up: open the demo board which contains a live sample-app iframe.

### 7.1 App frame loads
- [ ] App frame iframe renders the sample-app content (pricing page or similar). No "iframe blocked" message.

### 7.2 Inspect panel — Pick element
- [ ] Open the right side panel → "Inspect" tab.
- [ ] Panel shows empty-state: "Select an element on a live preview to inspect…"
- [ ] Click "Pick element" button. Button label changes to "Picking…" and aria-pressed flips.
- [ ] Hover over elements in the iframe. Orange outline follows your cursor.
- [ ] Click an element (e.g. a button or heading).
- [ ] Panel populates with that element's computed styles in groups: Layout, Spacing, Typography, Fill, Border & Shadow, Transform.
- [ ] Selector text displayed at top of panel (e.g. `body > div:nth-of-type(2) > button.primary`).

### 7.3 Edit styles — live overlay
- [ ] In the populated Inspect panel, change padding-top from current value (e.g. 8px) to 24px.
- [ ] Iframe content updates instantly — the element's padding visibly changes.
- [ ] Change color → background-color → font-size. All update in real-time.

### 7.4 CSS validation
- [ ] Type an invalid value: "12" (no unit) into padding-top.
- [ ] Field gets red border + tooltip: "missing unit (px, em, %)". Overlay NOT applied to iframe.
- [ ] Fix to "12px". Border returns to normal. Overlay applies.
- [ ] Type "not-a-color" in color field. Same error treatment.

### 7.5 Reset / Undo
- [ ] After several edits, click "Reset all". Iframe reverts to original computed styles for the picked element.
- [ ] Edit again. Press Cmd-Z within the panel. Just the last change reverts.

### 7.6 Multi-element selection
- [ ] Pick mode. Click element A → panel shows A's styles.
- [ ] Cmd-click element B → panel shows "2 elements selected" in header. Style fields show combined values (or blank if mismatched).
- [ ] Change a value. Both elements receive the change.

### 7.7 Save to source (DISPATCH PATH — IMPORTANT)
- [ ] Pick an element. Make a change (e.g. padding-top → 24px).
- [ ] Click "Save to source".
- [ ] Confirmation modal opens showing selector + diff (before → after).
- [ ] Click "Send to Claude" (or the confirm button).
- [ ] A dispatch is created. Status indicator (top bar or in-panel) shows "pending → running".
- [ ] If real Claude CLI is wired: child frame appears with the applied source change.
- [ ] If simulator mode: heuristic banner shows on the canvas ("Running on simulator — install Claude CLI for real edits"). Child frame still appears with the heuristic edit.

### 7.8 Cross-origin iframe error handling
- [ ] If you have access to a board with a cross-origin iframe (unusual; test only if available): Pick mode → click in the iframe. Either you get an error banner "Couldn't pick element — iframe may be cross-origin" OR the pick silently does nothing. Either is acceptable v1; document the actual behavior in notes.

### 7.9 Keyboard shortcut
- [ ] With the Inspect panel mounted, press Cmd-Shift-I. Pick mode toggles on. Press again → off.

---

## Section 8 — Layer Navigator (Wave 4) (15 min)

Set up: open a board with several frames (use the demo board).

### 8.1 Tree structure
- [ ] Left side panel → "Layers" tab. Tree shows: branches (top level) → frames within each → comments under each frame.
- [ ] Each frame row shows: kind icon + name (markdown title / sticky body preview / app variant / arrow start→end).
- [ ] Frame with comments shows a red badge with the count.

### 8.2 Click-to-select + pan
- [ ] Click a frame row in the navigator. Canvas pans + zooms to center that frame. The row gets a blue 4px left-border indicator.
- [ ] Click a different row. Canvas re-pans.

### 8.3 Search / filter
- [ ] Click the search input at the top of the layer panel (or press Cmd-F while focused).
- [ ] Type a frame name fragment. Tree narrows to matching rows.
- [ ] Clear with Esc.

### 8.4 Keyboard navigation
- [ ] Tab into the layer tree. First row gets focus.
- [ ] Press Down → focus moves to next row. Up → previous.
- [ ] Right arrow on a collapsed branch → expand. Left arrow → collapse.
- [ ] Enter on a frame row → select + pan (same as click).
- [ ] F2 or Cmd-R on a markdown frame row → enters rename mode. Type new title. Enter → committed.
- [ ] Delete key on a frame row → confirm dialog → delete on confirm.

### 8.5 Multi-select + bulk ops
- [ ] Click one frame row. Shift-click another → range selected.
- [ ] Cmd-click a third → added to selection.
- [ ] Cmd-A → all visible frames selected.
- [ ] Top toolbar button "Delete" now shows "Delete N". Click → confirm → all selected frames deleted.
- [ ] Esc → clear selection.

### 8.6 Drag-reorder
- [ ] Drag a frame row up/down within its branch. Drop in a new position.
- [ ] Canvas reflects the new vertical order (frames rearrange).
- [ ] Reload → order persisted.
- [ ] Drag across branches → blocked with a toast (v1 limitation).

### 8.7 Right-click context menu
- [ ] Right-click a frame row. Menu appears with: Rename, Duplicate (may be disabled — v1), Copy link to frame, Delete.
- [ ] Click "Copy link to frame". Clipboard now contains `https://foldo.dev/board/{id}/frame/{frameId}`. Paste in a new tab → opens the canvas focused on that frame.

### 8.8 Comment badge interaction
- [ ] Click the red comment count badge on a frame row. Comments for that frame expand inline under the row.

### 8.9 Empty + loading states
- [ ] Create a new empty board. Open it. Layer panel shows "This board has no frames yet. Use the toolbar at the bottom to create one."
- [ ] On a slow connection (DevTools → Network → throttle to slow 3G), reload a busy board. Layer panel shows 3 skeleton rows during the load.

---

## Section 9 — Dispatch / Claude integration (10 min)

This section depends on whether the Claude CLI is installed on the deploy. Check `/api/dispatch/info` endpoint or look for the "Simulator" banner on the canvas.

### 9.1 Open EditPanel from a comment
- [ ] Drop a comment on a markdown frame line. Click "Make edit" in popover. EditPanel opens.
- [ ] Intent textbox pre-filled with the comment text. Selected element shows the file + line.

### 9.2 Open EditPanel from app frame element pick
- [ ] App frame element pick (Section 7). After pick, switch to comment tool? Or use the existing flow that opens EditPanel directly when you "select" an element.
- [ ] EditPanel shows the element selector + intent textbox.

### 9.3 Dispatch — real Claude path
**Skip if running in simulator mode.**
- [ ] In EditPanel, type intent: "make the heading bigger".
- [ ] Click "Send to Claude".
- [ ] Status changes: pending → running. WS event stream shows in the panel (or via the dispatch indicator).
- [ ] Within ~30-60s: status changes to "done". A new child frame appears with the diff applied.
- [ ] Diff shows the actual source change Claude made.

### 9.4 Dispatch — simulator fallback
**Skip if Claude CLI is installed.**
- [ ] Same flow. The banner shows "Running on simulator — install Claude CLI for real edits".
- [ ] Status: pending → running → done. A child frame with a HEURISTIC edit appears (not real Claude reasoning).
- [ ] Diff may be minimal (e.g. a no-op or trivial change).

### 9.5 Dispatch failure handling
- [ ] Force a failure: type a deliberately impossible intent like "create a file at /etc/passwd". Claude (or sim) returns failure.
- [ ] EditPanel shows the error message. NO child frame is created.
- [ ] Dispatch retry: click "Retry" in the panel. New attempt fires.

---

## Section 10 — Tests panel + user testing (15 min)

This is the unmoderated UX testing feature.

### 10.1 Open tests panel
- [ ] Top bar → "Tests" button. Panel slides in from the right.
- [ ] Pending session badge shows the count of currently-running sessions (if any).

### 10.2 Create a test
- [ ] Click "New test" or "+". Form to define a test: name, optional questionnaire, target board (default current).
- [ ] Save. Test appears in the list with a "Draft" status.
- [ ] Click on the draft test → editor opens. Add 2-3 questionnaire questions, mark one as required.

### 10.3 Publish a test
- [ ] In the test editor, click "Publish". Test status changes to "Live".
- [ ] Test row shows a copyable share link `https://foldo.dev/t/{token}`.
- [ ] Copy the link.

### 10.4 Tester flow
- [ ] Open the share link in an Incognito window (no auth).
- [ ] Lands on the tester page. Intro screen: "Welcome to {test name}. We'll record your voice + screen for ~5 minutes."
- [ ] Click "Continue". Permission prompts for mic + screen recording.
- [ ] Grant permissions. Recording starts. Timer visible.
- [ ] Talk through the test board. Click around.
- [ ] When done, click "Finish recording". Questionnaire screen (the questions you set in 10.2) appears.
- [ ] Fill all required questions. Try to skip a required one → submit blocked with inline error.
- [ ] Submit. "Thanks!" screen.

### 10.5 Test results visible to creator
- [ ] As the creator (back in the canvas), open the tests panel. Click the test → result session appears.
- [ ] Click the session → playback view. Shows the recording (audio + video if available).
- [ ] Transcript section: if Deepgram is wired, shows real text. If not, shows the placeholder text — that's a known gap, not a bug, per `docs/USER-ACTIONS-REQUIRED.md` #3.
- [ ] Questionnaire answers visible below the recording.

### 10.6 Test summary frame
- [ ] On the canvas, a "Test summary" frame should be visible (or created on-demand) — summary of all sessions for the test. Counts, avg duration, top answers.

### 10.7 Unauth tester error states
- [ ] Open `https://foldo.dev/t/clearly-invalid-token`. Friendly error: "Test not found or no longer accepting responses."
- [ ] Open a DRAFT test's share URL (you can manually craft one since drafts don't usually have a public link). Same error.

---

## Section 11 — Share links (Wave 2) (10 min)

### 11.1 Mint a share link
- [ ] On a board, top bar → "Share" button. Modal opens.
- [ ] Click "Create share link". A new link appears. Copy it.

### 11.2 Anonymous view
- [ ] Open the share URL in an Incognito window (no auth).
- [ ] Lands on the share viewer. Frames render as a grid of thumbnails.
- [ ] Comments visible on each frame (Wave 1 fix).
- [ ] **No editing affordances visible**: no LeftRail, no plugin toolbar, no comment tool, no EditPanel. Click a frame → does NOT open the canvas editor.

### 11.3 Revoke a share link (Wave 2)
- [ ] Back as the owner, top bar → "Manage share links" (or the dropdown next to "Share").
- [ ] Modal opens listing all active shares with timestamps.
- [ ] Click "Revoke" on the link from 11.1.
- [ ] Row disappears (or marked revoked).
- [ ] Reload the anonymous viewer page → 404 / "Link revoked".

### 11.4 Email-verify gate on mint
- [ ] As an UNVERIFIED user (use 1.7), try to mint a share. Server returns 403 EMAIL_NOT_VERIFIED. UI shows the same friendly error.

---

## Section 12 — Capture from URL (10 min)

### 12.1 Modal flow
- [ ] On a board, top bar → "Capture" button. Modal opens.
- [ ] Two options visible: "URL" (paste a public URL) + "Chrome extension" (instructions to install).

### 12.2 URL capture via shotter
**Skip if shotter is not deployed (per railway.json — currently optional).**
- [ ] Paste a URL like `https://example.com`. Click "Capture".
- [ ] Loading state visible. After a few seconds, a new board with the captured screenshot appears.
- [ ] Redirected to that new board.

### 12.3 URL capture — shotter not deployed
**Skip the above if shotter IS deployed.**
- [ ] Without shotter, the capture button shows an error inline: "Capture-from-URL is not configured. Use the Chrome extension instead."

### 12.4 Chrome extension capture
**Skip if no extension installed.**
- [ ] Install the extension from `apps/extension/dist/` (load unpacked).
- [ ] On any web page, click the extension icon → "Capture to Foldo". Screenshot taken.
- [ ] Returns to Foldo with a new board created.

---

## Section 13 — Plugin substrate (Wave 1+4) (10 min)

### 13.1 LeftPanel / RightPanel slots
- [ ] On a board, both side panels are visible by default. Left = Layers tab. Right = Inspect tab.
- [ ] Click the tab strip → tab activates. URL gains `?leftTab=layers` / `?rightTab=inspect` (Wave 2 deep-linking).
- [ ] Reload with `?leftTab=layers&rightTab=inspect` in URL. Both tabs activate without clicking.

### 13.2 Panel collapse on tablet (Wave 1 iPad)
**On iPad or 800-900px viewport:**
- [ ] Left panel collapses to a vertical "Tabs" toggle button.
- [ ] Click the toggle → panel expands.

### 13.3 Plugin toolbar (bottom-center)
- [ ] Plugin toolbar visible at bottom-center. Shows 7 tool buttons with group dividers.
- [ ] Active tool's button has highlighted background.

### 13.4 No console errors during plugin activation
- [ ] Open a board with DevTools console open. No `[plugin:…] activate threw` errors.
- [ ] Window-level escape hatches are populated: in console, `typeof window.__foldoToast === 'function'` → true. `typeof window.__foldoSetTool === 'function'` → true.

---

## Section 14 — iPad-specific (20 min)

Run on a real iPad. Skip section if no iPad available.

### 14.1 PWA installability
- [ ] Open `https://foldo.dev/` in Safari on iPad.
- [ ] Tap Share → "Add to Home Screen".
- [ ] App appears on home screen with the Foldo icon (not generic web favicon).
- [ ] Tap from home screen. Opens in standalone mode (no Safari chrome).
- [ ] Splash screen shows briefly during launch (Wave 3 splash images).

### 14.2 Canvas gestures (iPad)
- [ ] Pinch to zoom: smooth, no jitter, no iOS bounce.
- [ ] Two-finger pan: smooth.
- [ ] One-finger tap on a tool button → tool activates. Hit areas feel ≥44pt.
- [ ] Three-finger swipe → iOS multitasking (not intercepted, correct).

### 14.3 Apple Pencil
- [ ] Tap a tool with Pencil → activates same as finger.
- [ ] Pencil + drag with sticky tool → creates a sticky at the touch point. Palm rest while drawing → no spurious pan.

### 14.4 iPad Magic Keyboard shortcuts
- [ ] With keyboard attached: press V → select tool. H → hand. C → comment. Etc.
- [ ] Cmd+0 → zoom-to-fit.

### 14.5 Touch targets
- [ ] Every button you tap feels comfortably hittable. No "I missed and hit something else" misses.
- [ ] CommentPopover close button (X) — visible, easy to tap.
- [ ] FrameMeta kebab menu — visible without hover, easy to tap.

### 14.6 Phone-sized banner
- [ ] On an iPhone (or iPad in iPhone-emulating compact mode at <600px width), open `/board/:id`. You should see a banner "Foldo's canvas is built for tablets and laptops. Open this URL on iPad or desktop."
- [ ] Link to `/home` still works on phone.

### 14.7 Form input — no auto-zoom
- [ ] On iPad, focus a textarea in CommentPopover or EditPanel. The page should NOT zoom in (font is ≥16px so iOS doesn't auto-zoom).

---

## Section 15 — Marketing pages (10 min)

### 15.1 Landing page
- [ ] `https://foldo.dev/` (or `/welcome` / `/`). Hero loads. Below-fold images lazy-load on scroll (DevTools Network tab — confirm `loading="lazy"` works).
- [ ] All CTAs work: "Sign up", "Log in", "Pricing", "Demo".
- [ ] Page renders on iPad portrait without horizontal scroll.
- [ ] Page renders on iPhone (430px) without horizontal scroll.

### 15.2 Pricing page (Wave 2)
- [ ] `/pricing` loads. 3 tier cards.
- [ ] Free tier CTA → `/signup`.
- [ ] Pro tier shows "Coming soon" pill — button disabled (per Wave 2 — billing not wired yet).
- [ ] Top Dog tier links to `/demo`.

### 15.3 Login + Signup pages
- [ ] `/login` + `/signup` forms render correctly. Inputs ≥16px font.
- [ ] Email validation runs before submit (try invalid email → inline error, no POST).

### 15.4 Forgot / Reset / Verify pages
- [ ] `/forgot` form submits → success message.
- [ ] `/reset?token=…` form has disabled state during submit (Wave 1).
- [ ] `/verify?token=valid` shows success state.
- [ ] `/verify?token=expired` shows error state with "Request new link" button.

### 15.5 Marketing image optimization (Wave 2)
- [ ] DevTools Network → reload landing page. Hero image loads as `.webp` (modern browsers) with `.png` fallback for older.
- [ ] Total marketing image weight < 500 KB (was ~8.5 MB pre-Wave 2).

---

## Section 16 — Accessibility (10 min)

### 16.1 Keyboard-only navigation
- [ ] Close DevTools. Use ONLY keyboard.
- [ ] Tab through `/home` → all interactive elements reachable. Focus rings visible.
- [ ] On a board, Tab into the layer tree → arrow keys navigate (Wave 4).
- [ ] Tab into a tab strip → arrow keys move between tabs (if implemented; native Enter activates).

### 16.2 Screen reader (VoiceOver on Mac, ⌘F5)
- [ ] Read the landing page. All buttons announce with their labels.
- [ ] On a board, the Layers panel announces as "Layers tree, N frames across M branches" (the aria-label).
- [ ] Comment pin close button announces as "Close comment" (not "button").

### 16.3 Color contrast
- [ ] Visually check text contrast: body text passes AA, button labels pass AA.
- [ ] No text colored on a similar-luminance background.

---

## Section 17 — Performance + scale (10 min)

### 17.1 Bundle size + cache headers
- [ ] DevTools Network → reload board page. Total JS transfer < 600 KB gzipped (Wave 2 bundle budget).
- [ ] Each hashed asset has `Cache-Control: public, max-age=31536000, immutable`.
- [ ] `index.html` has `Cache-Control: no-cache, no-store, must-revalidate`.

### 17.2 Frame creation throughput
- [ ] Open DevTools → Network. Use sticky tool, click rapidly to create ~10 stickies in 5s.
- [ ] All 10 sticky frames appear. No 429 rate limit (well under the 100/min cap).

### 17.3 Comment spam
- [ ] Try to create 50+ comments programmatically (via `fetch` in console). Around comment #501 (per 500/hr cap), 429 RATE_LIMITED returned. (Skip if you don't want to spam your test data.)

### 17.4 Multiplayer scaling
- [ ] Open the same board in 4+ contexts (Chrome, Firefox, Incognito, etc).
- [ ] All 4 see each other's cursors smoothly.
- [ ] No console errors. No memory leaks visible in DevTools Memory tab.

### 17.5 Live database performance check
- [ ] `curl -s -H 'Authorization: Bearer YOUR_TOKEN' https://api.foldo.dev/api/home | jq '. | length'` — completes in <300ms even with many boards (Wave 1 GROUP BY rewrite).

---

## Section 18 — Observability (5 min)

### 18.1 /health
- [ ] `curl -s https://api.foldo.dev/health` returns `{ok: true, db: {reachable: true, latency_ms: N}, hub: {active_boards: N}, ...}`. (Wave 1 enriched health probe.)
- [ ] Kill local Postgres (`docker stop pg`). `curl -s http://localhost:4000/health` returns 503 with `db: unreachable`.
- [ ] Restart Postgres. Health returns 200.

### 18.2 /metrics
- [ ] `curl -s https://api.foldo.dev/metrics` returns Prometheus text. Contains:
  - `foldo_http_requests_total{method,route,status}` — incremented on every request
  - `foldo_ws_connections{boardId}` — number of WS connections per board
  - `foldo_ws_broadcast_total{boardId,type}` — broadcasts emitted
  - `foldo_ws_board_count` — active boards in the hub map
  - `foldo_ws_replay_gaps_total{boardId}` — replay-buffer misses
  - `foldo_rate_limit_hits_total{bucket,outcome}` — rate-limit decisions (Wave 3)
  - `foldo_db_pool_idle` / `foldo_db_pool_total` — pg pool state
  - `foldo_hub_init_fallback_total` — Redis-fallback counter

### 18.3 Structured logs
- [ ] Tail server logs (Railway dashboard or local terminal). Each log line is JSON with: `level`, `time`, `service`, `env`, `reqId`, `userId` (where applicable), `msg`.

---

## Section 19 — Deploy + ops (5 min)

### 19.1 Production bundle freshness
- [ ] `curl -s https://foldo.dev/ | grep -o 'index-[A-Za-z0-9_-]*\.js'`. Note the hash.
- [ ] Push a no-op commit to main. Wait for Railway deploy.
- [ ] Re-check the hash. Should rotate to a new value within a few minutes.

### 19.2 Backup cron (Wave 1)
- [ ] GitHub → Actions tab. `.github/workflows/backup-pg.yml` listed. Last run: Sunday 04:00 UTC OR "Never run yet" if secrets aren't set.
- [ ] Manually trigger via workflow_dispatch. Runs successfully OR fails because secrets aren't set (per `docs/USER-ACTIONS-REQUIRED.md` #4).

### 19.3 Post-deploy smoke (Wave 1)
- [ ] After a deploy, `.github/workflows/post-deploy-smoke.yml` should auto-run if the Railway→GH webhook is wired (per `docs/USER-ACTIONS-REQUIRED.md` #6).

### 19.4 Static asset compression
- [ ] DevTools Network → click any `.js` from foldo.dev. Response header includes `Content-Encoding: br` or `gzip` (Wave 1 swap from vite preview to serve).

---

## Section 20 — Final smoke (5 min)

### 20.1 Cold load 5 random boards
- [ ] Open 5 boards in succession. Each one opens within 2s (Wave 1 batched markdown overlays + indexed comments).

### 20.2 Long session — no memory leak
- [ ] Open a board. Leave it open for 30 min while doing other work in adjacent tabs.
- [ ] Return. Canvas still responsive. Memory in DevTools didn't grow > 200 MB.

### 20.3 Visual regression sweep
- [ ] Open every major route in turn: `/`, `/pricing`, `/login`, `/signup`, `/home`, `/board/:id`, `/settings`. No visual oddities, no broken images, no overlapping UI.

### 20.4 No console errors anywhere
- [ ] DevTools console open throughout the test pass. Zero errors logged at the end.

---

## Result reporting

After completing the pass, fill in this summary:

```
Date: ____________
Tester: ____________
Environment: ____________
Browser: ____________
Sections completed: ____ / 20
Total tests: ____ passed, ____ failed, ____ skipped
Critical bugs found: ____ (P0 = blocks shipping, P1 = ships with caveat)
```

**Known acceptable skips (don't count as failures):**
- 14.* if no iPad available
- 7.7 / 9.3 if Claude CLI not installed locally (use simulator fallback path 9.4)
- 12.2 if shotter not deployed (use 12.3 / 12.4)
- 10.5 transcription if Deepgram not wired (it's a placeholder per docs)
- 19.2 / 19.3 if secrets not set (per USER-ACTIONS-REQUIRED.md)

**Failure triage:**
- P0 (ship-blocker): file as GitHub issue with `priority: P0` label + reproducer.
- P1 (caveat): same but `priority: P1`.
- P2 (polish): `priority: P2`.

End by committing `docs/MANUAL-TEST-RUN-{date}.md` so the run is permanent record.
