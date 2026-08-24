CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`summary` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `admin_users` ADD `can_manage_products` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `admin_users` ADD `can_manage_content` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `admin_users` ADD `can_view_analytics` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `admin_users` ADD `totp_secret` text;--> statement-breakpoint
ALTER TABLE `admin_users` ADD `totp_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `brand` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `active_ingredient` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `dosage` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `barcode` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `registration` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `available_store_1` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `available_store_2` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `offer_starts_at` text;--> statement-breakpoint
ALTER TABLE `products` ADD `offer_ends_at` text;