CREATE TABLE `notification_preferences` (
	`scope` text NOT NULL,
	`event` text NOT NULL,
	`channel` text NOT NULL,
	`enabled` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `event`, `channel`)
);
--> statement-breakpoint
CREATE TABLE `shop_plan_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`shop` text NOT NULL,
	`plan_handle` text NOT NULL,
	`reason` text NOT NULL,
	`granted_by` text NOT NULL,
	`starts_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`revoked_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shop_plan_grants_lookup_idx` ON `shop_plan_grants` (`shop`,`expires_at`,`revoked_at`);--> statement-breakpoint
CREATE TABLE `shop_subscriptions` (
	`shop` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`plan_handle` text,
	`trial_ends_at` integer,
	`current_period_ends_at` integer,
	`cancellation_effective_at` integer,
	`applied_occurred_at` integer NOT NULL,
	`applied_external_id` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shops` (
	`shop` text PRIMARY KEY NOT NULL,
	`shopify_shop_id` text,
	`name` text,
	`email` text,
	`contact_email` text,
	`logo_url` text,
	`url` text,
	`time_zone` text,
	`relationship_status` text,
	`relationship_occurred_at` integer,
	`installed_at` integer NOT NULL,
	`current_installed_at` integer,
	`uninstalled_at` integer,
	`last_authenticated_at` integer,
	`is_dev_store` integer DEFAULT false NOT NULL,
	`dev_status_checked_at` integer,
	`blocked_at` integer,
	`blocked_reason` text
);
--> statement-breakpoint
CREATE INDEX `shops_relationship_status_idx` ON `shops` (`relationship_status`);--> statement-breakpoint
CREATE INDEX `shops_installed_at_idx` ON `shops` (`installed_at`);--> statement-breakpoint
CREATE TABLE `redacted_shops` (
	`shop_hash` text PRIMARY KEY NOT NULL,
	`redacted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`topic` text NOT NULL,
	`api_version` text NOT NULL,
	`shop` text NOT NULL,
	`triggered_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	`payload_hash` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`processing_started_at` integer,
	`processed_at` integer,
	`failed_at` integer,
	`failure_code` text,
	`failure_detail` text
);
--> statement-breakpoint
CREATE INDEX `webhook_deliveries_shop_received_idx` ON `webhook_deliveries` (`shop`,`received_at`);--> statement-breakpoint
CREATE INDEX `webhook_deliveries_status_received_idx` ON `webhook_deliveries` (`status`,`received_at`);--> statement-breakpoint
CREATE TABLE `plan_usage` (
	`subject` text NOT NULL,
	`counter` text NOT NULL,
	`period` text NOT NULL,
	`used` integer NOT NULL CHECK (typeof(`used`) = 'integer' AND `used` >= 0 AND `used` <= 9007199254740991),
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`subject`, `counter`, `period`)
) WITHOUT ROWID;
--> statement-breakpoint
CREATE INDEX `plan_usage_expires_at_idx` ON `plan_usage` (`expires_at`);--> statement-breakpoint
CREATE TABLE `pending_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`shop` text NOT NULL,
	`ticket_id` text,
	`r2_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`adopted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pending_uploads_r2_key_unique` ON `pending_uploads` (`r2_key`);--> statement-breakpoint
CREATE INDEX `pending_uploads_shop_idx` ON `pending_uploads` (`shop`,`created_at`);--> statement-breakpoint
CREATE INDEX `pending_uploads_expiry_idx` ON `pending_uploads` (`expires_at`);--> statement-breakpoint
CREATE TABLE `support_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`shop` text NOT NULL,
	`r2_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `support_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `support_attachments_message_idx` ON `support_attachments` (`message_id`);--> statement-breakpoint
CREATE INDEX `support_attachments_shop_idx` ON `support_attachments` (`shop`);--> statement-breakpoint
CREATE TABLE `support_blocked_senders` (
	`pattern` text PRIMARY KEY NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `support_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`shop` text,
	`author` text NOT NULL,
	`author_name` text NOT NULL,
	`body` text NOT NULL,
	`external_id` text,
	`mail_id` text,
	`asks_review` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `support_messages_external_id_idx` ON `support_messages` (`external_id`);--> statement-breakpoint
CREATE INDEX `support_messages_mail_id_idx` ON `support_messages` (`mail_id`);--> statement-breakpoint
CREATE INDEX `support_messages_ticket_idx` ON `support_messages` (`ticket_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `support_messages_shop_idx` ON `support_messages` (`shop`);--> statement-breakpoint
CREATE TABLE `support_quarantine` (
	`id` text PRIMARY KEY NOT NULL,
	`external_id` text NOT NULL,
	`source` text NOT NULL,
	`reason` text NOT NULL,
	`sender_email` text NOT NULL,
	`sender_name` text NOT NULL,
	`shop_hint` text,
	`shop_name` text,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `support_quarantine_external_id_idx` ON `support_quarantine` (`external_id`);--> statement-breakpoint
CREATE INDEX `support_quarantine_created_idx` ON `support_quarantine` (`created_at`);--> statement-breakpoint
CREATE INDEX `support_quarantine_sender_idx` ON `support_quarantine` (`sender_email`);--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`shop` text,
	`source` text DEFAULT 'app_portal' NOT NULL,
	`reply_address` text,
	`shop_name` text NOT NULL,
	`merchant_email` text,
	`cc_emails` text DEFAULT '[]' NOT NULL,
	`category` text NOT NULL,
	`subject` text NOT NULL,
	`last_author` text NOT NULL,
	`last_message_at` integer NOT NULL,
	`closed_at` integer,
	`closed_asks_review` integer DEFAULT false NOT NULL,
	`merchant_last_read_at` integer,
	`staff_last_read_at` integer,
	`locale` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `support_tickets_shop_idx` ON `support_tickets` (`shop`);--> statement-breakpoint
CREATE INDEX `support_tickets_queue_idx` ON `support_tickets` (`closed_at`,`last_author`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `support_tickets_shop_recent_idx` ON `support_tickets` (`shop`,`last_message_at`);--> statement-breakpoint
CREATE TABLE `member_seat_episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`shop` text NOT NULL,
	`detected_at` integer NOT NULL,
	`notified_at` integer,
	`deadline_at` integer,
	`resolved_at` integer,
	`outcome` text,
	`trimmed_count` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_seat_episodes_open_idx` ON `member_seat_episodes` (`shop`) WHERE "member_seat_episodes"."resolved_at" IS NULL;--> statement-breakpoint
CREATE INDEX `member_seat_episodes_due_idx` ON `member_seat_episodes` (`deadline_at`) WHERE "member_seat_episodes"."resolved_at" IS NULL;--> statement-breakpoint
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
	`last_seen_at` integer,
	`trimmed_at` integer,
	`permissions` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shop_members_user_idx` ON `shop_members` (`shop`,`shopify_user_id`);--> statement-breakpoint
CREATE INDEX `shop_members_email_idx` ON `shop_members` (`shop`,`email`);--> statement-breakpoint
CREATE INDEX `shop_members_status_idx` ON `shop_members` (`shop`,`status`);--> statement-breakpoint
CREATE TABLE `content_overrides` (
	`account_id` text NOT NULL,
	`key` text NOT NULL,
	`locale` text NOT NULL,
	`parts` text NOT NULL,
	`default_fingerprint` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `key`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `push_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`audience` text NOT NULL,
	`account_id` text DEFAULT '' NOT NULL,
	`owner_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`label` text NOT NULL,
	`kind` text DEFAULT 'desktop' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_devices_endpoint_unique` ON `push_devices` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_devices_owner_idx` ON `push_devices` (`audience`,`account_id`,`owner_id`);--> statement-breakpoint
CREATE INDEX `push_devices_account_idx` ON `push_devices` (`account_id`);--> statement-breakpoint
CREATE TABLE `ai_models` (
	`role` text NOT NULL,
	`model_id` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`healthy` integer DEFAULT true NOT NULL,
	`last_failed_at` integer,
	`updated_at` integer NOT NULL,
	`updated_by` text,
	PRIMARY KEY(`role`, `model_id`)
);
--> statement-breakpoint
CREATE INDEX `ai_models_role_priority_idx` ON `ai_models` (`role`,`priority`);--> statement-breakpoint
CREATE TABLE `ai_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`model_id` text NOT NULL,
	`feature` text NOT NULL,
	`shop` text,
	`status` text NOT NULL,
	`reason_code` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`latency_ms` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_runs_created_idx` ON `ai_runs` (`created_at`);--> statement-breakpoint
CREATE INDEX `ai_runs_role_created_idx` ON `ai_runs` (`role`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_runs_id_uidx` ON `ai_runs` (`id`);--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`counter` text NOT NULL,
	`bucket` integer NOT NULL,
	`used` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`counter`, `bucket`),
	CONSTRAINT "ai_usage_used_non_negative" CHECK("ai_usage"."used" >= 0)
);
--> statement-breakpoint
CREATE INDEX `ai_usage_expires_idx` ON `ai_usage` (`expires_at`);--> statement-breakpoint
CREATE TABLE `portal_outbox` (
	`event_id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`account_kind` text,
	`account_id` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`sent_at` integer
);
--> statement-breakpoint
CREATE INDEX `portal_outbox_due_idx` ON `portal_outbox` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `portal_outbox_account_idx` ON `portal_outbox` (`account_kind`,`account_id`);