-- Add "all projects" + default role to MCP OAuth sessions and codes.
--
-- Enables a session to grant access to ALL of the user's projects (current
-- and future) at a single default role, rather than maintaining an explicit
-- project_collaborators row per project. Explicit per-project grants remain
-- honoured as overrides when present.
--
-- `access_all_projects` is a boolean flag (stored as 0/1).
-- `default_role` is nullable; when set and access_all_projects is true it is
-- used as the role for every project the user owns.
--
-- The authorization-code table carries the same fields so the choice made on
-- the consent screen survives the code-to-token exchange before the session is
-- created.
--
-- SQLite ALTER TABLE ADD COLUMN is non-destructive and requires no rebuild.

ALTER TABLE `mcp_oauth_sessions` ADD `access_all_projects` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `mcp_oauth_sessions` ADD `default_role` text;--> statement-breakpoint
ALTER TABLE `mcp_oauth_codes` ADD `access_all_projects` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `mcp_oauth_codes` ADD `default_role` text;