import { desc, eq } from "drizzle-orm";

import { InteractionTable } from "@/components/dashboard/interaction-table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { interactions } from "@/lib/db/schema";

export default async function DashboardPage() {
  const user = await requireUser();

  const rows = await db
    .select()
    .from(interactions)
    .where(eq(interactions.userId, user.id))
    .orderBy(desc(interactions.createdAt));

  const statusCounts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <section className="dashboard-shell">
      <header className="dashboard-header">
        <h1>Interaction Dashboard</h1>
        <p>Review captured walk notes, validate intent, and manage automation outcomes.</p>
      </header>

      <div className="dashboard-score-grid">
        <div className="dashboard-score dashboard-score-total col-4">
          <span>Total Interactions</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="dashboard-score col-2">
          <span className="status-pill status-pill-confirmed">confirmed</span>
          <strong>{statusCounts.approved || 0}</strong>
        </div>
        <div className="dashboard-score col-2">
          <span className="status-pill status-pill-review">needs review</span>
          <strong>{statusCounts.needs_review || 0}</strong>
        </div>
        <div className="dashboard-score col-2">
          <span className="status-pill status-pill-completed">completed</span>
          <strong>{statusCounts.completed || 0}</strong>
        </div>
        <div className="dashboard-score col-2">
          <span className="status-pill status-pill-archived">archived</span>
          <strong>{statusCounts.archived || 0}</strong>
        </div>
      </div>

      <InteractionTable interactions={rows} />
    </section>
  );
}
