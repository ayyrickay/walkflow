import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  phoneE164: text("phone_e164").unique(),
  phoneVerifiedAt: integer("phone_verified_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`)
});

export const repositories = sqliteTable("repositories", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  provider: text("provider").notNull().default("github"),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  defaultBranch: text("default_branch").notNull().default("main"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`)
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  twilioCallSid: text("twilio_call_sid").unique(),
  fromPhoneE164: text("from_phone_e164").notNull(),
  status: text("status", {
    enum: ["in_progress", "confirmed", "rejected_once", "needs_review", "processed"]
  }).notNull().default("in_progress"),
  resolutionMode: text("resolution_mode", {
    enum: ["mapped_user", "demo_fallback", "unresolved"]
  }).notNull().default("unresolved"),
  rawTranscript: text("raw_transcript"),
  finalSummary: text("final_summary"),
  mappedRepositoryId: text("mapped_repository_id").references(() => repositories.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
  endedAt: integer("ended_at", { mode: "timestamp_ms" })
});

export const proposalAttempts = sqliteTable("proposal_attempts", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  attemptNumber: integer("attempt_number").notNull(),
  proposalType: text("proposal_type", {
    enum: ["issue", "pr", "issue_and_pr"]
  }).notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  patchPreview: text("patch_preview"),
  userDecision: text("user_decision", {
    enum: ["pending", "confirmed", "rejected"]
  }).notNull().default("pending"),
  decisionReason: text("decision_reason"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
  decidedAt: integer("decided_at", { mode: "timestamp_ms" })
});

export const actions = sqliteTable("actions", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  proposalAttemptId: text("proposal_attempt_id").references(() => proposalAttempts.id),
  actionType: text("action_type", { enum: ["github_issue", "github_pr"] }).notNull(),
  providerId: text("provider_id"),
  status: text("status", {
    enum: ["queued", "succeeded", "failed", "skipped"]
  }).notNull().default("queued"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
  completedAt: integer("completed_at", { mode: "timestamp_ms" })
});

export const conversationEvents = sqliteTable("conversation_events", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  source: text("source", { enum: ["twilio", "agent", "system", "user"] }).notNull(),
  eventType: text("event_type").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`)
});

export const appSettings = sqliteTable("app_settings", {
  id: text("id").primaryKey().default("default"),
  allowUnmappedCalls: integer("allow_unmapped_calls", { mode: "boolean" })
    .notNull()
    .default(false),
  demoAccountId: text("demo_account_id").references(() => users.id),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`)
});

export const interactions = sqliteTable("interactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  status: text("status", {
    enum: ["captured", "proposed", "approved", "needs_review", "completed"]
  }).notNull().default("captured"),
  transcript: text("transcript").notNull(),
  summary: text("summary").notNull(),
  chosenRepoName: text("chosen_repo_name").notNull(),
  chosenIssueTitle: text("chosen_issue_title").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`)
});

export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  interactionId: text("interaction_id")
    .notNull()
    .references(() => interactions.id)
    .unique(),
  githubIssueLink: text("github_issue_link"),
  githubPrLink: text("github_pr_link"),
  codeChangesSummary: text("code_changes_summary"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`)
});
