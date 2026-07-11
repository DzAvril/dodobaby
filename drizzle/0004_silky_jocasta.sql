CREATE TABLE `vaccination_records` (
	`id` text PRIMARY KEY NOT NULL,
	`baby_id` text NOT NULL,
	`vaccine_name` text NOT NULL,
	`dose_number` integer NOT NULL,
	`category` text DEFAULT 'unknown' NOT NULL,
	`status` text NOT NULL,
	`planned_date` text,
	`planned_time` text,
	`administered_date` text,
	`manufacturer` text,
	`batch_number` text,
	`administration_site` text,
	`vaccination_unit` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`baby_id`) REFERENCES `babies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vaccination_records_baby_status_planned_date_idx` ON `vaccination_records` (`baby_id`,`status`,`planned_date`);--> statement-breakpoint
CREATE INDEX `vaccination_records_baby_administered_date_idx` ON `vaccination_records` (`baby_id`,`administered_date`);