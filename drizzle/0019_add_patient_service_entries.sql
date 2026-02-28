CREATE TABLE IF NOT EXISTS `patientServiceEntries` (
  `id` int AUTO_INCREMENT NOT NULL,
  `patientId` int NOT NULL,
  `serviceCode` varchar(64) NOT NULL,
  `serviceName` varchar(255),
  `source` enum('mssql','manual','import') NOT NULL DEFAULT 'mssql',
  `sourceRef` varchar(128) NOT NULL,
  `serviceDate` date,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `patientServiceEntries_id` PRIMARY KEY(`id`),
  CONSTRAINT `patientServiceEntries_sourceRef_unique` UNIQUE(`sourceRef`),
  KEY `patientServiceEntries_patientId_idx` (`patientId`),
  KEY `patientServiceEntries_serviceCode_idx` (`serviceCode`)
);
