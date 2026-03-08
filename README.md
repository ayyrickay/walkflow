# WalkFlow MVP Skeleton

Minimal Next.js + TypeScript project scaffold for WalkFlow.

## Included in this skeleton

- App Router structure with login and dashboard pages
- SQLite + Drizzle schema for accounts, conversations, attempts, actions, and settings
- Secure cookie session auth (email/password)
- Conversation and settings API routes
- GitHub endpoints stubbed with `501 Not Implemented`
- Twilio voice TwiML + ConversationRelay websocket capture flow (MVP)

## Quick start

1. Install dependencies:
   - `npm install`
2. Create env file:
   - `cp .env.example .env`
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

- GitHub issue/PR creation is intentionally not implemented yet.
- Twilio ConversationRelay uses `TWILIO_CONVERSATION_RELAY_WSS_URL`.
- In production, set `TWILIO_CONVERSATION_RELAY_WSS_URL` to a public `wss://` endpoint backed by a persistent websocket-capable runtime (do not rely on serverless request-only handlers).
- Local fastify relay default is `ws://localhost:8081/twilio/conversation-relay/ws` (`TWILIO_RELAY_HOST`/`TWILIO_RELAY_PORT`).
- The Fastify relay also serves TwiML at `/api/twilio/voice`, so a single tunnel/host can serve both voice webhook and websocket relay.
- Phone verification is stubbed by marking phone as verified at registration for now.
