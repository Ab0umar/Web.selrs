ALTER TABLE patients
  ADD INDEX idx_patients_full_name (fullName),
  ADD INDEX idx_patients_last_visit (lastVisit),
  ADD INDEX idx_patients_service_type (serviceType),
  ADD INDEX idx_patients_location_type (locationType),
  ADD INDEX idx_patients_service_location_visit (serviceType, locationType, lastVisit);
