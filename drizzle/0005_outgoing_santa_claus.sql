CREATE TABLE `device_link_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`shop` text NOT NULL,
	`member_id` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `device_link_attempts_member_idx` ON `device_link_attempts` (`shop`,`member_id`,`at`);--> statement-breakpoint
CREATE INDEX `device_link_attempts_at_idx` ON `device_link_attempts` (`at`);--> statement-breakpoint
CREATE TABLE `device_link_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`shop` text NOT NULL,
	`device_code_hash` text NOT NULL,
	`user_code_hash` text NOT NULL,
	`status` text NOT NULL,
	`member_id` text,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`locale` text NOT NULL,
	`place` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`approved_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_link_requests_device_code_idx` ON `device_link_requests` (`device_code_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `device_link_requests_user_code_idx` ON `device_link_requests` (`shop`,`user_code_hash`);--> statement-breakpoint
CREATE INDEX `device_link_requests_expires_idx` ON `device_link_requests` (`expires_at`);--> statement-breakpoint
CREATE TABLE `member_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`shop` text NOT NULL,
	`member_id` text NOT NULL,
	`secret_hash` text NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`locale` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer,
	`verified_at` integer NOT NULL,
	`revoked_at` integer,
	`revoke_reason` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_devices_secret_hash_unique` ON `member_devices` (`secret_hash`);--> statement-breakpoint
CREATE INDEX `member_devices_member_idx` ON `member_devices` (`shop`,`member_id`);--> statement-breakpoint
CREATE INDEX `member_devices_revoked_idx` ON `member_devices` (`shop`,`revoked_at`);