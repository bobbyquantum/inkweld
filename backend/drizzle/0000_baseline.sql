CREATE TABLE IF NOT EXISTS `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text,
	`name` text,
	`email` text,
	`password` text,
	`githubId` text,
	`enabled` integer DEFAULT false NOT NULL,
	`approved` integer DEFAULT false NOT NULL,
	`isAdmin` integer DEFAULT false NOT NULL,
	`sessionsValidFrom` integer DEFAULT 0 NOT NULL,
	`hasAvatar` integer DEFAULT false NOT NULL,
	`hasBackground` integer DEFAULT false NOT NULL,
	`preferences` text,
	`hasBanner` integer DEFAULT false NOT NULL,
	`bio` text,
	`profileVisibility` text DEFAULT 'private' NOT NULL,
	`activityVisibility` text DEFAULT 'public' NOT NULL,
	`projectsVisibility` text DEFAULT 'private' NOT NULL,
	`syncQuotaBytes` integer,
	`storageUsedBytes` integer DEFAULT 0 NOT NULL,
	`policyAcceptedVersion` text,
	`policyAcceptedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_githubId_unique` ON `users` (`githubId`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text,
	`expiredAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text(1000),
	`user_id` text NOT NULL,
	`cover_image` text,
	`min_client_version` text,
	`created_date` integer NOT NULL,
	`updated_date` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `projects_user_slug_unique` ON `projects` (`user_id`,`slug`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `project_collaborators` (
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
CREATE UNIQUE INDEX IF NOT EXISTS `project_collaborators_user_unique_idx` ON `project_collaborators` (`project_id`,`user_id`) WHERE "project_collaborators"."collaborator_type" = 'user';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `project_collaborators_oauth_unique_idx` ON `project_collaborators` (`project_id`,`mcp_session_id`) WHERE "project_collaborators"."mcp_session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `project_collaborators_session_idx` ON `project_collaborators` (`mcp_session_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `project_collaborators_project_idx` ON `project_collaborators` (`project_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `project_collaborators_user_status_idx` ON `project_collaborators` (`user_id`,`status`,`invited_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `project_slug_aliases` (
	`old_slug` text NOT NULL,
	`user_id` text NOT NULL,
	`new_slug` text NOT NULL,
	`renamed_at` integer NOT NULL,
	PRIMARY KEY(`old_slug`, `user_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_project_slug_aliases_user_id` ON `project_slug_aliases` (`user_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `project_tombstones` (
	`slug` text NOT NULL,
	`user_id` text NOT NULL,
	`deleted_at` integer NOT NULL,
	PRIMARY KEY(`slug`, `user_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `project_tombstones_user_id_idx` ON `project_tombstones` (`user_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `document_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text(500) NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text(255) NOT NULL,
	`description` text,
	`xml_content` text,
	`worldbuilding_data` text,
	`word_count` integer,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `document_snapshots_project_document_idx` ON `document_snapshots` (`project_id`,`document_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `published_files` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`filename` text NOT NULL,
	`format` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`plan_name` text NOT NULL,
	`plan_id` text,
	`share_permission` text DEFAULT 'private' NOT NULL,
	`share_token` text,
	`meta_title` text NOT NULL,
	`meta_author` text NOT NULL,
	`meta_subtitle` text,
	`meta_language` text,
	`meta_item_count` integer DEFAULT 0 NOT NULL,
	`meta_word_count` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `published_files_project_id_idx` ON `published_files` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `published_files_share_token_idx` ON `published_files` (`share_token`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_published_files_plan_id` ON `published_files` (`plan_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`encrypted` integer DEFAULT false NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `mcp_oauth_clients` (
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
CREATE INDEX IF NOT EXISTS `mcp_oauth_clients_name_idx` ON `mcp_oauth_clients` (`client_name`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `mcp_oauth_sessions` (
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
	`access_all_projects` integer DEFAULT false NOT NULL,
	`default_role` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `mcp_oauth_clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `mcp_oauth_sessions_user_idx` ON `mcp_oauth_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `mcp_oauth_sessions_client_idx` ON `mcp_oauth_sessions` (`client_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `mcp_oauth_sessions_refresh_token_idx` ON `mcp_oauth_sessions` (`refresh_token_hash`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `mcp_oauth_sessions_prev_token_idx` ON `mcp_oauth_sessions` (`previous_refresh_token_hash`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `mcp_oauth_codes` (
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
	`access_all_projects` integer DEFAULT false NOT NULL,
	`default_role` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `mcp_oauth_clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `mcp_oauth_codes_code_hash_unique` ON `mcp_oauth_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `mcp_oauth_codes_hash_idx` ON `mcp_oauth_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `mcp_oauth_codes_expires_idx` ON `mcp_oauth_codes` (`expires_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `image_model_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`supports_image_input` integer DEFAULT false NOT NULL,
	`supports_custom_resolutions` integer DEFAULT false NOT NULL,
	`uses_aspect_ratio_only` integer DEFAULT false NOT NULL,
	`supported_sizes` text,
	`default_size` text,
	`model_config` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`credit_cost` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `image_model_profiles_name_unique` ON `image_model_profiles` (`name`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `image_generation_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`profile_id` text,
	`profile_name` text NOT NULL,
	`prompt` text NOT NULL,
	`reference_image_urls` text,
	`output_image_urls` text,
	`credit_cost` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`message` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `image_model_profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_user_idx` ON `image_generation_audits` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_created_idx` ON `image_generation_audits` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_profile_idx` ON `image_generation_audits` (`profile_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_status_idx` ON `image_generation_audits` (`status`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`type` text DEFAULT 'announcement' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`isPublic` integer DEFAULT true NOT NULL,
	`publishedAt` integer,
	`expiresAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`createdBy` text NOT NULL,
	FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `announcement_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`announcementId` text NOT NULL,
	`userId` text NOT NULL,
	`readAt` integer NOT NULL,
	FOREIGN KEY (`announcementId`) REFERENCES `announcements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `announcement_user_idx` ON `announcement_reads` (`announcementId`,`userId`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `oauth_login_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `oauth_login_codes_hash_idx` ON `oauth_login_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `oauth_login_codes_expires_idx` ON `oauth_login_codes` (`expires_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `comment_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text(500) NOT NULL,
	`project_id` text NOT NULL,
	`author_id` text NOT NULL,
	`resolved` integer DEFAULT false NOT NULL,
	`resolved_by` text,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comment_threads_project` ON `comment_threads` (`project_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comment_threads_document` ON `comment_threads` (`document_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comment_threads_author` ON `comment_threads` (`author_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `comment_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`author_id` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	`edited_at` integer,
	FOREIGN KEY (`thread_id`) REFERENCES `comment_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comment_messages_thread` ON `comment_messages` (`thread_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comment_messages_author` ON `comment_messages` (`author_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `comment_read_status` (
	`user_id` text NOT NULL,
	`document_id` text(500) NOT NULL,
	`last_seen_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `document_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_passkeys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`aaguid` text,
	`device_type` text,
	`backed_up` integer DEFAULT false NOT NULL,
	`name` text,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `user_passkeys_credential_id_unique` ON `user_passkeys` (`credential_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_passkeys_user_id_idx` ON `user_passkeys` (`user_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `webauthn_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge` text NOT NULL,
	`type` text NOT NULL,
	`user_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `webauthn_challenges_challenge_idx` ON `webauthn_challenges` (`challenge`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `webauthn_challenges_expires_at_idx` ON `webauthn_challenges` (`expires_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `passkey_recovery_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `passkey_recovery_tokens_token_hash_idx` ON `passkey_recovery_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `passkey_recovery_tokens_user_id_idx` ON `passkey_recovery_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `writing_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`element_id` text(500) NOT NULL,
	`user_id` text NOT NULL,
	`session_start` integer NOT NULL,
	`session_end` integer,
	`start_word_count` integer NOT NULL,
	`end_word_count` integer,
	`words_delta` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `writing_sessions_project_id_idx` ON `writing_sessions` (`project_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `writing_sessions_user_id_idx` ON `writing_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `writing_sessions_element_id_idx` ON `writing_sessions` (`element_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `writing_sessions_project_start_idx` ON `writing_sessions` (`project_id`,`session_start`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `activity_events` (
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
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `activity_events_project_id_idx` ON `activity_events` (`project_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `activity_events_user_id_idx` ON `activity_events` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `activity_events_project_created_idx` ON `activity_events` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `auto_review_rejections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`document_id` text NOT NULL,
	`element_id` text NOT NULL,
	`original_text` text NOT NULL,
	`suggestion_text` text NOT NULL,
	`category` text,
	`message` text,
	`rejected_by` text NOT NULL,
	`rejected_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rejected_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_auto_review_rejections_project` ON `auto_review_rejections` (`project_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_auto_review_rejections_document` ON `auto_review_rejections` (`document_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_auto_review_rejections_element` ON `auto_review_rejections` (`element_id`);