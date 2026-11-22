CREATE TABLE `firesio_cms_assets` (
	`key` text PRIMARY KEY NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `firesio_cms_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`collection` text NOT NULL,
	`locale` text NOT NULL,
	`slug` text NOT NULL,
	`group_id` text NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL,
	`version` integer NOT NULL,
	`scheduled_for` integer,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `firesio_cms_entries_slug_idx` ON `firesio_cms_entries` (`collection`,`locale`,`slug`);--> statement-breakpoint
CREATE INDEX `firesio_cms_entries_live_idx` ON `firesio_cms_entries` (`collection`,`locale`,`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `firesio_cms_entries_updated_idx` ON `firesio_cms_entries` (`collection`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `firesio_cms_entries_group_idx` ON `firesio_cms_entries` (`group_id`);--> statement-breakpoint
CREATE TABLE `firesio_cms_redirects` (
	`collection` text NOT NULL,
	`locale` text NOT NULL,
	`from_slug` text NOT NULL,
	`to_slug` text,
	`at` integer NOT NULL,
	PRIMARY KEY(`collection`, `locale`, `from_slug`)
);
--> statement-breakpoint
CREATE INDEX `firesio_cms_redirects_to_idx` ON `firesio_cms_redirects` (`collection`,`locale`,`to_slug`);--> statement-breakpoint
CREATE TABLE `firesio_cms_requests` (
	`request_id` text NOT NULL,
	`command` text NOT NULL,
	`answer` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`request_id`, `command`)
);
--> statement-breakpoint
CREATE INDEX `firesio_cms_requests_at_idx` ON `firesio_cms_requests` (`at`);--> statement-breakpoint
CREATE TABLE `firesio_cms_versions` (
	`entry_id` text NOT NULL,
	`version` integer NOT NULL,
	`slug` text NOT NULL,
	`data` text NOT NULL,
	`at` integer NOT NULL,
	`actor` text NOT NULL,
	PRIMARY KEY(`entry_id`, `version`)
);
