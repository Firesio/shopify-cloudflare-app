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
ALTER TABLE `shop_members` ADD `trimmed_at` integer;