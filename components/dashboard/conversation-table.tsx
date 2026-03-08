import Link from "next/link";

import type { ConversationRow } from "@/types/conversation";

export function ConversationTable({ conversations }: { conversations: ConversationRow[] }) {
  if (conversations.length === 0) {
    return <p>No conversations yet.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Status</th>
          <th>From</th>
          <th>Mode</th>
        </tr>
      </thead>
      <tbody>
        {conversations.map((conversation) => (
          <tr key={conversation.id}>
            <td>
              <Link href={`/dashboard/calls/${conversation.id}`}>{conversation.id}</Link>
            </td>
            <td>{conversation.status}</td>
            <td>{conversation.fromPhoneE164}</td>
            <td>{conversation.resolutionMode}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
