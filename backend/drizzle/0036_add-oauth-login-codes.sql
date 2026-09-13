-- One-time GitHub sign-in codes, moved out of a per-process Map.
--
-- The OAuth callback redirects the browser with an opaque code which the SPA
-- exchanges for a session via POST. Held in memory, the code only existed on
-- the instance/isolate that handled the callback, so the exchange failed
-- whenever it landed elsewhere (any multi-replica deploy; Workers routinely).
-- Only the code's SHA-256 hash is stored; the row references the user and the
-- session JWT is minted at exchange time.

CREATE TABLE `oauth_login_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `oauth_login_codes_hash_idx` ON `oauth_login_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `oauth_login_codes_expires_idx` ON `oauth_login_codes` (`expires_at`);
