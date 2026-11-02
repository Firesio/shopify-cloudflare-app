CREATE TABLE `campaign_recipients` (
	`campaign_id` text NOT NULL,
	`shop` text NOT NULL,
	`shop_name` text NOT NULL,
	`email` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reason_code` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`settled_at` integer,
	PRIMARY KEY(`campaign_id`, `shop`),
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `campaign_recipients_status_idx` ON `campaign_recipients` (`campaign_id`,`status`);--> statement-breakpoint
CREATE TABLE `campaign_unsubscribes` (
	`address` text PRIMARY KEY NOT NULL,
	`unsubscribed_at` integer NOT NULL,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`cta_label` text,
	`cta_url` text,
	`audience` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`pause_reason` text,
	`recipient_count` integer,
	`created_by` text,
	`created_by_email` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`last_pump_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `campaigns_created_idx` ON `campaigns` (`created_at`);--> statement-breakpoint
CREATE INDEX `campaigns_status_idx` ON `campaigns` (`status`);