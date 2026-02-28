import { int, varchar, text, timestamp, date, boolean, json, decimal, mysqlTable, mysqlEnum, primaryKey, index } from "drizzle-orm/mysql-core";

/**
 * Core user table with local authentication (username/password)
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(), // bcrypt hash
  name: text("name"),
  email: varchar("email", { length: 320 }),
  role: mysqlEnum("role", ["admin", "doctor", "nurse", "technician", "reception", "manager", "accountant"]).default("reception").notNull(),
  branch: mysqlEnum("branch", ["examinations", "surgery", "both"]).default("examinations").notNull(),
  shift: int("shift").default(1).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Patients table - ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط±ط¶ظ‰
 */
export const patients = mysqlTable("patients", {
  id: int("id").autoincrement().primaryKey(),
  patientCode: varchar("patientCode", { length: 50 }).notNull().unique(), // ظƒظˆط¯ ط§ظ„ظ…ط±ظٹط¶
  fullName: varchar("fullName", { length: 255 }).notNull(), // ط§ظ„ط§ط³ظ… ط§ظ„ظƒط§ظ…ظ„
  dateOfBirth: date("dateOfBirth"), // طھط§ط±ظٹط® ط§ظ„ظ…ظٹظ„ط§ط¯
  age: int("age"), // ط§ظ„ط¹ظ…ط±
  gender: mysqlEnum("gender", ["male", "female"]), // ط§ظ„ط¬ظ†ط³
  nationalId: varchar("nationalId", { length: 20 }), // ط§ظ„ط±ظ‚ظ… ط§ظ„ظ‚ظˆظ…ظٹ
  phone: varchar("phone", { length: 20 }), // ط±ظ‚ظ… ط§ظ„ظ‡ط§طھظپ
  alternatePhone: varchar("alternatePhone", { length: 20 }), // ط±ظ‚ظ… ظ‡ط§طھظپ ط¨ط¯ظٹظ„
  address: text("address"), // ط§ظ„ط¹ظ†ظˆط§ظ†
  occupation: varchar("occupation", { length: 255 }), // ط§ظ„ظˆط¸ظٹظپط©
  referralSource: varchar("referralSource", { length: 255 }), // ظƒظٹظپظٹط© ط§ظ„ظ…ط¹ط±ظپط©
  medicalHistory: text("medicalHistory"), // ط§ظ„طھط§ط±ظٹط® ط§ظ„ظ…ط±ط¶ظٹ
  allergies: text("allergies"), // ط§ظ„ط­ط³ط§ط³ظٹط§طھ
  branch: mysqlEnum("branch", ["examinations", "surgery"]).default("examinations"), // ط§ظ„ظپط±ط¹ ط§ظ„ط£ط³ط§ط³ظٹ
  serviceType: mysqlEnum("serviceType", ["consultant", "specialist", "lasik", "surgery", "external"]).default("consultant"), // ظ†ظˆط¹ ط§ظ„ط®ط¯ظ…ط©
  locationType: mysqlEnum("locationType", ["center", "external"]).default("center"), // مكان الخدمة
  doctorId: int("doctorId"),
  lastVisit: date("lastVisit"), // طھط§ط±ظٹط® ط§ظ„ط²ظٹط§ط±ط©/ط§ظ„ظ…طھط§ط¨ط¹ط©
  status: mysqlEnum("status", ["new", "followup", "archived"]).default("new"), // ط­ط§ظ„ط© ط§ظ„ظ…ط±ظٹط¶
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = typeof patients.$inferInsert;

export const patientImportStaging = mysqlTable("patient_import_staging", {
  id: int("id").autoincrement().primaryKey(),
  batchId: varchar("batchId", { length: 64 }).notNull(),
  rowNumber: int("rowNumber").notNull(),
  patientCode: varchar("patientCode", { length: 50 }),
  fullName: varchar("fullName", { length: 255 }),
  dateOfBirthRaw: varchar("dateOfBirthRaw", { length: 64 }),
  dateOfBirth: date("dateOfBirth"),
  gender: mysqlEnum("gender", ["male", "female"]),
  phone: varchar("phone", { length: 20 }),
  address: text("address"),
  branch: mysqlEnum("branch", ["examinations", "surgery"]).default("examinations"),
  serviceType: mysqlEnum("serviceType", ["consultant", "specialist", "lasik", "surgery", "external"]),
  locationType: mysqlEnum("locationType", ["center", "external"]),
  doctorCode: varchar("doctorCode", { length: 64 }),
  doctorId: int("doctorId"),
  status: mysqlEnum("status", ["pending", "valid", "invalid", "applied"]).default("pending").notNull(),
  errors: text("errors"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PatientImportStaging = typeof patientImportStaging.$inferSelect;
export type InsertPatientImportStaging = typeof patientImportStaging.$inferInsert;

/**
 * Appointments table - ط¬ط¯ظˆظ„ ط§ظ„ظ…ظˆط§ط¹ظٹط¯
 */
export const appointments = mysqlTable("appointments", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  doctorId: int("doctorId"), // ط§ظ„ط·ط¨ظٹط¨ ط§ظ„ظ…ط¹ظٹظ†
  appointmentDate: timestamp("appointmentDate").notNull(), // طھط§ط±ظٹط® ظˆظˆظ‚طھ ط§ظ„ظ…ظˆط¹ط¯
  appointmentType: mysqlEnum("appointmentType", ["examination", "surgery", "followup"]).notNull(), // ظ†ظˆط¹ ط§ظ„ظ…ظˆط¹ط¯
  branch: mysqlEnum("branch", ["examinations", "surgery"]).notNull(), // ط§ظ„ظپط±ط¹
  status: mysqlEnum("status", ["scheduled", "completed", "cancelled", "no_show"]).default("scheduled"), // ط­ط§ظ„ط© ط§ظ„ظ…ظˆط¹ط¯
  notes: text("notes"), // ظ…ظ„ط§ط­ط¸ط§طھ
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = typeof appointments.$inferInsert;

/**
 * Visits table - ط¬ط¯ظˆظ„ ط§ظ„ط²ظٹط§ط±ط§طھ/ط§ظ„ظƒط´ظˆظپط§طھ
 */
export const visits = mysqlTable("visits", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  appointmentId: int("appointmentId"), // ط§ظ„ظ…ظˆط¹ط¯ ط§ظ„ظ…ط±طھط¨ط·
  visitDate: timestamp("visitDate").defaultNow().notNull(), // طھط§ط±ظٹط® ط§ظ„ط²ظٹط§ط±ط©
  visitType: mysqlEnum("visitType", ["consultation", "examination", "surgery", "followup"]).notNull(), // ظ†ظˆط¹ ط§ظ„ط²ظٹط§ط±ط©
  chiefComplaint: text("chiefComplaint"), // ط§ظ„ط´ظƒظˆظ‰ ط§ظ„ط±ط¦ظٹط³ظٹط©
  branch: mysqlEnum("branch", ["examinations", "surgery"]).notNull(), // ط§ظ„ظپط±ط¹
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Visit = typeof visits.$inferSelect;
export type InsertVisit = typeof visits.$inferInsert;

/**
 * Examinations table - ط¬ط¯ظˆظ„ ط§ظ„ظپط­ظˆطµط§طھ
 */
export const examinations = mysqlTable("examinations", {
  id: int("id").autoincrement().primaryKey(),
  visitId: int("visitId").notNull(),
  patientId: int("patientId").notNull(),
  
  // Uncorrected Vision (UCVA) - ط­ط¯ط© ط§ظ„ط¥ط¨طµط§ط± ط¨ط¯ظˆظ† طھطµط­ظٹط­
  ucvaOD: varchar("ucvaOD", { length: 20 }), // ط§ظ„ط¹ظٹظ† ط§ظ„ظٹظ…ظ†ظ‰
  ucvaOS: varchar("ucvaOS", { length: 20 }), // ط§ظ„ط¹ظٹظ† ط§ظ„ظٹط³ط±ظ‰
  
  // Best Corrected Visual Acuity (BCVA) - ط£ظپط¶ظ„ ط­ط¯ط© ط¥ط¨طµط§ط± ظ…طµط­ط­ط©
  bcvaOD: varchar("bcvaOD", { length: 20 }), // ط§ظ„ط¹ظٹظ† ط§ظ„ظٹظ…ظ†ظ‰
  bcvaOS: varchar("bcvaOS", { length: 20 }), // ط§ظ„ط¹ظٹظ† ط§ظ„ظٹط³ط±ظ‰
  
  // Refraction - ط§ظ„ط§ظ†ظƒط³ط§ط±
  sphereOD: varchar("sphereOD", { length: 20 }), // ط§ظ„ظƒط±ط©
  sphereOS: varchar("sphereOS", { length: 20 }),
  cylinderOD: varchar("cylinderOD", { length: 20 }), // ط§ظ„ط£ط³ط·ظˆط§ظ†ط©
  cylinderOS: varchar("cylinderOS", { length: 20 }),
  axisOD: varchar("axisOD", { length: 20 }), // ط§ظ„ظ…ط­ظˆط±
  axisOS: varchar("axisOS", { length: 20 }),
  
  // Intraocular Pressure (IOP) - ط¶ط؛ط· ط§ظ„ط¹ظٹظ†
  iopOD: varchar("iopOD", { length: 20 }), // ط§ظ„ط¶ط؛ط· ط§ظ„ط¹ظٹظ† ط§ظ„ظٹظ…ظ†ظ‰
  iopOS: varchar("iopOS", { length: 20 }), // ط§ظ„ط¶ط؛ط· ط§ظ„ط¹ظٹظ† ط§ظ„ظٹط³ط±ظ‰
  
  // Anterior Segment - ط§ظ„ظ…ظ‚ط¯ظ…ط©
  anteriorSegmentOD: text("anteriorSegmentOD"),
  anteriorSegmentOS: text("anteriorSegmentOS"),
  
  // Posterior Segment - ط§ظ„ظ…ط¤ط®ط±ط©
  posteriorSegmentOD: text("posteriorSegmentOD"),
  posteriorSegmentOS: text("posteriorSegmentOS"),
  
  // Air Puff - ط§ط®طھط¨ط§ط± ط§ظ„ظ‡ظˆط§ط،
  airPuffOD: varchar("airPuffOD", { length: 20 }),
  airPuffOS: varchar("airPuffOS", { length: 20 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Examination = typeof examinations.$inferSelect;
export type InsertExamination = typeof examinations.$inferInsert;

/**
 * Pentacam Results table - ظ†طھط§ط¦ط¬ ط§ظ„ط¨ظ†طھط§ظƒط§ظ…
 */
export const pentacamResults = mysqlTable("pentacamResults", {
  id: int("id").autoincrement().primaryKey(),
  visitId: int("visitId").notNull(),
  patientId: int("patientId").notNull(),
  recordedBy: int("recordedBy"), // ط§ظ„ظپظ†ظٹ ط§ظ„ط°ظٹ ط³ط¬ظ„ ط§ظ„ظ†طھط§ط¦ط¬
  pachymetryOD: varchar("pachymetryOD", { length: 20 }), // ط³ظ…ظƒ ط§ظ„ظ‚ط±ظ†ظٹط© ط§ظ„ظٹظ…ظ†ظ‰
  pachymetryOS: varchar("pachymetryOS", { length: 20 }), // ط³ظ…ظƒ ط§ظ„ظ‚ط±ظ†ظٹط© ط§ظ„ظٹط³ط±ظ‰
  keratometryOD: varchar("keratometryOD", { length: 50 }), // ظ‚ظٹط§ط³ طھط­ط¯ط¨ ط§ظ„ظ‚ط±ظ†ظٹط© ط§ظ„ظٹظ…ظ†ظ‰
  keratometryOS: varchar("keratometryOS", { length: 50 }), // ظ‚ظٹط§ط³ طھط­ط¯ط¨ ط§ظ„ظ‚ط±ظ†ظٹط© ط§ظ„ظٹط³ط±ظ‰
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PentacamResult = typeof pentacamResults.$inferSelect;
export type InsertPentacamResult = typeof pentacamResults.$inferInsert;

/**
 * Pentacam Files table - imported image/PDF artifacts from device exports
 */
export const pentacamFiles = mysqlTable("pentacamFiles", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId"),
  patientCode: varchar("patientCode", { length: 50 }),
  sourcePath: varchar("sourcePath", { length: 512 }).notNull().unique(),
  sourceFileName: varchar("sourceFileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  fileSizeBytes: int("fileSizeBytes"),
  fileHash: varchar("fileHash", { length: 64 }),
  eyeSide: mysqlEnum("eyeSide", ["OD", "OS", "OU", "unknown"]).default("unknown").notNull(),
  capturedAt: timestamp("capturedAt"),
  importStatus: mysqlEnum("importStatus", ["imported", "duplicate", "unmatched", "failed"]).notNull().default("imported"),
  importError: text("importError"),
  storageKey: varchar("storageKey", { length: 512 }),
  storageUrl: text("storageUrl"),
  metadata: json("metadata"),
  importedAt: timestamp("importedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  patientImportedIdx: index("idx_pentacam_files_patient_imported").on(table.patientId, table.importedAt),
  statusImportedIdx: index("idx_pentacam_files_status_imported").on(table.importStatus, table.importedAt),
  fileHashIdx: index("idx_pentacam_files_hash").on(table.fileHash),
}));

export type PentacamFile = typeof pentacamFiles.$inferSelect;
export type InsertPentacamFile = typeof pentacamFiles.$inferInsert;

/**
 * Doctor Reports table - طھظ‚ط§ط±ظٹط± ط§ظ„ط·ط¨ظٹط¨
 */
export const doctorReports = mysqlTable("doctorReports", {
  id: int("id").autoincrement().primaryKey(),
  visitId: int("visitId").notNull(),
  patientId: int("patientId").notNull(),
  doctorId: int("doctorId"), // ط§ظ„ط·ط¨ظٹط¨
  diagnosis: text("diagnosis"), // ط§ظ„طھط´ط®ظٹطµ
  diseases: text("diseases"), // JSON array of diseases
  treatment: text("treatment"), // ط§ظ„ط¹ظ„ط§ط¬
  recommendations: text("recommendations"), // ط§ظ„طھظˆطµظٹط§طھ
  visitDate: date("visitDate"), // طھط§ط±ظٹط® ط§ظ„ط²ظٹط§ط±ط©
  operationType: varchar("operationType", { length: 255 }), // ظ†ظˆط¹ ط§ظ„ط¹ظ…ظ„ظٹط©
  clinicalOpinion: text("clinicalOpinion"),
  additionalNotes: text("additionalNotes"),
  followUpDate: timestamp("followUpDate"), // طھط§ط±ظٹط® ط§ظ„ظ…طھط§ط¨ط¹ط©
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DoctorReport = typeof doctorReports.$inferSelect;
export type InsertDoctorReport = typeof doctorReports.$inferInsert;

/**
 * Prescriptions table - ط§ظ„ط±ظˆط´ط§طھ
 */
export const prescriptions = mysqlTable("prescriptions", {
  id: int("id").autoincrement().primaryKey(),
  visitId: int("visitId"),
  patientId: int("patientId").notNull(),
  doctorId: int("doctorId"), // ط§ظ„ط·ط¨ظٹط¨
  prescriptionDate: timestamp("prescriptionDate").defaultNow().notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Prescription = typeof prescriptions.$inferSelect;
export type InsertPrescription = typeof prescriptions.$inferInsert;

/**
 * Prescription Items table - ط¨ظ†ظˆط¯ ط§ظ„ط±ظˆط´ط©
 */
export const prescriptionItems = mysqlTable("prescriptionItems", {
  id: int("id").autoincrement().primaryKey(),
  prescriptionId: int("prescriptionId").notNull(),
  medicationId: int("medicationId").notNull(),
  dosage: varchar("dosage", { length: 100 }), // ط§ظ„ط¬ط±ط¹ط©
  frequency: varchar("frequency", { length: 100 }), // ط§ظ„طھظƒط±ط§ط±
  duration: varchar("duration", { length: 100 }), // ط§ظ„ظ…ط¯ط©
  instructions: text("instructions"), // ط§ظ„طھط¹ظ„ظٹظ…ط§طھ
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PrescriptionItem = typeof prescriptionItems.$inferSelect;
export type InsertPrescriptionItem = typeof prescriptionItems.$inferInsert;

/**
 * Diseases table - ط§ظ„ط£ظ…ط±ط§ط¶
 */
export const diseases = mysqlTable("diseases", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  branch: varchar("branch", { length: 100 }),
  abbrev: varchar("abbrev", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Disease = typeof diseases.$inferSelect;
export type InsertDisease = typeof diseases.$inferInsert;

/**
 * User Page States - UI state per user/page
 */
export const userPageStates = mysqlTable("userPageStates", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  page: varchar("page", { length: 128 }).notNull(),
  data: json("data"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserPageState = typeof userPageStates.$inferSelect;
export type InsertUserPageState = typeof userPageStates.$inferInsert;

/**
 * Patient Page States - UI state per patient/page
 */
export const patientPageStates = mysqlTable("patientPageStates", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  page: varchar("page", { length: 128 }).notNull(),
  data: json("data"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  patientPageIdx: index("idx_patient_page_updated").on(table.patientId, table.page, table.updatedAt),
}));

export type PatientPageState = typeof patientPageStates.$inferSelect;
export type InsertPatientPageState = typeof patientPageStates.$inferInsert;

/**
 * Patient Service Entries - service-level transactions per patient (can repeat by patient code)
 */
export const patientServiceEntries = mysqlTable("patientServiceEntries", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  serviceCode: varchar("serviceCode", { length: 64 }).notNull(),
  serviceName: varchar("serviceName", { length: 255 }),
  source: mysqlEnum("source", ["mssql", "manual", "import"]).default("mssql").notNull(),
  sourceRef: varchar("sourceRef", { length: 128 }).notNull().unique(),
  serviceDate: date("serviceDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  patientServiceDateIdx: index("idx_patient_service_date").on(table.patientId, table.serviceCode, table.serviceDate),
  sourceUpdatedIdx: index("idx_service_source_updated").on(table.source, table.updatedAt),
}));

export type PatientServiceEntry = typeof patientServiceEntries.$inferSelect;
export type InsertPatientServiceEntry = typeof patientServiceEntries.$inferInsert;

/**
 * Surgeries table - ط§ظ„ط¹ظ…ظ„ظٹط§طھ ط§ظ„ط¬ط±ط§ط­ظٹط©
 */
export const surgeries = mysqlTable("surgeries", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  surgeryType: varchar("surgeryType", { length: 255 }), // ظ†ظˆط¹ ط§ظ„ط¹ظ…ظ„ظٹط©
  surgeryDate: timestamp("surgeryDate").notNull(), // طھط§ط±ظٹط® ط§ظ„ط¹ظ…ظ„ظٹط©
  surgeon: varchar("surgeon", { length: 255 }), // ط§ظ„ط¬ط±ط§ط­
  notes: text("notes"), // ظ…ظ„ط§ط­ط¸ط§طھ
  status: mysqlEnum("status", ["scheduled", "completed", "cancelled"]).default("scheduled"),
  branch: mysqlEnum("branch", ["examinations", "surgery"]).default("surgery"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Surgery = typeof surgeries.$inferSelect;
export type InsertSurgery = typeof surgeries.$inferInsert;

/**
 * Post-Op Followups table - ظ…طھط§ط¨ط¹ط© ظ…ط§ ط¨ط¹ط¯ ط§ظ„ط¹ظ…ظ„ظٹط©
 */
export const postOpFollowups = mysqlTable("postOpFollowups", {
  id: int("id").autoincrement().primaryKey(),
  surgeryId: int("surgeryId").notNull(),
  patientId: int("patientId").notNull(),
  followupDate: timestamp("followupDate").notNull(),
  findings: text("findings"), // ط§ظ„ظ†طھط§ط¦ط¬
  recommendations: text("recommendations"), // ط§ظ„طھظˆطµظٹط§طھ
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PostOpFollowup = typeof postOpFollowups.$inferSelect;
export type InsertPostOpFollowup = typeof postOpFollowups.$inferInsert;

/**
 * Consent Forms table - ظ†ظ…ط§ط°ط¬ ط§ظ„ط¥ظ‚ط±ط§ط±
 */
export const consentForms = mysqlTable("consentForms", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  formType: varchar("formType", { length: 255 }), // ظ†ظˆط¹ ط§ظ„ظ†ظ…ظˆط°ط¬
  signedDate: timestamp("signedDate").notNull(),
  content: text("content"), // ظ…ط­طھظˆظ‰ ط§ظ„ظ†ظ…ظˆط°ط¬
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ConsentForm = typeof consentForms.$inferSelect;
export type InsertConsentForm = typeof consentForms.$inferInsert;

/**
 * Medical History Checklist table - ظ‚ط§ط¦ظ…ط© ط§ظ„طھط§ط±ظٹط® ط§ظ„ظ…ط±ط¶ظٹ
 */
export const medicalHistoryChecklist = mysqlTable("medicalHistoryChecklist", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  diabetes: boolean("diabetes").default(false),
  hypertension: boolean("hypertension").default(false),
  heartDisease: boolean("heartDisease").default(false),
  asthma: boolean("asthma").default(false),
  allergies: boolean("allergies").default(false),
  previousSurgeries: text("previousSurgeries"),
  medications: text("medications"),
  familyHistory: text("familyHistory"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MedicalHistoryChecklist = typeof medicalHistoryChecklist.$inferSelect;
export type InsertMedicalHistoryChecklist = typeof medicalHistoryChecklist.$inferInsert;

/**
 * Audit Logs table - ط³ط¬ظ„ ط§ظ„طھط¯ظ‚ظٹظ‚
 */
export const auditLog = mysqlTable("auditLog", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId"),
  action: varchar("action", { length: 255 }),
  entityType: varchar("entityType", { length: 100 }),
  entityId: int("entityId"),
  changes: text("changes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = typeof auditLog.$inferInsert;

/**
 * Alias for auditLog
 */
export const auditLogs = auditLog;

/**
 * Medications table - ط§ظ„ط£ط¯ظˆظٹط©
 */
export const medications = mysqlTable("medications", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["tablet", "drops", "ointment", "injection", "suspension", "other"]).notNull(),
  activeIngredient: varchar("activeIngredient", { length: 255 }),
  strength: varchar("strength", { length: 100 }),
  manufacturer: varchar("manufacturer", { length: 255 }),
  dosage: varchar("dosage", { length: 100 }),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Medication = typeof medications.$inferSelect;
export type InsertMedication = typeof medications.$inferInsert;

/**
 * Tests table - ط§ظ„ظپط­ظˆطµط§طھ ظˆط§ظ„طھط­ط§ظ„ظٹظ„
 */
export const tests = mysqlTable("tests", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["examination", "lab", "imaging", "other"]).notNull(),
  category: varchar("category", { length: 255 }),
  normalRange: varchar("normalRange", { length: 255 }),
  unit: varchar("unit", { length: 64 }),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const testFavorites = mysqlTable("testFavorites", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  testId: int("testId").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type Test = typeof tests.$inferSelect;
export type InsertTest = typeof tests.$inferInsert;

/**
 * Test Requests table - ط·ظ„ط¨ط§طھ ط§ظ„ظپط­ظˆطµط§طھ
 */
export const testRequests = mysqlTable("testRequests", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  visitId: int("visitId"),
  requestDate: timestamp("requestDate").defaultNow().notNull(),
  status: mysqlEnum("status", ["pending", "completed", "cancelled"]).default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TestRequest = typeof testRequests.$inferSelect;
export type InsertTestRequest = typeof testRequests.$inferInsert;

/**
 * Test Request Items table - ط¨ظ†ظˆط¯ ط·ظ„ط¨ ط§ظ„ظپط­ظˆطµط§طھ
 */
export const testRequestItems = mysqlTable("testRequestItems", {
  id: int("id").autoincrement().primaryKey(),
  testRequestId: int("testRequestId").notNull(),
  testId: int("testId").notNull(),
  result: text("result"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TestRequestItem = typeof testRequestItems.$inferSelect;
export type InsertTestRequestItem = typeof testRequestItems.$inferInsert;

/**
 * System Settings table - ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„ظ†ط¸ط§ظ…
 */
export const systemSettings = mysqlTable("systemSettings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  value: text("value"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;

/**
 * User permissions table
 */
export const userPermissions = mysqlTable("user_permissions", {
  userId: int("userId").notNull(),
  pageId: varchar("pageId", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.pageId] }),
}));

export type UserPermission = typeof userPermissions.$inferSelect;
export type InsertUserPermission = typeof userPermissions.$inferInsert;

/**
 * Sheet entries table
 */
export const sheetEntries = mysqlTable("sheet_entries", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  sheetType: mysqlEnum("sheetType", ["consultant", "specialist", "lasik", "external"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SheetEntry = typeof sheetEntries.$inferSelect;
export type InsertSheetEntry = typeof sheetEntries.$inferInsert;

/**
 * Operation lists table
 */
export const operationLists = mysqlTable("operationLists", {
  id: int("id").autoincrement().primaryKey(),
  doctorTab: varchar("doctorTab", { length: 100 }).notNull(),
  listDate: date("listDate").notNull(),
  operationType: varchar("operationType", { length: 50 }),
  doctorName: varchar("doctorName", { length: 255 }),
  listTime: varchar("listTime", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OperationList = typeof operationLists.$inferSelect;
export type InsertOperationList = typeof operationLists.$inferInsert;

/**
 * Operation list items table
 */
export const operationListItems = mysqlTable("operationListItems", {
  id: int("id").autoincrement().primaryKey(),
  listId: int("listId").notNull(),
  number: varchar("number", { length: 50 }),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  doctor: varchar("doctor", { length: 255 }),
  operation: varchar("operation", { length: 255 }),
  center: boolean("center").default(false).notNull(),
  payment: boolean("payment").default(false).notNull(),
  code: varchar("code", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  listNumberIdx: index("idx_operation_list_number").on(table.listId, table.number),
}));

export type OperationListItem = typeof operationListItems.$inferSelect;
export type InsertOperationListItem = typeof operationListItems.$inferInsert;






