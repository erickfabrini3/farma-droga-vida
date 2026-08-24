CREATE TABLE `catalog_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT '+' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_categories_name_unique` ON `catalog_categories` (`name`);--> statement-breakpoint
CREATE TABLE `catalog_subcategories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `catalog_categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_subcategory_category_name_unique` ON `catalog_subcategories` (`category_id`,`name`);--> statement-breakpoint
INSERT INTO `catalog_categories` (`id`, `name`, `icon`, `active`, `sort_order`) VALUES
	(1, 'Área Infantil', '🍼', true, 10),
	(2, 'Suplementos', '✦', true, 20),
	(3, 'Medicamentos', '+', true, 30),
	(4, 'Perfumaria e Cuidados Pessoais', '◇', true, 40),
	(5, 'Saúde e Bem-estar', '♡', true, 50);--> statement-breakpoint
INSERT INTO `catalog_subcategories` (`id`, `category_id`, `name`, `active`, `sort_order`) VALUES
	(1, 1, 'Fraldas', true, 10),
	(2, 1, 'Lenços umedecidos', true, 20),
	(3, 1, 'Higiene infantil', true, 30),
	(4, 1, 'Mamadeiras e acessórios', true, 40),
	(5, 1, 'Chupetas', true, 50),
	(6, 1, 'Fórmulas infantis', true, 60),
	(7, 2, 'Polivitamínicos', true, 10),
	(8, 2, 'Cabelo, pele e unhas', true, 20),
	(9, 2, 'Ômega e ácidos graxos', true, 30),
	(10, 2, 'Vitaminas e minerais', true, 40),
	(11, 2, 'Nutrição esportiva', true, 50),
	(12, 3, 'Resfriado e gripe', true, 10),
	(13, 3, 'Dor e febre', true, 20),
	(14, 3, 'Alergias', true, 30),
	(15, 3, 'Digestão', true, 40),
	(16, 3, 'Primeiros socorros', true, 50),
	(17, 3, 'Outros medicamentos', true, 60),
	(18, 4, 'Hidratantes', true, 10),
	(19, 4, 'Higiene pessoal', true, 20),
	(20, 4, 'Cuidados com a pele', true, 30),
	(21, 4, 'Shampoo e condicionador', true, 40),
	(22, 4, 'Tinturas e tonalizantes', true, 50),
	(23, 4, 'Desodorantes', true, 60),
	(24, 5, 'Aparelhos de saúde', true, 10),
	(25, 5, 'Cuidados diários', true, 20),
	(26, 5, 'Diabetes', true, 30);
