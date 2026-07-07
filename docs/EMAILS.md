# Lifecycle emails

The onboarding email sequence for new signups. Copy lives in code
(`apps/server/src/email/templates.ts`); the sweep that sends the day-N
stages is `apps/server/src/email/lifecycle.ts`; dedup state is the
`lifecycle_emails` table (`user_id`, `kind`, `sent_at`). This doc is the
reviewable source for the copy and the trigger rules — keep it in sync
with `templates.ts` when either changes.

All emails are plain text, sent from the configured `FOLDO_EMAIL_FROM`
address, and signed "— Luka, Foldo". Replies go to the founder inbox —
"reply to this email" is a real support channel, not decoration.

`{origin}` below is `FOLDO_PUBLIC_WEB_ORIGIN`
(default `http://localhost:5173`).

---

## The sequence

### 1. `welcome` — immediately on signup

- **Trigger:** sent inline from the signup handler
  (`apps/server/src/routes/auth.ts`), right after the verification
  email. Non-blocking (`void sendWelcomeEmail(...)`); errors are logged,
  never fail the signup. Recorded in `lifecycle_emails` on success.
- **Audience:** every new `kind = 'human'` signup with an email.

**Subject:** Welcome to Foldo — your first walkthrough is 3 steps away

> Hi {name},
>
> Thanks for signing up. Foldo turns every merged PR into a narrated
> video walkthrough of your product, rendered onto a shared board — so
> the people who never read pull requests can see what actually changed.
> Comments on the board can be dispatched straight back to your coding
> agent as change requests.
>
> Three steps to your first walkthrough:
>
> 1. Install the Foldo GitHub App on the repo you want documented.
> 2. Point a board at your preview URL — any deployed or staging URL works.
> 3. Create a walkthrough and hit Render. Or just merge a PR and we'll
>    render one for you.
>
> Want to see the end result first? Here's a live demo board:
>
> {origin}/s/demo
>
> Stuck on anything at all? Reply to this email — it comes straight to me.
>
> — Luka, Foldo

### 2. `day2_no_walkthrough` — day 2, still no walkthrough

- **Trigger:** account age ≥ 2 days (and < 4 — see the window rule
  below), AND no `first_walkthrough` row in `analytics_events` for this
  user, AND not already sent.
- **Intent:** one concrete unblocking tip (the preview URL is where most
  people stall) + a real offer to set it up together.

**Subject:** Stuck on the preview URL? Most people are

> Hi {name},
>
> You signed up for Foldo a couple of days ago but haven't rendered a
> walkthrough yet. In my experience there's one step where almost
> everyone stalls, so here's the tip:
>
> The preview URL doesn't need to be anything special. Any deployed or
> staging URL works — a Vercel or Netlify preview, a Railway service,
> even a tunnel to localhost. Foldo just needs somewhere it can load
> your product in a browser.
>
> Behind a login wall? Add the login steps to the board's auth recipe
> and Foldo signs in before it starts filming.
>
> And if you'd rather not fight it alone: I'll set it up with you on a
> 15-minute call. Reply to this email with a couple of times that work
> for you.
>
> The demo board is here if you want to see what you're aiming for:
>
> {origin}/s/demo
>
> — Luka, Foldo

### 3. `day5_walkthrough_made` — day 5, walkthrough exists

- **Trigger:** account age ≥ 5 days (< 8), AND a `first_walkthrough`
  row EXISTS in `analytics_events` for this user, AND not already sent.
- **Intent:** the payoff habit — share the board with a stakeholder who
  never reads PRs; comments become agent dispatches.

**Subject:** Send your board to someone who never reads PRs

> Hi {name},
>
> You've rendered your first walkthrough — nice. Here's the habit that
> makes Foldo actually pay for itself:
>
> Share your board link with one stakeholder who never reads pull
> requests — a founder, a designer, a customer-facing teammate. They
> watch the walkthrough, see exactly what shipped, and leave comments
> right on the video. No repo access, no diff-reading, no standing
> meeting.
>
> Those comments aren't just notes. Any comment can be dispatched to
> your coding agent as a change request — so "this button should be
> blue" turns into a PR, and the next merge re-renders the walkthrough
> with the fix in it.
>
> The share link is in the board's top bar.
>
> — Luka, Foldo

### 4. `day11_trial_ending` — day 11, still trialing

- **Trigger:** account age ≥ 11 days (< 13 — the window closes early so
  "ends in 3 days" is never sent after the trial has actually ended),
  AND `subscriptions.status = 'trialing'`, AND not already sent.
- **Intent:** honest heads-up — the date, the price, one-click keep,
  and a genuine ask for why-not.

**Subject:** Your Foldo trial ends in 3 days

> Hi {name},
>
> A heads-up rather than a hard sell: your 14-day Foldo trial ends in
> 3 days.
>
> After that it's £79/month per product. Your walkthroughs keep
> re-rendering on every merged PR, and your boards stay live for
> everyone you've shared them with.
>
> Keep it in one click:
>
> {origin}/pricing
>
> And honestly — if Foldo didn't stick for you, I'd like to know why.
> Reply and tell me what was missing or confusing. I read every one of
> these.
>
> — Luka, Foldo

### 5. `day14_trial_ended` — day 14+, trial lapsed without conversion

- **Trigger:** account age ≥ 14 days (< 17), AND the user has NO
  subscription row with status `'trialing'` or `'active'` (i.e. no row
  at all, or a lapsed/cancelled one), AND not already sent.
- **Intent:** graceful exit — data kept 30 days, door left open, one
  question.

**Subject:** Your Foldo trial has ended

> Hi {name},
>
> Your Foldo trial ended without a subscription — sorry to see you go.
>
> Your boards and walkthroughs are kept for 30 days, so if you change
> your mind you can pick up exactly where you left off:
>
> {origin}/pricing
>
> One question before you go: what was missing? A feature, a rough
> edge, the price — whatever it was, reply and tell me. It genuinely
> shapes what we build next.
>
> — Luka, Foldo

---

## Operating notes

### How the sweep works

- `startLifecycleEmails()` is called once from
  `apps/server/src/index.ts`, next to `startSessionGc()`. It runs one
  sweep immediately at boot (dedup makes this safe) and then hourly via
  `setInterval` (unref'd, so it never keeps the process alive).
- Each sweep, per stage: select `kind = 'human'` users with a non-null
  email whose `users.created_at` falls inside the stage's day window,
  filter by the stage condition (funnel event / subscription status),
  exclude anyone with a `lifecycle_emails` row for that `kind`, then
  send and record.
- **Send-then-record:** the `lifecycle_emails` row is written only
  after a successful send. A failed send is logged and retried on the
  next sweep. The rare inverse failure (sent, but the record write
  died) can double-send once — chosen deliberately over silently
  dropping emails.
- **Day windows, not just thresholds:** every stage has a max age as
  well as a min (2–4, 5–8, 11–13, 14–17 days). This is launch safety —
  deploying the feature does not blast the historical user backlog with
  day-2 emails — and staleness safety (`day11_trial_ending` says "3
  days left", so it must never fire on day 14).
- Errors never propagate: a bad address, a provider outage, or a query
  failure logs (`job: lifecycle-emails`) and the sweep moves on.
- The `welcome` email is not part of the sweep — it's sent inline at
  signup so it lands immediately, but it records the same
  `lifecycle_emails` row (`kind = 'welcome'`).

### Testing with the stub outbox

The default email provider (`FOLDO_EMAIL_PROVIDER=stub`) writes every
send as a JSON file to `.foldo-email-outbox/` (override the directory
with `FOLDO_EMAIL_OUTBOX_DIR`). Lifecycle sends are tagged
`lifecycle-*` in the filename and the `kind` field:

```bash
ls .foldo-email-outbox/ | grep lifecycle
cat .foldo-email-outbox/*-lifecycle-welcome-*.json
```

To exercise a day-N stage without waiting N days, backdate a user and
run a sweep:

```sql
-- make a test user look 2 days old
UPDATE users SET created_at = (now() - interval '2 days 1 hour')::text
 WHERE email = 'you+test@example.com';
```

then either restart the server (the boot-time sweep picks it up) or
call `runLifecycleSweep()` directly from a scratch script / test. To
re-send a stage, delete its dedup row:

```sql
DELETE FROM lifecycle_emails WHERE user_id = 'u-…' AND kind = 'day2_no_walkthrough';
```

For real delivery, set `FOLDO_EMAIL_PROVIDER=resend`, `RESEND_API_KEY`,
and `FOLDO_EMAIL_FROM` (see `apps/server/src/email/index.ts`).
