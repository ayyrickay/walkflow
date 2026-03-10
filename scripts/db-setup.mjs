import { Pool } from "pg";

import { seedDemoData } from "./seed.mjs";

const databaseUrl = process.env.DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:5432/walkflow";
const sslEnabled = (process.env.DATABASE_SSL || "").trim().toLowerCase() === "true";

if (databaseUrl.startsWith("file:")) {
  throw new Error("DATABASE_URL must be a Postgres connection string. Replace any old SQLite-style value like file:./walkflow.sqlite.");
}

const bootstrapSql = `
  CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY NOT NULL,
    email text NOT NULL,
    name text,
    password_hash text NOT NULL,
    phone_e164 text,
    phone_verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email);
  CREATE UNIQUE INDEX IF NOT EXISTS users_phone_e164_unique ON users (phone_e164);

  CREATE TABLE IF NOT EXISTS repositories (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL REFERENCES users(id),
    provider text DEFAULT 'github' NOT NULL,
    owner text NOT NULL,
    name text NOT NULL,
    default_branch text DEFAULT 'main' NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id text PRIMARY KEY NOT NULL,
    user_id text REFERENCES users(id),
    twilio_call_sid text,
    from_phone_e164 text NOT NULL,
    status text DEFAULT 'in_progress' NOT NULL,
    resolution_mode text DEFAULT 'unresolved' NOT NULL,
    raw_transcript text,
    final_summary text,
    mapped_repository_id text REFERENCES repositories(id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone
  );

  CREATE UNIQUE INDEX IF NOT EXISTS conversations_twilio_call_sid_unique ON conversations (twilio_call_sid);

  CREATE TABLE IF NOT EXISTS proposal_attempts (
    id text PRIMARY KEY NOT NULL,
    conversation_id text NOT NULL REFERENCES conversations(id),
    attempt_number integer NOT NULL,
    proposal_type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    patch_preview text,
    user_decision text DEFAULT 'pending' NOT NULL,
    decision_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone
  );

  CREATE TABLE IF NOT EXISTS actions (
    id text PRIMARY KEY NOT NULL,
    conversation_id text NOT NULL REFERENCES conversations(id),
    proposal_attempt_id text REFERENCES proposal_attempts(id),
    action_type text NOT NULL,
    provider_id text,
    status text DEFAULT 'queued' NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
  );

  CREATE TABLE IF NOT EXISTS conversation_events (
    id text PRIMARY KEY NOT NULL,
    conversation_id text NOT NULL REFERENCES conversations(id),
    source text NOT NULL,
    event_type text NOT NULL,
    payload_json text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    id text PRIMARY KEY DEFAULT 'default' NOT NULL,
    allow_unmapped_calls boolean DEFAULT false NOT NULL,
    demo_account_id text REFERENCES users(id),
    updated_at timestamp with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS interactions (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL REFERENCES users(id),
    status text DEFAULT 'captured' NOT NULL,
    transcript text NOT NULL,
    summary text NOT NULL,
    chosen_repo_name text NOT NULL,
    chosen_issue_title text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS artifacts (
    id text PRIMARY KEY NOT NULL,
    interaction_id text NOT NULL REFERENCES interactions(id),
    github_issue_link text,
    github_pr_link text,
    code_changes_summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS artifacts_interaction_id_unique ON artifacts (interaction_id);
`;

async function bootstrapSchema(pool) {
  await pool.query(bootstrapSql);
}

async function main() {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: sslEnabled ? { rejectUnauthorized: false } : undefined
  });

  try {
    console.log("Applying database schema...");
    await bootstrapSchema(pool);
  } finally {
    await pool.end();
  }

  console.log("Seeding demo data...");
  await seedDemoData();
  console.log("Database is ready for local demo use.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
