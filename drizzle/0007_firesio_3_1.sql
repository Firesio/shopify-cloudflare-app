CREATE TABLE `notify_inbound` (
	`channel` text NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`address_hash` text NOT NULL,
	`shop` text,
	`last_at` integer NOT NULL,
	`provider_message_id` text NOT NULL,
	PRIMARY KEY(`channel`, `owner`, `address_hash`)
);
--> statement-breakpoint
CREATE INDEX `notify_inbound_shop_idx` ON `notify_inbound` (`shop`);--> statement-breakpoint
CREATE INDEX `notify_inbound_address_idx` ON `notify_inbound` (`address_hash`);--> statement-breakpoint
CREATE TABLE `firesio_news` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`link_label` text,
	`link_url` text,
	`segment` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`published_at` integer,
	`archived_at` integer
);
--> statement-breakpoint
CREATE INDEX `firesio_news_created_idx` ON `firesio_news` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `firesio_news_published_idx` ON `firesio_news` (`status`,`published_at`);--> statement-breakpoint
CREATE TABLE `firesio_news_dismissals` (
	`shop` text NOT NULL,
	`member` text NOT NULL,
	`news_id` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`shop`, `member`, `news_id`)
);
--> statement-breakpoint
CREATE INDEX `firesio_news_dismissals_news_idx` ON `firesio_news_dismissals` (`news_id`);--> statement-breakpoint
CREATE TABLE `firesio_news_requests` (
	`request_id` text NOT NULL,
	`command` text NOT NULL,
	`answer` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`request_id`, `command`)
);
--> statement-breakpoint
CREATE INDEX `firesio_news_requests_at_idx` ON `firesio_news_requests` (`at`);--> statement-breakpoint
ALTER TABLE `notify_deliveries` ADD `copies` text DEFAULT '[]' NOT NULL;