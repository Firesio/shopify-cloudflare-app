CREATE TABLE `notify_pending_events` (
	`provider_id` text NOT NULL,
	`event_id` text NOT NULL,
	`provider_message_id` text NOT NULL,
	`event` text NOT NULL,
	`address_hash` text,
	`at` integer NOT NULL,
	PRIMARY KEY(`provider_id`, `event_id`)
);
--> statement-breakpoint
CREATE INDEX `notify_pending_events_message_idx` ON `notify_pending_events` (`provider_id`,`provider_message_id`);--> statement-breakpoint
CREATE INDEX `notify_pending_events_at_idx` ON `notify_pending_events` (`at`);--> statement-breakpoint
CREATE TABLE `push_sent` (
	`delivery_id` text NOT NULL,
	`device_id` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`delivery_id`, `device_id`)
);
--> statement-breakpoint
CREATE INDEX `push_sent_at_idx` ON `push_sent` (`at`);--> statement-breakpoint
CREATE UNIQUE INDEX `notify_deliveries_dedupe_shop_unique` ON `notify_deliveries` ((CASE WHEN "shop" IS NULL THEN '' ELSE "shop" END),`dedupe_key`,`channel`,`address_hash`);