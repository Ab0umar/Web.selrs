CREATE INDEX `idx_patient_service_date`
  ON `patientServiceEntries` (`patientId`, `serviceCode`, `serviceDate`);
