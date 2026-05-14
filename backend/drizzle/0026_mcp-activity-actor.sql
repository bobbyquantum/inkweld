-- Add actor_label column for MCP API key activity events.
-- This column stores the display name for non-user actors (e.g. MCP key name).
--
-- Note: user_id remains NOT NULL in the DB schema for now; the application
-- layer ensures one of userId or actorLabel is always provided.

ALTER TABLE `activity_events` ADD COLUMN `actor_label` text;
