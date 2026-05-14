import type { RecordingMode } from '@foldo/protocol';

// Thin wrapper around getUserMedia / getDisplayMedia + MediaRecorder. Keeps the
// permission/codec/track-lifecycle mess out of the TestRunner component.

export class MediaUnsupportedError extends Error {}
export class PermissionDeniedError extends Error {}

export interface RecorderHandle {
  /** The stream being recorded. */
  stream: MediaStream;
  /** ms elapsed since the recorder started. */
  elapsedMs(): number;
  /** Stop, flush, release tracks, and return the finished recording. */
  stop(): Promise<{ blob: Blob; durationMs: number }>;
  /** Discard and release everything without producing a blob. */
  cancel(): void;
  /** Fires if capture ends on its own (tester hits the browser's "Stop sharing"). */
  onEnded(cb: () => void): void;
}

function supportsRecording(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined'
  );
}

/** Acquire the media stream for a recording mode. Throws on denial/unsupported. */
export async function acquireMedia(mode: RecordingMode): Promise<MediaStream> {
  if (!supportsRecording()) {
    throw new MediaUnsupportedError(
      'This browser can’t record audio or screen. Try Chrome or Edge on a desktop.',
    );
  }
  try {
    if (mode === 'voice_only') {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    if (mode === 'screen_only') {
      return await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
    }
    // screen_voice — screen video + mic audio merged into one stream.
    const display = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      display.getTracks().forEach((t) => t.stop());
      throw e;
    }
    return new MediaStream([
      ...display.getVideoTracks(),
      ...mic.getAudioTracks(),
    ]);
  } catch (e) {
    if (e instanceof MediaUnsupportedError) throw e;
    const name = (e as { name?: string }).name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new PermissionDeniedError(
        'Recording permission was denied — we need it to capture your session.',
      );
    }
    if (name === 'NotFoundError' || name === 'NotReadableError') {
      throw new PermissionDeniedError(
        'No microphone or screen source was available to record.',
      );
    }
    throw e instanceof Error ? e : new Error('Could not start recording.');
  }
}

function pickMimeType(stream: MediaStream): string {
  const hasVideo = stream.getVideoTracks().length > 0;
  const candidates = hasVideo
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['audio/webm;codecs=opus', 'audio/webm'];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return hasVideo ? 'video/webm' : 'audio/webm';
}

/** Begin recording a stream. Emits a chunk every 3s for crash resilience. */
export function startRecorder(stream: MediaStream): RecorderHandle {
  const mimeType = pickMimeType(stream);
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];
  const startedAt = Date.now();
  let endedCb: (() => void) | null = null;
  let notified = false;

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  // track.stop() does NOT fire 'ended', so this only catches the tester
  // ending the capture themselves (the browser's "Stop sharing" button).
  for (const track of stream.getTracks()) {
    track.addEventListener('ended', () => {
      if (notified) return;
      notified = true;
      endedCb?.();
    });
  }

  recorder.start(3000);

  const releaseTracks = () => stream.getTracks().forEach((t) => t.stop());
  const finalBlob = () => new Blob(chunks, { type: mimeType });

  return {
    stream,
    elapsedMs: () => Date.now() - startedAt,
    onEnded: (cb) => {
      endedCb = cb;
    },
    stop: () =>
      new Promise((resolve) => {
        const durationMs = Date.now() - startedAt;
        if (recorder.state === 'inactive') {
          releaseTracks();
          resolve({ blob: finalBlob(), durationMs });
          return;
        }
        recorder.onstop = () => {
          releaseTracks();
          resolve({ blob: finalBlob(), durationMs });
        };
        recorder.stop();
      }),
    cancel: () => {
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        /* ignore */
      }
      releaseTracks();
    },
  };
}
