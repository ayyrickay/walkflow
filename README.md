# WalkFlow

WalkFlow turns a developer phone call into reviewable GitHub work.

Instead of losing ideas during a walk, you call WalkFlow, explain what should change, and get a proposed repo + issue/PR plan. If confidence is low, WalkFlow routes to review instead of automating risky actions.

This repository is the MVP: a phone-first capture flow, proposal generation, safe approval/rejection handling, and a dashboard for review.

## Why This Exists

Great implementation ideas often appear away from the keyboard. WalkFlow captures those ideas at the moment they happen, then converts them into concrete next steps your team can evaluate and ship.

The product promise is simple:

- capture fast from voice,
- structure into actionable work,
- keep uncertain output in `needs_review`.

## What You Can Demo Today

You can run a full local flow:

1. Start the web app and Twilio relay.
2. Receive a call through Twilio.
3. Capture transcript + proposal.
4. Confirm or reject by voice.
5. Review the interaction in the dashboard.

## Getting Started (Local Demo)

### 1) Install dependencies

```bash
npm install
```

### 2) Create your environment file

```bash
cp .env.example .env
```

Then fill in at least:

- `DATABASE_URL` (shared Postgres connection string)
- `OPENAI_API_KEY`
- `AUTH_SECRET`
- `GITHUB_PROVIDER=rest` (default) and `GITHUB_READ_TOKEN`
- `GITHUB_WRITE_ALLOWED_REPO=owner/repo` (required safety guard for writes)

Optional but useful:

- `DATABASE_SSL=true` if your Postgres provider requires TLS
- `GITHUB_WRITE_TOKEN` for issue/PR creation
- `TWILIO_TEST_CALLER_E164` and `TWILIO_TEST_USER_EMAIL` for deterministic caller mapping during local tests

### 3) Run database migrations

```bash
npm run db:migrate
```

### 4) Seed demo data and login

```bash
npm run seed
```

### 5) Run the app and relay (two terminals)

Terminal A:

```bash
npm run dev
```

Terminal B:

```bash
npm run relay:dev
```

### 6) Expose the relay publicly

Twilio must reach your local relay over the public internet. Use a tunnel (for example, ngrok or Cloudflare Tunnel) and note the HTTPS public URL.

### 7) Configure Twilio Voice webhook (required)

In the Twilio Console for your phone number:

- Go to Voice settings
- Set **A call comes in** to **Webhook**
- Method: `POST`
- URL: `https://<your-public-host>/api/twilio/voice`

If this step is skipped, calls will not enter the WalkFlow voice flow.

### 8) Use Walkflow!
Login at `http://localhost:3000/login` with:

- Email: `demo@walkflow.dev`
- Password: `walkflow-demo-123`

Then call in to your Twilio number to test Walkflow!

## Running Tests and Checks

```bash
npm test
npm run lint
npm run typecheck
```

## Implementation Notes

Detailed runtime and architecture notes are intentionally kept outside this README:

- GitHub integration direction: [`decisions/0001-github-integration-api-first.md`](./decisions/0001-github-integration-api-first.md)
- Next.js runtime decision: [`decisions/0002-keep-nextjs-for-mvp.md`](./decisions/0002-keep-nextjs-for-mvp.md)
- Twilio relay runtime and webhook constraints: [`decisions/0003-twilio-relay-runtime-and-webhook.md`](./decisions/0003-twilio-relay-runtime-and-webhook.md)
