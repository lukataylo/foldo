import SimplePage from './SimplePage';

export default function StoragePolicy() {
  return (
    <SimplePage
      title="Cookies"
      chip="Cookies"
      intro="What Foldo stores in your browser, why, and how to clear it. Short on purpose. Foldo doesn't track you across the web."
    >
      <h2>What we store</h2>
      <p>
        Foldo keeps a small amount of state in <strong>browser localStorage</strong>.
        Under EU and UK rules, localStorage is treated as a "cookie" for
        consent purposes, so we list it here.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
        <thead>
          <tr>
            <th style={th}>Key</th>
            <th style={th}>Purpose</th>
            <th style={th}>Category</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}><code>foldo:token</code></td>
            <td style={td}>Your session, so you don't have to log in on every page load.</td>
            <td style={td}>Essential</td>
          </tr>
          <tr>
            <td style={td}><code>foldo:user</code></td>
            <td style={td}>Cached display name, initial, and brand colour for the avatar.</td>
            <td style={td}>Essential</td>
          </tr>
          <tr>
            <td style={td}><code>foldo:recents</code></td>
            <td style={td}>List of board IDs you opened recently, to power the home Recents view.</td>
            <td style={td}>Functional</td>
          </tr>
          <tr>
            <td style={td}><code>foldo:starred</code></td>
            <td style={td}>List of board IDs you starred.</td>
            <td style={td}>Functional</td>
          </tr>
          <tr>
            <td style={td}><code>foldo:demoUserId</code></td>
            <td style={td}>Demo-identity selector for anonymous canvas visitors.</td>
            <td style={td}>Functional</td>
          </tr>
          <tr>
            <td style={td}><code>foldo:cookie-acked</code></td>
            <td style={td}>Records that you saw this notice, so we don't show it again.</td>
            <td style={td}>Essential</td>
          </tr>
        </tbody>
      </table>

      <h2>What we don't use</h2>
      <ul>
        <li>No analytics (no Google Analytics, no Plausible, no Mixpanel).</li>
        <li>No advertising or retargeting pixels.</li>
        <li>No third-party tracking cookies.</li>
        <li>No cross-site tracking. The only third-party request the site
          makes is to <code>fonts.googleapis.com</code> for the brand
          typeface, which is a CSS request (no cookies are set).</li>
      </ul>

      <h2>Clearing your data</h2>
      <p>
        Open your browser DevTools, go to Application → Local Storage, select
        <code> foldo.dev</code>, and delete the keys above. Or:
        Settings → Privacy → Clear site data. Doing this will sign you out.
      </p>
      <p>
        You can also delete your whole account from{' '}
        <a href="/settings">Settings → Password</a> (or email{' '}
        <a href="mailto:hi@foldo.dev">hi@foldo.dev</a>) and we hard-delete
        everything server-side within 7 days.
      </p>

      <h2>Updates to this policy</h2>
      <p>
        If we add analytics or any third-party cookie, we'll update this page
        and re-show the banner so you can re-consent. Date of this version:
        2026-05-13.
      </p>

      <h2>Contact</h2>
      <p>
        Privacy / cookie questions: <a href="mailto:hi@foldo.dev">hi@foldo.dev</a>.
      </p>
    </SimplePage>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#666',
  borderBottom: '1.5px solid #E6E3DE',
  padding: '8px 12px',
};

const td: React.CSSProperties = {
  fontSize: 13.5,
  color: '#222',
  borderBottom: '1px solid #efe9df',
  padding: '10px 12px',
  verticalAlign: 'top',
  lineHeight: 1.5,
};
