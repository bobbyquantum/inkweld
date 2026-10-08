ALTER TABLE `users` ADD `homeAssistantUserId` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_homeAssistantUserId_unique` ON `users` (`homeAssistantUserId`);