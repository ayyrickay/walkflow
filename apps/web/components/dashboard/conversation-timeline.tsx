import type { ConversationEventRow, ProposalAttemptRow } from "@walkflow/core/types/conversation";

export function ConversationTimeline({
  attempts,
  events
}: {
  attempts: ProposalAttemptRow[];
  events: ConversationEventRow[];
}) {
  return (
    <div>
      <h2>Attempts</h2>
      {attempts.length === 0 ? (
        <p>No attempts yet.</p>
      ) : (
        <ul>
          {attempts.map((attempt) => (
            <li key={attempt.id}>
              {attempt.attemptNumber}. {attempt.title} ({attempt.userDecision})
            </li>
          ))}
        </ul>
      )}

      <h2>Events</h2>
      {events.length === 0 ? (
        <p>No events yet.</p>
      ) : (
        <ul>
          {events.map((event) => (
            <li key={event.id}>
              {event.source}: {event.eventType}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
