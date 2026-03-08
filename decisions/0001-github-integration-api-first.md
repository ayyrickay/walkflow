# DR-0001: Choose GitHub API-First Integration (Over MCP or CLI)

Date: 2026-03-08  
Status: Accepted

## Context
We need GitHub integration for WalkFlow in two places:

1. Call-time repo context (read-only) so the agent can propose likely repositories.
2. Post-call web/worker actions (write) with strict safety controls, including a single demo repository write limit.

We discussed three implementation paths:

- Direct GitHub API calls
- GitHub MCP integration
- Running GitHub CLI (`gh`) from the agent

At this stage, the product goal is a reliable MVP with clear safety boundaries and low operational complexity.

## Decision
We will implement GitHub integration API-first.

- Use direct GitHub REST API access for read and write operations.
- Keep write access constrained by explicit server-side policy (`GITHUB_WRITE_ALLOWED_REPO`).
- Keep call flow read-only in behavior, and reserve writes for asynchronous web/worker paths.
- Keep the internal integration surface provider-based so MCP can be adopted later without rewriting call/web flow logic.

## Also considered
### GitHub MCP first
Why we considered it:
- More AI-native tool interface.
- Good long-term direction for agent tool orchestration.

Why we did not choose it as the primary path now:
- Extra infrastructure and compatibility surface for MVP.
- Tool naming/output contracts vary across MCP servers and require additional hardening.
- We want the smallest number of moving parts while proving end-to-end reliability.

### GitHub CLI (`gh`) from the agent
Why we considered it:
- Easy local workflows and familiar commands.
- Works with access tokens (`GH_TOKEN`/`GITHUB_TOKEN`).

Why we did not choose it as the primary path now:
- Adds process/runtime dependency management in production execution paths.
- CLI output parsing is less stable than typed API payloads.
- Harder to enforce and audit fine-grained policy compared with explicit API-layer checks.

## Consequences
- Positive:
  - Fewer moving parts for MVP and easier operational debugging.
  - Clear policy enforcement at the application boundary for write restrictions.
  - More predictable typed responses for proposal context and async actions.
- Negative:
  - Less "AI-native" than MCP in the short term.
  - We may do migration work later if we standardize on MCP for all tools.
- Neutral:
  - `gh` and MCP remain valid future options; this decision does not block either.
  - We should revisit after asynchronous code-generation flow is stable and we have real usage data.
