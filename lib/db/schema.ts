import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  phoneE164: text("phone_e164").unique(),
  phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow()
});

export const repositories = pgTable("repositories", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  provider: text("provider").notNull().default("github"),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  defaultBranch: text("default_branch").notNull().default("main"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow()
});

export const conversations = pgTable("conversations", {
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
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" })
});

export const proposalAttempts = pgTable("proposal_attempts", {
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
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true, mode: "date" })
});

export const actions = pgTable("actions", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  proposalAttemptId: text("proposal_attempt_id").references(() => proposalAttempts.id),
  actionType: text("action_type", { enum: ["github_issue", "github_pr"] }).notNull(),
  providerId: text("provider_id"),
  status: text("status", {
    enum: ["queued", "succeeded", "failed", "skipped"]
  }).notNull().default("queued"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" })
});

export const conversationEvents = pgTable("conversation_events", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  source: text("source", { enum: ["twilio", "agent", "system", "user"] }).notNull(),
  eventType: text("event_type").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow()
});

export const appSettings = pgTable("app_settings", {
  id: text("id").primaryKey().default("default"),
  allowUnmappedCalls: boolean("allow_unmapped_calls").notNull().default(false),
  demoAccountId: text("demo_account_id").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow()
});

export const interactions = pgTable("interactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  status: text("status", {
    enum: ["captured", "proposed", "approved", "needs_review", "archived", "completed"]
  }).notNull().default("captured"),
  transcript: text("transcript").notNull(),
  summary: text("summary").notNull(),
  chosenRepoName: text("chosen_repo_name").notNull(),
  chosenIssueTitle: text("chosen_issue_title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow()
});

export const artifacts = pgTable("artifacts", {
  id: text("id").primaryKey(),
  interactionId: text("interaction_id")
    .notNull()
    .references(() => interactions.id)
    .unique(),
  githubIssueLink: text("github_issue_link"),
  githubPrLink: text("github_pr_link"),
  codeChangesSummary: text("code_changes_summary"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow()
});
