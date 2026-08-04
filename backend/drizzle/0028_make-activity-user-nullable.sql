-- Make activity_events.user_id nullable so non-user actors (e.g. MCP API
-- keys) can record events with only an actor_label.
--
-- Migration 0025 created activity_events with user_id NOT NULL, but the
-- application layer has always supported two actor kinds (see
-- ActivityService.record docs): a real user (userId set) or a non-user
-- actor (actorLabel set, userId NULL). Migration 0026 added actor_label but
-- left the NOT NULL constraint in place, so every MCP API-key activity
-- insert failed the constraint and was silently dropped by the best-effort
-- service. This rebuilds the table with a nullable user_id to match the
-- schema (src/db/schema/activity-events.ts).

PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text,
	`actor_label` text,
	`event_type` text(64) NOT NULL,
	`entity_id` text(500),
	`entity_name` text(500),
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_activity_events`("id", "project_id", "user_id", "actor_label", "event_type", "entity_id", "entity_name", "metadata", "created_at") SELECT "id", "project_id", "user_id", "actor_label", "event_type", "entity_id", "entity_name", "metadata", "created_at" FROM `activity_events`;--> statement-breakpoint
DROP TABLE `activity_events`;--> statement-breakpoint
ALTER TABLE `__new_activity_events` RENAME TO `activity_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `activity_events_project_id_idx` ON `activity_events` (`project_id`);--> statement-breakpoint
CREATE INDEX `activity_events_user_id_idx` ON `activity_events` (`user_id`);--> statement-breakpoint
CREATE INDEX `activity_events_project_created_idx` ON `activity_events` (`project_id`,`created_at`);
