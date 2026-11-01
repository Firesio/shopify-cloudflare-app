CREATE TABLE `shop_members` (
	`id` text PRIMARY KEY NOT NULL,
	`shop` text NOT NULL,
	`shopify_user_id` text,
	`email` text,
	`name` text,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`account_owner` integer DEFAULT false NOT NULL,
	`collaborator` integer DEFAULT false NOT NULL,
	`invited_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_seen_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shop_members_user_idx` ON `shop_members` (`shop`,`shopify_user_id`);--> statement-breakpoint
CREATE INDEX `shop_members_email_idx` ON `shop_members` (`shop`,`email`);--> statement-breakpoint
CREATE INDEX `shop_members_status_idx` ON `shop_members` (`shop`,`status`);