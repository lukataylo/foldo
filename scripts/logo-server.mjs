import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Serves the WHOLE captured xTrade screen (DOM snapshot) with the latest
// Claude-edited logo swapped in — so a "change the logo colour" dispatch's
// result frame shows the full screen with the recoloured logo, not a
// standalone logo page. The dashboard snapshot inlines exactly one
// image/svg+xml data URL (the logo, verbatim), so the swap is unambiguous.
const REPO = '/tmp/xt-logo-demo';
const SNAPSHOT = '/tmp/foldo-e2e/xt/journey/01-dashboard.html';

function latestRef() {
  try {
    const out = execFileSync(
      'git',
      ['-C', REPO, 'for-each-ref', '--sort=-committerdate', '--format=%(refname:short)', 'refs/heads/foldo'],
      { encoding: 'utf8' },
    ).trim().split('\n').filter(Boolean);
    return out[0] || 'main';
  } catch { return 'main'; }
}
function editedLogoDataUrl() {
  const svg = execFileSync('git', ['-C', REPO, 'show', `${latestRef()}:xTrade-logo.svg`]);
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

createServer((req, res) => {
  try {
    let html = readFileSync(SNAPSHOT, 'utf8');
    html = html.replace(/data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+/, editedLogoDataUrl());
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    res.end(html);
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
}).listen(8012, () => console.log('logo-server on 8012: whole screen + latest-edit logo'));
