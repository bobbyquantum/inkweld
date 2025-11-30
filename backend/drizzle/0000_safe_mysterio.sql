CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text,
	`name` text,
	`email` text,
	`password` text,
	`githubId` text,
	`enabled` integer DEFAULT false NOT NULL,
	`approved` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_githubId_unique` ON `users` (`githubId`);--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text,
	`expiredAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text(1000),
	`user_id` text NOT NULL,
	`created_date` integer NOT NULL,
	`updated_date` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `document_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text(500) NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text(255) NOT NULL,
	`description` text,
	`y_doc_state` blob NOT NULL,
	`state_vector` blob,
	`word_count` integer,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
