CREATE TABLE `interactions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `status` text DEFAULT 'captured' NOT NULL,
  `transcript` text NOT NULL,
  `summary` text NOT NULL,
  `chosen_repo_name` text NOT NULL,
  `chosen_issue_title` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);

CREATE TABLE `artifacts` (
  `id` text PRIMARY KEY NOT NULL,
  `interaction_id` text NOT NULL,
  `github_issue_link` text,
  `github_pr_link` text,
  `code_changes_summary` text,
  `created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
  FOREIGN KEY (`interaction_id`) REFERENCES `interactions`(`id`)
);

CREATE UNIQUE INDEX `artifacts_interaction_id_unique` ON `artifacts` (`interaction_id`);
