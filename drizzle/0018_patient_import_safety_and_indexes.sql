ALTER TABLE patients
  ADD COLUMN doctorId int NULL;
--> statement-breakpoint

CREATE INDEX idx_patients_doctor_id ON patients (doctorId);
--> statement-breakpoint
CREATE INDEX idx_patients_last_visit_service_location ON patients (lastVisit, serviceType, locationType);
--> statement-breakpoint

ALTER TABLE patients
  ADD CONSTRAINT fk_patients_doctor_user
  FOREIGN KEY (doctorId) REFERENCES users(id)
  ON UPDATE CASCADE
  ON DELETE SET NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS patient_import_staging (
  id int AUTO_INCREMENT PRIMARY KEY,
  batchId varchar(64) NOT NULL,
  rowNumber int NOT NULL,
  patientCode varchar(50) NULL,
  fullName varchar(255) NULL,
  dateOfBirthRaw varchar(64) NULL,
  dateOfBirth date NULL,
  gender enum('male','female') NULL,
  phone varchar(20) NULL,
  address text NULL,
  branch enum('examinations','surgery') NULL DEFAULT 'examinations',
  serviceType enum('consultant','specialist','lasik','surgery','external') NULL,
  locationType enum('center','external') NULL,
  doctorCode varchar(64) NULL,
  doctorId int NULL,
  status enum('pending','valid','invalid','applied') NOT NULL DEFAULT 'pending',
  errors text NULL,
  createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_patient_import_batch_status (batchId, status),
  INDEX idx_patient_import_code (patientCode),
  INDEX idx_patient_import_doctor_id (doctorId)
);
