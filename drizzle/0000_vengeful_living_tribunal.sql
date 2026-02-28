CREATE TABLE `appointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`doctorId` int,
	`appointmentDate` timestamp NOT NULL,
	`appointmentType` enum('examination','surgery','followup') NOT NULL,
	`branch` enum('examinations','surgery') NOT NULL,
	`status` enum('scheduled','completed','cancelled','no_show') DEFAULT 'scheduled',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auditLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int,
	`action` varchar(255),
	`entityType` varchar(100),
	`entityId` int,
	`changes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `consentForms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`formType` varchar(255),
	`signedDate` timestamp NOT NULL,
	`content` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `consentForms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `doctorReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`visitId` int NOT NULL,
	`patientId` int NOT NULL,
	`doctorId` int,
	`diagnosis` text,
	`treatment` text,
	`recommendations` text,
	`followUpDate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `doctorReports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `examinations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`visitId` int NOT NULL,
	`patientId` int NOT NULL,
	`ucvaOD` varchar(20),
	`ucvaOS` varchar(20),
	`bcvaOD` varchar(20),
	`bcvaOS` varchar(20),
	`sphereOD` varchar(20),
	`sphereOS` varchar(20),
	`cylinderOD` varchar(20),
	`cylinderOS` varchar(20),
	`axisOD` varchar(20),
	`axisOS` varchar(20),
	`iopOD` varchar(20),
	`iopOS` varchar(20),
	`anteriorSegmentOD` text,
	`anteriorSegmentOS` text,
	`posteriorSegmentOD` text,
	`posteriorSegmentOS` text,
	`airPuffOD` varchar(20),
	`airPuffOS` varchar(20),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `examinations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `medicalHistoryChecklist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`diabetes` boolean DEFAULT false,
	`hypertension` boolean DEFAULT false,
	`heartDisease` boolean DEFAULT false,
	`asthma` boolean DEFAULT false,
	`allergies` boolean DEFAULT false,
	`previousSurgeries` text,
	`medications` text,
	`familyHistory` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `medicalHistoryChecklist_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `medications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('tablet','drops','ointment','injection') NOT NULL,
	`dosage` varchar(100),
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `medications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `patients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientCode` varchar(50) NOT NULL,
	`fullName` varchar(255) NOT NULL,
	`dateOfBirth` date,
	`age` int,
	`gender` enum('male','female'),
	`nationalId` varchar(20),
	`phone` varchar(20),
	`alternatePhone` varchar(20),
	`address` text,
	`occupation` varchar(255),
	`referralSource` varchar(255),
	`medicalHistory` text,
	`allergies` text,
	`branch` enum('examinations','surgery') DEFAULT 'examinations',
	`status` enum('new','followup','archived') DEFAULT 'new',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `patients_id` PRIMARY KEY(`id`),
	CONSTRAINT `patients_patientCode_unique` UNIQUE(`patientCode`)
);
--> statement-breakpoint
CREATE TABLE `pentacamResults` (
	`id` int AUTO_INCREMENT NOT NULL,
	`visitId` int NOT NULL,
	`patientId` int NOT NULL,
	`recordedBy` int,
	`pachymetryOD` varchar(20),
	`pachymetryOS` varchar(20),
	`keratometryOD` varchar(50),
	`keratometryOS` varchar(50),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pentacamResults_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `postOpFollowups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`surgeryId` int NOT NULL,
	`patientId` int NOT NULL,
	`followupDate` timestamp NOT NULL,
	`findings` text,
	`recommendations` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `postOpFollowups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prescriptionItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`prescriptionId` int NOT NULL,
	`medicationId` int NOT NULL,
	`dosage` varchar(100),
	`frequency` varchar(100),
	`duration` varchar(100),
	`instructions` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `prescriptionItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prescriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`visitId` int NOT NULL,
	`patientId` int NOT NULL,
	`doctorId` int,
	`prescriptionDate` timestamp NOT NULL DEFAULT (now()),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `prescriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `surgeries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`surgeryType` varchar(255),
	`surgeryDate` timestamp NOT NULL,
	`surgeon` varchar(255),
	`notes` text,
	`status` enum('scheduled','completed','cancelled') DEFAULT 'scheduled',
	`branch` enum('examinations','surgery') DEFAULT 'surgery',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `surgeries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `systemSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(255) NOT NULL,
	`value` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `systemSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `systemSettings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `testRequestItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`testRequestId` int NOT NULL,
	`testId` int NOT NULL,
	`result` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `testRequestItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `testRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`visitId` int,
	`requestDate` timestamp NOT NULL DEFAULT (now()),
	`status` enum('pending','completed','cancelled') DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `testRequests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('examination','lab','imaging') NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`password` varchar(255) NOT NULL,
	`name` text,
	`email` varchar(320),
	`role` enum('admin','doctor','nurse','technician','reception','manager') NOT NULL DEFAULT 'reception',
	`branch` enum('examinations','surgery','both') NOT NULL DEFAULT 'examinations',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `visits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`appointmentId` int,
	`visitDate` timestamp NOT NULL DEFAULT (now()),
	`visitType` enum('consultation','examination','surgery','followup') NOT NULL,
	`chiefComplaint` text,
	`branch` enum('examinations','surgery') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `visits_id` PRIMARY KEY(`id`)
);
