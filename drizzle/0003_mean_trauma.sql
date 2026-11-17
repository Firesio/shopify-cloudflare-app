ALTER TABLE `shop_settings` RENAME TO `firesio_settings`;--> statement-breakpoint
CREATE TABLE `plan_usage_holds` (
	`hold_id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`operation_id` text NOT NULL,
	`counter` text NOT NULL,
	`period` text NOT NULL,
	`amount` integer NOT NULL CHECK (typeof(`amount`) = 'integer' AND `amount` > 0),
	`committed` integer NOT NULL CHECK (typeof(`committed`) = 'integer' AND `committed` >= 0 AND `committed` <= `amount`),
	`state` text NOT NULL CHECK (`state` IN ('held', 'committed', 'cancelled')),
	`note` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
) WITHOUT ROWID;
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_usage_holds_operation_idx` ON `plan_usage_holds` (`subject`,`operation_id`);--> statement-breakpoint
CREATE INDEX `plan_usage_holds_counter_idx` ON `plan_usage_holds` (`subject`,`counter`,`period`,`state`);--> statement-breakpoint
CREATE INDEX `plan_usage_holds_held_idx` ON `plan_usage_holds` (`state`,`counter`,`created_at`);--> statement-breakpoint
CREATE INDEX `plan_usage_holds_expires_at_idx` ON `plan_usage_holds` (`expires_at`);--> statement-breakpoint
ALTER TABLE `content_overrides` ADD `hidden` text DEFAULT '[]' NOT NULL;