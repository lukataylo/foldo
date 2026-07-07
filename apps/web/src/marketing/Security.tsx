import SimplePage from './SimplePage';

export default function Security() {
  return (
    <SimplePage
      title="What the GitHub App can and cannot read"
      chip="🔒 Security"
      intro="Foldo documents your product without touching your source code. Here is exactly what the GitHub App sees, what it can never see, and where everything else lives."
    >
      <div data-testid="foldo-security-page">
        <h2>What the GitHub App CAN read</h2>
        <ul>
          <li>
            <strong>Pull request metadata</strong> — title, body, number, and
            merge state.
          </li>
          <li>
            <strong>Unified diffs of merged PRs</strong> — the patch text of
            what changed, used to decide which walkthrough steps to re-film.
          </li>
          <li>
            <strong>Webhook pings</strong> — the merge events that tell the
            director a new walkthrough is due.
          </li>
        </ul>

        <h2>What it CANNOT do</h2>
        <ul>
          <li>
            <strong>Clone your repository.</strong> The app has no contents
            access beyond the diff of a merged PR.
          </li>
          <li>
            <strong>Read your full source tree.</strong> It never sees files
            the diff didn't touch.
          </li>
          <li>
            <strong>Write to your repo.</strong> No commits, no branches, no
            comments — read-only, always.
          </li>
          <li>
            <strong>See other repos.</strong> The installation is scoped to
            exactly the repositories you pick.
          </li>
        </ul>

        <h2>Where walkthroughs come from</h2>
        <p>
          Walkthrough capture films your <strong>deployed</strong> app at the
          preview URL you provide — not your code. If the app sits behind an
          auth wall, you supply credentials for filming; they're stored
          encrypted at rest and used only by the capture pipeline.
        </p>

        <h2>Where artifacts live</h2>
        <p>
          Rendered video, stills, and captions are stored in our object
          storage. They belong to your board: delete the board and the
          artifacts are deleted with it.
        </p>

        <h2>Webhooks</h2>
        <p>
          Every webhook from GitHub is HMAC-verified against the installation
          secret before we act on it. Unsigned or mismatched payloads are
          dropped.
        </p>

        <h2>Deleting your data</h2>
        <p>
          Deleting a board deletes its walkthroughs, takes, artifacts, and the
          stored PR metadata and diffs that produced them. For the full
          picture of what we store and for how long, see the{' '}
          <a href="/data-policy">data policy</a>.
        </p>
      </div>
    </SimplePage>
  );
}
