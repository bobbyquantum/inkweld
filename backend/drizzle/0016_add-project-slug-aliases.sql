-- Migration: Add project slug aliases table for tracking renamed projects
-- This allows clients with offline copies to be redirected to the new slug

CREATE TABLE IF NOT EXISTS `project_slug_aliases` (
  `old_slug` text NOT NULL,
  `user_id` text NOT NULL,
  `new_slug` text NOT NULL,
  `renamed_at` integer NOT NULL,
  PRIMARY KEY(`old_slug`, `user_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

-- Create index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS `idx_project_slug_aliases_user_id` ON `project_slug_aliases`(`user_id`);
