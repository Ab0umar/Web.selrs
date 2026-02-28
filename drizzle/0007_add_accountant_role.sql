ALTER TABLE `users`
  MODIFY COLUMN `role` enum('admin','doctor','nurse','technician','reception','manager','accountant') NOT NULL DEFAULT 'reception';
--> statement-breakpoint
