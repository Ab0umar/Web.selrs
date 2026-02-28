CREATE TABLE `pentacamFiles` (
  `id` int AUTO_INCREMENT NOT NULL,
  `patientId` int,
  `patientCode` varchar(50),
  `sourcePath` varchar(512) NOT NULL,
  `sourceFileName` varchar(255) NOT NULL,
  `mimeType` varchar(128) NOT NULL,
  `fileSizeBytes` int,
  `fileHash` varchar(64),
  `eyeSide` enum('OD','OS','OU','unknown') NOT NULL DEFAULT 'unknown',
  `capturedAt` timestamp,
  `importStatus` enum('imported','duplicate','unmatched','failed') NOT NULL DEFAULT 'imported',
  `importError` text,
  `storageKey` varchar(512),
  `storageUrl` text,
  `metadata` json,
  `importedAt` timestamp NOT NULL DEFAULT (now()),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pentacamFiles_id` PRIMARY KEY(`id`),
  CONSTRAINT `pentacamFiles_sourcePath_unique` UNIQUE(`sourcePath`)
);
--> statement-breakpoint
CREATE INDEX `idx_pentacam_files_patient_imported` ON `pentacamFiles` (`patientId`,`importedAt`);
--> statement-breakpoint
CREATE INDEX `idx_pentacam_files_status_imported` ON `pentacamFiles` (`importStatus`,`importedAt`);
--> statement-breakpoint
CREATE INDEX `idx_pentacam_files_hash` ON `pentacamFiles` (`fileHash`);
