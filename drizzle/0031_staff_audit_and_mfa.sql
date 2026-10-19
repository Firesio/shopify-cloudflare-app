CREATE TABLE `staff_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_user_id` text,
	`actor_email` text NOT NULL,
	`kind` text NOT NULL,
	`method` text,
	`path` text,
	`shop` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `staff_audit_logs_created_idx` ON `staff_audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `staff_audit_logs_actor_created_idx` ON `staff_audit_logs` (`admin_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `staff_audit_logs_shop_idx` ON `staff_audit_logs` (`shop`);--> statement-breakpoint
CREATE TABLE `admin_mfa` (
	`admin_user_id` text PRIMARY KEY NOT NULL,
	`secret` text,
	`pending_secret` text,
	`pending_created_at` integer,
	`enabled_at` integer,
	`last_step` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `admin_recovery_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`admin_user_id` text NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `admin_recovery_codes_user_idx` ON `admin_recovery_codes` (`admin_user_id`);