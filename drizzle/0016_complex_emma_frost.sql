CREATE TABLE `diseases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`branch` varchar(100),
	`abbrev` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `diseases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operationListItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listId` int NOT NULL,
	`number` varchar(50),
	`name` varchar(255) NOT NULL,
	`phone` varchar(50),
	`doctor` varchar(255),
	`operation` varchar(255),
	`center` boolean NOT NULL DEFAULT false,
	`payment` boolean NOT NULL DEFAULT false,
	`code` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operationListItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operationLists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`doctorTab` varchar(100) NOT NULL,
	`listDate` date NOT NULL,
	`operationType` varchar(50),
	`doctorName` varchar(255),
	`listTime` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `operationLists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `patientPageStates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`page` varchar(128) NOT NULL,
	`data` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `patientPageStates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sheet_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`sheetType` enum('consultant','specialist','lasik','external') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sheet_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `testFavorites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`testId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `testFavorites_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userPageStates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`page` varchar(128) NOT NULL,
	`data` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userPageStates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_permissions` (
	`userId` int NOT NULL,
	`pageId` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_permissions_userId_pageId_pk` PRIMARY KEY(`userId`,`pageId`)
);
--> statement-breakpoint
ALTER TABLE `prescriptions` MODIFY COLUMN `visitId` int;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','doctor','nurse','technician','reception','manager','accountant') NOT NULL DEFAULT 'reception';--> statement-breakpoint
ALTER TABLE `doctorReports` ADD `diseases` text;--> statement-breakpoint
ALTER TABLE `doctorReports` ADD `visitDate` date;--> statement-breakpoint
ALTER TABLE `doctorReports` ADD `operationType` varchar(255);--> statement-breakpoint
ALTER TABLE `doctorReports` ADD `clinicalOpinion` text;--> statement-breakpoint
ALTER TABLE `doctorReports` ADD `additionalNotes` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `serviceType` enum('consultant','specialist','lasik','surgery','external') DEFAULT 'consultant';--> statement-breakpoint
ALTER TABLE `patients` ADD `locationType` enum('center','external') DEFAULT 'center';--> statement-breakpoint
ALTER TABLE `patients` ADD `lastVisit` date;