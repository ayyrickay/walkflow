# DR-0005: Use Deterministic Relay Prompts with AI-Generated Proposals

Date: 2026-03-10  
Status: Accepted

## Context

WalkFlow's phone experience needs to feel reliable enough for a live demo and simple enough to debug from transcripts.

In practice, fully AI-authored relay conversations created several problems:

- the agent drifted between slightly different phrasings for the same state
- silence handling was hard to reason about and harder to debug
- confirmation prompts repeated in inconsistent ways
- retry flows became chaotic because the model improvised instead of following a tight state machine
- bad transcripts were difficult to analyze because it was unclear whether the failure came from state handling or from prompt variation

The product requirement for the MVP is not open-ended conversational richness. The requirement is a safe, understandable phone flow:

1. capture the caller's request
2. generate a useful repo-aware summary
3. ask the caller to confirm or reject it
4. route uncertain outcomes to review

That means the highest-value AI work is not conversational phrasing. The highest-value AI work is converting a rough spoken request into a structured proposal:

- repository
- action type
- issue or PR title
- summary

The relay runtime itself is also safety-sensitive. Unclear conversational behavior should not make the state machine harder to verify.

## Decision

For the live phone relay, WalkFlow will use deterministic scripted prompts for the conversation flow and use AI only to generate the structured proposal content.

Deterministic relay prompts include:

- greeting
- silence interruption prompts
- "let me summarize that" processing prompt
- proposal readout wrapper
- confirmation prompt
- retry prompt
- approval closeout
- review closeout

AI remains responsible for proposal generation, specifically:

- selecting the most appropriate repository from the allowed candidates
- deciding between issue and pull request
- producing a concise work item title
- producing a concise summary from the caller transcript

Intent handling may use deterministic matching when possible, especially for confirm, reject, done, and finish-style decisions in the live relay path.

This decision should be revisited only if WalkFlow moves beyond MVP and has enough transcript quality, observability, and evaluation coverage to support more open-ended AI-authored live conversations safely.

## Also considered

### Fully AI-authored live conversation

We tried letting the model generate most relay utterances in real time.

We did not choose this because it introduced too much behavioral variance for the current product stage. The result was harder to debug, harder to test against scenario expectations, and too easy to regress.

### Fully deterministic conversation and fully deterministic proposal generation

We considered keeping everything rule-based, including repo selection and summary generation.

We did not choose this because the caller input is messy speech. AI adds real value in turning that speech into useful structured repo work, especially when the transcript is imperfect.

### Rolling the relay all the way back to an older commit

We considered reverting to a much earlier relay implementation that was simpler and easier to reason about.

We did not choose that as the primary design decision because some of the newer architecture is still useful. The better outcome is not "go back entirely"; it is "keep the structured AI work, remove conversational improvisation."

## Consequences

- Positive:
  - The call flow becomes easier to reason about from transcripts.
  - Relay behavior is more stable across demo runs.
  - State-machine bugs are easier to separate from proposal-generation bugs.
  - Prompt drift is reduced because only the proposal payload is AI-authored.
  - The system better matches the desired MVP conversation shape: summarize, confirm or reject, then act.

- Negative:
  - The live conversation may feel less natural or less expressive than a fully AI-authored assistant.
  - Deterministic prompts can feel repetitive if the flow is overused.
  - Some nuance in caller intent may be lost if deterministic matching is too rigid.

- Neutral:
  - AI is still required for the parts of the workflow where it provides the most leverage.
  - Future versions can still expand conversational flexibility once the relay state machine is better instrumented and better evaluated.

Follow-up work:

- Keep the scenario asset in `docs/voice-relay-scenarios.md` aligned with relay behavior.
- Add lightweight flow-level checks around silence interruption, reject-twice review routing, and revised-summary behavior.
- Continue improving transcript quality and observability before expanding the AI-authored surface area again.
