<h1 align="center">Foldo</h1>

<p align="center">
  <strong>Documentation that updates itself when your agents ship.</strong><br/>
  Every merged PR re-films a narrated video walkthrough of your product —
  on a board anyone can watch, with nothing to install beyond a GitHub App.
</p>

<p align="center">
  <a href="#quick-start">Quick start</a>
  · <a href="#how-it-works">How it works</a>
  · <a href="CLAUDE.md">Engineering onboarding</a>
  · <a href="SALES.md">Sales</a>
  · <a href="docs/DEPLOYMENT.md">Deploy</a>
</p>

---

## Why

Teams whose coding agents merge PRs weekly have a documentation problem
nobody owns: the PMs, designers and founders who decide what to build next
can't watch the product change, because the only record of change is a
stream of agent-written diffs they'll never read. Hand-recorded videos
(Loom) rot by the next merge. Hand-authored demos (Arcade) need a human in
the loop.

Foldo makes the walkthrough a **maintained artifact**. Point it at a repo
and a deployed preview URL; on every merged PR the **director**:

1. reads the diff and decides which walkthrough steps it touched
   (Claude, with a deterministic heuristic fallback),
2. re-films **only those steps** with grounded Playwright capture
   (visible-text locators, never CSS selectors),
3. narrates them (ElevenLabs, hash-cached) and re-assembles the video —
   unchanged segments are reused **byte-for-byte**, provably (sha256 in
   the take manifest),
4. lands the new take on the board **beside its predecessor**, with a
   plain-language "what changed" list.

Stakeholders watch what changed. A comment pinned on a walkthrough frame
can be dispatched straight back to the coding agent ("Make this an edit"),
closing the loop.

**Reliability beats features**: capture that hits an auth wall, a feature
flag, or a flaky selector degrades — per-step stills + captions, amber
badge, retry button — it never dies silently. The degradation ladder is
tested in CI.

£79/month per product · 14-day free trial · live demo board at `/s/demo`,
no signup.

## Quick start

```bash
npm install
# Postgres required:
export DATABASE_URL=postgres://user:pass@localhost:5432/foldo
npm run dev   # web :5173 · api :4000 · sample app :5174
```

Open http://localhost:5173/board/board-acme-landing (seeded demo board),
hit **Docs → Render now** on the `Acme pricing tour` walkthrough, and
watch a walkthrough frame land on the board: queued → capturing →
rendering → ready. `ffmpeg` on PATH gives you video; without it the take
degrades to stills + captions by design.

Simulate the real trigger — a merged PR:

```bash
curl -X POST localhost:4000/api/webhooks/github \
  -H 'Content-Type: application/json' -H 'X-GitHub-Event: pull_request' \
  -d '{"action":"closed","number":42,"repository":{"full_name":"acme/landing"},
       "pull_request":{"number":42,"title":"pricing: refresh hero","merged":true,
       "base":{"ref":"main"},"head":{"ref":"feat/x","sha":"cafe42"}}}'
```

Render the marketing demo with the product itself:
`node scripts/render-foldo-demo.mjs` (films Foldo's own landing, demo
board and pricing pages through the real pipeline).

## How it works

```
GitHub App (PR merged) ─► /api/webhooks/github ─► director
                                                   ├ verdict   diff → which steps changed
Board (React, :5173) ◄─ WS ─ Fastify API (:4000)   ├ capture   grounded Playwright, per-step
   frames · comments          Postgres             ├ narrate   ElevenLabs, hash-cached
   dispatch loop              Storage (S3/disk)    └ assemble  ffmpeg, byte-identical reuse
        │                                                        │
        └── "Make this an edit" ─► dispatch ─► MCP ─► coding agent┘
```

- **`apps/server/src/director/`** — the engine (ported from
  [Foley](https://github.com/lukataylo/foley), Python → TS).
- **`apps/web`** — the board viewer + marketing site. Three surfaces
  only: viewer, comments, dispatch.
- **`apps/mcp`** — the MCP server coding agents connect through.
- **`packages/protocol`** — every wire type, single source of truth.

The full path — merged PR → rendered walkthrough → byte-identical
re-render → comment → agent dispatch — is covered by
`e2e/walkthrough/merge-to-walkthrough.spec.ts` and runs in CI with real
chromium + ffmpeg.

## Configuration

| Env | Purpose |
|---|---|
| `DATABASE_URL` | Postgres (required) |
| `ANTHROPIC_API_KEY` | LLM step verdicts (falls back to a deterministic heuristic) |
| `ELEVENLABS_API_KEY` | Narration (falls back to silent + captions) |
| `FOLDO_GITHUB_TOKEN` | PR diffs for private repos |
| `FOLDO_GITHUB_WEBHOOK_SECRET` | HMAC verification on the webhook |
| `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` / `STRIPE_WEBHOOK_SECRET` | Billing |
| `FOLDO_S3_BUCKET` | Object storage (falls back to local disk) |

What the GitHub App can and cannot read: the `/security` page.
Plain-language data policy: the `/data-policy` page.

## License

[MIT](LICENSE) — see the LICENSE file.
