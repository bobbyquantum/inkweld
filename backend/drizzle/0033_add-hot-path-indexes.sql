-- Indexes for hot lookup paths that were full table scans.
--
-- projects(user_id, slug): every project request resolves username/slug ->
--   project (users by unique username, then projects by user_id + slug); the
--   leading column also serves "all projects for a user".
-- project_collaborators(user_id, status): collaborator-side lookups (pending
--   invitations, projects shared with me, OAuth grants by granting user). All
--   existing indexes led with project_id or mcp_session_id.
-- document_snapshots(project_id, document_id): snapshot listings; rows carry
--   the full XML payload so scans are expensive per row.
-- project_tombstones(user_id): the PK is (slug, user_id) so per-user lookups
--   could not use it.
-- published_files(project_id) and (share_token): per-project listings and
--   anonymous share-link resolution.
--
-- CREATE INDEX IF NOT EXISTS is idempotent and non-destructive.

CREATE INDEX IF NOT EXISTS `projects_user_id_slug_idx` ON `projects` (`user_id`,`slug`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `project_collaborators_user_status_idx` ON `project_collaborators` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `document_snapshots_project_document_idx` ON `document_snapshots` (`project_id`,`document_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `project_tombstones_user_id_idx` ON `project_tombstones` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `published_files_project_id_idx` ON `published_files` (`project_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `published_files_share_token_idx` ON `published_files` (`share_token`);
