CREATE TABLE IF NOT EXISTS `userPageStates` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `page` varchar(128) NOT NULL,
  `data` json,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `userPageStates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `userPageStates_user_page_idx` ON `userPageStates` (`userId`,`page`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `patientPageStates` (
  `id` int AUTO_INCREMENT NOT NULL,
  `patientId` int NOT NULL,
  `page` varchar(128) NOT NULL,
  `data` json,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `patientPageStates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patientPageStates_patient_page_idx` ON `patientPageStates` (`patientId`,`page`);
