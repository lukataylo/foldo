# Protocol Design Ideas (Deferred)

This file collects design ideas for `@foldo/protocol` that we considered,
sketched, but chose **not** to ship in v1. Each section explains the idea,
the prototype we tried, and the reason we deferred it. Keep this file in
sync with the "Phase 2 follow-ups" list in [ROADMAP-AAA.md](./ROADMAP-AAA.md).

These are intentionally kept out of production source files so a reader of
`packages/protocol/src/*.ts` sees only the shipped wire format — not 20
lines of commented-out aspirational code per file.

---

## 1. Branded ID phantom types

### The idea

Every Foldo entity has an opaque string id: `BoardId`, `FrameId`,
`CommentId`, `DispatchId`, `UserId`, `BranchId`, `CommitSha`. Today these
are all `type X = string` — so the type system happily lets you write
`getFrameById(commentId)` and the bug only surfaces at runtime when the
lookup misses.

A **branded** (a.k.a. **phantom-typed**) version stamps each id with a
unique compile-time tag so the compiler rejects cross-type assignments
without changing the runtime representation. The shape we sketched:

```ts
declare const __idBrand: unique symbol;
export type Brand<Base, Tag extends string> = Base & {
  readonly [__idBrand]: Tag;
};

export type BoardId = Brand<string, 'BoardId'>;
export type FrameId = Brand<string, 'FrameId'>;
export type CommentId = Brand<string, 'CommentId'>;
// …etc

export const asBoardId = (s: string): BoardId => s as BoardId;
export const asFrameId = (s: string): FrameId => s as FrameId;
// …etc
```

`asBoardId(...)` is a zero-cost cast helper — the only place we trust a
raw string-to-branded-id conversion is at the boundary (URL params, DB
row mapping, JSON request bodies). Internal code that flows ids around
never touches `as` again.

### Why deferred

The first prototype run produced **~280 cast points across the tree** —
every URL param read, every DB row mapped to a domain object, every
JSON request body, every WS message field, plus every place a frontend
component pulled an id out of a Map key or a route param.

Each cast is mechanical — `id` → `asBoardId(id)` at the boundary — but
the patch is large enough that it conflicts with every concurrently-open
feature branch. We didn't have a window where the tree was quiet enough
to land it without rebase pain.

The bug it prevents (passing a comment id where a frame id is expected)
hasn't actually bitten us in v1, because most of our id-passing flows
through a single hand of code (REST handler → repo function → DB query)
and the runtime "row not found" surfaces fast in tests. The cost/benefit
flips once a second or third agent starts writing routes in parallel and
the type system needs to do the noticing for us.

### How to land it (when we do)

1. Add the `Brand<>` machinery + `asXxxId` helpers to
   `packages/protocol/src/domain.ts` (or a sibling `ids.ts`).
2. Switch each `export type XxxId = string` to
   `export type XxxId = Brand<string, 'XxxId'>` one at a time — each
   batch is a self-contained PR. Start with `BoardId` (fewest sites)
   and work outward.
3. At every boundary point, wrap the raw string in `asXxxId(...)`:
   - `req.params.id` in route handlers
   - DB row mapping in `apps/server/src/repo/*`
   - JSON body field reads (anywhere we do `body.boardId as string`)
   - WS message field reads
   - URL search-param reads in `apps/web`
4. Internal code keeps flowing branded ids; the compiler does the work.
5. Per-batch budget: ~1 day of fix-up per branded id type once the
   tree is quiet.

### Related

- ROADMAP-AAA.md "Phase 2 follow-ups" — "Branded ID types" line item.
- The audit count of 277 cast points is from the first prototype branch
  that's since been deleted; expect a similar order of magnitude.

---

## 2. Zod for REST + WS validation

### The idea

Today every REST route in `apps/server/src/routes/*` does manual
validation: `if (!body.title) return reply.code(400).send(...)`. Same
pattern in WS handlers in `apps/server/src/ws/*`. The shape works but
has documented gaps (the API audit caught fields that pass through
without ever being validated), and the error responses are inconsistent
across routes — some return `{ error: 'missing title' }`, some return
`{ message: 'Bad Request', field: 'title' }`, some return plain text.

A **Zod schema** per route gives us:
- One declarative description of the body shape, used both for the
  runtime check and as the source for compile-time types
- Per-field error responses in a single shape across every route
- A free OpenAPI/JSON-schema export if we ever want one
- Removes the duplicated "validate then narrow" boilerplate that
  several routes carry today

### Why deferred

The Zod migration touches every route and every WS handler. Same
problem as branded IDs — it's not hard, but it's a wide patch and the
tree was never quiet enough to land it without rebase pain. The
existing manual checks are good enough for v1 because most production
clients are first-party (our own web canvas, our own MCP, our own
extension); the validation surface that matters is the one a malicious
external client would hit, and that's a much smaller subset we can
audit by hand.

### How to land it (when we do)

1. Add `zod` to `packages/protocol`. Export per-message schemas alongside
   the existing TS types (or generate the TS types from the schemas).
2. Add a small Fastify plugin that takes a Zod schema and produces the
   `preHandler` validator + the consistent error response shape.
3. Migrate one route family at a time: `routes/auth.ts` is a good
   candidate to start (small surface, security-sensitive, easy to test).
4. Delete the manual `if (!body.x)` checks as schemas replace them.

### Related

- ROADMAP-AAA.md "Phase 2 follow-ups" — "Zod for REST + WS validation"
  line item.

---

## 3. schema_migrations table + split inline schema

### The idea

Today `apps/server/src/db.ts` carries an inline `SCHEMA` string + a
collection of idempotent `DO $$` (well, `CREATE TABLE IF NOT EXISTS` +
ad-hoc `ALTER TABLE`) blocks. There's no migration history table — the
database state is whatever the union of those blocks produces.

A proper `schema_migrations` table (one row per migration filename,
with `applied_at`) lets us:
- Roll back a migration cleanly
- Coordinate parallel migration writes from multiple devs without
  manual merge of `db.ts`
- See at a glance which migrations have run against a given DB

### Why deferred

The inline-`SCHEMA` + idempotent-blocks pattern works fine for a
single-dev linear-migrations workflow, which is what we have. Pick
this up when we need to roll back a migration or when two devs need
to write migrations concurrently and the merge of `db.ts` starts
getting ugly.

### Related

- ROADMAP-AAA.md "Phase 2 follow-ups" — "schema_migrations table" line
  item.
