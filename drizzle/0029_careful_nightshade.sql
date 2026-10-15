CREATE TABLE `admin_notification_preferences` (
	`admin_user_id` text NOT NULL,
	`topic` text NOT NULL,
	`channel` text NOT NULL,
	`enabled` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`admin_user_id`, `topic`, `channel`),
	FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_admin_user_idx` ON `push_subscriptions` (`admin_user_id`);