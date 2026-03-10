CREATE TABLE "users" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "name" text,
  "password_hash" text NOT NULL,
  "phone_e164" text,
  "phone_verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "users_email_unique" ON "users" ("email");
CREATE UNIQUE INDEX "users_phone_e164_unique" ON "users" ("phone_e164");

CREATE TABLE "repositories" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "provider" text DEFAULT 'github' NOT NULL,
  "owner" text NOT NULL,
  "name" text NOT NULL,
  "default_branch" text DEFAULT 'main' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "conversations" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text REFERENCES "users"("id"),
  "twilio_call_sid" text,
  "from_phone_e164" text NOT NULL,
  "status" text DEFAULT 'in_progress' NOT NULL,
  "resolution_mode" text DEFAULT 'unresolved' NOT NULL,
  "raw_transcript" text,
  "final_summary" text,
  "mapped_repository_id" text REFERENCES "repositories"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ended_at" timestamp with time zone
);

CREATE UNIQUE INDEX "conversations_twilio_call_sid_unique" ON "conversations" ("twilio_call_sid");

CREATE TABLE "proposal_attempts" (
  "id" text PRIMARY KEY NOT NULL,
  "conversation_id" text NOT NULL REFERENCES "conversations"("id"),
  "attempt_number" integer NOT NULL,
  "proposal_type" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "patch_preview" text,
  "user_decision" text DEFAULT 'pending' NOT NULL,
  "decision_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "decided_at" timestamp with time zone
);

CREATE TABLE "actions" (
  "id" text PRIMARY KEY NOT NULL,
  "conversation_id" text NOT NULL REFERENCES "conversations"("id"),
  "proposal_attempt_id" text REFERENCES "proposal_attempts"("id"),
  "action_type" text NOT NULL,
  "provider_id" text,
  "status" text DEFAULT 'queued' NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

CREATE TABLE "conversation_events" (
  "id" text PRIMARY KEY NOT NULL,
  "conversation_id" text NOT NULL REFERENCES "conversations"("id"),
  "source" text NOT NULL,
  "event_type" text NOT NULL,
  "payload_json" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "app_settings" (
  "id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
  "allow_unmapped_calls" boolean DEFAULT false NOT NULL,
  "demo_account_id" text REFERENCES "users"("id"),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
