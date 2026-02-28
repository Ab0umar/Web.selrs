CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`action` varchar(50) NOT NULL,
	`entityType` varchar(50) NOT NULL,
	`entityId` int,
	`oldData` json,
	`newData` json,
	`description` text,
	`ipAddress` varchar(45),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(100) NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`category` varchar(50),
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_adminId_users_id_fk` FOREIGN KEY (`adminId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `system_settings` ADD CONSTRAINT `system_settings_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;