ALTER TABLE `products` ADD `subcategory` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `products` SET `category` = 'Suplementos', `subcategory` = 'Polivitamínicos' WHERE `name` = 'Vitergan Master-N';
--> statement-breakpoint
UPDATE `products` SET `category` = 'Perfumaria e Cuidados Pessoais', `subcategory` = 'Cuidados com a pele' WHERE `name` = 'Nivea Aqua Rose';
--> statement-breakpoint
UPDATE `products` SET `category` = 'Suplementos', `subcategory` = 'Ômega e ácidos graxos' WHERE `name` = 'Ômega 3 Catarinense';
--> statement-breakpoint
UPDATE `products` SET `category` = 'Saúde e Bem-estar', `subcategory` = 'Aparelhos de saúde' WHERE `name` = 'Omron HEM-7122';
--> statement-breakpoint
UPDATE `products` SET `category` = 'Suplementos', `subcategory` = 'Polivitamínicos' WHERE `name` = 'TRIPLO IMUNO 30CP';
--> statement-breakpoint
UPDATE `products` SET `category` = 'Perfumaria e Cuidados Pessoais', `subcategory` = 'Desodorantes' WHERE `name` = 'DESODORANTE GIOVANNA BABY CR DOLCE VANILLA 50G';
