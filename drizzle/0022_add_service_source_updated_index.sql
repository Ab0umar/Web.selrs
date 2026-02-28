CREATE INDEX `idx_service_source_updated`
  ON `patientServiceEntries` (`source`, `updatedAt`);
