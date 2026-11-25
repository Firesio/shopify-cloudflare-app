ALTER TABLE `campaign_recipients` ADD `address` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `channel` text DEFAULT 'email' NOT NULL;