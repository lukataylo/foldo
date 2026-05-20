// Configuration loaded from environment variables, with sensible defaults
// suitable for the local prototype.

import { resolve } from 'node:path';

export interface FoldoMcpConfig {
  cloudUrl: string;
  cloudWsPath: string;
  token: string;
  boardId: string;
  agentName: string;
  version: string;
  sampleAppUrl: string;
  cloudBridge: boolean;
  /** Absolute path to the repo the `claude` CLI should edit. Defaults to cwd. */
  targetRepo: string;
  /** When true, the real-edit path pushes the work branch to `origin`.
   *  Opt-in (FOLDO_MCP_PUSH=1); default is commit-locally-only. */
  push: boolean;
}

function envOr(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (!v) return fallback;
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
}

export function loadConfig(): FoldoMcpConfig {
  // FOLDO_CLOUD_URL is the http(s) origin; we derive ws(s) from it.
  const cloudUrl = envOr('FOLDO_CLOUD_URL', 'http://localhost:4000');
  return {
    cloudUrl,
    cloudWsPath: envOr('FOLDO_CLOUD_WS_PATH', '/ws/mcp'),
    token: envOr('FOLDO_TOKEN', 'demo-mcp'),
    boardId: envOr('FOLDO_BOARD_ID', 'board-acme-landing'),
    agentName: envOr('FOLDO_AGENT_NAME', 'Claude Code'),
    version: '0.0.1',
    sampleAppUrl: envOr('FOLDO_SAMPLE_APP_URL', 'http://localhost:5174'),
    cloudBridge: envBool('FOLDO_CLOUD_BRIDGE', false),
    targetRepo: resolve(envOr('FOLDO_TARGET_REPO', process.cwd())),
    push: envBool('FOLDO_MCP_PUSH', false),
  };
}

export function toWsUrl(httpUrl: string, path: string): string {
  const u = new URL(httpUrl);
  const protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${u.host}${path}`;
}
