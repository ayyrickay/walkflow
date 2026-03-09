# DR-0002: Keep Next.js as the Primary App Runtime for MVP

Date: 2026-03-09  
Status: Accepted

## Context
WalkFlow currently uses two runtimes:

1. Next.js + TypeScript (App Router) for dashboard/auth and server routes.
2. Fastify for the phone relay path (including realtime/websocket-oriented behavior).

We evaluated whether to consolidate into a Fastify-first architecture and serve all product surfaces from one server/deploy unit.

For MVP, the main goals are reliability, demo readiness, and fastest iteration velocity while supporting:

1. Phone and webhook ingestion paths.
2. Post-call processing and review actions.
3. Dashboard pages with authentication and interaction history.

The key question is whether consolidation now would improve outcomes more than it would slow near-term shipping.

## Decision
We will keep the current split runtime architecture during MVP:

- Continue using App Router and route handlers for dashboard and webhook/action endpoints.
- Continue using Fastify for phone relay responsibilities.
- Defer consolidation into a single Fastify-first deploy until after MVP-critical iteration goals are met.
- Treat this as intentional, time-boxed technical debt and revisit when coordination overhead exceeds iteration benefit.

## Also considered
### Fastify + React Router
Why we considered it:
- Single runtime/deploy model aligned with existing Fastify relay usage.
- Greater explicit backend control and API-first architecture.

Why we did not choose it now:
- Requires migration work during active MVP delivery.
- Adds immediate implementation churn and risk while core product loops are still being proven.
- Would likely slow short-term iteration despite potential medium-term operational simplification.

### React Router inside current frontend focus
Why we considered it:
- Flexible client routing model.

Why we did not choose it as a replacement:
- Solves frontend routing only, not backend webhook/action runtime needs.
- Still requires a separate backend framework for Twilio/GitHub/Codex server paths.

## Consequences
- Positive:
  - Preserves current momentum and avoids migration risk during MVP.
  - Minimizes glue code for auth, server routes, and page rendering.
- Negative:
  - Maintains two deploys/runtimes in the short term.
  - Creates explicit technical debt around cross-runtime coordination and release management.
  - Some future consolidation work is likely if single-runtime operations become a priority.
- Neutral:
  - Fastify and React Router remain valid future options.
  - Reassess when one or more of the following are true:
    1. Cross-runtime change coordination materially slows releases.
    2. Incident/debug burden repeatedly comes from boundary issues between Next.js and Fastify.
    3. The team prioritizes operational simplicity (single deploy) over raw MVP feature velocity.
