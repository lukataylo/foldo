import { useEffect, useRef, useState } from 'react';
import type { RecordingMode } from '@foldo/protocol';
import { INK, PAPER, PILLOW, SOFT_GREY, YELLOW } from '../marketing/shared';

// A clean, scrubbable player for a finished test recording. It draws a static
// peak waveform from the decoded audio, tracks a playhead during playback, and
// lets you click the waveform to seek. For screen modes the <video> is shown
// above the waveform (the waveform is the scrubber); voice-only shows just the
// waveform + controls. Playback is always driven off a hidden/visible media
// element's `currentTime`.
//
// Robust fallback: if decodeAudioData fails (CORS, codec, byte-range quirks)
// we drop to a plain native <video controls> / <audio controls> so the
// recording is always playable — the waveform is a nicety, not a dependency.

export interface WaveformPlayerProps {
  /** Absolute recording URL. */
  src: string;
  /** What the tester recorded — picks video vs. audio element + layout. */
  recordingMode: RecordingMode;
  /** Known recording length, ms — used for the readout before metadata loads. */
  durationMs?: number;
}

const BAR_W = 2;
const BAR_GAP = 1;
const WAVE_HEIGHT = 44;

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Decode the recording and reduce it to one peak value per bar bucket. */
async function computePeaks(src: string, bucketCount: number): Promise<number[]> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`recording fetch failed (${res.status})`);
  const arrayBuffer = await res.arrayBuffer();

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio API unavailable');
  const audioCtx = new Ctor();
  try {
    // Some browsers only support the callback form — wrap defensively.
    const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
      const maybe = audioCtx.decodeAudioData(
        arrayBuffer,
        (buf) => resolve(buf),
        (err) => reject(err ?? new Error('decodeAudioData failed')),
      );
      if (maybe && typeof (maybe as Promise<AudioBuffer>).then === 'function') {
        (maybe as Promise<AudioBuffer>).then(resolve, reject);
      }
    });

    const channel = audioBuffer.getChannelData(0);
    const samplesPerBucket = Math.max(1, Math.floor(channel.length / bucketCount));
    const peaks: number[] = [];
    let max = 0;
    for (let b = 0; b < bucketCount; b++) {
      let peak = 0;
      const start = b * samplesPerBucket;
      const end = Math.min(channel.length, start + samplesPerBucket);
      for (let i = start; i < end; i++) {
        const v = Math.abs(channel[i]);
        if (v > peak) peak = v;
      }
      peaks.push(peak);
      if (peak > max) max = peak;
    }
    // Normalise so the loudest moment fills the track.
    return max > 0 ? peaks.map((p) => p / max) : peaks;
  } finally {
    void audioCtx.close().catch(() => undefined);
  }
}

export function WaveformPlayer({
  src,
  recordingMode,
  durationMs,
}: WaveformPlayerProps): JSX.Element {
  const isVideo = recordingMode !== 'voice_only';
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(
    durationMs && durationMs > 0 ? durationMs / 1000 : 0,
  );
  const [waveWidth, setWaveWidth] = useState(320);

  // Track the rendered width so the canvas bar count fills the container.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWaveWidth(Math.max(80, el.clientWidth));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Decode the recording into static peaks once per source; fall back to
  // native controls if anything in the pipeline (CORS, codec, range) refuses.
  // We over-sample the bucket count so a later resize just re-maps the same
  // peak array in the draw step rather than re-decoding the whole recording.
  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    setDecodeFailed(false);
    computePeaks(src, 1600)
      .then((p) => {
        if (!cancelled) setPeaks(p);
      })
      .catch(() => {
        if (!cancelled) setDecodeFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  // Mirror playback state off the real media element.
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    const onTime = () => setCurrentSec(media.currentTime);
    const onMeta = () => {
      if (Number.isFinite(media.duration) && media.duration > 0) {
        setDurationSec(media.duration);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    media.addEventListener('timeupdate', onTime);
    media.addEventListener('loadedmetadata', onMeta);
    media.addEventListener('durationchange', onMeta);
    media.addEventListener('play', onPlay);
    media.addEventListener('pause', onPause);
    media.addEventListener('ended', onEnded);
    return () => {
      media.removeEventListener('timeupdate', onTime);
      media.removeEventListener('loadedmetadata', onMeta);
      media.removeEventListener('durationchange', onMeta);
      media.removeEventListener('play', onPlay);
      media.removeEventListener('pause', onPause);
      media.removeEventListener('ended', onEnded);
    };
  }, [decodeFailed]);

  // Draw the static waveform + playhead.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !peaks) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = waveWidth * dpr;
    canvas.height = WAVE_HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, waveWidth, WAVE_HEIGHT);

    const stride = BAR_W + BAR_GAP;
    const barCount = Math.min(peaks.length, Math.floor(waveWidth / stride));
    const progress = durationSec > 0 ? currentSec / durationSec : 0;
    const playedX = progress * waveWidth;
    const mid = WAVE_HEIGHT / 2;

    for (let i = 0; i < barCount; i++) {
      const x = i * stride;
      const peak = peaks[Math.floor((i / barCount) * peaks.length)] ?? 0;
      const h = Math.max(2, peak * (WAVE_HEIGHT - 6));
      const y = mid - h / 2;
      const r = Math.min(BAR_W / 2, h / 2);
      ctx.fillStyle = x <= playedX ? INK : SOFT_GREY;
      ctx.beginPath();
      ctx.roundRect(x, y, BAR_W, h, r);
      ctx.fill();
    }

    // Playhead line.
    ctx.fillStyle = PILLOW;
    ctx.fillRect(Math.min(waveWidth - 1.5, Math.max(0, playedX - 0.75)), 0, 1.5, WAVE_HEIGHT);
  }, [peaks, currentSec, durationSec, waveWidth]);

  const togglePlay = () => {
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) {
      void media.play().catch(() => undefined);
    } else {
      media.pause();
    }
  };

  const seekFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const media = mediaRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!media || rect.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const dur =
      Number.isFinite(media.duration) && media.duration > 0
        ? media.duration
        : durationSec;
    if (dur > 0) {
      media.currentTime = ratio * dur;
      setCurrentSec(media.currentTime);
    }
  };

  // ---- Fallback: native controls, always playable ----
  if (decodeFailed) {
    return isVideo ? (
      <video
        ref={mediaRef as React.RefObject<HTMLVideoElement>}
        src={src}
        controls
        playsInline
        style={{
          width: '100%',
          maxHeight: 220,
          borderRadius: 10,
          border: `1px solid ${SOFT_GREY}`,
          background: '#000',
          display: 'block',
        }}
      />
    ) : (
      <audio
        ref={mediaRef as React.RefObject<HTMLAudioElement>}
        src={src}
        controls
        style={{ width: '100%', display: 'block' }}
      />
    );
  }

  return (
    <div style={{ width: '100%' }}>
      {isVideo ? (
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          src={src}
          playsInline
          onClick={togglePlay}
          style={{
            width: '100%',
            maxHeight: 220,
            borderRadius: 10,
            border: `1px solid ${SOFT_GREY}`,
            background: '#000',
            display: 'block',
            cursor: 'pointer',
          }}
        />
      ) : (
        <audio
          ref={mediaRef as React.RefObject<HTMLAudioElement>}
          src={src}
          preload="metadata"
          style={{ display: 'none' }}
        />
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginTop: isVideo ? 8 : 0,
        }}
      >
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
          style={{
            flexShrink: 0,
            width: 30,
            height: 30,
            borderRadius: 999,
            border: 'none',
            background: YELLOW,
            color: INK,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 1.5px 0 ${PILLOW}`,
          }}
        >
          {playing ? (
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
              <rect x="1.5" y="1" width="3" height="10" rx="1" fill="currentColor" />
              <rect x="7.5" y="1" width="3" height="10" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.5 1.5 10 6l-7.5 4.5z" fill="currentColor" />
            </svg>
          )}
        </button>

        <div
          ref={wrapRef}
          onClick={seekFromEvent}
          style={{
            position: 'relative',
            flex: 1,
            height: WAVE_HEIGHT,
            cursor: 'pointer',
            borderRadius: 8,
            background: PAPER,
            border: `1px solid ${SOFT_GREY}`,
            overflow: 'hidden',
          }}
        >
          {peaks ? (
            <canvas
              ref={canvasRef}
              style={{
                width: waveWidth,
                height: WAVE_HEIGHT,
                display: 'block',
              }}
              aria-hidden="true"
            />
          ) : (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                color: '#9b948a',
                fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
              }}
            >
              Loading waveform…
            </div>
          )}
        </div>

        <div
          style={{
            flexShrink: 0,
            fontSize: 11.5,
            fontVariantNumeric: 'tabular-nums',
            color: '#7a756c',
            fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
          }}
        >
          {formatClock(currentSec)} / {formatClock(durationSec)}
        </div>
      </div>
    </div>
  );
}
