# Security notes

Operational security knobs that aren't obvious from the code itself.

## Browser-extension CORS allowlist

The Foldo browser extension talks to the server's REST API; CORS therefore
has to accept the extension's origin (`chrome-extension://<id>`). Previously
the server accepted any `chrome-extension://` origin, which means any
extension installed on a tester's box could call the API with the user's
session cookie.

Locked-down behaviour (see `apps/server/src/index.ts`):

| `NODE_ENV`  | `FOLDO_EXTENSION_ID` set? | Behaviour |
|-------------|---------------------------|-----------|
| production  | yes                       | only `chrome-extension://${FOLDO_EXTENSION_ID}` is allowed |
| production  | no                        | all extension origins denied; startup warning logged |
| development | yes                       | only the configured id is allowed |
| development | no                        | any `chrome-extension://` is allowed (so unpacked dev builds work without ceremony) |

`FOLDO_EXTENSION_ID` is the Chrome Web Store id (32 lowercase letters).
Set it as a Railway env var before flipping the production switch.

## Email-verification gates

A handful of routes are explicitly gated on email verification because
they let an unverified signup weaponise the platform — sending mail in
our name, minting public links, or creating tester-facing surfaces:

- `POST /api/boards/:id/shares` — minting a public board share link.
- `PATCH /api/tests/:id` when transitioning `status` to `live` — going
  live publishes a `foldo.dev/t/:token` link.
- (existing) Test live transition, demo-request creation, etc.

The check is implemented by `assertEmailVerified` in
`apps/server/src/auth.ts`; agents and demo accounts are exempt.

## Rate limits

Per-IP limits (in `apps/server/src/rateLimit.ts`):

- `auth-login`, `auth-signup`, `auth-pw-reset-req`: 5 per minute
- `auth-pw-reset-cmp`: **5 per 15 minutes** (matches login; the previous
  10/min would have let a bot try ~150 reset tokens before tripping)
- `auth-verify`: 20 per minute
- `auth-verify-resend`: 3 per minute
- `me-export` / `me-delete`: 5 / 3 per minute

Per-USER mutation limits (new in A+ W1):

- `POST /api/frames`: 100 per minute per user
- `POST /api/comments`: 500 per hour per user

The per-user limits are keyed on `req.user.id` so a single user behind a
corporate NAT can't be DoS'd by a noisy sibling tab, and conversely a
stolen session can't dodge a per-IP cap by hopping IPs.

## GDPR delete

`POST /api/me/delete` (in `apps/server/src/routes/me.ts`):

1. password-gated
2. anonymises every comment authored by the user → `u-deleted` sentinel
3. anonymises every nested reply on other people's comments authored by
   the user → same sentinel identity (new — previously the reply
   identity stuck around in `comments.replies_json`)
4. reassigns test ownership to the sentinel
5. soft-deletes the user row (email → NULL, password_hash → NULL,
   email_hash retained for fraud audits)
6. drops every session

The reply walk is a single SQL UPDATE using `jsonb_array_elements` /
`jsonb_set`; on big boards it touches only rows that contain a matching
reply (`replies_json @? jsonpath` is index-friendly).
