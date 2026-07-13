CREATE TABLE `medication_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`baby_id` text NOT NULL,
	`medication_name` text NOT NULL,
	`dose_amount` real NOT NULL,
	`dose_unit` text NOT NULL,
	`interval_days` integer DEFAULT 1 NOT NULL,
	`scheduled_times` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`baby_id`) REFERENCES `babies`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "medication_plans_interval_days_range" CHECK("medication_plans"."interval_days" BETWEEN 1 AND 30),
	CONSTRAINT "medication_plans_date_range" CHECK("medication_plans"."end_date" IS NULL OR "medication_plans"."end_date" >= "medication_plans"."start_date")
);
--> statement-breakpoint
CREATE INDEX `medication_plans_baby_start_date_idx` ON `medication_plans` (`baby_id`,`start_date`);--> statement-breakpoint
CREATE TABLE `medication_records` (
	`id` text PRIMARY KEY NOT NULL,
	`baby_id` text NOT NULL,
	`plan_id` text,
	`medication_name` text NOT NULL,
	`dose_amount` real NOT NULL,
	`dose_unit` text NOT NULL,
	`taken_date` text NOT NULL,
	`scheduled_time` text,
	`taken_time` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`baby_id`) REFERENCES `babies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `medication_plans`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `medication_records_baby_date_time_idx` ON `medication_records` (`baby_id`,`taken_date`,`taken_time`);--> statement-breakpoint
CREATE UNIQUE INDEX `medication_records_plan_date_time_unique` ON `medication_records` (`plan_id`,`taken_date`,`scheduled_time`);