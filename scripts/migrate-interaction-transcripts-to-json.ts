import { eq } from "drizzle-orm";

import { db } from "../lib/db/client";
import { interactions } from "../lib/db/schema";
import { parseTranscriptTurns, serializeTranscriptTurns } from "../lib/transcript";

async function main() {
  const rows = await db.select({ id: interactions.id, transcript: interactions.transcript }).from(interactions);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const turns = parseTranscriptTurns(row.transcript);
    const serialized = serializeTranscriptTurns(turns);

    if (row.transcript === serialized) {
      skipped += 1;
      continue;
    }

    await db
      .update(interactions)
      .set({
        transcript: serialized,
        updatedAt: new Date()
      })
      .where(eq(interactions.id, row.id));

    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        total: rows.length,
        updated,
        skipped
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
