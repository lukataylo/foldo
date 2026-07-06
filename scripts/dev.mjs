#!/usr/bin/env node
// Top-level dev orchestrator. Boots server + sample-app + web via
// concurrently. Optionally adds the MCP runner when `FOLDO_MCP_DEV=1` is
// set — gated because running the MCP fires real Claude CLI invocations
// on every dispatch, which costs credits.

import { spawn } from 'node:child_process';

const services = [
  { name: 'server', color: 'blue', script: 'dev:server' },
  { name: 'sample', color: 'magenta', script: 'dev:sample' },
  { name: 'web', color: 'cyan', script: 'dev:web' },
];

if (process.env.FOLDO_MCP_DEV === '1') {
  services.push({ name: 'mcp', color: 'yellow', script: 'dev:mcp' });
}

const names = services.map((s) => s.name).join(',');
const colors = services.map((s) => s.color).join(',');
const scripts = services.map((s) => `npm:${s.script}`);

const args = ['concurrently', '-n', names, '-c', colors, ...scripts];
const child = spawn('npx', args, { stdio: 'inherit', env: process.env });
child.on('exit', (code) => process.exit(code ?? 0));
