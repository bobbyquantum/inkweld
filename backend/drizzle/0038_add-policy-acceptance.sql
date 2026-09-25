-- Records which version of the instance's privacy policy / terms of service a
-- user last accepted. Both columns are nullable: NULL means "never accepted",
-- which is correct for every existing row (they are asked on next sign-in if
-- the admin turns on REQUIRE_POLICY_ACCEPTANCE).
--
-- `policyAcceptedAt` is Unix seconds, like the other user timestamps.

ALTER TABLE `users` ADD `policyAcceptedVersion` text;--> statement-breakpoint
ALTER TABLE `users` ADD `policyAcceptedAt` integer;
