// Lifecycle email templates — the onboarding sequence for new signups.
//
// Each template is a pure function (name, origin) → { subject, text } so the
// copy can be unit-tested and reviewed without a transport in the loop. The
// full sequence, trigger conditions, and operating notes live in
// docs/EMAILS.md — keep that doc in sync when editing copy here.
//
// Conventions (match the verification/reset emails in routes/auth.ts):
//   - plain text only; the EmailSender falls back to text for html
//   - greet by first line "Hi <name>,"
//   - links are bare URLs on their own line
//   - sign-off "— Luka, Foldo"

export interface LifecycleEmailContent {
  subject: string;
  text: string;
}

/**
 * Sent immediately on signup (routes/auth.ts, alongside the verification
 * email). What Foldo does, the three steps to a first walkthrough, the live
 * demo board, and reply-to-this-email support.
 */
export function welcomeEmail(
  name: string,
  origin: string,
): LifecycleEmailContent {
  return {
    subject: 'Welcome to Foldo — your first walkthrough is 3 steps away',
    text:
      `Hi ${name},\n\n` +
      `Thanks for signing up. Foldo turns every merged PR into a narrated ` +
      `video walkthrough of your product, rendered onto a shared board — so ` +
      `the people who never read pull requests can see what actually ` +
      `changed. Comments on the board can be dispatched straight back to ` +
      `your coding agent as change requests.\n\n` +
      `Three steps to your first walkthrough:\n\n` +
      `1. Install the Foldo GitHub App on the repo you want documented.\n` +
      `2. Point a board at your preview URL — any deployed or staging URL works.\n` +
      `3. Create a walkthrough and hit Render. Or just merge a PR and we'll\n` +
      `   render one for you.\n\n` +
      `Want to see the end result first? Here's a live demo board:\n\n` +
      `${origin}/s/demo\n\n` +
      `Stuck on anything at all? Reply to this email — it comes straight to me.\n\n` +
      `— Luka, Foldo\n`,
  };
}

/**
 * Day 2, only if the user has NOT rendered a walkthrough yet (no
 * `first_walkthrough` funnel event). One concrete unblocking tip + an offer
 * to set it up together on a call.
 */
export function day2NoWalkthroughEmail(
  name: string,
  origin: string,
): LifecycleEmailContent {
  return {
    subject: 'Stuck on the preview URL? Most people are',
    text:
      `Hi ${name},\n\n` +
      `You signed up for Foldo a couple of days ago but haven't rendered a ` +
      `walkthrough yet. In my experience there's one step where almost ` +
      `everyone stalls, so here's the tip:\n\n` +
      `The preview URL doesn't need to be anything special. Any deployed or ` +
      `staging URL works — a Vercel or Netlify preview, a Railway service, ` +
      `even a tunnel to localhost. Foldo just needs somewhere it can load ` +
      `your product in a browser.\n\n` +
      `Behind a login wall? Add the login steps to the board's auth recipe ` +
      `and Foldo signs in before it starts filming.\n\n` +
      `And if you'd rather not fight it alone: I'll set it up with you on a ` +
      `15-minute call. Reply to this email with a couple of times that work ` +
      `for you.\n\n` +
      `The demo board is here if you want to see what you're aiming for:\n\n` +
      `${origin}/s/demo\n\n` +
      `— Luka, Foldo\n`,
  };
}

/**
 * Day 5, only if the user HAS rendered a walkthrough (`first_walkthrough`
 * funnel event exists). The payoff habit: share the board with a stakeholder
 * who never reads PRs; comments become agent dispatches.
 */
export function day5WalkthroughMadeEmail(
  name: string,
  _origin: string,
): LifecycleEmailContent {
  return {
    subject: 'Send your board to someone who never reads PRs',
    text:
      `Hi ${name},\n\n` +
      `You've rendered your first walkthrough — nice. Here's the habit that ` +
      `makes Foldo actually pay for itself:\n\n` +
      `Share your board link with one stakeholder who never reads pull ` +
      `requests — a founder, a designer, a customer-facing teammate. They ` +
      `watch the walkthrough, see exactly what shipped, and leave comments ` +
      `right on the video. No repo access, no diff-reading, no standing ` +
      `meeting.\n\n` +
      `Those comments aren't just notes. Any comment can be dispatched to ` +
      `your coding agent as a change request — so "this button should be ` +
      `blue" turns into a PR, and the next merge re-renders the walkthrough ` +
      `with the fix in it.\n\n` +
      `The share link is in the board's top bar.\n\n` +
      `— Luka, Foldo\n`,
  };
}

/**
 * Day 11, only if subscriptions.status = 'trialing'. Trial ends in 3 days,
 * the price, one-click keep link, honest ask for why-not.
 */
export function day11TrialEndingEmail(
  name: string,
  origin: string,
): LifecycleEmailContent {
  return {
    subject: 'Your Foldo trial ends in 3 days',
    text:
      `Hi ${name},\n\n` +
      `A heads-up rather than a hard sell: your 14-day Foldo trial ends in ` +
      `3 days.\n\n` +
      `After that it's £79/month per product. Your walkthroughs keep ` +
      `re-rendering on every merged PR, and your boards stay live for ` +
      `everyone you've shared them with.\n\n` +
      `Keep it in one click:\n\n` +
      `${origin}/pricing\n\n` +
      `And honestly — if Foldo didn't stick for you, I'd like to know why. ` +
      `Reply and tell me what was missing or confusing. I read every one of ` +
      `these.\n\n` +
      `— Luka, Foldo\n`,
  };
}

/**
 * Day 14+, only if the trial lapsed without conversion (status is no longer
 * 'trialing' and never became 'active'). Data kept 30 days; one question.
 */
export function day14TrialEndedEmail(
  name: string,
  origin: string,
): LifecycleEmailContent {
  return {
    subject: 'Your Foldo trial has ended',
    text:
      `Hi ${name},\n\n` +
      `Your Foldo trial ended without a subscription — sorry to see you go.\n\n` +
      `Your boards and walkthroughs are kept for 30 days, so if you change ` +
      `your mind you can pick up exactly where you left off:\n\n` +
      `${origin}/pricing\n\n` +
      `One question before you go: what was missing? A feature, a rough ` +
      `edge, the price — whatever it was, reply and tell me. It genuinely ` +
      `shapes what we build next.\n\n` +
      `— Luka, Foldo\n`,
  };
}
