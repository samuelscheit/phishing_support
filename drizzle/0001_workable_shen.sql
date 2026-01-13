PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_analysis_runs` (
	`id` INTEGER PRIMARY KEY NOT NULL,
	`submission_id` INTEGER NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`input` text,
	`output` text,
	`tokens_used` integer,
	`data` text,
	`created_at` INTEGER DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_analysis_runs`("id", "submission_id", "status", "input", "output", "tokens_used", "data", "created_at") SELECT "id", "submission_id", "status", "input", "output", "tokens_used", "data", "created_at" FROM `analysis_runs`;--> statement-breakpoint
DROP TABLE `analysis_runs`;--> statement-breakpoint
ALTER TABLE `__new_analysis_runs` RENAME TO `analysis_runs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_artifacts` (
	`id` INTEGER PRIMARY KEY NOT NULL,
	`submission_id` INTEGER,
	`name` text,
	`kind` text NOT NULL,
	`created_at` INTEGER DEFAULT (unixepoch() * 1000) NOT NULL,
	`mime_type` text,
	`sha256` text,
	`size` integer,
	`blob` blob NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_artifacts`("id", "submission_id", "name", "kind", "created_at", "mime_type", "sha256", "size", "blob") SELECT "id", "submission_id", "name", "kind", "created_at", "mime_type", "sha256", "size", "blob" FROM `artifacts`;--> statement-breakpoint
DROP TABLE `artifacts`;--> statement-breakpoint
ALTER TABLE `__new_artifacts` RENAME TO `artifacts`;--> statement-breakpoint
CREATE INDEX `artifacts_submission_kind_created_idx` ON `artifacts` (`submission_id`,`kind`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `artifacts_sha256_size_unique` ON `artifacts` (`sha256`,`size`);--> statement-breakpoint
CREATE TABLE `__new_reports` (
	`id` INTEGER PRIMARY KEY NOT NULL,
	`submission_id` INTEGER NOT NULL,
	`analysis_run_id` INTEGER,
	`channel` text DEFAULT 'email' NOT NULL,
	`to` text NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`status` text DEFAULT 'sent' NOT NULL,
	`sent_at` integer,
	`provider_message_id` text,
	`attachments_artifact_ids` text,
	`data` text,
	`created_at` INTEGER DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` INTEGER DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`analysis_run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_reports`("id", "submission_id", "analysis_run_id", "channel", "to", "subject", "body", "status", "sent_at", "provider_message_id", "attachments_artifact_ids", "data", "created_at", "updated_at") SELECT "id", "submission_id", "analysis_run_id", "channel", "to", "subject", "body", "status", "sent_at", "provider_message_id", "attachments_artifact_ids", "data", "created_at", "updated_at" FROM `reports`;--> statement-breakpoint
DROP TABLE `reports`;--> statement-breakpoint
ALTER TABLE `__new_reports` RENAME TO `reports`;--> statement-breakpoint
CREATE INDEX `reports_submission_created_idx` ON `reports` (`submission_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_to_created_idx` ON `reports` (`to`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_status_created_idx` ON `reports` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_submissions` (
	`id` INTEGER PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`source` text,
	`data` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`info` text,
	`created_at` INTEGER DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` INTEGER DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_submissions`("id", "kind", "source", "data", "dedupe_key", "status", "info", "created_at", "updated_at") SELECT "id", "kind", "source", "data", "dedupe_key", "status", "info", "created_at", "updated_at" FROM `submissions`;--> statement-breakpoint
DROP TABLE `submissions`;--> statement-breakpoint
ALTER TABLE `__new_submissions` RENAME TO `submissions`;--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_dedupe_key_unique` ON `submissions` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `submissions_kind_received_at_idx` ON `submissions` (`kind`);--> statement-breakpoint
CREATE INDEX `submissions_status_received_at_idx` ON `submissions` (`status`);--> statement-breakpoint
CREATE INDEX `submissions_source_idx` ON `submissions` (`source`);