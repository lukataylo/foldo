# Foldo top-level convenience targets. The package.json is the source of
# truth for build/test/dev — this file collects one-shot operator tasks
# that don't belong in the JS toolchain.

REPO_ROOT := $(shell pwd)
MCP_ENTRY := $(REPO_ROOT)/apps/mcp/bin/foldo-mcp.mjs

.PHONY: claude-mcp-install
## claude-mcp-install: wire the local foldo MCP into Claude Code's settings.
##   If ~/.config/claude-code/settings.json exists, idempotently merges in
##   the `foldo` mcpServer entry. Otherwise writes a paste-ready snippet
##   to ./foldo-mcp.claude-snippet.json so you can copy it in manually.
claude-mcp-install:
	@node scripts/claude-mcp-install.mjs "$(MCP_ENTRY)"
