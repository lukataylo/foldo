import SimplePage from './SimplePage';

export default function Privacy() {
  return (
    <SimplePage
      title="Privacy"
      chip="🔒 Privacy"
      intro="Plain-English summary of what we store, why, and how to get rid of it. Detailed list below."
    >
      <h2>What we store</h2>
      <ul>
        <li><strong>Account:</strong> your name, email, password hash, brand colour.</li>
        <li><strong>Boards:</strong> repo slug, dev URL you connected, frames, comments, dispatches.</li>
        <li><strong>Sessions:</strong> a random session token per device with last-seen timestamp + the User-Agent string your browser sends.</li>
        <li><strong>Logs:</strong> request logs for ~14 days, sanitised of any bearer tokens.</li>
      </ul>

      <h2>What we don't store</h2>
      <ul>
        <li>Source code from your repo. We see commit metadata in webhooks; the diffs stay on GitHub.</li>
        <li>Cookies for ads. Foldo has no advertising and no third-party trackers.</li>
        <li>Anything you typed but didn't send (drafts live in your browser only).</li>
      </ul>

      <h2>Where it lives</h2>
      <p>
        Foldo's hosted version runs on <a href="https://railway.com" target="_blank" rel="noreferrer">Railway</a> with a managed Postgres database. Region is auto-allocated; you can request EU-only by emailing us before signup.
      </p>

      <h2>Deleting your account</h2>
      <p>
        From <a href="/settings">settings → password</a>, click <em>"delete account"</em> (or write to <a href="mailto:hi@foldo.dev">hi@foldo.dev</a>). We hard-delete within 7 days. Boards you owned are deleted; comments you left on others' boards are anonymised.
      </p>

      <h2>Self-host</h2>
      <p>
        None of the above applies if you run Foldo on your own infra. Clone the repo and you own the data. See <a href="/docs/self-host">/docs/self-host</a>.
      </p>

      <h2>Contact</h2>
      <p>
        Privacy questions: <a href="mailto:hi@foldo.dev">hi@foldo.dev</a>.
      </p>
    </SimplePage>
  );
}
