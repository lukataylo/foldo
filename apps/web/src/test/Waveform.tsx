import { useEffect, useRef } from 'react';

// A live audio-level waveform — taps the recording stream's mic track through
// a Web Audio AnalyserNode and animates a row of rounded bars to the tester's
// voice. It's the "yes, we're hearing you" signal next to the REC timer.

interface Props {
  /** The MediaStream being recorded (may have no audio track). */
  stream: MediaStream | null;
  /** Bar colour. */
  color: string;
  width?: number;
  height?: number;
}

const BARS = 22;
const GAP = 3;

export function Waveform({ stream, color, width = 128, height = 26 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const hasAudio = !!stream && stream.getAudioTracks().length > 0;

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let data: Uint8Array<ArrayBuffer> | null = null;

    if (hasAudio && stream) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      audioCtx = new Ctor();
      void audioCtx.resume().catch(() => undefined);
      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      // Explicit ArrayBuffer so the type is Uint8Array<ArrayBuffer>, which is
      // what getByteTimeDomainData expects under the current DOM lib types.
      data = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    }

    const barW = (width - GAP * (BARS - 1)) / BARS;
    const FLOOR = 0.14; // bars never collapse fully — reads as "live", not "dead"
    const heights = new Array(BARS).fill(FLOOR);
    let raf = 0;

    const draw = () => {
      if (analyser && data) {
        analyser.getByteTimeDomainData(data);
        const step = Math.floor(data.length / BARS);
        for (let i = 0; i < BARS; i++) {
          let peak = 0;
          for (let j = 0; j < step; j++) {
            const dev = Math.abs(data[i * step + j] - 128) / 128;
            if (dev > peak) peak = dev;
          }
          const target = Math.max(FLOOR, Math.min(1, peak * 2.1));
          heights[i] += (target - heights[i]) * 0.4;
        }
      } else {
        // no mic track (screen-only) — a calm idle shimmer
        const t = Date.now() / 360;
        for (let i = 0; i < BARS; i++) {
          heights[i] = 0.14 + 0.07 * Math.abs(Math.sin(t + i * 0.55));
        }
      }

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;
      for (let i = 0; i < BARS; i++) {
        const h = Math.max(2, heights[i] * height);
        const x = i * (barW + GAP);
        const y = (height - h) / 2;
        const r = Math.min(barW / 2, h / 2);
        ctx.beginPath();
        ctx.roundRect(x, y, barW, h, r);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      if (audioCtx) void audioCtx.close().catch(() => undefined);
    };
  }, [stream, color, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: 'block' }}
      aria-hidden="true"
    />
  );
}
