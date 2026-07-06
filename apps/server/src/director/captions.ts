// WebVTT captions, ported from Foley's captions.py.
//
// One cue per step: title on the first line, narration below. Cue timing
// comes from the steps' declared durations laid end to end — that matches
// the assembled master exactly, because segments are padded/trimmed to the
// declared duration at build time. Captions are also the degradation path:
// when narration audio is unavailable, the words still reach the viewer.

import type { WalkthroughStep } from '@foldo/protocol';

function formatTs(msIn: number): string {
  let ms = Math.max(0, Math.round(msIn));
  const h = Math.floor(ms / 3_600_000);
  ms -= h * 3_600_000;
  const m = Math.floor(ms / 60_000);
  ms -= m * 60_000;
  const s = Math.floor(ms / 1000);
  ms -= s * 1000;
  const pad = (n: number, w: number) => String(n).padStart(w, '0');
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`;
}

export function stepsToVtt(steps: WalkthroughStep[]): string {
  const lines: string[] = ['WEBVTT', ''];
  let cursor = 0;
  steps.forEach((step, i) => {
    const start = cursor;
    const end = cursor + Math.max(1000, step.durationMs);
    cursor = end;
    lines.push(`step-${i + 1}-${step.id}`);
    lines.push(`${formatTs(start)} --> ${formatTs(end)}`);
    lines.push(step.title);
    lines.push(step.narration);
    lines.push('');
  });
  return lines.join('\n');
}
