PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_project_collaborators` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`mcp_session_id` text,
	`collaborator_type` text DEFAULT 'user' NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invited_by` text,
	`invited_at` integer NOT NULL,
	`accepted_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mcp_session_id`) REFERENCES `mcp_oauth_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_project_collaborators`("project_id", "user_id", "mcp_session_id", "collaborator_type", "role", "status", "invited_by", "invited_at", "accepted_at") SELECT "project_id", "user_id", "mcp_session_id", "collaborator_type", "role", "status", "invited_by", "invited_at", "accepted_at" FROM `project_collaborators`;--> statement-breakpoint
DROP TABLE `project_collaborators`;--> statement-breakpoint
ALTER TABLE `__new_project_collaborators` RENAME TO `project_collaborators`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `project_collaborators_user_unique_idx` ON `project_collaborators` (`project_id`,`user_id`) WHERE "project_collaborators"."collaborator_type" = 'user';--> statement-breakpoint
CREATE UNIQUE INDEX `project_collaborators_oauth_unique_idx` ON `project_collaborators` (`project_id`,`mcp_session_id`) WHERE "project_collaborators"."mcp_session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `project_collaborators_session_idx` ON `project_collaborators` (`mcp_session_id`);--> statement-breakpoint
CREATE INDEX `project_collaborators_project_idx` ON `project_collaborators` (`project_id`);