CREATE TABLE `mcp_access_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`projectId` text NOT NULL,
	`name` text NOT NULL,
	`keyHash` text NOT NULL,
	`keyPrefix` text NOT NULL,
	`permissions` text DEFAULT '["read:project","read:elements"]' NOT NULL,
	`expiresAt` integer,
	`lastUsedAt` integer,
	`lastUsedIp` text,
	`createdAt` integer NOT NULL,
	`revokedAt` integer,
	`revokedReason` text,
	FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_access_keys_keyHash_unique` ON `mcp_access_keys` (`keyHash`);--> statement-breakpoint
CREATE INDEX `mcp_access_keys_project_idx` ON `mcp_access_keys` (`projectId`);--> statement-breakpoint
CREATE INDEX `mcp_access_keys_hash_idx` ON `mcp_access_keys` (`keyHash`);