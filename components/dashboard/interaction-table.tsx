import Link from "next/link";

import type { InteractionRow } from "@/types/interaction";

function statusLabel(status: string) {
  if (status === "approved") {
    return "confirmed";
  }
  return status.replace(/_/g, " ");
}

function statusClass(status: string) {
  if (status === "completed") {
    return "status-pill-completed";
  }
  if (status === "approved") {
    return "status-pill-confirmed";
  }
  if (status === "archived") {
    return "status-pill-archived";
  }
  if (status === "needs_review") {
    return "status-pill-review";
  }
  return "status-pill-default";
}

function formatCreatedAt(value: Date) {
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(value);

  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(value);

  return { date, time };
}

export function InteractionTable({ interactions }: { interactions: InteractionRow[] }) {
  if (interactions.length === 0) {
    return <p className="dashboard-empty">No interactions yet.</p>;
  }

  return (
    <table className="dashboard-table">
      <thead>
        <tr>
          <th>Status</th>
          <th>Repository</th>
          <th>Work Item</th>
          <th>Created</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {interactions.map((interaction) => {
          const created = formatCreatedAt(new Date(interaction.createdAt));
          return (
            <tr key={interaction.id}>
            <td>
              <span className={`status-pill ${statusClass(interaction.status)}`}>
                {statusLabel(interaction.status)}
              </span>
            </td>
            <td className="repo-cell">
              <code>{interaction.chosenRepoName}</code>
            </td>
            <td>
              <Link href={`/dashboard/interactions/${interaction.id}`} className="dashboard-title-link">
                {interaction.chosenIssueTitle}
              </Link>
            </td>
            <td className="created-cell">
              <span className="created-at">
                <span>{created.date}</span>
                <span>{created.time}</span>
              </span>
            </td>
            <td>
              <Link href={`/dashboard/interactions/${interaction.id}`} className="artifact-link-button">
                Open
              </Link>
            </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
