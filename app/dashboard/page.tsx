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

  return (
    <section>
      <h1>Interaction Dashboard</h1>
      <p>Review captured walking interactions and approve or hold actions.</p>
      <InteractionTable interactions={rows} />
    </section>
  );
}
