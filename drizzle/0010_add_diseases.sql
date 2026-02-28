CREATE TABLE IF NOT EXISTS `diseases` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(255) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `diseases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `diseases_name_idx` ON `diseases` (`name`);
