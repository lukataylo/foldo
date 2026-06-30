#!/usr/bin/env node
// Idempotently install the foldo MCP into Claude Code's settings.json.
//
// Behaviour:
//   - Reads $HOME/.config/claude-code/settings.json (or platform-specific
//     equivalent on macOS / Windows).
//   - If the file exists: merges `mcpServers.foldo = { command, args }`.
//     If `foldo` is already present and points at the same entry, exits
//     0 with a "no-op" notice. If present but different, prints a diff
//     and exits 1 — so the user can review before overwriting.
//   - If the file doesn't exist: writes the snippet to
//     `./foldo-mcp.claude-snippet.json` in the repo root and prints the
//     suggested target path.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir, platform } from 'node:os';
import { argv, exit } from 'node:process';

const entry = argv[2];
if (!entry) {
  console.error('usage: claude-mcp-install.mjs <abs-path-to-foldo-mcp.mjs>');
  exit(1);
}
const absEntry = resolve(entry);

function defaultSettingsPath() {
  const home = homedir();
  if (platform() === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  if (platform() === 'win32') {
    return join(process.env.APPDATA ?? home, 'Claude', 'claude_desktop_config.json');
  }
  return join(home, '.config', 'claude-code', 'settings.json');
}

const target = process.env.CLAUDE_SETTINGS_PATH ?? defaultSettingsPath();
const snippet = {
  mcpServers: {
    foldo: {
      command: 'node',
      args: [absEntry],
    },
  },
};

function writeSnippetFallback() {
  const out = resolve('foldo-mcp.claude-snippet.json');
  writeFileSync(out, JSON.stringify(snippet, null, 2) + '\n');
  console.log(`Wrote snippet to: ${out}`);
  console.log(`Paste these contents into: ${target}`);
}

if (!existsSync(target)) {
  console.log(`No Claude settings file at: ${target}`);
  writeSnippetFallback();
  exit(0);
}

let current;
try {
  current = JSON.parse(readFileSync(target, 'utf8'));
} catch (err) {
  console.error(`Failed to parse ${target}: ${err.message}`);
  writeSnippetFallback();
  exit(1);
}

if (typeof current !== 'object' || current === null) current = {};
if (typeof current.mcpServers !== 'object' || current.mcpServers === null) {
  current.mcpServers = {};
}

const existing = current.mcpServers.foldo;
const desired = snippet.mcpServers.foldo;
if (existing && JSON.stringify(existing) === JSON.stringify(desired)) {
  console.log(`foldo MCP already wired in ${target} — no changes.`);
  exit(0);
}

if (existing) {
  console.log(`foldo MCP already present in ${target} with different config:`);
  console.log('  existing:', JSON.stringify(existing));
  console.log('  desired :', JSON.stringify(desired));
  console.log('Refusing to overwrite — edit manually or remove the existing entry first.');
  exit(1);
}

current.mcpServers.foldo = desired;
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(current, null, 2) + '\n');
console.log(`Added foldo MCP server to: ${target}`);
