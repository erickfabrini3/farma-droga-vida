ALTER TABLE `admin_users` ADD `owner_guard` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `admin_users_owner_guard_unique` ON `admin_users` (`owner_guard`);