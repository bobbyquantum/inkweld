CREATE TABLE `user_passkeys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`credential_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer NOT NULL DEFAULT 0,
	`transports` text,
	`aaguid` text,
	`device_type` text,
	`backed_up` integer NOT NULL DEFAULT 0,
	`name` text,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_passkeys_credential_id_unique` ON `user_passkeys` (`credential_id`);
--> statement-breakpoint
CREATE INDEX `user_passkeys_user_id_idx` ON `user_passkeys` (`user_id`);
--> statement-breakpoint
CREATE TABLE `webauthn_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge` text NOT NULL,
	`type` text NOT NULL,
	`user_id` text REFERENCES `users`(`id`) ON DELETE CASCADE,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `webauthn_challenges_challenge_idx` ON `webauthn_challenges` (`challenge`);
--> statement-breakpoint
CREATE INDEX `webauthn_challenges_expires_at_idx` ON `webauthn_challenges` (`expires_at`);
