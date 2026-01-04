CREATE TABLE `announcements` (
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
CREATE TABLE `announcement_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`announcementId` text NOT NULL,
	`userId` text NOT NULL,
	`readAt` integer NOT NULL,
	FOREIGN KEY (`announcementId`) REFERENCES `announcements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `announcement_user_idx` ON `announcement_reads` (`announcementId`,`userId`);