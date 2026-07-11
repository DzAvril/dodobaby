CREATE TABLE `feeding_records` (
	`id` text PRIMARY KEY NOT NULL,
	`baby_id` text NOT NULL,
	`feeding_date` text NOT NULL,
	`started_time` text NOT NULL,
	`left_duration_minutes` integer,
	`right_duration_minutes` integer,
	`expressed_milk_ml` real,
	`formula_ml` real,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`baby_id`) REFERENCES `babies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `feeding_records_baby_date_idx` ON `feeding_records` (`baby_id`,`feeding_date`);