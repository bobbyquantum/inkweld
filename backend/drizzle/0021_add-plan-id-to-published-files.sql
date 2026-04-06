ALTER TABLE `published_files` ADD `plan_id` text;
--> statement-breakpoint
CREATE INDEX `idx_published_files_plan_id` ON `published_files` (`plan_id`);
