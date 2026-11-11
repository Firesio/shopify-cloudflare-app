CREATE TABLE `support_blocked_senders` (
	`pattern` text PRIMARY KEY NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `support_quarantine` (
	`id` text PRIMARY KEY NOT NULL,
	`external_id` text NOT NULL,
	`source` text NOT NULL,
	`reason` text NOT NULL,
	`sender_email` text NOT NULL,
	`sender_name` text NOT NULL,
	`shop_hint` text,
	`shop_name` text,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `support_quarantine_external_id_idx` ON `support_quarantine` (`external_id`);--> statement-breakpoint
CREATE INDEX `support_quarantine_created_idx` ON `support_quarantine` (`created_at`);--> statement-breakpoint
CREATE INDEX `support_quarantine_sender_idx` ON `support_quarantine` (`sender_email`);