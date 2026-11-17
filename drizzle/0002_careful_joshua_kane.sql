CREATE TABLE `shop_settings` (
	`shop` text NOT NULL,
	`settings_group` text NOT NULL,
	`revision` integer NOT NULL,
	`version` integer NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	PRIMARY KEY(`shop`, `settings_group`)
);
