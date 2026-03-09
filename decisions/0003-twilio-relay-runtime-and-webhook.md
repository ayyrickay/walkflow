# DR-0003: Use a Persistent Websocket Relay Runtime for Twilio ConversationRelay

Date: 2026-03-09

## Context

WalkFlow's phone flow relies on Twilio ConversationRelay, which requires a stable websocket endpoint. In local and production environments, webhook and websocket paths must remain reachable for the life of the call session.

If this runtime is misconfigured, callers can connect to Twilio but never reach the application proposal flow.

## Decision

For MVP, run Twilio voice handling through a persistent Fastify relay process that serves:

- TwiML voice webhook at `/api/twilio/voice`
- ConversationRelay websocket at `/twilio/conversation-relay/ws`

Use a public host or tunnel so Twilio can reach `/api/twilio/voice`, and set `TWILIO_CONVERSATION_RELAY_WSS_URL` when explicit websocket routing is needed.

## Also considered

### Next.js-only request/response handlers for the full phone path

This is simpler to reason about but does not provide a reliable persistent websocket runtime for ConversationRelay in all deployment targets.

### Serverless-only phone runtime

This reduces ops overhead but can introduce lifecycle and connection constraints that are risky for long-lived call sessions.

## Consequences

- Local development requires two running processes (`npm run dev` and `npm run relay:dev`).
- Twilio number configuration must point to a publicly reachable `/api/twilio/voice` endpoint.
- Production deployments must use infrastructure that supports durable websocket connections.
- Readme can stay short and demo-focused while deep relay requirements live in this decision record.
