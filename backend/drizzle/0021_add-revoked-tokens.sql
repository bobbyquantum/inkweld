CREATE TABLE `revoked_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`expires_at` integer NOT NULL,
	`revoked_at` integer NOT NULL,
	`reason` text NOT NULL DEFAULT 'logout',
	CONSTRAINT `revoked_tokens_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE INDEX `idx_revoked_tokens_hash` ON `revoked_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `idx_revoked_tokens_user` ON `revoked_tokens` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_revoked_tokens_expires` ON `revoked_tokens` (`expires_at`);
