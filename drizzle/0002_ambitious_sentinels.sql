CREATE TABLE `growth_records` (
	`id` text PRIMARY KEY NOT NULL,
	`baby_id` text NOT NULL,
	`measured_date` text NOT NULL,
	`weight_kg` real,
	`height_cm` real,
	`head_circumference_cm` real,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`baby_id`) REFERENCES `babies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_records_baby_date_unique` ON `growth_records` (`baby_id`,`measured_date`);