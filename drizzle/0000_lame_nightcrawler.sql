CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`old_price_cents` integer NOT NULL,
	`price_cents` integer NOT NULL,
	`tone` text DEFAULT 'amber' NOT NULL,
	`image_url` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `products` (`category`, `name`, `detail`, `old_price_cents`, `price_cents`, `tone`, `image_url`, `active`, `sort_order`) VALUES
  ('Vitaminas', 'Vitergan Master-N', '30 comprimidos', 11029, 7499, 'mint', '/products/vitergan-master-n.jpg', 1, 1),
  ('Cuidados com a pele', 'Nivea Aqua Rose', 'Tônico facial • 200 ml', 2599, 1999, 'rose', '/products/nivea-aqua-rose.jpg', 1, 2),
  ('Suplementos', 'Ômega 3 Catarinense', '1000 mg • 120 cápsulas', 8029, 6999, 'amber', '/products/omega-3-catarinense.png', 1, 3),
  ('Saúde em casa', 'Omron HEM-7122', 'Medidor de pressão digital', 26196, 25199, 'blue', '/products/omron-hem-7122.webp', 1, 4);
