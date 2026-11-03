CREATE TABLE `oidc_login_transactions` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`nonce` text NOT NULL,
	`code_verifier` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oidc_login_transactions_expires_idx` ON `oidc_login_transactions` (`expires_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `oidcIssuer` text;--> statement-breakpoint
ALTER TABLE `users` ADD `oidcSubject` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_oidc_identity_unique` ON `users` (`oidcIssuer`,`oidcSubject`);--> statement-breakpoint
ALTER TABLE `oauth_login_codes` ADD `provider` text DEFAULT 'github' NOT NULL;