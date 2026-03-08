import Link from "next/link";

import type { InteractionRow } from "@/types/interaction";

export function InteractionTable({ interactions }: { interactions: InteractionRow[] }) {
  if (interactions.length === 0) {
    return <p>No interactions yet.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Status</th>
          <th>Repository</th>
          <th>Issue Title</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        {interactions.map((interaction) => (
          <tr key={interaction.id}>
            <td>{interaction.status}</td>
            <td>{interaction.chosenRepoName}</td>
            <td>
              <Link href={`/dashboard/interactions/${interaction.id}`}>{interaction.chosenIssueTitle}</Link>
            </td>
            <td>{new Date(interaction.createdAt).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
