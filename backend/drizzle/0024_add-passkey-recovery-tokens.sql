CREATE TABLE `passkey_recovery_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `passkey_recovery_tokens_token_hash_idx` ON `passkey_recovery_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `passkey_recovery_tokens_user_id_idx` ON `passkey_recovery_tokens` (`user_id`);
