CREATE TABLE `image_model_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`supports_image_input` integer DEFAULT false NOT NULL,
	`supported_sizes` text,
	`default_size` text,
	`model_config` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `image_model_profiles_name_unique` ON `image_model_profiles` (`name`);