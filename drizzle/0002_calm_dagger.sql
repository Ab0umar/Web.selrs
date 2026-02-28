CREATE TABLE `medications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('tablet','drops','ointment','injection','suspension','other') NOT NULL,
	`activeIngredient` varchar(255),
	`strength` varchar(100),
	`manufacturer` varchar(255),
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `medications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prescriptionItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`prescriptionId` int NOT NULL,
	`medicationId` int NOT NULL,
	`dosage` varchar(255) NOT NULL,
	`frequency` varchar(255) NOT NULL,
	`duration` varchar(255),
	`instructions` text,
	`quantity` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `prescriptionItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `testRequestItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`testRequestId` int NOT NULL,
	`testId` int NOT NULL,
	`notes` text,
	`result` text,
	`resultDate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `testRequestItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `testRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`doctorId` int NOT NULL,
	`visitId` int,
	`requestDate` timestamp NOT NULL DEFAULT (now()),
	`priority` enum('routine','urgent','stat') DEFAULT 'routine',
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `testRequests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('examination','lab','imaging','other') NOT NULL,
	`category` varchar(255),
	`description` text,
	`normalRange` varchar(255),
	`unit` varchar(100),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tests_id` PRIMARY KEY(`id`)
);
