CREATE TABLE `mcp_oauth_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`client_name` text NOT NULL,
	`client_uri` text,
	`logo_uri` text,
	`redirect_uris` text NOT NULL,
	`client_type` text DEFAULT 'public' NOT NULL,
	`client_secret_hash` text,
	`client_secret_prefix` text,
	`contact_email` text,
	`policy_uri` text,
	`tos_uri` text,
	`is_dynamic` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `mcp_oauth_clients_name_idx` ON `mcp_oauth_clients` (`client_name`);--> statement-breakpoint
CREATE TABLE `mcp_oauth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`refresh_token_hash` text NOT NULL,
	`previous_refresh_token_hash` text,
	`previous_token_expires_at` integer,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`last_used_ip` text,
	`last_used_user_agent` text,
	`revoked_at` integer,
	`revoked_reason` text,
	`expires_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `mcp_oauth_clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mcp_oauth_sessions_user_idx` ON `mcp_oauth_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `mcp_oauth_sessions_client_idx` ON `mcp_oauth_sessions` (`client_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_oauth_sessions_refresh_token_idx` ON `mcp_oauth_sessions` (`refresh_token_hash`);--> statement-breakpoint
CREATE INDEX `mcp_oauth_sessions_prev_token_idx` ON `mcp_oauth_sessions` (`previous_refresh_token_hash`);--> statement-breakpoint
CREATE TABLE `mcp_oauth_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`code_challenge` text NOT NULL,
	`code_challenge_method` text DEFAULT 'S256' NOT NULL,
	`redirect_uri` text NOT NULL,
	`grants` text NOT NULL,
	`scope` text,
	`state` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `mcp_oauth_clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_oauth_codes_code_hash_unique` ON `mcp_oauth_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `mcp_oauth_codes_hash_idx` ON `mcp_oauth_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `mcp_oauth_codes_expires_idx` ON `mcp_oauth_codes` (`expires_at`);--> statement-breakpoint
ALTER TABLE `project_collaborators` ADD `mcp_session_id` text REFERENCES mcp_oauth_sessions(id);--> statement-breakpoint
ALTER TABLE `project_collaborators` ADD `collaborator_type` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
CREATE INDEX `project_collaborators_session_idx` ON `project_collaborators` (`mcp_session_id`);--> statement-breakpoint
CREATE INDEX `project_collaborators_project_idx` ON `project_collaborators` (`project_id`);