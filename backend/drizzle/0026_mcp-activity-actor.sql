-- Make user_id nullable so activity events from MCP API key sessions
-- (which have no associated user account) can be recorded.
-- Add actor_label to store the display name for non-user actors
-- (e.g. MCP key name, or "MCP" when the key has no name).

PRAGMA foreign_keys=OFF;

-- Recreate the table with user_id nullable and actor_label added
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

INSERT INTO `activity_events_new`
  (`id`, `project_id`, `user_id`, `actor_label`, `event_type`, `entity_id`, `entity_name`, `metadata`, `created_at`)
SELECT
  `id`, `project_id`, `user_id`, NULL, `event_type`, `entity_id`, `entity_name`, `metadata`, `created_at`
FROM `activity_events`;

DROP TABLE `activity_events`;
ALTER TABLE `activity_events_new` RENAME TO `activity_events`;

CREATE INDEX `activity_events_project_id_idx` ON `activity_events` (`project_id`);
CREATE INDEX `activity_events_user_id_idx` ON `activity_events` (`user_id`);
CREATE INDEX `activity_events_project_created_idx` ON `activity_events` (`project_id`, `created_at`);

PRAGMA foreign_keys=ON;
