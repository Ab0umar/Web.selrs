CREATE INDEX `idx_patient_page_updated`
  ON `patientPageStates` (`patientId`, `page`, `updatedAt`);
