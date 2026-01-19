CREATE TABLE `image_generation_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`profile_id` text,
	`profile_name` text NOT NULL,
	`prompt` text NOT NULL,
	`reference_image_urls` text,
	`output_image_urls` text,
	`credit_cost` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`message` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `image_model_profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_user_idx` ON `image_generation_audits` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `image_generation_audits` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_profile_idx` ON `image_generation_audits` (`profile_id`);--> statement-breakpoint
CREATE INDEX `audit_status_idx` ON `image_generation_audits` (`status`);--> statement-breakpoint
ALTER TABLE `image_model_profiles` ADD `credit_cost` integer DEFAULT 1 NOT NULL;