CREATE TABLE `search_analytics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`normalized_query` text NOT NULL,
	`query` text NOT NULL,
	`search_count` integer DEFAULT 1 NOT NULL,
	`last_searched_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_analytics_normalized_query_unique` ON `search_analytics` (`normalized_query`);--> statement-breakpoint
CREATE TABLE `store_special_hours` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`store_number` integer NOT NULL,
	`date` text NOT NULL,
	`closed` integer DEFAULT false NOT NULL,
	`opens` text DEFAULT '' NOT NULL,
	`closes` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_special_hours_store_date_unique` ON `store_special_hours` (`store_number`,`date`);