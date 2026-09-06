-- Public profile controls.
--
-- `profileVisibility` gates the whole profile page; the per-section levels
-- (`activityVisibility`, `projectsVisibility`) can only narrow it further.
-- Each holds one of 'public' | 'members' | 'private':
--   public  -> anyone, including anonymous visitors
--   members -> any signed-in user
--   private -> only the owner (and admins)
--
-- Existing accounts default to a private profile, which matches the previous
-- behaviour where the profile page only ever showed the signed-in user to
-- themselves. Sections default to 'public' (i.e. "as visible as the profile")
-- except projects, which default to private because project titles were never
-- visible to anyone but the owner and collaborators before.
--
-- SQLite ALTER TABLE ADD COLUMN is non-destructive and requires no rebuild.

ALTER TABLE `users` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `users` ADD `profileVisibility` text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `activityVisibility` text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `projectsVisibility` text DEFAULT 'private' NOT NULL;
