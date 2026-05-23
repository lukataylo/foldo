// Preflight check for the `claude` CLI, modeled after `claude doctor`.
// Called at MCP boot so misconfigured installs surface immediately
// instead of failing on the first dispatch. Never throws — logs and
// returns a structured result the caller can use to decide whether to
// fall back to the sim runner.

import { spawn } from 'node:child_process';
import { resolveClaudeBinary } from './claudeCli.ts';

export interface ClaudeDoctorReport {
  binary: string | null;
  version: string | null;
  reachable: boolean;
  error?: string;
}

const VERSION_TIMEOUT_MS = 5_000;

async function runVersion(binary: string): Promise<string | null> {
  return new Promise((resolve) => {
    let out = '';
    let settled = false;
    let child;
    try {
      child = spawn(binary, ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      });
    } catch {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => {
      settled = true;
      try {
        child?.kill('SIGKILL');
      } catch {
        /* noop */
      }
      resolve(null);
    }, VERSION_TIMEOUT_MS);

    child.stdout?.on('data', (b: Buffer) => {
      out += b.toString('utf8');
    });
    child.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        resolve(null);
        return;
      }
      resolve(out.trim() || null);
    });
  });
}

/**
 * Run the preflight. Logs via the provided logger; returns the report so
 * callers can branch on availability. `forceSim` is the boot-time value of
 * `FOLDO_MCP_FORCE_SIM === '1'` — when true, a missing binary is not warned
 * because the user explicitly opted out of the real CLI.
 */
export async function runClaudeDoctor(
  log: (line: string) => void,
  opts: { forceSim?: boolean } = {},
): Promise<ClaudeDoctorReport> {
  const binary = resolveClaudeBinary();
  if (!binary) {
    const report: ClaudeDoctorReport = {
      binary: null,
      version: null,
      reachable: false,
      error: 'claude not on PATH',
    };
    if (opts.forceSim) {
      log('[claude] not on PATH; FOLDO_MCP_FORCE_SIM=1 set, using sim runner');
    } else {
      log(
        '[claude] WARN: not on PATH; dispatches will fail until claude is installed (or set FOLDO_MCP_FORCE_SIM=1)',
      );
    }
    return report;
  }
  log(`[claude] path: ${binary}`);
  const version = await runVersion(binary);
  if (!version) {
    log('[claude] WARN: failed to read version; binary may be broken');
    return { binary, version: null, reachable: false, error: 'version probe failed' };
  }
  log(`[claude] version: ${version}`);
  log('[claude] ready');
  return { binary, version, reachable: true };
}
