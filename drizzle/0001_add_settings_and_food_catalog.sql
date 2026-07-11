CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `food_catalog_items` (
	`id` text PRIMARY KEY NOT NULL,
	`baby_id` text NOT NULL,
	`name` text NOT NULL,
	`default_unit` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`baby_id`) REFERENCES `babies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `food_catalog_baby_name_unique` ON `food_catalog_items` (`baby_id`,`name`);--> statement-breakpoint
CREATE INDEX `food_catalog_baby_idx` ON `food_catalog_items` (`baby_id`);