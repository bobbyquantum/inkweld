CREATE TABLE `comment_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text(500) NOT NULL,
	`project_id` text NOT NULL,
	`author_id` text NOT NULL,
	`resolved` integer DEFAULT false NOT NULL,
	`resolved_by` text,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_comment_threads_project` ON `comment_threads` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_comment_threads_document` ON `comment_threads` (`document_id`);--> statement-breakpoint
CREATE INDEX `idx_comment_threads_author` ON `comment_threads` (`author_id`);--> statement-breakpoint
CREATE TABLE `comment_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`author_id` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	`edited_at` integer,
	FOREIGN KEY (`thread_id`) REFERENCES `comment_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_comment_messages_thread` ON `comment_messages` (`thread_id`);--> statement-breakpoint
CREATE INDEX `idx_comment_messages_author` ON `comment_messages` (`author_id`);--> statement-breakpoint
CREATE TABLE `comment_read_status` (
	`user_id` text NOT NULL,
	`document_id` text(500) NOT NULL,
	`last_seen_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `document_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);