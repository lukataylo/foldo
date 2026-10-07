# Foldo

Vibe-coding platform on a Node port of bolt.new (Remix + Vite, React 18). See README.md.

- `app/routes/` — `login` (register/login/logout), `_index`/`chat.$id`/`p.$shareId` (same chat UI, different loaders), `api.chat`/`api.enhancer` (LLM, auth + daily quota), `api.projects` (save/list/share/delete).
- `app/lib/.server/` — `db.ts` (node:sqlite), `auth.ts` (scrypt, cookie sessions, quota), `llm/` (DeepSeek/OpenAI via `@ai-sdk/openai`).
- Projects are the chat messages; reopening re-runs the `<boltArtifact>` actions in the WebContainer, so no file snapshot is stored.
- `server.mjs` uses `installGlobals({ nativeFetch: true })` — remix-serve's polyfilled fetch breaks the AI SDK streams.
- vite `nodePolyfills` has `process: false`; the shim hides `process.env` on the server.
- Check: `npm run build` then `npm start`; `npx vitest run` (parser tests). `tsc` has a few upstream type errors (Markdown, unist).
- `/` is the landing page for visitors and the studio home when signed in; `chat.$id` and `p.$shareId` render the same `Studio`.
- Non-Claude models ignore bolt's artifact format unless `FORMAT_REMINDER` (prompts.ts) is appended; default OpenAI model is gpt-4.1.
- API routes use `requireApiUser` (401), page routes use `requireUser` (redirect).
- Templates: sources in `templates/` (packs + overlays) -> `scripts/build-templates.mjs` -> `public/templates/*.json` (generated, gitignored). Server side: `app/lib/.server/templates.ts` (index, prompt guide, snapshots), client: `app/lib/templates/client.ts` (apply + prefetch), `snapshot.client.ts` (admin builder). A template project is saved with `projects.template`; reopening re-applies the template, then replays chat edits on top. The first message `tpl-intro` is UI-only and is dropped before the model sees it. Templates must never ship their own package.json (the pack owns it) and `npm run test:templates` must pass before changing a pack.
- Snapshot format gotchas (WebContainer 1.3): `mount()` ignores `mountPoint` for snapshots, drops file modes (we `chmod +x node_modules/.bin/*` after mounting), and the runtime's `serialize()` output must be converted to msgpack (`msgpack.ts`). Vite's cache is keyed on the lockfile: warm it with no `package-lock.json` present.
- Provider catalog, settings, key encryption: `app/lib/.server/config.ts`. Quotas, sessions, throttles, stream concurrency: `auth.ts`. Admin UI: `routes/admin.tsx`.
- Password hashing must stay async (`scrypt`); the sync version froze the event loop under load.
- `npm run test:e2e` (after `npm run build`) is the regression suite; extend it when adding routes. `.npmrc` has legacy-peer-deps because @remix-run/express wants express 4.
- Reply length, continuations, per-login concurrency, fallback model, pause switch live in `settings` (see `config.ts`); `routes/api.chat.ts` owns failover and the user-facing error copy (keep it calm, one next step).
- Never call `scryptSync` per request (derive keys once). `scripts/load-test.mjs` + `scripts/stub-llm.mjs` are the load tools.
- Everything the server imports at runtime must be in `dependencies` (the Docker image prunes devDependencies).
