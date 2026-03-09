# AGENTS.md

## Product Overview
WalkFlow is a phone-first app for capturing developer thoughts while walking, then turning them into actionable repo work.

The MVP flow:
1. Developer calls WalkFlow
2. Agent captures transcript and proposes a repo + issue/PR idea
3. Developer confirms or rejects by voice
4. If confirmed, interaction is stored and queued for post-call action
5. If rejected twice, interaction is marked `Needs Review` (no automated GitHub action)
6. Web dashboard shows interaction history, status, details, and review actions

## MVP Goals
- Prove the end-to-end loop from phone capture to reviewable artifact
- Keep implementation simple, reliable, and demo-ready
- Preserve safe behavior: uncertain interactions go to review, not auto-action

## In Scope (MVP)
- Phone number based account mapping (`1 phone number -> 1 account`)
- Demo fallback mode for unmapped callers (toggleable)
- Interaction persistence with transcript, summary, chosen repo/issue
- Artifacts persistence (issue link, PR link, code change summary)
- Dashboard list + detail review pages
- Basic secure login for web UI
- Post-call processing hooks (can be stubbed behind clear interfaces)

## Out of Scope (for now)
- Multi-tenant org permissions
- Full production call orchestration reliability features
- Advanced analytics/reporting
- Complex UI styling/polish beyond readability

## Core User Stories
1. As a developer, I can call WalkFlow and describe a coding thought hands-free.
2. As a developer, I hear a proposed repo + issue/PR summary and can confirm or reject it.
3. As a developer, if I reject a proposal once, WalkFlow asks for more context and retries.
4. As a developer, if I reject again, WalkFlow marks the interaction `Needs Review` and makes no repo changes.
5. As a reviewer, I can open the dashboard and quickly see interaction status and proposed work.
6. As a reviewer, I can open one interaction detail page and approve, hold, or complete it.
7. As a demo operator, I can enable unmapped-caller demo mode so callers without linked accounts still work.

## Interaction Status Rules
- `captured`: call/transcript stored
- `proposed`: proposal generated
- `approved`: user/reviewer approved action
- `needs_review`: rejected twice or unresolved
- `completed`: downstream action finished

Never auto-complete uncertain interactions.

## Technical Direction
- Next.js + TypeScript (App Router)
- SQLite-first persistence
- Server routes for webhooks and actions
- Integration wrappers isolated (Twilio, GitHub, Codex) for easy mocking

## Coding Rules
- Keep files small and explicit
- Prefer typed utility functions for matching/scoring/state transitions
- Add tests for non-trivial routing, matching, and state-machine logic
- Use clear UI labels (repo/issue title), avoid raw internal IDs except debug views

## Sessions
| Session | Label | Resume Command |
| --- | --- | --- |
| 1 | App Scaffolding Session | `codex resume 019ccb16-2986-76d3-97f6-51ddd79d1b3b` |
| 2 | Twilio Working Milestone | `codex resume 019ccb5b-10f7-7db0-8071-7ff072aa6c47` |
| 3 | OpenAI Call Intelligence Session | `codex resume 019cccf5-1752-7932-bbb7-0aee380036fe` |
| 4 | GitHub Access Mapping Session | `codex resume 019ccf1b-a31f-7cd2-a9b0-cba43d0d8434` |
| 5 | Issue Creation Logic Working Session | `codex resume 019ccf95-bc1e-7643-bed1-71ae5e25bd93` |
| 6 | PR Generation with Codex Session | `codex resume 019ccfcd-ec19-7730-b935-fe3bc79cdf13` |
| 7 | UI Edits Session | `codex resume 019ccffa-ca8f-7822-9b92-012763290932` |
