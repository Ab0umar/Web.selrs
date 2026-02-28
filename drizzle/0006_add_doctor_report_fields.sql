ALTER TABLE `doctorReports`
  ADD COLUMN `visitDate` date,
  ADD COLUMN `operationType` varchar(255),
  ADD COLUMN `clinicalOpinion` text,
  ADD COLUMN `additionalNotes` text;
