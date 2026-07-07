import SimplePage from './SimplePage';

export default function DataPolicy() {
  return (
    <SimplePage
      title="Data policy"
      chip="📋 Data policy"
      intro="Plain language, no legalese: what we store, where it lives, how long we keep it, and how to get it out."
    >
      <div data-testid="foldo-data-policy-page">
        <h2>What we store</h2>
        <ul>
          <li>Your account email and profile.</li>
          <li>Board content — frames, comments, walkthrough structure.</li>
          <li>
            Walkthrough artifacts — rendered video, stills, captions, and take
            manifests.
          </li>
          <li>PR metadata and unified diffs of merged PRs.</li>
          <li>
            Funnel events like "first walkthrough rendered" — plain counts so
            we know the product works, not behavioural tracking. There are no
            third-party analytics scripts on any Foldo page.
          </li>
        </ul>

        <h2>Where it lives</h2>
        <p>
          Postgres for structured data and object storage for artifacts, in
          EU/US regions hosted on Railway.
        </p>

        <h2>How long we keep it</h2>
        <p>
          Until you delete it. Deleting a board deletes its content and
          artifacts; deleting your account deletes everything. Deleted data
          persists in backups for up to 30 days, then it's gone from those
          too.
        </p>

        <h2>Your rights</h2>
        <p>
          You can export or delete everything yourself from settings — no
          support ticket needed. Under the hood these are the GDPR endpoints{' '}
          <code>/api/me/export</code> and <code>/api/me/delete</code>.
        </p>

        <h2>Subprocessors</h2>
        <ul>
          <li>
            <strong>Railway</strong> — hosting (application, Postgres, object
            storage).
          </li>
          <li>
            <strong>Stripe</strong> — payments. We never see your card number.
          </li>
          <li>
            <strong>Anthropic</strong> — diff analysis for deciding what to
            re-film. Receives diffs of merged PRs only.
          </li>
          <li>
            <strong>ElevenLabs</strong> — walkthrough narration. Receives the
            narration text only.
          </li>
        </ul>

        <h2>Questions</h2>
        <p>
          What the GitHub App can and cannot read is documented separately at{' '}
          <a href="/security">/security</a>. Anything else, email us — a human
          answers.
        </p>
      </div>
    </SimplePage>
  );
}
