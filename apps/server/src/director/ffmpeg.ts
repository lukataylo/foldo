// ffmpeg plumbing for the director. Ported from Foley's concat.py.
//
// ENCODE_ARGS are pinned: identical params + identical input = byte-identical
// output. That property is what makes "re-render only the segments the diff
// touched, leave the rest byte-identical" hold. Don't tweak these without
// accepting that every cached segment invalidates.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const ENCODE_ARGS = [
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-crf', '20',
  '-pix_fmt', 'yuv420p',
  '-r', '30',
  '-g', '60',
  '-c:a', 'aac',
  '-b:a', '128k',
  '-ar', '44100',
  '-movflags', '+faststart',
];

let ffmpegAvailable: boolean | null = null;

/** True when an ffmpeg binary is on PATH. Cached after the first probe. */
export async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 10_000 });
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

/** For tests. */
export function resetFfmpegProbe(): void {
  ffmpegAvailable = null;
}

export async function ffmpeg(args: string[], timeoutMs = 120_000): Promise<void> {
  try {
    await execFileAsync('ffmpeg', ['-y', ...args], {
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (err) {
    const stderr =
      err && typeof err === 'object' && 'stderr' in err
        ? String((err as { stderr: unknown }).stderr).slice(-1500)
        : String(err);
    throw new Error(`ffmpeg failed:\n${stderr}`);
  }
}

/** webm → mp4 with pinned codec params, trimmed to the step's duration.
 * Video-only: narration arrives separately and is muxed at segment build. */
export async function transcodeToMp4(
  srcWebm: string,
  dstMp4: string,
  durationMs: number,
): Promise<void> {
  const durationS = (durationMs / 1000).toFixed(3);
  await ffmpeg(['-i', srcWebm, '-t', durationS, ...ENCODE_ARGS, '-an', dstMp4]);
}

/** Render a still PNG into a video clip of the step's duration — the
 * graceful-degradation path when video capture failed but we have a frame. */
export async function stillToClip(
  srcPng: string,
  dstMp4: string,
  durationMs: number,
): Promise<void> {
  const durationS = (durationMs / 1000).toFixed(3);
  await ffmpeg([
    '-loop', '1',
    '-framerate', '30',
    '-i', srcPng,
    '-t', durationS,
    // Pad odd dimensions so yuv420p doesn't reject the frame.
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    ...ENCODE_ARGS,
    '-an',
    dstMp4,
  ]);
}

/** Mux narration onto a clip, padding audio with silence to the declared
 * duration. Without narration, attach a silent track so every segment has an
 * identical stream layout (a concat-demuxer requirement). */
export async function buildSegment(
  clipMp4: string,
  narrationMp3: string | null,
  dstMp4: string,
  durationMs: number,
): Promise<void> {
  const durationS = (durationMs / 1000).toFixed(3);
  if (narrationMp3) {
    await ffmpeg([
      '-i', clipMp4,
      '-i', narrationMp3,
      '-filter_complex', `[1:a]apad,atrim=0:${durationS},asetpts=N/SR/TB[a]`,
      '-map', '0:v',
      '-map', '[a]',
      '-shortest',
      ...ENCODE_ARGS,
      dstMp4,
    ]);
  } else {
    await ffmpeg([
      '-i', clipMp4,
      '-f', 'lavfi',
      '-i', 'anullsrc=r=44100:cl=stereo',
      '-map', '0:v',
      '-map', '1:a',
      '-shortest',
      ...ENCODE_ARGS,
      dstMp4,
    ]);
  }
}

/** Stitch segments at the container level (`-c copy`) — never re-encodes, so
 * reused segments survive into the master byte-for-byte. */
export async function concatSegments(
  concatListPath: string,
  dstMp4: string,
): Promise<void> {
  await ffmpeg([
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    dstMp4,
  ]);
}
