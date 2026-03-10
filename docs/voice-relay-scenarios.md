# Voice Relay Scenarios

These scenarios are the baseline for reasoning about the live phone experience.
They are intentionally plain-language and easy to review.

Use them when changing:
- relay silence timing
- summary wording
- confirmation and rejection behavior
- AI prompt instructions for live calls

## Operating Assumptions

- For MVP, any meaningful caller content is enough to justify a summary if the caller then goes silent.
- Silence should trigger the same behavior after an initial request and after a correction during retry.
- The silence threshold should feel fast. Three seconds is likely an upper bound, not a target.
- A call should not be auto-approved without an explicit or clearly implied confirmation.
- "Bye" or similar ending language only counts as confirmation if it happens after the agent has already presented the summary and the interaction is clearly satisfactory.
- If the call ends without explicit or clearly implied confirmation, default to review.

## Scenario 1: Happy Path, Perfect Match

Goal: caller states a clear request, agent produces the right summary, caller confirms.

Caller:
"Hey, I want a PR in `ayyrickay/walkflow-test` that adds a simple FizzBuzz example."

Expected relay behavior:
1. Agent listens without unnecessary interruption.
2. After the caller pauses, agent says it is summarizing.
3. Agent reads one concise proposal summary.
4. Agent ends with: "Please confirm or reject this summary."
5. Caller says "Confirm."
6. Agent marks the interaction approved and ends the call cleanly.

Good example transcript:

Agent:
"I'm listening. Talk it through."

Caller:
"Hey, I want a PR in `ayyrickay/walkflow-test` that adds a simple FizzBuzz example."

Agent:
"Let me summarize that."

Agent:
"I'd put this in `ayyrickay/walkflow-test` as a pull request: Add FizzBuzz example. Add a simple FizzBuzz sample implementation for demo purposes. Please confirm or reject this summary."

Caller:
"Confirm."

Agent:
"Approved. I'll queue the follow-up and let you go."

Notes:
- No extra branching into "want more detail?" after the caller is already done.
- No duplicate summary readouts.
- No second guessing after a clear confirm.
- For MVP, even one clear caller sentence is enough to trigger the summary path after silence.

## Scenario 2: Review Path, Reject Twice

Goal: caller rejects the proposal twice, so the system safely sends it to review.

Caller:
"I want a PR for the auth retry fix in `walkflow/web`."

Expected relay behavior:
1. Agent summarizes the request once.
2. Agent asks the caller to confirm or reject the summary.
3. Caller rejects.
4. Agent asks what should change.
5. Caller rejects again or makes it clear the proposal is still wrong.
6. Agent marks the interaction `needs_review`.
7. Agent clearly says nothing will be automated.

Good example transcript:

Caller:
"I want a PR for the auth retry fix in `walkflow/web`."

Agent:
"Let me summarize that."

Agent:
"I'd put this in `walkflow/web` as a pull request: Fix auth retry flow. Tighten the retry behavior in the auth flow so failures recover cleanly. Please confirm or reject this summary."

Caller:
"Reject."

Agent:
"What should I change? You can add context or name a different repo."

Caller:
"Reject. This still isn't right."

Agent:
"Understood. I marked it for review, so nothing will run automatically."

Notes:
- The second rejection should not loop back into another speculative summary.
- The safe default is review, not more automation.
- If the caller hangs up or the call ends before a clear confirm, this should also land in review.

## Scenario 3: Reject Then Confirm

Goal: caller rejects the first summary, provides a correction, then confirms the revised summary.

Caller:
"I want a PR for a coin-change example in `ayyrickay/walkflow-test`."

Expected relay behavior:
1. Agent reads the first summary.
2. Caller rejects because the title, repo, or scope is wrong.
3. Agent asks what to change.
4. Caller gives one correction.
5. After the caller pauses again, agent produces one updated summary.
6. Agent asks: "Please confirm or reject this summary."
7. Caller confirms.
8. Agent approves and ends the call.

Good example transcript:

Caller:
"I want a PR for a coin-change example in `ayyrickay/walkflow-test`."

Agent:
"Let me summarize that."

Agent:
"I'd put this in `ayyrickay/walkflow-test` as a pull request: Add coin change example. Add a sample dynamic programming solution for coin change. Please confirm or reject this summary."

Caller:
"Reject. Make it ways to make 100 cents."

Agent:
"What should I change? You can add context or name a different repo."

Caller:
"The scope should be ways to make 100 cents."

Agent:
"Let me summarize that."

Agent:
"I'd put this in `ayyrickay/walkflow-test` as a pull request: Add coin change ways-to-make-100-cents example. Add a sample dynamic programming solution for counting ways to make 100 cents. Please confirm or reject this summary."

Caller:
"Confirm."

Agent:
"Approved. I'll queue the follow-up and let you go."

Notes:
- The updated summary should incorporate the correction once.
- The relay should not drift into open-ended brainstorming between reject and confirm.
- Silence after the correction should trigger the revised summary automatically.

## Scenario 4: Satisfied Goodbye Counts as Confirmation

Goal: caller hears the summary, is satisfied, and ends the call in a way that clearly implies approval.

Caller:
"I want a PR in `ayyrickay/walkflow-test` that adds a simple FizzBuzz example."

Expected relay behavior:
1. Agent reads the summary.
2. Agent asks the caller to confirm or reject the summary.
3. Caller responds with a satisfied ending like "Perfect, bye."
4. Agent treats that as confirmation and closes the call cleanly.

Good example transcript:

Caller:
"I want a PR in `ayyrickay/walkflow-test` that adds a simple FizzBuzz example."

Agent:
"Let me summarize that."

Agent:
"I'd put this in `ayyrickay/walkflow-test` as a pull request: Add FizzBuzz example. Add a simple FizzBuzz sample implementation for demo purposes. Please confirm or reject this summary."

Caller:
"Perfect, bye."

Agent:
"Approved. I'll queue the follow-up and let you go."

Notes:
- This only applies after the summary has been read.
- "Bye" before the summary, or a dropped call, should not count as confirmation.

## Anti-Patterns

These are signs the relay behavior is off:

- The agent asks "do you want more details or a summary?" after the caller already finished describing the task.
- The agent reads multiple summaries back-to-back without new caller input.
- The agent keeps talking after silence because it re-triggered its own silence prompt.
- The agent asks for confirmation in multiple different ways in the same call.
- The agent treats "confirm" as ambiguous after it already asked for confirm-or-reject.
- The agent treats an early hangup or stray "bye" as approval before the summary has been accepted.

## Design Rule

Once the caller has provided enough content for a proposal, the relay should collapse into a constrained state machine:

1. Summarize
2. Ask for confirm or reject
3. Apply the caller's answer

That should be the default shape of the conversation.

For MVP, "enough content" can be a single clear request.
