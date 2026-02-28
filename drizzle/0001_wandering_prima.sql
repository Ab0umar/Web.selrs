ALTER TABLE `medications` MODIFY COLUMN `type` enum('tablet','drops','ointment','injection','suspension','other') NOT NULL;--> statement-breakpoint
ALTER TABLE `tests` MODIFY COLUMN `type` enum('examination','lab','imaging','other') NOT NULL;--> statement-breakpoint
ALTER TABLE `medications` ADD `activeIngredient` varchar(255);--> statement-breakpoint
ALTER TABLE `medications` ADD `strength` varchar(100);--> statement-breakpoint
ALTER TABLE `medications` ADD `manufacturer` varchar(255);--> statement-breakpoint
ALTER TABLE `tests` ADD `category` varchar(255);--> statement-breakpoint
ALTER TABLE `tests` ADD `normalRange` varchar(255);--> statement-breakpoint
ALTER TABLE `tests` ADD `unit` varchar(64);