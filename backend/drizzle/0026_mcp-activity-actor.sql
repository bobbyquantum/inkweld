-- Make user_id nullable and add actor_label for MCP API key activity events.
--
-- SQLite does not support DROP NOT NULL via ALTER TABLE, so we use the
-- recommended table-rebuild approach. actor_label stores the display name
-- for non-user actors (e.g. MCP key name or "MCP").

PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `activity_events_new` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL REFERENCES `projects`(`id`) ON DELETE CASCADE,
  `user_id` text REFERENCES `users`(`id`) ON DELETE CASCADE,
  `actor_label` text,
  `event_type` text(64) NOT NULL,
  `entity_id` text(500),
  `entity_name` text(500),
  `metadata` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `activity_events_new`
  (`id`, `project_id`, `user_id`, `actor_label`, `event_type`, `entity_id`, `entity_name`, `metadata`, `created_at`)
SELECT
  `id`, `project_id`, `user_id`, NULL, `event_type`, `entity_id`, `entity_name`, `metadata`, `created_at`
FROM `activity_events`;
--> statement-breakpoint
DROP TABLE `activity_events`;
--> statement-breakpoint
ALTER TABLE `activity_events_new` RENAME TO `activity_events`;
--> statement-breakpoint
CREATE INDEX `activity_events_project_id_idx` ON `activity_events` (`project_id`);
--> statement-breakpoint
CREATE INDEX `activity_events_user_id_idx` ON `activity_events` (`user_id`);
--> statement-breakpoint
CREATE INDEX `activity_events_project_created_idx` ON `activity_events` (`project_id`, `created_at`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
