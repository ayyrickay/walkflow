CREATE TABLE "interactions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "status" text DEFAULT 'captured' NOT NULL,
  "transcript" text NOT NULL,
  "summary" text NOT NULL,
  "chosen_repo_name" text NOT NULL,
  "chosen_issue_title" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "artifacts" (
  "id" text PRIMARY KEY NOT NULL,
  "interaction_id" text NOT NULL REFERENCES "interactions"("id"),
  "github_issue_link" text,
  "github_pr_link" text,
  "code_changes_summary" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "artifacts_interaction_id_unique" ON "artifacts" ("interaction_id");
