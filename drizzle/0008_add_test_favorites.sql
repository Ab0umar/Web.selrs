CREATE TABLE IF NOT EXISTS `testFavorites` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `testId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `testFavorites_id` PRIMARY KEY(`id`),
  UNIQUE KEY `testFavorites_user_test_idx` (`userId`,`testId`)
);
--> statement-breakpoint
