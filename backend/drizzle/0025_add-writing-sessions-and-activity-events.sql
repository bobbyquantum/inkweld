CREATE TABLE `writing_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`element_id` text(500) NOT NULL,
	`user_id` text NOT NULL,
	`session_start` integer NOT NULL,
	`session_end` integer,
	`start_word_count` integer NOT NULL,
	`end_word_count` integer,
	`words_delta` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `writing_sessions_project_id_idx` ON `writing_sessions` (`project_id`);--> statement-breakpoint
CREATE INDEX `writing_sessions_user_id_idx` ON `writing_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `writing_sessions_element_id_idx` ON `writing_sessions` (`element_id`);--> statement-breakpoint
CREATE INDEX `writing_sessions_project_start_idx` ON `writing_sessions` (`project_id`,`session_start`);--> statement-breakpoint
CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`event_type` text(64) NOT NULL,
	`entity_id` text(500),
	`entity_name` text(500),
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_events_project_id_idx` ON `activity_events` (`project_id`);--> statement-breakpoint
CREATE INDEX `activity_events_user_id_idx` ON `activity_events` (`user_id`);--> statement-breakpoint
CREATE INDEX `activity_events_project_created_idx` ON `activity_events` (`project_id`,`created_at`);
