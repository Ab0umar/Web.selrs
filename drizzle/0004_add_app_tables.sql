-- Add serviceType to patients
ALTER TABLE `patients`
  ADD COLUMN `serviceType` enum('consultant','specialist','lasik','surgery','external') DEFAULT 'consultant';
--> statement-breakpoint

-- Allow prescriptions.visitId to be nullable
ALTER TABLE `prescriptions`
  MODIFY COLUMN `visitId` int NULL;
--> statement-breakpoint

-- User permissions
CREATE TABLE IF NOT EXISTS `user_permissions` (
  `userId` int NOT NULL,
  `pageId` varchar(255) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`userId`, `pageId`)
);
--> statement-breakpoint

-- Sheet entries
CREATE TABLE IF NOT EXISTS `sheet_entries` (
  `id` int AUTO_INCREMENT NOT NULL,
  `patientId` int NOT NULL,
  `sheetType` enum('consultant','specialist','lasik','external') NOT NULL,
  `content` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `sheet_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

-- Operation lists
CREATE TABLE IF NOT EXISTS `operationLists` (
  `id` int AUTO_INCREMENT NOT NULL,
  `doctorTab` varchar(100) NOT NULL,
  `listDate` date NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `operationLists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `operationListItems` (
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
