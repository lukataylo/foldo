// Grounded Playwright capture — the TypeScript port of Foley's
// playwright_runner.py, adapted for unattended server-side runs.
//
// Resilience contract (unchanged from Foley, hardened for auth walls):
//   - A single action failure (selector miss, timeout) is *recorded*, not
//     raised. The camera holds on the last good frame and the run continues,
//     so a flaky selector degrades one moment of one step, not the take.
//   - Every step always tries to produce a final-frame PNG still. If video
//     capture or transcode fails, the still (plus the step's narration as a
//     caption) is the fallback artifact.
//   - A catastrophic failure (browser missing, target unreachable) returns a
//     step error rather than throwing, so the caller can degrade the take.
//
// Selectors are visible-text locators only — `page.getByText(...)` /
// `getByLabel(...)` — never CSS/XPath. That's the "grounded" part: specs
// survive markup refactors and read like documentation.

import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Walkthrough, WalkthroughAction, WalkthroughStep } from '@foldo/protocol';
import { CAPTURE_VIEWPORT, stepFingerprint } from './models.ts';
import { hasFfmpeg, transcodeToMp4 } from './ffmpeg.ts';

export const ACTION_TIMEOUT_MS = 8_000;
const PRIME_GOTO_TIMEOUT_MS = 15_000;

export interface ActionWarning {
  index: number;
  kind: string;
  message: string;
}

export interface StepCaptureResult {
  stepId: string;
  fingerprint: string;
  /** Video clip (mp4, pinned encode), when video capture + transcode worked */
  clipPath?: string;
  /** Final-frame still. Present in almost every outcome, including failures */
  stillPath?: string;
  warnings: ActionWarning[];
  /** Set when the step produced no usable clip (still-only degradation) */
  error?: string;
  elapsedMs: number;
}

type PlaywrightModule = typeof import('playwright');

let pwModule: PlaywrightModule | null | undefined;

/** Dynamic import so a deployment without Playwright degrades cleanly
 * instead of crashing the server at boot. */
async function loadPlaywright(): Promise<PlaywrightModule | null> {
  if (pwModule !== undefined) return pwModule;
  try {
    pwModule = await import('playwright');
  } catch {
    pwModule = null;
  }
  return pwModule;
}

function resolveUrl(base: string, url: string): string {
  return url.startsWith('/') ? base.replace(/\/+$/, '') + url : url;
}

function firstLine(err: unknown): string {
  return String(err).split('\n')[0] ?? '';
}

async function doAction(
  page: import('playwright').Page,
  action: WalkthroughAction,
  baseUrl: string,
): Promise<void> {
  switch (action.kind) {
    case 'goto':
      await page.goto(resolveUrl(baseUrl, action.url), {
        waitUntil: 'networkidle',
        timeout: ACTION_TIMEOUT_MS,
      });
      break;
    case 'click':
      await page
        .getByText(action.text, { exact: false })
        .first()
        .click({ timeout: ACTION_TIMEOUT_MS });
      break;
    case 'hover':
      await page
        .getByText(action.text, { exact: false })
        .first()
        .hover({ timeout: ACTION_TIMEOUT_MS });
      break;
    case 'fill': {
      // Try an accessible label first, then placeholder — both are
      // "grounded" in what a user can see.
      const byLabel = page.getByLabel(action.label, { exact: false }).first();
      try {
        await byLabel.fill(action.value, { timeout: ACTION_TIMEOUT_MS });
      } catch {
        await page
          .getByPlaceholder(action.label, { exact: false })
          .first()
          .fill(action.value, { timeout: ACTION_TIMEOUT_MS });
      }
      break;
    }
    case 'press':
      await page.keyboard.press(action.key);
      break;
    case 'scroll':
      await page.mouse.wheel(0, action.y);
      break;
    case 'wait':
      await page.waitForTimeout(Math.min(action.ms, 15_000));
      break;
    default: {
      const _exhaustive: never = action;
      throw new Error(`unknown action: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export interface CaptureOptions {
  /** Scratch directory for per-step artifacts. Created if missing. */
  workDir: string;
  /** Ran once on a fresh context before the first step — login walls. */
  authActions?: WalkthroughAction[];
  onProgress?: (message: string) => void;
}

/**
 * Capture a list of steps against the walkthrough's target URL. Each step
 * gets a fresh page (deterministic starting state) inside one browser +
 * context (auth cookies persist across steps).
 *
 * Never throws for per-step problems; returns one result per step. Throws
 * only when Playwright itself is unavailable AND no degradation is possible.
 */
export async function captureSteps(
  walkthrough: Walkthrough,
  steps: WalkthroughStep[],
  opts: CaptureOptions,
): Promise<StepCaptureResult[]> {
  await mkdir(opts.workDir, { recursive: true });
  const pw = await loadPlaywright();
  if (!pw) {
    return steps.map((s) => ({
      stepId: s.id,
      fingerprint: stepFingerprint(s),
      warnings: [],
      error: 'playwright is not installed on this server',
      elapsedMs: 0,
    }));
  }

  const ffmpegOk = await hasFfmpeg();
  const results: StepCaptureResult[] = [];

  let browser: import('playwright').Browser | null = null;
  try {
    browser = await pw.chromium.launch({
      headless: true,
      // Escape hatch for hosts with a pre-provisioned chromium that doesn't
      // match the playwright package's pinned revision.
      executablePath: process.env.FOLDO_CHROMIUM_PATH || undefined,
    });
  } catch (err) {
    const message = firstLine(err).slice(0, 300);
    return steps.map((s) => ({
      stepId: s.id,
      fingerprint: stepFingerprint(s),
      warnings: [],
      error: `browser launch failed: ${message}`,
      elapsedMs: 0,
    }));
  }

  try {
    // One context for the whole take so auth survives across steps; video
    // recording is enabled per-context, one webm per page (= per step).
    const videoDir = join(opts.workDir, 'video');
    await mkdir(videoDir, { recursive: true });
    const context = await browser.newContext({
      viewport: CAPTURE_VIEWPORT,
      deviceScaleFactor: 1,
      recordVideo: ffmpegOk
        ? { dir: videoDir, size: CAPTURE_VIEWPORT }
        : undefined,
    });
    context.setDefaultTimeout(ACTION_TIMEOUT_MS);

    // Auth recipe: run once, on a throwaway page, warnings surfaced on the
    // first step. An expired auth wall degrades the take to stills of the
    // login page rather than killing the run — visible, diagnosable, retryable.
    const authWarnings: ActionWarning[] = [];
    if (opts.authActions?.length) {
      opts.onProgress?.('running auth recipe');
      const authPage = await context.newPage();
      try {
        await authPage.goto(walkthrough.targetUrl, {
          waitUntil: 'networkidle',
          timeout: PRIME_GOTO_TIMEOUT_MS,
        });
        for (const [i, action] of opts.authActions.entries()) {
          try {
            await doAction(authPage, action, walkthrough.targetUrl);
          } catch (err) {
            authWarnings.push({
              index: i,
              kind: `auth:${action.kind}`,
              message: firstLine(err).slice(0, 200),
            });
          }
        }
      } catch (err) {
        authWarnings.push({
          index: -1,
          kind: 'auth:goto',
          message: firstLine(err).slice(0, 200),
        });
      } finally {
        await authPage.close().catch(() => {});
      }
    }

    const pendingTranscodes = new Map<string, PendingTranscode>();
    for (const step of steps) {
      opts.onProgress?.(`capturing step "${step.title}"`);
      const result = await captureOneStep(context, walkthrough, step, {
        workDir: opts.workDir,
        ffmpegOk,
        pendingTranscodes,
      });
      if (authWarnings.length && results.length === 0) {
        result.warnings.unshift(...authWarnings);
      }
      results.push(result);
    }

    // Playwright finalises webms when the context closes; transcode after.
    await context.close().catch(() => {});

    for (const result of results) {
      const pending = pendingTranscodes.get(result.stepId);
      if (!pending || !ffmpegOk) continue;
      try {
        await transcodeToMp4(pending.webmPath, pending.clipPath, pending.durationMs);
        result.clipPath = pending.clipPath;
      } catch (err) {
        result.warnings.push({
          index: -1,
          kind: 'transcode',
          message: firstLine(err).slice(0, 200),
        });
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  // Clean the raw webms; clips + stills remain.
  await rm(join(opts.workDir, 'video'), { recursive: true, force: true }).catch(() => {});

  return results;
}

interface PendingTranscode {
  webmPath: string;
  clipPath: string;
  durationMs: number;
}

async function captureOneStep(
  context: import('playwright').BrowserContext,
  walkthrough: Walkthrough,
  step: WalkthroughStep,
  opts: {
    workDir: string;
    ffmpegOk: boolean;
    pendingTranscodes: Map<string, PendingTranscode>;
  },
): Promise<StepCaptureResult> {
  const warnings: ActionWarning[] = [];
  let error: string | undefined;
  let stillPath: string | undefined;
  let elapsedMs = 0;
  const t0 = Date.now();

  let page: import('playwright').Page | null = null;
  try {
    page = await context.newPage();

    // Prime the page when the step doesn't open with a goto. Nothing useful
    // has been recorded yet, so a generous timeout + hard failure is fine.
    if (step.actions[0]?.kind !== 'goto') {
      try {
        await page.goto(walkthrough.targetUrl, {
          waitUntil: 'networkidle',
          timeout: PRIME_GOTO_TIMEOUT_MS,
        });
      } catch (err) {
        warnings.push({
          index: -1,
          kind: 'prime_goto',
          message: firstLine(err).slice(0, 200),
        });
      }
    }

    for (const [i, action] of step.actions.entries()) {
      try {
        await doAction(page, action, walkthrough.targetUrl);
      } catch (err) {
        // Selector miss / timeout: record and continue. The camera keeps
        // rolling on whatever state the page is in.
        warnings.push({
          index: i,
          kind: action.kind,
          message: firstLine(err).slice(0, 200),
        });
      }
    }

    elapsedMs = Date.now() - t0;

    // Final-frame still — the degradation anchor. Best-effort.
    const still = join(opts.workDir, `${step.id}.png`);
    try {
      await page.screenshot({ path: still, fullPage: false });
      stillPath = still;
    } catch {
      /* leave stillPath unset */
    }

    if (opts.ffmpegOk) {
      const video = page.video();
      if (video) {
        // The webm path is known now but only final after context close;
        // queue the transcode for the caller.
        const webmPath = await video.path();
        opts.pendingTranscodes.set(step.id, {
          webmPath,
          clipPath: join(opts.workDir, `${step.id}.mp4`),
          durationMs: step.durationMs,
        });
      }
    }
  } catch (err) {
    error = firstLine(err).slice(0, 300);
    elapsedMs = Date.now() - t0;
  } finally {
    await page?.close().catch(() => {});
  }

  return {
    stepId: step.id,
    fingerprint: stepFingerprint(step),
    stillPath,
    warnings,
    error,
    elapsedMs,
  };
}

/** List leftover artifacts in a work dir (used by tests). */
export async function listWorkDir(workDir: string): Promise<string[]> {
  try {
    return await readdir(workDir);
  } catch {
    return [];
  }
}
