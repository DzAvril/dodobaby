CREATE TABLE `sleep_records` (
	`id` text PRIMARY KEY NOT NULL,
	`baby_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`record_timezone` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`baby_id`) REFERENCES `babies`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "sleep_records_valid_interval" CHECK("sleep_records"."ended_at" IS NULL OR "sleep_records"."ended_at" > "sleep_records"."started_at")
);
--> statement-breakpoint
CREATE INDEX `sleep_records_baby_started_at_idx` ON `sleep_records` (`baby_id`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `sleep_records_one_active_per_baby` ON `sleep_records` (`baby_id`) WHERE "sleep_records"."ended_at" IS NULL;
