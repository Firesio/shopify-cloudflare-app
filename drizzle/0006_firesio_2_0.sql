-- @firesio/app 2.0.0, EXPAND ONLY (`checkMigrations`, app/test/migrations.test.ts). What the generator also wrote and was taken out by hand, because the previous
-- release still reads it and D1 does not roll back with `wrangler rollback`: DROP TABLE of `notification_logs`, `notification_preferences`, `ai_models`, `ai_runs`,
-- `ai_usage`, `support_tickets`, `support_messages`, `support_attachments`, `campaign_unsubscribes`, and `ALTER TABLE campaigns DROP COLUMN last_pump_at`. They go in
-- the NEXT release as a file named `*_contract.sql` (docs/migrating-to-2.0.md), once nothing reads them. `drizzle-kit generate` will not write them again: the snapshot
-- of this migration no longer lists those tables.
CREATE TABLE `shop_probes` (
	`shop` text PRIMARY KEY NOT NULL,
	`lease_until` integer,
	`last_succeeded_at` integer,
	`last_failed_at` integer,
	`failure_code` text,
	`failure_detail` text
);
--> statement-breakpoint
CREATE TABLE `notify_consents` (
	`list` text NOT NULL,
	`owner` text NOT NULL,
	`channel` text NOT NULL,
	`address_hash` text NOT NULL,
	`state` text NOT NULL,
	`at` integer NOT NULL,
	`source` text NOT NULL,
	PRIMARY KEY(`list`, `owner`, `channel`, `address_hash`)
);
--> statement-breakpoint
CREATE TABLE `notify_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`dedupe_key` text,
	`shop` text,
	`message_id` text NOT NULL,
	`channel` text NOT NULL,
	`channels` text NOT NULL,
	`sender` text,
	`basis` text NOT NULL,
	`list` text,
	`list_owner` text,
	`ref_kind` text,
	`ref_id` text,
	`locale` text NOT NULL,
	`address` text,
	`address_hash` text NOT NULL,
	`vars` text NOT NULL,
	`headers` text DEFAULT '{}' NOT NULL,
	`status` text NOT NULL,
	`notified_status` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`provider_message_id` text,
	`reason` text,
	`trace` text DEFAULT '[]' NOT NULL,
	`seen_events` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notify_deliveries_dedupe_unique` ON `notify_deliveries` (`dedupe_key`,`channel`,`address_hash`);--> statement-breakpoint
CREATE INDEX `notify_deliveries_shop_idx` ON `notify_deliveries` (`shop`,`created_at`);--> statement-breakpoint
CREATE INDEX `notify_deliveries_ref_idx` ON `notify_deliveries` (`ref_kind`,`ref_id`);--> statement-breakpoint
CREATE INDEX `notify_deliveries_provider_idx` ON `notify_deliveries` (`provider_message_id`);--> statement-breakpoint
CREATE INDEX `notify_deliveries_due_idx` ON `notify_deliveries` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `notify_deliveries_owed_idx` ON `notify_deliveries` (`status`,`notified_status`);--> statement-breakpoint
CREATE INDEX `notify_deliveries_address_idx` ON `notify_deliveries` (`address_hash`);--> statement-breakpoint
CREATE TABLE `notify_scheduled` (
	`key` text PRIMARY KEY NOT NULL,
	`shop` text,
	`message_id` text NOT NULL,
	`at` integer NOT NULL,
	`input` text NOT NULL,
	`status` text NOT NULL,
	`lease_until` integer,
	`outcome` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notify_scheduled_due_idx` ON `notify_scheduled` (`status`,`at`);--> statement-breakpoint
CREATE INDEX `notify_scheduled_shop_idx` ON `notify_scheduled` (`shop`);--> statement-breakpoint
CREATE TABLE `notify_suppressions` (
	`channel` text NOT NULL,
	`scope` text DEFAULT '' NOT NULL,
	`address_hash` text NOT NULL,
	`reason` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	PRIMARY KEY(`channel`, `scope`, `address_hash`)
);
--> statement-breakpoint
CREATE TABLE `portal_command_runs` (
	`shop` text NOT NULL,
	`request_id` text NOT NULL,
	`command` text NOT NULL,
	`target` text NOT NULL,
	`fingerprint` text NOT NULL,
	`answer` text,
	`created_at` integer NOT NULL,
	`settled_at` integer,
	PRIMARY KEY(`shop`, `request_id`)
);
--> statement-breakpoint
CREATE INDEX `portal_command_runs_created_idx` ON `portal_command_runs` (`created_at`);--> statement-breakpoint
CREATE TABLE `firesio_dead_letters` (
	`id` text PRIMARY KEY NOT NULL,
	`queue` text NOT NULL,
	`kind` text,
	`dedupe_key` text,
	`shop` text,
	`body` text NOT NULL,
	`body_truncated` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 1 NOT NULL,
	`first_error` text,
	`last_error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `firesio_dead_letters_created_idx` ON `firesio_dead_letters` (`created_at`);--> statement-breakpoint
CREATE INDEX `firesio_dead_letters_shop_idx` ON `firesio_dead_letters` (`shop`,`created_at`);--> statement-breakpoint
CREATE INDEX `firesio_dead_letters_queue_idx` ON `firesio_dead_letters` (`queue`,`created_at`);--> statement-breakpoint
CREATE TABLE `firesio_job_claims` (
	`kind` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`state` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_until` integer,
	`done_at` integer,
	`shop` text,
	`first_error` text,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`kind`, `dedupe_key`)
);
--> statement-breakpoint
CREATE INDEX `firesio_job_claims_done_idx` ON `firesio_job_claims` (`state`,`done_at`);--> statement-breakpoint
CREATE INDEX `firesio_job_claims_updated_idx` ON `firesio_job_claims` (`updated_at`);--> statement-breakpoint
CREATE INDEX `firesio_job_claims_shop_idx` ON `firesio_job_claims` (`shop`);--> statement-breakpoint
CREATE TABLE `support_cases` (
	`conversation_id` text PRIMARY KEY NOT NULL,
	`source` text DEFAULT 'app_portal' NOT NULL,
	`reply_address` text,
	`shop_name` text NOT NULL,
	`merchant_email` text,
	`cc_emails` text DEFAULT '[]' NOT NULL,
	`category` text NOT NULL,
	`last_author` text NOT NULL,
	`closed_at` integer,
	`closed_asks_review` integer DEFAULT false NOT NULL,
	`merchant_last_read_at` integer,
	`staff_last_read_at` integer,
	`locale` text
);
--> statement-breakpoint
CREATE INDEX `support_cases_queue_idx` ON `support_cases` (`closed_at`,`last_author`);--> statement-breakpoint
CREATE TABLE `firesio_settings_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shop` text NOT NULL,
	`settings_group` text NOT NULL,
	`field` text NOT NULL,
	`old_value` text NOT NULL,
	`new_value` text NOT NULL,
	`revision` integer NOT NULL,
	`actor` text NOT NULL,
	`source` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `firesio_settings_audit_shop` ON `firesio_settings_audit` (`shop`,`id`);--> statement-breakpoint
CREATE TABLE `firesio_setup` (
	`shop` text PRIMARY KEY NOT NULL,
	`dismissed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversation_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`message_id` text NOT NULL,
	`shop` text,
	`ref` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `conversation_attachments_message_idx` ON `conversation_attachments` (`message_id`);--> statement-breakpoint
CREATE INDEX `conversation_attachments_conversation_idx` ON `conversation_attachments` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `conversation_attachments_shop_idx` ON `conversation_attachments` (`shop`);--> statement-breakpoint
CREATE TABLE `conversation_lines` (
	`conversation_id` text NOT NULL,
	`shop` text NOT NULL,
	`channel` text NOT NULL,
	`line` text NOT NULL,
	`address` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`shop`, `channel`, `line`, `address`)
);
--> statement-breakpoint
CREATE INDEX `conversation_lines_conversation_idx` ON `conversation_lines` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `conversation_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`shop` text,
	`direction` text NOT NULL,
	`channel` text NOT NULL,
	`body` text NOT NULL,
	`provider_ref` text,
	`send_ref` text,
	`external_id` text,
	`delivery_state` text NOT NULL,
	`delivery_error` text,
	`from_address` text,
	`from_name` text,
	`asks_review` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_messages_ref_uidx` ON `conversation_messages` (`shop`,`channel`,`provider_ref`) WHERE "conversation_messages"."provider_ref" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_messages_mail_uidx` ON `conversation_messages` (`external_id`,`shop`) WHERE "conversation_messages"."external_id" IS NOT NULL AND "conversation_messages"."shop" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_messages_mail_unowned_uidx` ON `conversation_messages` (`external_id`) WHERE "conversation_messages"."external_id" IS NOT NULL AND "conversation_messages"."shop" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_messages_send_uidx` ON `conversation_messages` (`shop`,`send_ref`) WHERE "conversation_messages"."send_ref" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `conversation_messages_thread_idx` ON `conversation_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `conversation_participants` (
	`conversation_id` text NOT NULL,
	`shop` text,
	`channel` text NOT NULL,
	`address` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`conversation_id`, `channel`, `address`)
);
--> statement-breakpoint
CREATE INDEX `conversation_participants_shop_idx` ON `conversation_participants` (`shop`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`shop` text,
	`title` text,
	`subject_kind` text,
	`subject_id` text,
	`created_at` integer NOT NULL,
	`last_message_at` integer NOT NULL,
	`unread` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `conversations_shop_last_idx` ON `conversations` (`shop`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `conversations_subject_idx` ON `conversations` (`shop`,`subject_kind`,`subject_id`);--> statement-breakpoint
-- The index changes shape (it no longer reads `last_pump_at`, which stays until the contract migration): an index holds no data of its own.
DROP INDEX `campaigns_status_idx`;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `owner` text DEFAULT 'platform' NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `scheduled_for` integer;--> statement-breakpoint
CREATE INDEX `campaigns_owner_idx` ON `campaigns` (`owner`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `campaigns_status_idx` ON `campaigns` (`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `shops` ADD `currency_code` text;--> statement-breakpoint
ALTER TABLE `shops` ADD `taxes_included` integer;--> statement-breakpoint
ALTER TABLE `shops` ADD `address` text;--> statement-breakpoint
ALTER TABLE `shops` ADD `primary_locale` text;--> statement-breakpoint
ALTER TABLE `shop_subscriptions` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shop_subscriptions` ADD `verified_at` integer;--> statement-breakpoint
ALTER TABLE `shop_subscriptions` ADD `cancel_effective_on` text;--> statement-breakpoint
ALTER TABLE `content_overrides` ADD `source_text` text;--> statement-breakpoint
ALTER TABLE `campaign_recipients` ADD `owner` text DEFAULT 'platform' NOT NULL;--> statement-breakpoint
CREATE INDEX `campaign_recipients_owner_idx` ON `campaign_recipients` (`owner`);