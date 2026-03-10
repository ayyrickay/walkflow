# DR-0004: Use a Shared Managed Database for Render Deployment

Date: 2026-03-09  
Status: Accepted

## Context
WalkFlow currently runs two runtimes for the MVP:

1. `walkflow-web` (Next.js app routes and dashboard)
2. `walkflow-relay` (Fastify Twilio ConversationRelay websocket runtime)

Both runtimes read and write the same application data. Local development uses SQLite (`file:./walkflow.sqlite`), which works because both processes run on the same machine and can access the same file.

For Render deployment, persistent disks cannot be shared across multiple services. This creates a production mismatch if we keep file-backed SQLite, because `walkflow-web` and `walkflow-relay` would not have shared DB state.

## Decision
For Render deployment, move from local file-backed SQLite to a shared managed database that both services can connect to with one `DATABASE_URL`.

- Create one managed database resource (Render Postgres or equivalent shared DB).
- Keep two app services (`walkflow-web` and `walkflow-relay`).
- Point both services at the same shared `DATABASE_URL`.
- Treat this as required for production deployment on Render.

This does not require a third app process, but it does require a separate managed database resource.

## Also considered
### Keep SQLite on a Render disk attached to one service
Why we considered it:
- Minimal short-term code churn.

Why we did not choose it:
- Disk is single-service, so the second service cannot share state.
- Breaks call-to-dashboard consistency because relay and web would diverge.

### Collapse web and relay into one service to keep SQLite
Why we considered it:
- Could keep a single attached disk.

Why we did not choose it now:
- Requires runtime consolidation work before deployment.
- Adds risk and scope during near-term deployment hardening.

## Consequences
- Positive:
  - Shared, consistent state between Twilio relay and dashboard services.
  - Render deployment model matches runtime architecture.
  - Easier operational growth than file-backed local DB.
- Negative:
  - Requires DB migration work (schema dialect, migrations, env updates).
  - Adds managed database cost and operational setup.
- Neutral:
  - Local SQLite can still be used for development if desired.
  - MVP service split remains unchanged; only persistence topology changes.
