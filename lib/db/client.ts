import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "@/lib/db/schema";

const databaseUrl = process.env.DATABASE_URL || "file:./walkflow.sqlite";
const client = createClient({ url: databaseUrl });

export const db = drizzle(client, { schema });
