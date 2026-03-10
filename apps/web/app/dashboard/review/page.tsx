import Link from "next/link";
import { and, eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth";
import { db } from "@walkflow/db/client";
import { interactions } from "@walkflow/db/schema";

export default async function ReviewPage() {
  const user = await requireUser();

  const rows = await db
    .select({ id: interactions.id, chosenIssueTitle: interactions.chosenIssueTitle })
    .from(interactions)
    .where(and(eq(interactions.status, "needs_review"), eq(interactions.userId, user.id)));

  return (
    <section>
      <h1>Needs review</h1>
      {rows.length === 0 ? <p>No interactions currently need review.</p> : (
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={`/dashboard/interactions/${row.id}`}>{row.chosenIssueTitle}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
