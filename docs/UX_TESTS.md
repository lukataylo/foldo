# Foldo Tests — Unmoderated UX Testing

> **Status:** Phases 1–4 implemented (2026-05-14). S3 storage, transcription, and AI synthesis ship as pluggable adapters — the stub defaults run with zero config; real providers drop in via env vars (`FOLDO_S3_BUCKET`, `FOLDO_TRANSCRIPTION_PROVIDER`, `ANTHROPIC_API_KEY`).
> **Author:** drafted 2026-05-14
> **One-liner:** Turn any board into a source of *real-user* evidence — publish a short `foldo.dev/t/:token` link, gather screen+voice recordings against tasks, and stream the results back onto the canvas as frames you can comment on and dispatch edits from.

---

## 1. Why

Foldo today closes one loop: **build → internal review → fix**. But every reviewer on the canvas is a *proxy* for the end user — PMs, designers, founders all guessing what real users will do. The loop that's actually missing is **build → real users try it → evidence → fix**.

Unmoderated tests add that loop *without leaving Foldo's model*:

- The public link is the `board_shares` pattern (base62 token, no-auth `/api/share/:token`, `/s/:token` viewer) — we already built it once.
- The results are **frames**. A session becomes a video frame + transcript + answers, connector-lined under a summary frame, clustered by task. The canvas *is* the results dashboard — the differentiator vs. Maze / UserTesting, which dump results into a separate report.
- **The loop closes:** highlight a line in a session transcript → "Make this an edit" → the existing dispatch pipeline → Claude Code ships the fix. No usability tool on the market connects raw user feedback directly to a coding agent.

This earns a Roadmap entry and a Feature bullet in the README.

---

## 2. Decisions locked

| Decision | Choice |
| --- | --- |
| **Delivery** | **Auto-detect hybrid** — server probes the target; `iframe` when framing is allowed, `handoff` (new tab + screen recording) when it isn't. Plus a third **`dom_snapshot`** mode for local-only apps that an external tester can't reach. |
| **Storage** | **Object storage from day one** — S3-compatible (AWS S3 / Cloudflare R2 / Backblaze). Recordings referenced by key in Postgres, never inlined. |
| **This doc** | Detailed plan/spec. No code yet. |

---

## 3. The three delivery modes

| Mode | When | Tester experience | Trade-off |
| --- | --- | --- | --- |
| **`iframe`** | Target sends no `X-Frame-Options` / permissive `frame-ancestors` (Vercel previews usually qualify) | App runs inside the Foldo page; task banner is Foldo chrome *around* the iframe | Cleanest, most branded. We still can't inject *into* the iframe cross-origin — banner sits outside it. |
| **`handoff`** | Target blocks framing (lots of staging/prod) | Foldo tab is a **control panel** (tasks, "I did it", "skip", "finish"); the real app opens in a new tab; screen recording spans both | Works on every public URL. We lose in-page event capture — we rely on the screen recording + the tester's self-reported task completion. `COOP` may sever `window.opener`, so don't depend on it. |
| **`dom_snapshot`** | Local-only apps (`localhost`, private staging) an external tester literally cannot reach | The creator captures the DOM via the **existing extension / MCP `foldo_freeze`** (already serializes `document.documentElement.outerHTML`, 500 KB cap); we serve that frozen snapshot in a sandboxed `srcdoc` iframe with the banner | **Static** — no live JS or backend. Good for first-impression, first-click, and "where would you click?" tests; *not* deep task flows. Set this expectation in the builder UI. |

`tests.target_mode` can be `auto` (resolve per-session via probe), or pinned to a specific mode. The probe runs at test-creation time (server-side `GET`/`HEAD`, inspect `X-Frame-Options` and CSP `frame-ancestors`) and is cached on the test; re-checkable on demand.

---

## 4. Data model

New Postgres tables (follow `db.ts` conventions — `newId(prefix)`, ISO timestamps, JSON columns via `parseJson`). The `DemoRequests` table is precedent for adding standalone tables.

### `tests`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | `test-<8hex>` |
| `board_id` | TEXT FK → boards | Results land on this board |
| `name` | TEXT | |
| `target_url` | TEXT NULL | The deployed app URL; null for `dom_snapshot` |
| `target_mode` | TEXT | `auto` \| `iframe` \| `handoff` \| `dom_snapshot` |
| `frameable` | BOOLEAN NULL | Probe result, cached |
| `dom_snapshot_key` | TEXT NULL | Object-storage key of the frozen DOM (dom_snapshot mode) |
| `intro` | TEXT | Welcome / context shown before tasks |
| `recording_modes` | JSONB | Allowed modes the tester may pick: `screen_voice` \| `voice_only` \| `screen_only` |
| `questionnaire_json` | JSONB NULL | Followup questions (see §7) |
| `status` | TEXT | `draft` \| `live` \| `closed` |
| `share_token` | TEXT UNIQUE | base62 ~10 char — `foldo.dev/t/:token` |
| `response_limit` | INT NULL | Optional cap; auto-`closed` when reached |
| `summary_frame_id` | TEXT NULL | The hub frame on the canvas (see §8) |
| `created_by_user_id` | TEXT FK → users | |
| `created_at` / `updated_at` | TEXT | |

### `test_tasks` — the "series of screens"
| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | `tt-<8hex>` |
| `test_id` | TEXT FK | |
| `order_index` | INT | |
| `title` | TEXT | e.g. "Find and start a free trial" |
| `instruction` | TEXT | Banner text shown to the tester |
| `success_hint` | TEXT NULL | Optional — what "done" looks like (creator analysis aid) |
| `start_url` | TEXT NULL | Per-task starting route |
| `start_recipe_json` | JSONB NULL | **Reuses the existing recipe system** (`click`/`fill`/`navigate`) to set up starting state — modal open, form half-filled |

### `test_sessions` — one tester's run
| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | `ts-<8hex>` |
| `test_id` | TEXT FK | |
| `status` | TEXT | `started` \| `recording` \| `completed` \| `abandoned` |
| `recording_mode` | TEXT | What the tester chose |
| `tester_label` | TEXT | Anonymous — "Tester 4" — or optional self-entered name |
| `tester_meta_json` | JSONB | UA, viewport, locale, referrer. No PII unless volunteered |
| `consent_at` | TEXT NULL | Explicit recording consent timestamp (legal) |
| `recording_key` | TEXT NULL | Object-storage key; null until upload completes |
| `recording_duration_ms` | INT NULL | |
| `transcript_json` | JSONB NULL | `[{ startMs, endMs, text }]` |
| `transcript_status` | TEXT | `pending` \| `processing` \| `done` \| `failed` \| `skipped` |
| `responses_json` | JSONB NULL | Questionnaire answers |
| `result_frame_id` | TEXT NULL | The session frame on the canvas |
| `started_at` / `completed_at` | TEXT | |

### `test_task_results` — per task within a session
| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | |
| `session_id` | TEXT FK | |
| `task_id` | TEXT FK | |
| `status` | TEXT | `completed` \| `skipped` \| `gave_up` |
| `duration_ms` | INT | |
| `recording_offset_ms` | INT | Where this task starts in the recording — lets the canvas deep-link the video to a task |
| `events_json` | JSONB NULL | Clicks / navigations / rage-clicks / console errors (iframe + dom_snapshot modes only — see §6) |

A new short-token session credential authorizes all per-session writes (so a tester can only touch their own session, never the test definition or other sessions).

---

## 5. API surface

### Creator side (authed, board-membership checked — mirrors `routes/boards.ts`)
- `POST   /api/tests` — create (`boardId`, `name`, `targetUrl?`, `targetMode`, `intro`, `recordingModes`, `tasks[]`, `questionnaire?`). Runs the frame-ability probe. Returns the test + `shareToken`.
- `GET    /api/tests?boardId=` — list tests + session counts for a board.
- `GET    /api/tests/:id` — test + tasks + session summaries.
- `PATCH  /api/tests/:id` — edit fields; `status` transitions `draft → live → closed`.
- `DELETE /api/tests/:id`
- `POST/PATCH/DELETE /api/tests/:id/tasks[/:taskId]` + reorder
- `GET    /api/tests/:id/sessions` — list with status.
- `GET    /api/tests/:id/sessions/:sessionId` — full detail (signed recording URL, transcript, responses, task results).

### Public side (no auth — token-scoped, mirrors `GET /api/share/:token`)
- `GET  /api/t/:token` — live test definition for a tester (intro, tasks, allowed recording modes, resolved delivery mode, questionnaire). `404` if not `live` / closed / limit reached.
- `POST /api/t/:token/sessions` — start a session → returns `sessionId` + session-scoped token.
- `POST /api/t/:token/sessions/:id/consent`
- `POST /api/t/:token/sessions/:id/recording/init` — begin an **S3 multipart upload**, return `uploadId` + presigned part URLs (granted in batches).
- `POST /api/t/:token/sessions/:id/recording/complete` — finalize multipart upload → set `recording_key`, enqueue transcription job.
- `POST /api/t/:token/sessions/:id/tasks/:taskId` — submit a task result.
- `POST /api/t/:token/sessions/:id/responses` — submit questionnaire answers.
- `POST /api/t/:token/sessions/:id/complete` — finalize session → create the canvas frame → broadcast (see §8).

> **Why multipart upload:** `MediaRecorder` with a `timeslice` emits chunks that are *not* individually valid media files. Uploading each chunk as an S3 multipart *part* and completing the upload at the end yields one valid `.webm` object and survives a mid-session crash. Don't buffer the whole recording in memory and upload once.

---

## 6. The tester page — `apps/web` route `/t/:token`

New root component `<TestRunner />`, registered in `main.tsx` alongside `<ShareViewer />`. State machine:

1. **Intro** — name, intro copy, "what we record" disclosure, est. time, task count. Tester picks a recording mode from the allowed set. Optional name field.
2. **Consent + permissions** — explicit consent checkbox (recording is legally consented capture), then `getUserMedia({audio})` and, for screen modes, `getDisplayMedia()`. Handle denials gracefully (fall back to voice-only or block with explanation). Warn handoff testers: *screen sharing can capture other tabs — close anything sensitive, or share just the app tab.*
3. **Delivery setup** — branch on resolved mode:
   - `iframe`: render target in an iframe, Foldo task banner fixed above it.
   - `handoff`: "We'll open the app in a new tab — keep this one, your tasks live here." Start recording, `window.open(targetUrl)`, show a floating control panel.
   - `dom_snapshot`: render the stored DOM via sandboxed `srcdoc` iframe + banner.
4. **Task loop** — banner shows the current task's instruction + **"I did it"** / **"I'm stuck — skip"**. Records per-task timing + `recording_offset_ms`. Recording runs **continuously** with offset markers (simpler and more reliable than pause/resume).
5. **Questionnaire** — render followup questions if present.
6. **Done** — stop recording, flush the final upload part, `POST .../complete`, thank-you screen.

**New modules:**
- `apps/web/src/test/recorder.ts` — wraps `MediaRecorder`; mixes mic + display tracks (or mic only); `timeslice` chunking; uploads each chunk as a multipart part via presigned URL; exposes offset markers.
- `apps/web/src/test/eventCapture.ts` — for `iframe` / `dom_snapshot` modes, captures clicks / navigations / rage-clicks / console errors via the **existing sample-app `postMessage` bridge pattern** (`apps/sample-app/src/bridge`). Not available in `handoff` mode (cross-tab) — that's the documented trade-off.

**Constraints to surface in the UI:**
- `getDisplayMedia` needs a user gesture and shows the browser picker — unavoidable, standard for the category.
- Mobile browsers mostly don't support `getDisplayMedia` → mobile testers get voice-only; full mobile screen capture is out of scope for v1.

---

## 7. Questionnaire

`questionnaire_json` is an ordered array of questions; v1 types: `short_text`, `long_text`, `single_choice`, `multi_choice`, `rating` (1–5 / NPS-style). Answers stored as `responses_json` on the session. The builder gets a lightweight question editor; the tester page renders them after the task loop.

---

## 8. Results on the canvas

When a session completes, the server creates frame(s) and broadcasts `frame.added` — **the existing WS path**, no new browser-side plumbing needed.

- **`test_summary` frame** — the test's hub on the canvas. Aggregate: N sessions, per-task completion rate, median time-on-task, common flagged moments. Created when the test goes `live`; `tests.summary_frame_id` points to it.
- **`test_session` frame** — one per completed session, connected to the summary via the existing `parent_frame_id` + `Connectors`. Contains a video player (signed `recording_key` URL), tester label, duration, per-task pass/skip/gave-up chips, a transcript panel, and questionnaire answers. Clicking a transcript line or a task chip **seeks the video** (using `recording_offset_ms`).

Sessions **stream in live** as testers finish — the board visibly fills with evidence in real time. Add WS messages `test.session.started` (a "someone is testing now" indicator) and `test.session.completed`.

New protocol additions in `packages/protocol` (`@foldo/protocol`): `Test`, `TestTask`, `TestSession`, `TestTaskResult` in `domain.ts`; `TestSummaryFrameContent` / `TestSessionFrameContent` added to the frame-content union; request/response types in `rest.ts`; the new messages in `ws.ts`.

---

## 9. Loop closure — the part that makes this *Foldo*

In a `test_session` frame, selecting a transcript line or a flagged moment behaves like selecting a frame element today: it opens the **EditPanel** / drops a comment carrying a `CommentTarget`. Add a `CommentTarget` variant for test feedback — `{ kind: 'test_feedback', sessionId, quote, recordingOffsetMs }` — so "Make this an edit" produces a dispatch prompt like:

> *In testing, Tester 4 said "I couldn't tell the Pro plan was monthly vs annual" at 02:14 while doing "Pick a plan." Fix the pricing toggle clarity.*

That flows through the **unchanged** MCP dispatch pipeline → Claude Code → a new frame on the canvas. Raw user feedback → shipped fix, in one surface.

---

## 10. Intelligence layer (stretch, but it's the magic)

After transcription, run a Claude pass over each session (and across sessions) to: summarize the run, extract discrete issues with severity, tag which task each issue belongs to, and surface "3 of 5 testers struggled here." Each extracted issue becomes a **candidate comment** pre-filled on the relevant frame — the creator just approves it into a dispatch. This is the natural Foldo move: an AI-native product where the agent triages the evidence too.

---

## 11. Infrastructure additions

- **`apps/server/src/storage/`** — S3-compatible adapter. Env: `FOLDO_S3_ENDPOINT`, `FOLDO_S3_BUCKET`, `FOLDO_S3_REGION`, `FOLDO_S3_ACCESS_KEY`, `FOLDO_S3_SECRET`. Presigned multipart PUT for chunks; presigned GET for playback. Keying: `recordings/{testId}/{sessionId}.webm`, `dom-snapshots/{testId}.html`.
- **Transcription job** — background worker triggered on `recording/complete`. Pluggable provider behind `FOLDO_TRANSCRIPTION_PROVIDER` (Deepgram / AssemblyAI / Whisper). v1 can be an in-process async task; graduate to a real queue alongside the Redis work already on the roadmap.
- **Retention** — video is expensive; add a retention policy (`FOLDO_RECORDING_TTL_DAYS`) and lean on `response_limit`.

---

## 12. Risks & constraints

| Risk | Mitigation |
| --- | --- |
| Many apps block iframing | The hybrid `handoff` mode is the universal fallback — always works on a public URL. |
| `handoff` mode loses in-page events | Documented trade-off; rely on screen recording + self-reported completion. `COOP` may sever `window.opener` — never depend on it. |
| `dom_snapshot` is static (no JS/backend) | Scope it as first-impression / first-click testing in the builder UI; don't promise task flows. |
| Recording consent & privacy (GDPR) | Explicit consent screen, plain-language disclosure of what's captured, retention policy. Warn handoff testers about other-tab capture. |
| Mobile screen capture unsupported | Voice-only on mobile for v1. |
| Storage/transcription cost | Retention TTL, `response_limit`, pluggable transcription provider. |
| `MediaRecorder` chunks aren't standalone files | S3 multipart upload — one part per chunk, combined on `complete`. |

---

## 13. Phasing

**Phase 1 — Foundation.** Protocol types; `tests` / `test_tasks` / `test_sessions` / `test_task_results` migrations; S3 storage adapter; tests CRUD API + the creator's test-builder UI on the board (incl. "seed a test from existing captured frames"). *Exit:* create a test, get a `foldo.dev/t/:token` link — no recording yet.

**Phase 2 — Tester flow.** `/t/:token` `<TestRunner />`; `recorder.ts`; consent + permissions; task loop; multipart chunked upload; session lifecycle. Ship **`handoff` first** (works everywhere), then `iframe`, then `dom_snapshot`. *Exit:* a tester completes a recorded session end-to-end.

**Phase 3 — Results on canvas.** `test_summary` + `test_session` frame kinds; `test.session.*` WS messages; live streaming-in; the video-player frame component with transcript seek. *Exit:* completed sessions appear as frames in real time.

**Phase 4 — Loop closure + intelligence.** Transcription job; `test_feedback` `CommentTarget` + transcript → "Make this an edit"; Claude session synthesis with candidate comments. *Exit:* a line of user feedback becomes a shipped commit without leaving the canvas.
