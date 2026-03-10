import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/lib/db/schema";

const databaseUrl = process.env.DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:5432/walkflow";

const sslEnabled = (process.env.DATABASE_SSL || "").trim().toLowerCase() === "true";
const client = new Pool({
  connectionString: databaseUrl,
  ssl: sslEnabled ? { rejectUnauthorized: false } : undefined
});

export const db = drizzle(client, { schema });
