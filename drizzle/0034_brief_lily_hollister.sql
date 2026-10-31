-- support_tickets.shop and support_messages.shop become nullable (a conversation
-- no shop owns yet), plus the source / reply-address / mail-id columns.
--
-- SQLite cannot drop NOT NULL in place, so the tables are rebuilt. The rebuild
-- order is NOT the one drizzle-kit emits: D1 enforces foreign keys and ignores
-- PRAGMA foreign_keys, so dropping a parent first would run its ON DELETE
-- CASCADE over the child rows. Children are backed up and dropped FIRST, then
-- the parent, then everything is recreated and refilled. Existing columns are
-- the only ones selected from the old tables; new columns take their defaults.
CREATE TABLE `__bak_support_attachments` AS SELECT * FROM `support_attachments`;--> statement-breakpoint
CREATE TABLE `__bak_support_messages` AS SELECT * FROM `support_messages`;--> statement-breakpoint
CREATE TABLE `__bak_support_tickets` AS SELECT * FROM `support_tickets`;--> statement-breakpoint
DROP TABLE `support_attachments`;--> statement-breakpoint
DROP TABLE `support_messages`;--> statement-breakpoint
DROP TABLE `support_tickets`;--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`shop` text,
	`source` text DEFAULT 'app_portal' NOT NULL,
	`reply_address` text,
	`shop_name` text NOT NULL,
	`merchant_email` text,
	`cc_emails` text DEFAULT '[]' NOT NULL,
	`category` text NOT NULL,
	`subject` text NOT NULL,
	`last_author` text NOT NULL,
	`last_message_at` integer NOT NULL,
	`closed_at` integer,
	`merchant_last_read_at` integer,
	`staff_last_read_at` integer,
	`locale` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `support_tickets`("id", "shop", "shop_name", "merchant_email", "cc_emails", "category", "subject", "last_author", "last_message_at", "closed_at", "merchant_last_read_at", "staff_last_read_at", "locale", "created_at") SELECT "id", "shop", "shop_name", "merchant_email", "cc_emails", "category", "subject", "last_author", "last_message_at", "closed_at", "merchant_last_read_at", "staff_last_read_at", "locale", "created_at" FROM `__bak_support_tickets`;--> statement-breakpoint
CREATE TABLE `support_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`shop` text,
	`author` text NOT NULL,
	`author_name` text NOT NULL,
	`body` text NOT NULL,
	`external_id` text,
	`mail_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `support_messages`("id", "ticket_id", "shop", "author", "author_name", "body", "created_at") SELECT "id", "ticket_id", "shop", "author", "author_name", "body", "created_at" FROM `__bak_support_messages`;--> statement-breakpoint
CREATE TABLE `support_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`shop` text NOT NULL,
	`r2_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `support_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `support_attachments` SELECT * FROM `__bak_support_attachments`;--> statement-breakpoint
DROP TABLE `__bak_support_attachments`;--> statement-breakpoint
DROP TABLE `__bak_support_messages`;--> statement-breakpoint
DROP TABLE `__bak_support_tickets`;--> statement-breakpoint
CREATE UNIQUE INDEX `support_messages_external_id_idx` ON `support_messages` (`external_id`);--> statement-breakpoint
CREATE INDEX `support_messages_mail_id_idx` ON `support_messages` (`mail_id`);--> statement-breakpoint
CREATE INDEX `support_messages_ticket_idx` ON `support_messages` (`ticket_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `support_messages_shop_idx` ON `support_messages` (`shop`);--> statement-breakpoint
CREATE INDEX `support_attachments_message_idx` ON `support_attachments` (`message_id`);--> statement-breakpoint
CREATE INDEX `support_attachments_shop_idx` ON `support_attachments` (`shop`);--> statement-breakpoint
CREATE INDEX `support_tickets_shop_idx` ON `support_tickets` (`shop`);--> statement-breakpoint
CREATE INDEX `support_tickets_queue_idx` ON `support_tickets` (`closed_at`,`last_author`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `support_tickets_shop_recent_idx` ON `support_tickets` (`shop`,`last_message_at`);
