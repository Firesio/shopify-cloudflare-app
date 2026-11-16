CREATE TABLE `plan_usage_ops` (
	`subject` text NOT NULL,
	`operation_id` text NOT NULL,
	`counter` text NOT NULL,
	`period` text NOT NULL,
	`amount` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`subject`, `operation_id`)
);
--> statement-breakpoint
CREATE INDEX `plan_usage_ops_expires_at_idx` ON `plan_usage_ops` (`expires_at`);--> statement-breakpoint
CREATE TABLE `notification_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`dedupe_key` text,
	`recipient_ref` text NOT NULL,
	`account_ref` text DEFAULT '' NOT NULL,
	`type` text NOT NULL,
	`audience` text NOT NULL,
	`channel` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 1 NOT NULL,
	`next_attempt_at` integer,
	`message_id` text,
	`reason` text,
	`detail` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_logs_dedupe_unique` ON `notification_logs` (`dedupe_key`,`recipient_ref`,`channel`);--> statement-breakpoint
CREATE INDEX `notification_logs_account_idx` ON `notification_logs` (`account_ref`,`created_at`);--> statement-breakpoint
CREATE INDEX `notification_logs_due_idx` ON `notification_logs` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `notification_logs_recipient_idx` ON `notification_logs` (`recipient_ref`);--> statement-breakpoint
CREATE INDEX `notification_logs_updated_idx` ON `notification_logs` (`updated_at`);--> statement-breakpoint
ALTER TABLE `shop_plan_grants` ADD `request_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `shop_plan_grants_request_idx` ON `shop_plan_grants` (`shop`,`request_id`) WHERE "shop_plan_grants"."request_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE `shop_subscriptions` ADD `billing_interval` text;--> statement-breakpoint
ALTER TABLE `shop_subscriptions` ADD `price_amount` integer;--> statement-breakpoint
ALTER TABLE `shop_subscriptions` ADD `price_currency` text;--> statement-breakpoint
ALTER TABLE `shop_subscriptions` ADD `current_period_starts_at` integer;--> statement-breakpoint
ALTER TABLE `shop_subscriptions` ADD `pending_plan_handle` text;--> statement-breakpoint
ALTER TABLE `shop_subscriptions` ADD `pending_billing_interval` text;--> statement-breakpoint
ALTER TABLE `shops` ADD `proxy_path_prefix` text;--> statement-breakpoint
ALTER TABLE `shop_members` ADD `locale` text;