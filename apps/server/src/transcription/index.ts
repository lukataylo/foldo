import type { RecordingMode, TranscriptCue } from '@foldo/protocol';
import { getSessionById, updateSessionTranscript } from '../repo/testSessions.ts';
import { updateSessionFrame } from '../sessionFrames.ts';
import { enqueueSynthesis } from '../ai/synthesis.ts';

/**
 * Pluggable transcription for test-session recordings.
 *
 * The default provider is a **stub** — no API key, no network call. It returns
 * a single, clearly-labelled placeholder cue so the UI has something to render
 * and it's obvious transcription isn't wired up; it never fabricates speech.
 *
 * Real providers (Deepgram / OpenAI Whisper / AssemblyAI) are a documented
 * future drop-in: implement `Transcriber`, select it via
 * `FOLDO_TRANSCRIPTION_PROVIDER`, and the rest of the pipeline is unchanged.
 * The provider receives the storage *key* (not bytes) so a real implementation
 * can hand the object — or a presigned URL — straight to the provider's API.
 */
export interface Transcriber {
  /** Provider name, surfaced in logs. */
  readonly name: string;
  transcribe(
    recordingKey: string,
    mode: RecordingMode,
    durationMs: number,
  ): Promise<{ cues: TranscriptCue[]; status: 'done' | 'skipped' | 'failed' }>;
}

/** No-op provider used when no transcription service is configured. */
class StubTranscriber implements Transcriber {
  readonly name = 'stub';

  async transcribe(
    _recordingKey: string,
    _mode: RecordingMode,
    durationMs: number,
  ): Promise<{
    cues: TranscriptCue[];
    status: 'done' | 'skipped' | 'failed';
  }> {
    return {
      cues: [
        {
          startMs: 0,
          endMs: Math.max(0, durationMs),
          text: '(transcription provider not configured)',
        },
      ],
      // 'skipped' is honest: nothing was actually transcribed.
      status: 'skipped',
    };
  }
}

let cached: Transcriber | null = null;

/** Resolve the configured transcriber (stub unless a provider is wired up). */
export function getTranscriber(): Transcriber {
  if (cached) return cached;
  const provider = (process.env.FOLDO_TRANSCRIPTION_PROVIDER ?? '').toLowerCase();
  switch (provider) {
    // Future: case 'deepgram': cached = new DeepgramTranscriber(...); break;
    // Future: case 'whisper': cached = new WhisperTranscriber(...); break;
    // Future: case 'assemblyai': cached = new AssemblyAiTranscriber(...); break;
    default:
      cached = new StubTranscriber();
  }
  return cached;
}

/** Direct transcription call — exposed for callers that want the cues inline. */
export async function transcribe(
  recordingKey: string,
  mode: RecordingMode,
  durationMs = 0,
): Promise<TranscriptCue[]> {
  const result = await getTranscriber().transcribe(
    recordingKey,
    mode,
    durationMs,
  );
  return result.cues;
}

/**
 * Fire-and-forget transcription job. Marks the session `processing`, runs the
 * transcriber, writes the cues + final status, refreshes the canvas frame, and
 * then chains into the AI synthesis pass.
 *
 * Never throws — a failed job sets `transcript_status = 'failed'` and still
 * lets synthesis run on whatever data exists.
 */
export function enqueueTranscription(sessionId: string): void {
  void runTranscription(sessionId);
}

async function runTranscription(sessionId: string): Promise<void> {
  try {
    const session = await getSessionById(sessionId);
    if (!session) return;

    // No recording (e.g. an upload that never landed) — nothing to transcribe.
    if (!session.recordingUrl) {
      await updateSessionTranscript(sessionId, [], 'skipped');
      await updateSessionFrame(sessionId);
      enqueueSynthesis(sessionId);
      return;
    }

    await updateSessionTranscript(
      sessionId,
      session.transcript ?? [],
      'processing',
    );
    await updateSessionFrame(sessionId);

    const recordingKey = `recordings/${session.testId}/${session.id}.webm`;
    const result = await getTranscriber().transcribe(
      recordingKey,
      session.recordingMode,
      session.recordingDurationMs ?? 0,
    );
    await updateSessionTranscript(sessionId, result.cues, result.status);
    await updateSessionFrame(sessionId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[transcription] session ${sessionId} failed:`, err);
    try {
      await updateSessionTranscript(sessionId, [], 'failed');
      await updateSessionFrame(sessionId);
    } catch {
      /* best-effort */
    }
  } finally {
    // Synthesis runs after transcription regardless of outcome.
    enqueueSynthesis(sessionId);
  }
}
