# Foldo art (Paper)

Paper-craft photos of FOLDO the origami dachshund, copied from the approved mockups (scratchpad `SP/blobs/`, ids in
`SP/blobmap.py`). Where the spec has a v2 (hero band, signup panel, booting cutout, delete banner) only the latest is here.

Rules (SPEC "Image rules", Illustration board): images are content, big where they tell the story, once per screen, with a
descriptive `alt`. `object-fit: cover`, radius 12-16, 1px Rule border on Paper (none on yellow images). On tinted or white
surfaces use the `*-cut.webp` cutouts with no frame. Wide yellow bands: set the section background to the image's field
colour so edges stay seamless (`hero-band.webp`: `background: #FDB914 url(...) no-repeat right bottom / auto 100%`).

The mark is `/foldo-mark.svg` (same geometry as the mockups' mark; favicons are made from it).

| File | Format | Shows | Boards |
|---|---|---|---|
| `booting-cut.webp` | transparent cutout (v2, fades on cut edges) | booting for tinted surfaces | Build-Booting, Illustration |
| `booting.webp` | 1:1 | turning the crank of a gear machine | Illustration |
| `build-error-cut.webp` | transparent cutout 720x498 | build-error for tinted surfaces | Build-Error, Illustration |
| `build-error.webp` | 1:1 | hard hat, wrench, toppled blocks | Illustration |
| `closing.webp` | 3:2 | sprinting for the finish tape, stopwatch | Illustration, Landing-Mobile, Landing |
| `cut-off.webp` | 1:1 | carrying the next track piece | Build-Limits, Illustration |
| `delete-confirm.webp` | 1:1 | holding a sheet over a bin | Illustration |
| `delete-wide.webp` | 23:10 1380x600 | delete dialog banner | Projects-Empty |
| `empty-404.webp` | 1:1 | lost on a map, question mark | Illustration, NotFound |
| `empty-gallery.webp` | 1:1 | poses on an empty museum pedestal | Illustration |
| `empty-preview.webp` | 1:1 | waits at a blank cinema screen | Illustration |
| `empty-projects.webp` | 1:1 | peeks out of an empty folder | Components, Illustration, Projects-Empty |
| `gallery-winner.webp` | 1:1 | rosette and trophy (most liked) | Gallery, Illustration |
| `hero-band.webp` | 1300x900 (v2), field #FDB914 | full-bleed yellow hero, art bottom-right | Home-FirstRun, Landing |
| `hero-mobile.webp` | 3:2 1536x1024, field #FDB914 | mobile hero art | Landing-Mobile |
| `hero.webp` | 3:2 1536x1024 | types on a laptop, an app pops up | Illustration, Main |
| `invite-invalid-panel.webp` | tall paper panel 1100x1500, field #FEFCF6 | auth split panel | Signin-Error |
| `invite-invalid.webp` | 1:1 | deerstalker, blank ticket | Illustration |
| `offline.webp` | 1:1 | cup-and-string phone | Illustration, Offline |
| `paused.webp` | 3:2 yellow | asleep under a yellow blanket | Admin, Build-Paused, Illustration |
| `quota-empty.webp` | 1:1 | licked-clean bowl (messages used up) | Build-Limits, Illustration |
| `remix.webp` | 3:2 paper | two paper-phone copies holding hands | Illustration, Shared-Remix |
| `server-error.webp` | 1:1 | tangled in yellow tape (500) | Illustration, ServerError |
| `share-create-wide.webp` | 13:5 1560x600 yellow | share-create, wide dialog banner | Share-Create |
| `share-create.webp` | 3:2 yellow | sealing a blank envelope | Illustration |
| `share-live-wide.webp` | 13:5 1560x600, field #FDCF3D | share-live, wide dialog banner | Share-Live |
| `share-live.webp` | 3:2 yellow | mail carrier, paper planes | Illustration |
| `signup-panel.webp` | 1100x1500 (v2), field #FDB10B | auth split yellow panel | Signup |
| `signup.webp` | 4:5 yellow | lanyard, holds out a badge | Illustration |
| `signups-closed-panel.webp` | tall paper panel 1100x1500, field #FDFBF5 | auth split panel | Signups-Closed |
| `signups-closed.webp` | 1:1 | doorman, velvet rope | Illustration |
| `step-build.webp` | 1:1 | hard hat, nudging blocks into a browser window | Illustration, Landing-Mobile, Landing |
| `step-describe.webp` | 1:1 | barks an idea into a speech bubble | Illustration, Landing-Mobile, Landing |
| `step-share.webp` | 1:1 | paper plane balanced on nose | Illustration, Landing-Mobile, Landing |
| `stop-sharing-cut.webp` | transparent cutout | stop-sharing for tinted surfaces | Illustration, Share-Stop |
| `stop-sharing.webp` | 1:1 | pulling the shutter down on a stall | Illustration |
| `track-access.webp` | 4:3 | unlocking the bank with a key | Home-FirstRun, Home, Illustration, Landing-Mobile, Landing |
| `track-fraud.webp` | 4:3 | detective with magnifier | Home-FirstRun, Home, Illustration, Landing-Mobile, Landing, Shared-Viewer |
| `track-payments.webp` | 4:3 | shopkeeper with coin | Build-Template, Components, Home-FirstRun, Home, Illustration, Landing-Mobile, Landing |
| `welcome.webp` | 3:2 yellow | party hat, gift box (first run) | Illustration |

Older art still here until the area teams finish (delete what nothing references afterwards): `hero-finance.webp`,
`not-found.webp`, `sleepy.webp`, `trophy.webp`, `icon-*.webp`. `tpl-*.webp/svg` are template-pack icons
(`lib/templates/client.ts`), not part of this set.
