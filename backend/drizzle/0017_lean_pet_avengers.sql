CREATE TABLE `project_tombstones` (
	`slug` text NOT NULL,
	`user_id` text NOT NULL,
	`deleted_at` integer NOT NULL,
	PRIMARY KEY(`slug`, `user_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
