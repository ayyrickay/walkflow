CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `name` text,
  `password_hash` text NOT NULL,
  `phone_e164` text,
  `phone_verified_at` integer,
  `created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);

CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
CREATE UNIQUE INDEX `users_phone_e164_unique` ON `users` (`phone_e164`);

CREATE TABLE `repositories` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `provider` text DEFAULT 'github' NOT NULL,
  `owner` text NOT NULL,
  `name` text NOT NULL,
  `default_branch` text DEFAULT 'main' NOT NULL,
  `is_active` integer DEFAULT true NOT NULL,
  `created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);

CREATE TABLE `conversations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text,
  `twilio_call_sid` text,
  `from_phone_e164` text NOT NULL,
  `status` text DEFAULT 'in_progress' NOT NULL,
  `resolution_mode` text DEFAULT 'unresolved' NOT NULL,
  `raw_transcript` text,
  `final_summary` text,
  `mapped_repository_id` text,
  `created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
  `ended_at` integer,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  FOREIGN KEY (`mapped_repository_id`) REFERENCES `repositories`(`id`)
);

CREATE UNIQUE INDEX `conversations_twilio_call_sid_unique` ON `conversations` (`twilio_call_sid`);

CREATE TABLE `proposal_attempts` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL,
  `attempt_number` integer NOT NULL,
  `proposal_type` text NOT NULL,
  `title` text NOT NULL,
  `body` text NOT NULL,
  `patch_preview` text,
  `user_decision` text DEFAULT 'pending' NOT NULL,
  `decision_reason` text,
  `created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
  `decided_at` integer,
  FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`)
);

CREATE TABLE `actions` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL,
  `proposal_attempt_id` text,
  `action_type` text NOT NULL,
  `provider_id` text,
  `status` text DEFAULT 'queued' NOT NULL,
  `error_message` text,
  `created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
  `completed_at` integer,
  FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`),
  FOREIGN KEY (`proposal_attempt_id`) REFERENCES `proposal_attempts`(`id`)
);

CREATE TABLE `conversation_events` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL,
  `source` text NOT NULL,
  `event_type` text NOT NULL,
  `payload_json` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
  FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`)
);

CREATE TABLE `app_settings` (
  `id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
  `allow_unmapped_calls` integer DEFAULT false NOT NULL,
  `demo_account_id` text,
  `updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
  FOREIGN KEY (`demo_account_id`) REFERENCES `users`(`id`)
);
