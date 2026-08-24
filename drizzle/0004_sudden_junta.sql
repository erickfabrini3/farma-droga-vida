CREATE TABLE `product_metrics` (
	`product_id` integer PRIMARY KEY NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`cart_adds` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `site_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`banner_active` integer DEFAULT true NOT NULL,
	`banner_eyebrow` text DEFAULT 'Oferta da semana' NOT NULL,
	`banner_title` text DEFAULT 'Economize cuidando de quem você ama.' NOT NULL,
	`banner_text` text DEFAULT 'Produtos selecionados com condições especiais por tempo limitado.' NOT NULL,
	`banner_cta_label` text DEFAULT 'Ver ofertas' NOT NULL,
	`banner_cta_href` text DEFAULT '#ofertas' NOT NULL,
	`store_1_hours` text DEFAULT 'Horário a confirmar' NOT NULL,
	`store_1_image_url` text DEFAULT '' NOT NULL,
	`store_2_hours` text DEFAULT 'Horário a confirmar' NOT NULL,
	`store_2_image_url` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `products` ADD `stock_quantity` integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `badge` text DEFAULT 'Oferta' NOT NULL;
--> statement-breakpoint
INSERT INTO `site_settings` (`id`) VALUES (1);
--> statement-breakpoint
UPDATE `products` SET `stock_quantity` = 1 WHERE `name` = 'Vitergan Master-N';
--> statement-breakpoint
UPDATE `products` SET `badge` = 'Mais vendido' WHERE `name` = 'Ômega 3 Catarinense';
