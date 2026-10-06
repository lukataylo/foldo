# Plan: shared projects with live collaboration (phase 1 of multiplayer)

Status: proposal, nothing built. Scope: **phase 1 only**. Branching and merging (phases 2 and 3) are out of scope but the
design below is chosen so they can be added without rework.

## Goal

A team member shares an **invite link** to a project. Anyone who opens it (after signing in) joins the same project live:

- sees who else is in it (avatars, cursors, current file),
- sees the same files, and edits them together in the editor,
- sees the same chat, including an AI response while it streams,
- gets their own live preview.

Not in phase 1: branches, merging, comments, voice, follow mode, binary assets.

## Where we are today (why this is not a small change)

- A project is **only its chat messages** (`projects.messages`, JSON). Reopening replays the `<boltArtifact>` actions in
  the viewer's WebContainer to rebuild files. There is **no server-side copy of the files**.
- The files and the running app live in **each browser's WebContainer**. Manual editor edits are never persisted.
- The LLM stream goes to the prompting browser only (`/api/chat` -> `useChat`), which parses it and executes actions
  locally (`app/lib/hooks/useMessageParser.ts`, `app/lib/runtime/action-runner.ts`).
- Sharing (`/p/:shareId`) is read-only; the first message by a signed-in viewer forks a private copy.
- Server is a single Node process with SQLite on a Railway volume (`server.mjs`, `app/lib/.server/db.ts`).

So phase 1 needs: a server-side source of truth for files, a realtime channel, membership/permissions, and an
"observer" mode in the client that applies someone else's changes instead of running its own.

## Design

### 1. Shared document: Yjs (CRDT)

One Yjs document per project:

| Key | Type | Content |
| --- | --- | --- |
| `files` | `Y.Map<path, Y.Text>` | source files only (see exclusions) |
| `messages` | `Y.Array<Y.Map>` | chat messages: `id, role, content, authorId, createdAt, status` |
| `meta` | `Y.Map` | `title`, `startCommand`, `lockHolder`, `schema: 1` |

- Why Yjs: concurrent typing in the same file merges cleanly, mature CodeMirror binding (`y-codemirror.next`) gives
  remote cursors and selections for free, and awareness gives presence. Alternatives considered: Automerge (heavier, weaker
  editor bindings), hosted Liveblocks/PartyKit (fastest to ship, but vendor lock-in and per-user cost, and we already
  run a single stateful Node process), event-sourcing the chat only (cheap, but manual edits diverge between clients).
- **Synced files exclude** `node_modules`, `.git`, `dist`, `build`, lockfiles, and anything over 200 KB or non-UTF-8.
  Each client runs its own `npm install`.

### 2. Transport and persistence (server)

- New WebSocket endpoint `GET /ws/project/:id` in `server.mjs` using `ws` and `y-protocols` (sync + awareness). No
  dependency on `y-websocket`'s server so we control auth and limits.
- **Auth on upgrade:** session cookie (reuse `getUser`), `Origin` must match host, and the user must be a member of the
  project. Otherwise `401/403` before upgrade. Disabled users and revoked members are disconnected immediately.
- **Roles enforced on the server**, not the client: `viewer` connections may receive updates but any sync update they
  send is dropped; `editor` and `owner` may write. Awareness is allowed for everyone but validated (size, shape).
- **Persistence:** append each update to `ydoc_updates(project_id, seq, update BLOB)`; compact into
  `projects.ydoc` (snapshot) after 200 updates or 60 s idle. Rooms live in memory while at least one client is
  connected and are evicted 60 s after the last disconnect.
- Hard limits: document size 5 MB, single update 1 MB, 20 messages/s per connection, 8 members per project, 200 open rooms.
- Single instance only (same constraint as today). A later move to Postgres + Redis pub/sub is the path to scale out.

### 3. Membership and invites

New tables:

```sql
project_members (project_id, user_id, role CHECK (role IN ('owner','editor','viewer')), joined, PRIMARY KEY (project_id, user_id))
project_invites (token TEXT PRIMARY KEY, project_id, role, expires, created_by, uses INTEGER)
```

- `POST /api/projects/:id/invite {role, ttlHours}` (owner only) -> `/join/:token`.
- `/join/:token`: signed out -> sign-up/sign-in with a `next` param -> adds membership -> redirects to `/chat/:id`.
- Owner can list members, change roles, remove a member, and revoke invites (Share menu -> "People").
- `chat.$id` and `/api/projects` loaders change from `user_id = ?` to "is a member". The existing public `/p/:shareId`
  link stays read-only and separate from collaboration.
- The project owner keeps the delete/share/gallery controls. Editors can edit and prompt.

### 4. Client: bridging the Yjs doc and the WebContainer

New module `app/lib/collab/` with three small pieces:

1. **Provider** - opens the WebSocket, creates the `Y.Doc`, exposes awareness, reconnects with backoff, shows
   "Reconnecting..." and keeps editing locally (Yjs merges on reconnect).
2. **File bridge** (the hard part):
   - *Local -> doc:* subscribe to `workbenchStore` file changes (editor edits and AI `file` actions) and apply a
     minimal text diff to the matching `Y.Text` (never replace whole strings, or concurrent edits get clobbered).
   - *Doc -> local:* observe `files`; for changes whose transaction origin is not "local", write to the WebContainer FS.
   - **Echo-loop guard:** every local write carries an origin tag; the WebContainer watcher ignores writes it caused.
   - Deleted/renamed files map to key deletes/inserts.
   - When `package.json` changes remotely, debounce 1.5 s then run `npm install`; the dev server restarts itself.
3. **Observer parser** - `useMessageParser` gets a `mode: 'owner' | 'observer'`. Observers render the artifact card
   (steps, file list) from the shared message text but **do not run actions**; file results arrive via the doc.

**Join flow** for a new collaborator: connect -> receive doc -> write all files -> `npm install` -> run
`meta.startCommand` (set by whoever last ran the dev server). Old projects (no doc yet) are **seeded lazily**: the first
time the owner opens one after the feature ships, their client replays the chat as today, then uploads the resulting file
tree to the doc.

### 5. Shared chat and the generation lock

- `/api/chat` accepts `projectId`, checks membership and role (`editor`+), and takes a **per-project lock**
  (in-memory map with 5 min TTL, same pattern as `acquireStream`). One AI generation per project at a time.
- The prompting client mirrors the stream into `messages` as a Y.Map with `status: 'streaming'`, throttled to ~4 writes
  per second, then finalises it (`status: 'done'`). Other clients render it live.
- UI: composer shows "Maya is prompting..." and is disabled for others until the lock clears. Queueing is future work.
- **Quota:** the *prompter's* daily quota is spent (simple, no new accounting). Open question below.
- Server also re-validates that `messages` in the request match the doc's history length bounds (reuse the existing
  size caps) so a client cannot send arbitrary history to burn tokens under another project's name.

### 6. Presence UI

- Header avatar stack (up to 5 + overflow), each with a stable colour from the user id.
- Editor: remote cursors and selections with name labels (via `y-codemirror.next`).
- File tree: dot showing where each person is; "prompting" badge on the avatar while holding the lock.

## Security and abuse model

| Threat | Mitigation |
| --- | --- |
| Non-member connects to a room | Membership check on WS upgrade; tested for 401/403 |
| Viewer writes to the doc | Server drops viewer sync updates; tested with a raw WS client |
| Revoked member keeps a live socket | Server closes sockets on role change/removal/disable |
| Invite link leak | Role-scoped, expiring, revocable, use-counted, 128-bit token |
| Oversized/spammy updates | Per-update, per-doc and per-connection limits; drop + close on violation |
| Token burn via another project | `projectId` membership check + existing history caps + prompter pays |
| Cross-site WebSocket hijack | `Origin` check and SameSite cookie |
| Malicious collaborator injects code that runs in teammates' WebContainers | Invite-only editors; WebContainer sandbox; documented trust model (collaborators are trusted, like a git repo) |
| XSS via names/titles | Rendered as text only (already the case) |

## Milestones (each is shippable behind a flag)

| # | Milestone | Est. | Done when |
| --- | --- | --- | --- |
| M0 | Spike: Yjs room server, auth, persistence, no UI | 2-3 d | Two `ws` test clients converge under a random-edit fuzz; server restart keeps state |
| M1 | Membership, invites, `/join`, People menu | 3 d | Adversarial API tests for roles/invites pass |
| M2 | File bridge + join flow + package.json handling | 4-5 d | Two browsers edit/generate and both previews update; no echo loops |
| M3 | CodeMirror co-editing + presence UI | 3 d | Remote cursors, avatars, per-file indicators |
| M4 | Shared chat, streaming mirror, observer parser, generation lock | 3-4 d | Teammate sees the AI response live; second prompt is blocked while the lock is held |
| M5 | Hardening: reconnects, limits, admin switch, e2e personas, load test | 3 d | Extended `scripts/e2e-security.mjs` plus an 8-client x 10-room load test green |

**Total about 3 weeks for one engineer; ~2 weeks for a thin slice** (M0-M2 + M4 with read-only file view, skipping
co-editing). Ship behind `COLLAB_ENABLED` (env) and an admin toggle, dry-run it at a small hackathon first.

## Test plan

- **Unit:** file bridge (diff application, echo guard, delete/rename), observer parser, role filter, limits.
- **Integration (no browser):** N `ws` clients with random edit streams must converge; reconnect with offline edits;
  server restart mid-session; compaction correctness.
- **Adversarial personas** (extend `scripts/e2e-security.mjs`): outsider, viewer, expired/revoked invite, removed member
  with a live socket, update flooder, oversized update, quota-exhausted teammate, lock bypass via direct `/api/chat`,
  reconnect storm.
- **Browser:** two real Chrome profiles editing the same file, generating at the same time, one dropping offline.
- **Load:** 10 rooms x 8 clients with typing at 5 Hz; watch event-loop lag, memory, and SQLite write rate.

## Risks

1. **WebContainer divergence.** Each client installs dependencies itself, so previews can briefly differ. Acceptable;
   mitigated by syncing `package.json` and re-running install on change.
2. **Echo loops / lost edits in the bridge.** The riskiest code. Needs the fuzz test before any UI work.
3. **Bolt's stores assume a single local owner** (`workbenchStore`, `FilesStore`). The observer mode may need a few
   refactors in upstream-derived code; budgeted in M2/M4.
4. **Single instance.** Rooms and locks are in memory. Fine for hackathon scale, a hard limit for horizontal scaling.
5. **Large projects.** The 200 KB per-file and 5 MB per-doc caps will reject some real apps; surface a clear message.

## Open questions

1. Who pays for AI messages in a shared project: the prompter (proposed), the project owner, or a shared pool?
2. Should viewers be able to run the preview (needs the full file sync) or only watch?
3. Member cap (proposed 8) and invite expiry default (proposed 24 h)?
4. Should the existing `/p/:shareId` remix flow become "join as viewer" instead of forking?
5. Is it acceptable that live collaboration is Chromium-only (a WebContainer constraint)?

## Out of scope, but designed for

- **Branches (phase 2):** a branch is a second `Y.Doc` whose initial state is a snapshot of the parent plus its own
  `messages`. The per-project room becomes a per-branch room; membership stays per project.
- **Merge (phase 3):** a three-way merge from the common-ancestor snapshot, with the model proposing the merged file
  contents and a diff review screen.
