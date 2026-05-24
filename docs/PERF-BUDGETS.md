# Performance budgets

This doc captures the size budgets we gate on in CI. Today there's one:
the JS bundle for `@foldo/web`. The script lives at
[`scripts/check-bundle-size.mjs`](../scripts/check-bundle-size.mjs); the
CI job is `bundle-size` in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## Why a budget?

A budget is a smoke alarm, not a fire department. We don't expect it to
fire on day-to-day feature work — current totals sit at roughly **27%** of
the budget — but when the size jumps by hundreds of KB in a single PR
(usually a heavyweight dep, an un-tree-shaken icon library, or an
accidentally-imported test fixture), we want the alarm in the PR diff
rather than in a user's tab-open time three weeks later.

## The current budget

| Bound        | Threshold |
| ------------ | --------- |
| Raw JS total | **2 MB**  |
| Gzipped JS total | **600 KB** |

The script sums every `.js` file under `apps/web/dist/assets/` (Vite's
default output dir). Non-JS assets (CSS, fonts, images) are tracked but
not gated. CSS sits at ~28 KB raw / ~6 KB gzipped today and is unlikely
to balloon.

## Today's bundle (build of `aplus-w2-helpers-errors-images`)

```
App-DHFZRGBn.js                              156.5 KB  gz:   43.4 KB
react-vendor-Ddy7v_zN.js                     137.6 KB  gz:   44.2 KB
MarketingRouter-DM4ODiVw.js                   80.1 KB  gz:   22.4 KB
index-C_oxBBDx.js                             31.9 KB  gz:   10.9 KB
HomeApp-CpLwrmpX.js                           29.0 KB  gz:    9.0 KB
SettingsApp-CQckO6hs.js                       25.2 KB  gz:    6.9 KB
TestRunner-vXnbuqLx.js                        19.2 KB  gz:    6.5 KB
shared-BC8cB-1P.js                            15.7 KB  gz:    4.6 KB
ShareViewer-B5IAc-iI.js                        7.5 KB  gz:    2.7 KB
CaptureViewer-Cl_h-7Xn.js                      5.8 KB  gz:    2.4 KB
icons-DDosNMYt.js                              5.2 KB  gz:    1.5 KB
tests-_YL7h_ZI.js                              1.6 KB  gz:    0.6 KB
CookieBanner-HD_XaSJZ.js                       1.5 KB  gz:    0.9 KB
auth-XvyonQUZ.js                               1.0 KB  gz:    0.4 KB
protocol-Dn2WJN_5.js                           0.0 KB  gz:    0.1 KB
──────────────────────────────────────────────────────────────────────
TOTAL                                        517.8 KB  gz:  156.6 KB
BUDGET                                      1953.1 KB  gz:  585.9 KB
```

So we're at roughly **27% raw, 27% gzipped** of the budget. The two
biggest chunks are predictable:

- `App-*.js` (~156 KB raw): the canvas app — Fastify wire types, board
  routing, the multi-frame view, comments, dispatches.
- `react-vendor-*.js` (~138 KB raw): React + ReactDOM. Pinned via Vite's
  `manualChunks` so cache hits survive a hot fix.
- `MarketingRouter-*.js` (~80 KB raw): the public landing / pricing /
  signup pages. Lazy-loaded; not in the canvas path.

The remaining 14 chunks are all under 35 KB raw — code-splitting is
working as intended (Home, Settings, Test runner, Share viewer all
load on demand).

## How to update the budget

A bundle size increase is fine if it's deliberate. Two cases:

1. **Feature add that genuinely needs the bytes** (e.g. a Monaco editor
   slot, a charting lib for a new dashboard). Update the constants in
   `scripts/check-bundle-size.mjs`:

   ```js
   const BUDGET_RAW_BYTES  = 2_000_000;  // ← bump
   const BUDGET_GZIP_BYTES = 600_000;    // ← bump
   ```

   In the PR description, explain *why* — "Monaco adds 280 KB raw, we'll
   bring it back down by code-splitting in W3" is fine; "make CI green"
   is not.

2. **Accidental regression.** Run `node scripts/check-bundle-size.mjs`
   locally after `npm --workspace @foldo/web run build`, find the chunk
   that grew, and either tree-shake/code-split your way back under the
   threshold or roll back the change. The script prints the per-chunk
   sizes sorted by raw bytes — the offender is always at the top.

## Why these numbers?

- **Raw 2 MB** is the rough size of "noticeable on a fresh 3G load."
  Lighthouse flags raw JS over ~1 MB as a hazard; we'd rather catch
  doublings, not nudges.
- **Gzipped 600 KB** is what the wire actually carries; it's the number
  that matters for cold-cache TTI. 600 KB gives us roughly 4× headroom
  over today's 157 KB — wide enough to absorb a single deliberate
  feature without a budget rev, narrow enough that a `npm install
  some-mega-dep` lights up.

When we get serious about performance (W3 or beyond) we'll tighten this
to ~1.5× of current, set per-chunk budgets, and gate on Brotli rather
than gzip. For now, one global gate is enough to keep the alarm useful
without becoming the kind of CI step engineers learn to mute.

## Related

- Marketing PNGs converted to WebP under `apps/web/public/marketing/`
  via [`scripts/convert-marketing-webp.mjs`](../scripts/convert-marketing-webp.mjs).
  Net image-payload drop: ~8.7 MB → ~230 KB on the marketing pages
  (a ~38× reduction). Fallback PNGs are kept for browsers without
  WebP support and served via `<picture>` in
  `apps/web/src/marketing/shared.tsx`.
