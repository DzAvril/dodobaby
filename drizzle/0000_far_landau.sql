CREATE TABLE `babies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`birth_date` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Shanghai' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`baby_id` text NOT NULL,
	`meal_date` text NOT NULL,
	`meal_type` text NOT NULL,
	`custom_meal_type` text,
	`planned_time` text,
	`plan_note` text,
	`actual_status` text DEFAULT 'planned' NOT NULL,
	`actual_time` text,
	`actual_note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`baby_id`) REFERENCES `babies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meal_entries_baby_date_idx` ON `meal_entries` (`baby_id`,`meal_date`);--> statement-breakpoint
CREATE INDEX `meal_entries_status_idx` ON `meal_entries` (`actual_status`);--> statement-breakpoint
CREATE TABLE `meal_items` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`name` text NOT NULL,
	`amount` real,
	`unit` text,
	`preparation` text,
	`is_first_try` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meal_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meal_items_meal_idx` ON `meal_items` (`meal_id`);--> statement-breakpoint
CREATE INDEX `meal_items_name_idx` ON `meal_items` (`name`);--> statement-breakpoint
CREATE TABLE `meal_reaction_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`tag` text NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meal_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meal_reaction_tags_meal_idx` ON `meal_reaction_tags` (`meal_id`);--> statement-breakpoint
CREATE INDEX `meal_reaction_tags_tag_idx` ON `meal_reaction_tags` (`tag`);