# Demo walkthroughs

Five flows that prove what Foldo is for. Boot the stack first:

```bash
npm install
npm run dev
# Optional, for real MCP-routed dispatches:
npm run dev:mcp
```

Open http://localhost:5173.

## 1. The headline edit loop

The 30-second pitch:

1. Scroll to the **`feat/cta-revamp`** row (middle).
2. Click the **orange Anna pin** on the dark CTA button.
3. In the popover, click **"Make this an edit"**.
4. The right-side EditPanel opens with:
   - branch `feat/cta-revamp`
   - commit `4f81b62`
   - file `src/components/Pricing.tsx:48`
   - element `<button class="cta-primary">`
   - the recipe (zero steps for default state)
   - the current source snippet
   - Anna's text pre-filled as intent
   - a live prompt preview at the bottom
5. Click **"Send to Claude Code"**.
6. Status flips `queued → sending → running`. The run log streams:
   - reading target…
   - inferring overrides from intent…
   - matched cta-primary heuristic — extending trial copy and subtext
   - committing as `<sha>`…
   - pushed (simulated)
7. A new frame slides in to the right of the cta-revamp PRD with a curved connector line back to the parent. The CTA now reads **"Start your 14-day free trial"** with **"No credit card. Cancel anytime."** below it. The branch's head SHA is updated.
8. Camera auto-pans to the new frame.

## 2. Pro tier tone-down

1. Scroll to the **`feat/pro-tier-highlight`** row (bottom).
2. Click **Mateo's blue pin** on the Pro tier card.
3. **Make this an edit** → **Send to Claude Code**.
4. New frame: same content but the Pro card's loud purple/pink gradient is replaced by a calm lavender treatment, the "Most popular" badge becomes outline-only, and the CTA button switches to outline.

## 3. Multiplayer (two browsers)

1. Open http://localhost:5173 in **Window A** (default user is "You").
2. Top-right user switcher → **"Demo as"** → pick **"Anna Cole"** → window reloads.
3. Open http://localhost:5173 in **Window B**.
4. User switcher → pick **"Mateo Rivas"**.
5. Both windows now show **two avatars** in the top bar with online dots.
6. Move your cursor in one window — see a **smoothly-interpolated cursor** in the other.
7. Click an element in Window A — Window B sees a **dashed orange outline** around the same element (selection ghost).
8. Hover Anna's avatar in B → click **"follow"** → B's viewport now mirrors A's pan/zoom.

## 4. Capture from URL

Without the extension:

1. Top-right **Capture from URL** → enter `https://stripe.com/pricing` (or any URL).
2. **Freeze this** → watch the simulated pipeline (`connecting → injecting → recording → freezing`).
3. A new frame lands in a fresh `captures` row at the top of the canvas, with an orange "captured" tag in its FrameMeta.

With the real extension (after `npm run build:extension` and Load Unpacked):

1. Browse to any deployed URL.
2. Click the Foldo dachshund icon → **Freeze this state**.
3. Same flow, but with a real DOM snapshot + screenshot uploaded.

## 5. Markdown frame → edit a PRD line

1. Navigate to the **`feat/cta-revamp`** row.
2. Click **Anna's pin** on the PRD frame (the warm off-white one). It's anchored to the first acceptance criterion.
3. **Make this an edit** → intent box prefilled.
4. **Send** → a new markdown frame appears with an `## Update (from canvas)` section appended.

---

## URL deep linking

Every focus updates the URL:

- `/` — landing
- `/board/board-acme-landing` — canvas at fit-to-view
- `/board/board-acme-landing/frame/f-cta-app` — focused on the CTA-revamp frame
- `/board/board-acme-landing/frame/f-cta-app/comment/c-cta-1` — focused + popover open

Share any of these — they survive a hard refresh.

## Offline mode

Stop the server (`Ctrl+C` on the `dev` task), refresh the canvas → "Cloud unreachable" overlay → **Use offline demo** → the full canvas hydrates from local mock data. All flows work, including dispatch simulation, but nothing persists.
