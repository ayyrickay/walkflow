# WalkFlow MVP Skeleton

Minimal Next.js + TypeScript project scaffold for WalkFlow.

## Included in this skeleton

- App Router structure with login and dashboard pages
- SQLite + Drizzle schema for accounts, conversations, attempts, actions, and settings
- Secure cookie session auth (email/password)
- Conversation and settings API routes
- GitHub read integration for repository suggestions during proposal generation
- GitHub write endpoints restricted to one configured demo repository
- GitHub provider abstraction: direct REST or MCP-backed tool calls
- Twilio voice TwiML + ConversationRelay websocket capture flow (MVP)
- OpenAI-backed proposal generation during live Twilio calls

## Quick start

1. Install dependencies:
   - `npm install`
2. Create env file:
   - `cp .env.example .env`
   - set `OPENAI_API_KEY` in `.env`
   - choose GitHub provider:
     - `GITHUB_PROVIDER=rest` (default): set `GITHUB_READ_TOKEN`; optional `GITHUB_WRITE_TOKEN`
     - `GITHUB_PROVIDER=mcp`: set `GITHUB_MCP_URL` (and optional tool names/tokens)
   - set `GITHUB_WRITE_ALLOWED_REPO=owner/repo` to hard-limit writes to one demo repository
   - optionally set `TWILIO_TEST_CALLER_E164` and `TWILIO_TEST_USER_EMAIL` for local caller mapping tests
3. Create SQLite DB and apply migration:
   - `sqlite3 walkflow.sqlite < drizzle/0001_init.sql`
   - `sqlite3 walkflow.sqlite < drizzle/0002_interactions.sql`
4. Seed fake interactions and create a dev login:
   - `npm run seed`
5. Run the app:
   - `npm run dev`
6. Run the Twilio relay websocket server (separate process):
   - `npm run relay:dev`
7. Point Twilio voice webhook to the relay server URL:
   - `https://<public-host>/api/twilio/voice`

## Dev Login Credentials

After running `npm run seed`, use these credentials at `/login`:

- Email: `demo@walkflow.dev`
- Password: `walkflow-demo-123`

## Checks

- `npm run lint`
- `npm run typecheck`

## Notes

- Call flow uses GitHub read access only to improve repository context. It does not write to GitHub.
- GitHub write APIs exist for web-initiated asynchronous actions and are hard-limited to `GITHUB_WRITE_ALLOWED_REPO`, in both REST and MCP modes.
- MCP mode expects a reachable MCP HTTP endpoint that supports `tools/call`.
- Twilio ConversationRelay uses `TWILIO_CONVERSATION_RELAY_WSS_URL`.
- Voice flow: caller speaks notes, says "done", WalkFlow proposes repo + issue, caller says "confirm" or "reject". A second rejection marks the interaction as `needs_review`.
- Proposal context is updated in place on retries (repo, action type issue/PR, and summary) using the full accumulated conversation notes.
- In production, set `TWILIO_CONVERSATION_RELAY_WSS_URL` to a public `wss://` endpoint backed by a persistent websocket-capable runtime (do not rely on serverless request-only handlers).
- Local fastify relay default is `ws://localhost:8081/twilio/conversation-relay/ws` (`TWILIO_RELAY_HOST`/`TWILIO_RELAY_PORT`).
- The Fastify relay also serves TwiML at `/api/twilio/voice`, so a single tunnel/host can serve both voice webhook and websocket relay.
- Phone verification is stubbed by marking phone as verified at registration for now.
