// ElevenLabs narration, ported from Foley's narrator.py.
//
// Hash-cached: identical text+voice+model → identical mp3 bytes, which keeps
// unchanged steps' segments byte-identical across takes. Degrades to null
// (silent video + captions) when no ELEVENLABS_API_KEY is configured or the
// API errors — narration is never allowed to fail a take.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_MODEL = 'eleven_turbo_v2_5';
const DEFAULT_VOICE = 'XB0fDUnXU5powFXDhCwa'; // "Charlotte", Foley's default

function cacheKey(text: string, voiceId: string, modelId: string): string {
  return createHash('sha256')
    .update(voiceId)
    .update('\x00')
    .update(modelId)
    .update('\x00')
    .update(text)
    .digest('hex')
    .slice(0, 16);
}

export interface NarratorOptions {
  /** Directory for the mp3 cache; survives across takes for reuse. */
  cacheDir: string;
  voiceId?: string;
  modelId?: string;
  onWarning?: (message: string) => void;
}

/**
 * Synthesize one narration line to mp3. Returns the file path, or null when
 * narration is unavailable (no key / API failure) — callers treat null as
 * "silent segment, captions carry the words".
 */
export async function synthNarration(
  text: string,
  opts: NarratorOptions,
): Promise<string | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = opts.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE;
  const modelId = opts.modelId ?? DEFAULT_MODEL;

  await mkdir(opts.cacheDir, { recursive: true });
  const key = cacheKey(text, voiceId, modelId);
  const cachePath = join(opts.cacheDir, `${key}.mp3`);

  try {
    await readFile(cachePath);
    return cachePath;
  } catch {
    /* cache miss */
  }

  if (!apiKey) {
    opts.onWarning?.('ELEVENLABS_API_KEY not set — rendering silent segments with captions');
    return null;
  }

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text, model_id: modelId }),
      },
    );
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      opts.onWarning?.(`ElevenLabs ${res.status}: ${body} — degrading to silent segment`);
      return null;
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    await writeFile(cachePath, bytes);
    return cachePath;
  } catch (err) {
    opts.onWarning?.(
      `ElevenLabs request failed: ${String(err).slice(0, 200)} — degrading to silent segment`,
    );
    return null;
  }
}
