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

.PHONY: prod-smoke
## prod-smoke: hit the live API surface and confirm a deploy is healthy.
##   Reads FOLDO_PROD_BASE (default https://api.foldo.dev) and
##   FOLDO_PROD_SMOKE_TOKEN (a scrape-only API token minted from the
##   canvas Settings → API tokens UI). Exits non-zero on any failure.
##
##   This target now runs the Playwright spec (e2e/deploy/prod-smoke.spec.ts)
##   so a green local run matches what the post-deploy webhook (CI workflow
##   .github/workflows/post-deploy-smoke.yml) executes. The token gate is
##   enforced so the spec doesn't silently SKIP the authenticated check.
##
##   See docs/DEPLOYMENT.md §6 for how to mint the token and §6.2 for the
##   post-deploy webhook wiring.
prod-smoke:
	@if [ -z "$$FOLDO_PROD_SMOKE_TOKEN" ]; then \
		echo "Set FOLDO_PROD_SMOKE_TOKEN first. See docs/DEPLOYMENT.md §6.2"; exit 1; \
	fi
	RUN_PROD_SMOKE=1 npx playwright test e2e/deploy/prod-smoke.spec.ts --reporter=line

.PHONY: prod-smoke-curl
## prod-smoke-curl: fast, dependency-free variant — just curls /health,
##   /metrics, and /api/home. Use this when you don't have Playwright
##   installed or want a quick yes/no.
prod-smoke-curl:
	@node scripts/prod-smoke.mjs
