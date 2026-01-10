CREATE TABLE `analysis_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`submission_id` integer NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`input` text,
	`output` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`submission_id` integer,
	`name` text,
	`kind` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`mime_type` text,
	`sha256` text,
	`size` integer,
	`blob` blob NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `artifacts_submission_kind_created_idx` ON `artifacts` (`submission_id`,`kind`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `artifacts_sha256_size_unique` ON `artifacts` (`sha256`,`size`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`submission_id` integer NOT NULL,
	`analysis_run_id` integer,
	`channel` text DEFAULT 'email' NOT NULL,
	`to` text NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`sent_at` integer,
	`provider_message_id` text,
	`attachments_artifact_ids` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`analysis_run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `reports_submission_created_idx` ON `reports` (`submission_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_to_created_idx` ON `reports` (`to`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_status_created_idx` ON `reports` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`source` text,
	`data` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`info` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_dedupe_key_unique` ON `submissions` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `submissions_kind_received_at_idx` ON `submissions` (`kind`);--> statement-breakpoint
CREATE INDEX `submissions_status_received_at_idx` ON `submissions` (`status`);