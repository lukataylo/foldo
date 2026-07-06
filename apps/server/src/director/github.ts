// Fetch a PR's unified diff from the GitHub API.
//
// Foley shelled out to the `gh` CLI (interactive auth on a laptop); as a
// hosted service we hit the REST API directly. Works unauthenticated for
// public repos (rate-limited); set FOLDO_GITHUB_TOKEN (a GitHub App
// installation token or PAT with contents:read) for private repos. Failure
// returns null — the verdict layer degrades to a full re-render, which is
// slower but never wrong.

export async function fetchPrDiff(
  repoSlug: string,
  prNumber: number,
): Promise<string | null> {
  const token = process.env.FOLDO_GITHUB_TOKEN;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repoSlug}/pulls/${prNumber}`,
      {
        headers: {
          accept: 'application/vnd.github.v3.diff',
          'user-agent': 'foldo-director',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      },
    );
    if (!res.ok) return null;
    const diff = await res.text();
    // A 10 MB lockfile-only diff would drown both the LLM and the heuristic.
    return diff.length > 400_000 ? diff.slice(0, 400_000) : diff;
  } catch {
    return null;
  }
}
