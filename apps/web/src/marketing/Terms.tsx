import SimplePage from './SimplePage';

export default function Terms() {
  return (
    <SimplePage
      title="Terms of service"
      chip="📜 Terms"
      intro="Foldo is open source and MIT-licensed. These terms cover the hosted version at foldo.dev. They're short on purpose."
    >
      <h2>The deal</h2>
      <p>
        You use Foldo to review code with your team. We host the canvas and
        store your boards, comments, and dispatches. Don't break things.
      </p>

      <h2>Your data</h2>
      <p>
        We see board metadata, comments, and dispatch logs. Your repo and any
        source files stay where they live. We never clone them. You can
        export or delete your account from <a href="/settings">settings</a> at
        any time.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Don't use Foldo to host content that's illegal where you live or
        where we host (Railway, EU + US). Don't use the dispatch system to
        target third-party hosts you don't own.
      </p>

      <h2>No warranty</h2>
      <p>
        Foldo is provided "as is". We'll do our best to keep it up, but
        you shouldn't bet a launch on a hosted prototype. If you need uptime
        guarantees, <a href="/demo">talk to us</a> about self-hosting.
      </p>

      <h2>Changes</h2>
      <p>
        We'll update these terms as the product grows. We'll email you
        before anything substantive changes. Hosted version: this page is
        the current copy. Self-host: see the LICENSE file in the repo.
      </p>

      <h2>Contact</h2>
      <p>
        Questions, or you spotted a hole? <a href="mailto:hi@foldo.dev">hi@foldo.dev</a>.
      </p>
    </SimplePage>
  );
}
