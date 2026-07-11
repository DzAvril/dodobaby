CREATE TABLE `diaper_records` (
	`id` text PRIMARY KEY NOT NULL,
	`baby_id` text NOT NULL,
	`diaper_date` text NOT NULL,
	`changed_time` text NOT NULL,
	`diaper_type` text NOT NULL,
	`urine_amount` text,
	`stool_amount` text,
	`stool_color` text,
	`stool_consistency` text,
	`skin_observation` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`baby_id`) REFERENCES `babies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `diaper_records_baby_date_time_idx` ON `diaper_records` (`baby_id`,`diaper_date`,`changed_time`);