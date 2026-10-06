export function timeAgo(ts: number | string, now = Date.now()) {
  const s = Math.max(0, (now - new Date(ts).getTime()) / 1000);
  const units: [number, string][] = [
    [86400 * 7, 'w'],
    [86400, 'd'],
    [3600, 'h'],
    [60, 'm'],
  ];

  if (s < 60) {
    return 'just now';
  }

  for (const [sec, label] of units) {
    if (s >= sec) {
      return `${Math.floor(s / sec)}${label} ago`;
    }
  }

  return 'just now';
}
