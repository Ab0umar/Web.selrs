import { eq, and, like, desc, or, sql, inArray, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import fs from "node:fs/promises";
import path from "node:path";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import {
  InsertUser,
  users,
  patients,
  patientImportStaging,
  appointments,
  InsertAppointment,
  visits,
  examinations,
  pentacamResults,
  doctorReports,
  prescriptions,
  prescriptionItems,
  surgeries,
  postOpFollowups,
  consentForms,
  medicalHistoryChecklist,
  auditLog,
  auditLogs,
  medications,
  tests,
  testRequests,
  testRequestItems,
  systemSettings,
  userPermissions,
  sheetEntries,
  operationLists,
  operationListItems,
  diseases,
  userPageStates,
  patientPageStates,
  testFavorites,
  patientServiceEntries,
  InsertAuditLog,
  InsertDoctorReport,
} from "../drizzle/schema";
const exec = promisify(execCb);

let _db: ReturnType<typeof drizzle> | null = null;

const MOJIBAKE_HINT = /[ØÙÃÂ]/;

function decodeMojibake(value: unknown): string {
  const raw = String(value ?? "");
  if (!raw || !MOJIBAKE_HINT.test(raw)) return raw;
  try {
    return Buffer.from(raw, "latin1").toString("utf8");
  } catch {
    return raw;
  }
}

function encodeForLegacySearch(value: string): string {
  try {
    return Buffer.from(String(value ?? ""), "utf8").toString("latin1");
  } catch {
    return value;
  }
}

function decodePatientRow<T extends Record<string, any>>(row: T): T {
  return {
    ...row,
    fullName: decodeMojibake(row.fullName),
    address: decodeMojibake(row.address),
    occupation: decodeMojibake(row.occupation),
    referralSource: decodeMojibake(row.referralSource),
    treatingDoctor: decodeMojibake(row.treatingDoctor),
  } as T;
}
// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============ USER OPERATIONS ============

/**
 * Get user by username (for local auth)
 */
export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const normalized = String(username ?? "").trim();
  const legacy = encodeForLegacySearch(normalized);
  const result = await db
    .select()
    .from(users)
    .where(or(eq(users.username, normalized), eq(users.username, legacy)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get user by ID
 */
export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Update user last signed in
 */
export async function updateUserLastSignedIn(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update user: database not available");
    return;
  }

  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
}

/**
 * Create a new user
 */
export async function createUser(userData: InsertUser) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create user: database not available");
    return undefined;
  }

  const result = await db.insert(users).values(userData);
  return result;
}

/**
 * Get all users
 */
export async function getAllUsers() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get users: database not available");
    return [];
  }

  const rows = await db.select().from(users);
  return rows.map((row) => ({
    ...row,
    username: decodeMojibake(row.username),
    name: decodeMojibake(row.name),
  }));
}

export async function getDoctors() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get doctors: database not available");
    return [];
  }

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.role, "doctor"));

  return rows
    .filter((row) => row.isActive)
    .map((row) => ({
      id: row.id,
      username: decodeMojibake(row.username),
      name: decodeMojibake(row.name ?? row.username),
      code: `DR${String(row.id).padStart(3, "0")}`,
    }));
}

/**
 * Update user
 */
export async function updateUser(userId: number, updates: Partial<InsertUser>) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update user: database not available");
    return;
  }

  await db.update(users).set(updates).where(eq(users.id, userId));
}

/**
 * Delete user
 */
export async function deleteUser(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete user: database not available");
    return;
  }

  await db.delete(users).where(eq(users.id, userId));
}

// ============ PATIENT OPERATIONS ============

export async function createPatient(patientData: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(patients).values(patientData);
  return result;
}

type StagePatientImportRowInput = {
  rowNumber: number;
  patientCode?: string | null;
  fullName?: string | null;
  dateOfBirth?: string | null;
  gender?: "male" | "female" | "" | null;
  phone?: string | null;
  address?: string | null;
  branch?: "examinations" | "surgery" | "" | null;
  serviceType?: "consultant" | "specialist" | "lasik" | "surgery" | "external" | "" | null;
  locationType?: "center" | "external" | "" | null;
  doctorCode?: string | null;
  doctorName?: string | null;
};

type StageBatchSummary = {
  batchId: string;
  total: number;
  valid: number;
  invalid: number;
};

const IMPORT_ALLOWED_SERVICE_TYPES = new Set(["consultant", "specialist", "lasik", "surgery", "external"]);
const IMPORT_ALLOWED_LOCATION_TYPES = new Set(["center", "external"]);
const IMPORT_ALLOWED_BRANCHES = new Set(["examinations", "surgery"]);

let doctorDirectoryCache:
  | {
      at: number;
      byCode: Map<string, { name: string; locationType: "center" | "external" }>;
      byName: Map<string, { code: string; locationType: "center" | "external" }>;
    }
  | null = null;

async function getDoctorDirectoryCached() {
  const now = Date.now();
  if (doctorDirectoryCache && now - doctorDirectoryCache.at < 60_000) {
    return doctorDirectoryCache;
  }

  const row = await getSystemSetting("doctor_directory");
  const byCode = new Map<string, { name: string; locationType: "center" | "external" }>();
  const byName = new Map<string, { code: string; locationType: "center" | "external" }>();
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value) as Array<any>;
      for (const item of parsed ?? []) {
        const code = String(item?.code ?? "").trim();
        const name = String(item?.name ?? "").trim();
        if (!code || !name) continue;
        const locationType = String(item?.locationType ?? "center").trim().toLowerCase() === "external" ? "external" : "center";
        byCode.set(code.toLowerCase(), { name, locationType });
        byName.set(name.toLowerCase(), { code, locationType });
      }
    } catch {
      // ignore malformed setting
    }
  }
  doctorDirectoryCache = { at: now, byCode, byName };
  return doctorDirectoryCache;
}

function normalizeIsoDate(input: unknown): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const dt = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
  if (Number.isNaN(dt.valueOf())) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function safeParseJsonArray(input: unknown): string[] {
  try {
    if (!input) return [];
    const parsed = JSON.parse(String(input));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => String(v)).filter(Boolean);
  } catch {
    return [];
  }
}

export async function stagePatientImportRows(batchId: string, rows: StagePatientImportRowInput[]): Promise<StageBatchSummary> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const normalizedBatchId = String(batchId ?? "").trim();
  if (!normalizedBatchId) throw new Error("batchId is required");

  await db.delete(patientImportStaging).where(eq(patientImportStaging.batchId, normalizedBatchId));

  const codeCounts = new Map<string, number>();
  for (const row of rows) {
    const code = String(row.patientCode ?? "").trim();
    if (!code) continue;
    codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
  }

  const directory = await getDoctorDirectoryCached();
  const doctorUsers = await getDoctors();
  const doctorIdByName = new Map<string, number>();
  for (const d of doctorUsers) {
    const key = String(d.name ?? "").trim().toLowerCase();
    if (key) doctorIdByName.set(key, Number(d.id));
  }

  let valid = 0;
  let invalid = 0;
  for (const row of rows) {
    const rowNumber = Number(row.rowNumber ?? 0) || 0;
    const patientCode = String(row.patientCode ?? "").trim();
    const fullName = String(row.fullName ?? "").trim();
    const dateOfBirthRaw = String(row.dateOfBirth ?? "").trim();
    const dateOfBirth = normalizeIsoDate(dateOfBirthRaw);
    const serviceType = String(row.serviceType ?? "").trim().toLowerCase();
    const branch = String(row.branch ?? "examinations").trim().toLowerCase();
    const explicitLocation = String(row.locationType ?? "").trim().toLowerCase();
    const doctorCode = String(row.doctorCode ?? "").trim();
    const doctorName = String(row.doctorName ?? "").trim();
    const genderRaw = String(row.gender ?? "").trim().toLowerCase();

    const errors: string[] = [];
    if (!patientCode) errors.push("Missing patient code");
    if (!fullName) errors.push("Missing full name");
    if (patientCode && (codeCounts.get(patientCode) ?? 0) > 1) errors.push("Duplicate patient code in same file");
    if (dateOfBirthRaw && !dateOfBirth) errors.push("Invalid dateOfBirth format (must be YYYY-MM-DD)");
    if (serviceType && !IMPORT_ALLOWED_SERVICE_TYPES.has(serviceType)) errors.push("Invalid serviceType");
    if (branch && !IMPORT_ALLOWED_BRANCHES.has(branch)) errors.push("Invalid branch");
    if (explicitLocation && !IMPORT_ALLOWED_LOCATION_TYPES.has(explicitLocation)) errors.push("Invalid locationType");

    const locationType = serviceType === "external" ? "external" : (IMPORT_ALLOWED_LOCATION_TYPES.has(explicitLocation) ? explicitLocation : "center");
    const gender = genderRaw === "male" || genderRaw === "female" ? genderRaw : null;

    let resolvedDoctorId: number | null = null;
    if (doctorName) {
      resolvedDoctorId = doctorIdByName.get(doctorName.toLowerCase()) ?? null;
    } else if (doctorCode) {
      const byCode = directory.byCode.get(doctorCode.toLowerCase());
      if (byCode) {
        resolvedDoctorId = doctorIdByName.get(byCode.name.toLowerCase()) ?? null;
      }
    }
    if ((doctorName || doctorCode) && !resolvedDoctorId) {
      errors.push("Doctor not found in users table");
    }

    const status = errors.length > 0 ? "invalid" : "valid";
    if (status === "valid") valid += 1;
    else invalid += 1;

    await db.insert(patientImportStaging).values({
      batchId: normalizedBatchId,
      rowNumber,
      patientCode: patientCode || null,
      fullName: fullName || null,
      dateOfBirthRaw: dateOfBirthRaw || null,
      dateOfBirth: dateOfBirth as any,
      gender: gender as any,
      phone: String(row.phone ?? "").trim() || null,
      address: String(row.address ?? "").trim() || null,
      branch: (IMPORT_ALLOWED_BRANCHES.has(branch) ? branch : "examinations") as any,
      serviceType: (IMPORT_ALLOWED_SERVICE_TYPES.has(serviceType) ? serviceType : "consultant") as any,
      locationType: locationType as any,
      doctorCode: doctorCode || null,
      doctorId: resolvedDoctorId,
      status: status as any,
      errors: errors.length ? JSON.stringify(errors) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return {
    batchId: normalizedBatchId,
    total: rows.length,
    valid,
    invalid,
  };
}

export async function getPatientImportErrors(batchId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const normalizedBatchId = String(batchId ?? "").trim();
  if (!normalizedBatchId) return [];
  const rows = await db
    .select()
    .from(patientImportStaging)
    .where(and(eq(patientImportStaging.batchId, normalizedBatchId), eq(patientImportStaging.status, "invalid" as any)))
    .orderBy(patientImportStaging.rowNumber);
  return rows.map((row) => ({
    rowNumber: Number(row.rowNumber ?? 0),
    patientCode: String(row.patientCode ?? ""),
    fullName: String(row.fullName ?? ""),
    errors: safeParseJsonArray(row.errors),
  }));
}

export async function getPatientImportPreview(batchId: string, limit = 100) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const normalizedBatchId = String(batchId ?? "").trim();
  if (!normalizedBatchId) return [];
  const safeLimit = Math.max(1, Math.min(500, Number(limit || 100)));
  const rows = await db
    .select()
    .from(patientImportStaging)
    .where(eq(patientImportStaging.batchId, normalizedBatchId))
    .orderBy(patientImportStaging.rowNumber)
    .limit(safeLimit);
  return rows.map((row) => ({
    rowNumber: Number(row.rowNumber ?? 0),
    patientCode: String(row.patientCode ?? ""),
    fullName: String(row.fullName ?? ""),
    serviceType: String(row.serviceType ?? ""),
    locationType: String(row.locationType ?? ""),
    status: String(row.status ?? "pending"),
    errors: safeParseJsonArray(row.errors),
  }));
}

export async function applyPatientImportBatch(batchId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const normalizedBatchId = String(batchId ?? "").trim();
  if (!normalizedBatchId) throw new Error("batchId is required");

  const rows = await db
    .select()
    .from(patientImportStaging)
    .where(and(eq(patientImportStaging.batchId, normalizedBatchId), eq(patientImportStaging.status, "valid" as any)))
    .orderBy(patientImportStaging.rowNumber);

  const directory = await getDoctorDirectoryCached();
  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const patientCode = String(row.patientCode ?? "").trim();
      const fullName = String(row.fullName ?? "").trim();
      if (!patientCode || !fullName) {
        failed += 1;
        await db
          .update(patientImportStaging)
          .set({ status: "invalid" as any, errors: JSON.stringify(["Missing patientCode/fullName"]), updatedAt: new Date() })
          .where(eq(patientImportStaging.id, row.id));
        continue;
      }

      const payload: any = {
        patientCode,
        fullName,
        dateOfBirth: row.dateOfBirth ?? null,
        gender: row.gender ?? null,
        phone: row.phone ?? "",
        address: row.address ?? "",
        branch: row.branch ?? "examinations",
        serviceType: row.serviceType ?? "consultant",
        locationType: row.locationType ?? (row.serviceType === "external" ? "external" : "center"),
        lastVisit: row.dateOfBirth ?? new Date(),
        doctorId: row.doctorId ?? null,
        status: "new",
      };

      const existing = await getPatientByCode(patientCode);
      if (existing) {
        await db.update(patients).set(payload).where(eq(patients.id, Number(existing.id)));
        updated += 1;
      } else {
        await db.insert(patients).values(payload);
        inserted += 1;
      }

      const doctorCode = String(row.doctorCode ?? "").trim();
      let doctorName = "";
      if (doctorCode) {
        doctorName = directory.byCode.get(doctorCode.toLowerCase())?.name ?? "";
      }
      if (!doctorName && row.doctorId) {
        const owner = await getUserById(Number(row.doctorId));
        doctorName = String(owner?.name ?? owner?.username ?? "").trim();
      }
      if (doctorName) {
        const savedPatient = await getPatientByCode(patientCode);
        if (savedPatient?.id) {
          const existingState = await getPatientPageState(savedPatient.id, "examination");
          const existingData =
            existingState && typeof (existingState as any).data === "object" && (existingState as any).data
              ? ((existingState as any).data as Record<string, any>)
              : {};
          await upsertPatientPageState(savedPatient.id, "examination", {
            ...existingData,
            doctorName,
            signatures: {
              ...(existingData.signatures ?? {}),
              doctor: doctorName,
            },
          });
        }
      }

      await db
        .update(patientImportStaging)
        .set({ status: "applied" as any, errors: null, updatedAt: new Date() })
        .where(eq(patientImportStaging.id, row.id));
    } catch (error: any) {
      failed += 1;
      await db
        .update(patientImportStaging)
        .set({
          status: "invalid" as any,
          errors: JSON.stringify([String(error?.message ?? error ?? "Unknown import apply error")]),
          updatedAt: new Date(),
        })
        .where(eq(patientImportStaging.id, row.id));
    }
  }

  return {
    batchId: normalizedBatchId,
    total: rows.length,
    inserted,
    updated,
    failed,
  };
}

export async function getOpsHealthStatus() {
  const db = await getDb();
  let dbConnected = false;
  let patientsCount = 0;
  let dbError = "";
  try {
    if (!db) throw new Error("Database not available");
    const rows = await db.select({ c: sql<number>`COUNT(*)` }).from(patients);
    dbConnected = true;
    patientsCount = Number(rows[0]?.c ?? 0);
  } catch (error: any) {
    dbConnected = false;
    dbError = String(error?.message ?? error ?? "db error");
  }

  let tunnelConnected = false;
  let tunnelInfo = "";
  try {
    const { stdout } = await exec("cloudflared tunnel list");
    tunnelInfo = stdout.trim();
    tunnelConnected = /[0-9a-f-]{36}/i.test(stdout);
  } catch (error: any) {
    tunnelInfo = String(error?.message ?? "cloudflared not available");
  }

  let api3000 = false;
  let web4000 = false;
  try {
    const { stdout } = await exec(
      'powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object -First 1 | ForEach-Object { $_.LocalPort }"'
    );
    api3000 = String(stdout).trim() === "3000";
  } catch {}
  try {
    const { stdout } = await exec(
      'powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 4000 -State Listen | Select-Object -First 1 | ForEach-Object { $_.LocalPort }"'
    );
    web4000 = String(stdout).trim() === "4000";
  } catch {}

  const backupsDir = path.join(process.cwd(), "backups");
  let latestBackupFile = "";
  let latestBackupAt = "";
  try {
    const files = await fs.readdir(backupsDir);
    const sqlFiles = files.filter((f) => f.toLowerCase().endsWith(".sql"));
    const withStat = await Promise.all(
      sqlFiles.map(async (name) => {
        const full = path.join(backupsDir, name);
        const stat = await fs.stat(full);
        return { name, full, mtime: stat.mtime };
      })
    );
    withStat.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    const latest = withStat[0];
    if (latest) {
      latestBackupFile = latest.full;
      latestBackupAt = latest.mtime.toISOString();
    }
  } catch {
    // ignore missing backups dir
  }

  return {
    ok: dbConnected && web4000,
    env: process.env.NODE_ENV || "development",
    web4000,
    api3000,
    dbConnected,
    patientsCount,
    dbError,
    tunnelConnected,
    tunnelInfo,
    latestBackupFile,
    latestBackupAt,
  };
}

export async function getNextPatientCode() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select({
      maxCode: sql<number>`MAX(CASE WHEN ${patients.patientCode} REGEXP '^[0-9]{4}$' THEN CAST(${patients.patientCode} AS UNSIGNED) ELSE NULL END)`,
    })
    .from(patients);

  const current = rows[0]?.maxCode ?? 0;
  const next = Number.isFinite(current) ? Number(current) + 1 : 1;
  return String(next).padStart(4, "0");
}

export async function getPatientById(patientId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);
  return result.length > 0 ? decodePatientRow(result[0] as any) : null;
}

export async function getPatientByCode(patientCode: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(patients).where(eq(patients.patientCode, patientCode)).limit(1);
  return result.length > 0 ? decodePatientRow(result[0] as any) : null;
}

export async function searchPatients(
  searchTerm: string,
  sheetType?: "consultant" | "specialist" | "lasik" | "external"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const normalized = String(searchTerm ?? "").trim();
  const legacy = encodeForLegacySearch(normalized);
  const term = `%${normalized}%`;
  const legacyTerm = `%${legacy}%`;
  const textMatch = or(
    like(patients.fullName, term),
    like(patients.fullName, legacyTerm),
    like(patients.patientCode, term),
    like(patients.phone, term),
    like(patients.alternatePhone, term)
  );

  let whereClause = textMatch as any;
  if (sheetType) {
    const rows = await db
      .select({ patientId: sheetEntries.patientId })
      .from(sheetEntries)
      .where(eq(sheetEntries.sheetType, sheetType as any))
      .groupBy(sheetEntries.patientId);
    const patientIds = rows.map((row) => Number(row.patientId)).filter((id) => Number.isFinite(id));
    if (patientIds.length === 0) return [];
    whereClause = and(textMatch, inArray(patients.id, patientIds));
  }

  const result = await db.select().from(patients).where(whereClause).limit(50);
  const enriched = await attachTreatingDoctor(result);
  return enriched.map((row) => decodePatientRow(row as any));
}

export async function updatePatient(patientId: number, updates: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const nextUpdates: Record<string, unknown> = { ...(updates ?? {}) };

  if (Object.prototype.hasOwnProperty.call(nextUpdates, "dateOfBirth")) {
    const rawDob = nextUpdates.dateOfBirth;
    const parseLooseDate = (value: unknown): string | null => {
      if (value == null) return null;
      if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);

      const raw = String(value).trim();
      if (!raw) return null;

      const ymd = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (ymd) {
        const normalized = `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
        const strict = normalizeIsoDate(normalized);
        if (strict) return strict;
      }

      const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (dmy) {
        const dd = dmy[1].padStart(2, "0");
        const mm = dmy[2].padStart(2, "0");
        const normalized = `${dmy[3]}-${mm}-${dd}`;
        const strict = normalizeIsoDate(normalized);
        if (strict) return strict;
      }

      const sanitized = raw
        .replace(/\bGM\b/g, "GMT")
        .replace(/\s+\([^)]+\)\s*$/, "")
        .trim();
      const parsed = new Date(sanitized);
      if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString().slice(0, 10);

      return null;
    };

    if (rawDob == null || String(rawDob).trim() === "") {
      nextUpdates.dateOfBirth = null;
    } else {
      const parsedDob = parseLooseDate(rawDob);
      if (parsedDob) {
        nextUpdates.dateOfBirth = parsedDob;
      } else {
        delete nextUpdates.dateOfBirth;
      }
    }
  }

  await db.update(patients).set(nextUpdates).where(eq(patients.id, patientId));
}

export async function deletePatient(patientId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(patients).where(eq(patients.id, patientId));
}

export async function deleteAllPatientsData() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(testRequestItems);
  await db.delete(prescriptionItems);
  await db.delete(examinations);
  await db.delete(pentacamResults);
  await db.delete(doctorReports);
  await db.delete(postOpFollowups);
  await db.delete(consentForms);
  await db.delete(medicalHistoryChecklist);
  await db.delete(sheetEntries);
  await db.delete(patientPageStates);
  await db.delete(patientServiceEntries);
  await db.delete(testRequests);
  await db.delete(prescriptions);
  await db.delete(surgeries);
  await db.delete(appointments);
  await db.delete(visits);
  await db.delete(patients);
}

function buildPatientFilterClauses(filters?: {
  branch?: string;
  searchTerm?: string;
  dateFrom?: string;
  dateTo?: string;
  doctorName?: string;
  serviceType?: "consultant" | "specialist" | "lasik" | "surgery" | "external";
  locationType?: "center" | "external";
}) {
  const whereClauses: any[] = [];
  const normalizedBranch = String(filters?.branch ?? "").trim();
  if (normalizedBranch) {
    whereClauses.push(eq(patients.branch, normalizedBranch as any));
  }
  const normalizedSearch = String(filters?.searchTerm ?? "").trim();
  if (normalizedSearch) {
    const legacy = encodeForLegacySearch(normalizedSearch);
    const term = `%${normalizedSearch}%`;
    const legacyTerm = `%${legacy}%`;
    whereClauses.push(sql`
      (
        ${patients.fullName} LIKE ${term}
        OR ${patients.fullName} LIKE ${legacyTerm}
        OR ${patients.patientCode} LIKE ${term}
        OR ${patients.phone} LIKE ${term}
        OR ${patients.alternatePhone} LIKE ${term}
        OR EXISTS (
          SELECT 1
          FROM patientPageStates pps
          WHERE pps.patientId = ${patients.id}
            AND pps.page = 'examination'
            AND (
              TRIM(COALESCE(
                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(pps.data, '$.doctorName')), ''),
                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(pps.data, '$.signatures.doctor')), '')
              )) LIKE ${term}
              OR TRIM(COALESCE(
                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(pps.data, '$.doctorName')), ''),
                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(pps.data, '$.signatures.doctor')), '')
              )) LIKE ${legacyTerm}
            )
        )
      )
    `);
  }
  const normalizedDateFrom = String(filters?.dateFrom ?? "").trim();
  if (normalizedDateFrom) {
    whereClauses.push(gte(patients.lastVisit, normalizedDateFrom as any));
  }
  const normalizedDateTo = String(filters?.dateTo ?? "").trim();
  if (normalizedDateTo) {
    whereClauses.push(lte(patients.lastVisit, normalizedDateTo as any));
  }
  const normalizedServiceType = String(filters?.serviceType ?? "").trim();
  if (normalizedServiceType) {
    whereClauses.push(eq(patients.serviceType, normalizedServiceType as any));
  }
  const normalizedLocationType = String(filters?.locationType ?? "").trim();
  if (normalizedLocationType) {
    whereClauses.push(eq(patients.locationType, normalizedLocationType as any));
  }
  const normalizedDoctor = String(filters?.doctorName ?? "").trim();
  if (normalizedDoctor) {
    const legacyDoctor = encodeForLegacySearch(normalizedDoctor);
    const doctorTerm = `%${normalizedDoctor}%`;
    const legacyDoctorTerm = `%${legacyDoctor}%`;
    whereClauses.push(sql`
      (
        EXISTS (
          SELECT 1
          FROM patientPageStates pps
          WHERE pps.patientId = ${patients.id}
            AND pps.page = 'examination'
            AND (
              TRIM(COALESCE(
                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(pps.data, '$.doctorName')), ''),
                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(pps.data, '$.signatures.doctor')), '')
              )) LIKE ${doctorTerm}
              OR TRIM(COALESCE(
                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(pps.data, '$.doctorName')), ''),
                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(pps.data, '$.signatures.doctor')), '')
              )) LIKE ${legacyDoctorTerm}
              OR TRIM(COALESCE(
                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(pps.data, '$.doctorName')), ''),
                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(pps.data, '$.signatures.doctor')), '')
              )) = ${normalizedDoctor}
              OR TRIM(COALESCE(
                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(pps.data, '$.doctorName')), ''),
                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(pps.data, '$.signatures.doctor')), '')
              )) = ${legacyDoctor}
            )
        )
      )
    `);
  }
  return whereClauses;
}

export async function getAllPatients(options?: {
  branch?: string;
  searchTerm?: string;
  dateFrom?: string;
  dateTo?: string;
  doctorName?: string;
  serviceType?: "consultant" | "specialist" | "lasik" | "surgery" | "external";
  locationType?: "center" | "external";
  limit?: number;
  cursor?: {
    codeNum: number;
    patientCode: string;
    id: number;
  };
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const whereClauses: any[] = buildPatientFilterClauses(options);
  const limitValue = Math.max(1, Math.min(500, Number(options?.limit ?? 120)));
  const cursor = options?.cursor;
  if (
    cursor &&
    Number.isFinite(Number(cursor.codeNum)) &&
    Number.isFinite(Number(cursor.id))
  ) {
    whereClauses.push(
      sql`(
        CAST(${patients.patientCode} AS UNSIGNED) > ${Number(cursor.codeNum)}
        OR (
          CAST(${patients.patientCode} AS UNSIGNED) = ${Number(cursor.codeNum)}
          AND ${patients.patientCode} > ${String(cursor.patientCode ?? "")}
        )
        OR (
          CAST(${patients.patientCode} AS UNSIGNED) = ${Number(cursor.codeNum)}
          AND ${patients.patientCode} = ${String(cursor.patientCode ?? "")}
          AND ${patients.id} > ${Number(cursor.id)}
        )
      )`
    );
  }
  const whereExpr = whereClauses.length > 0 ? and(...whereClauses) : undefined;

  let query = db
    .select()
    .from(patients)
    .orderBy(sql`CAST(${patients.patientCode} AS UNSIGNED) ASC, ${patients.patientCode} ASC`)
    .limit(limitValue + 1);

  if (whereExpr) {
    query = query.where(whereExpr) as any;
  }
  const patientRows = await query;

  const enriched = await attachTreatingDoctor(patientRows);
  const decoded = enriched.map((row) => decodePatientRow(row as any));
  const hasMore = decoded.length > limitValue;
  const rows = hasMore ? decoded.slice(0, limitValue) : decoded;
  const last = rows.length > 0 ? (rows[rows.length - 1] as any) : null;
  const leadingCodeNum = (value: unknown) => {
    const raw = String(value ?? "").trim();
    const m = raw.match(/^\d+/);
    return m ? Number(m[0]) : 0;
  };
  const nextCursor = last
    ? {
        codeNum: leadingCodeNum(last.patientCode),
        patientCode: String(last.patientCode ?? ""),
        id: Number(last.id),
      }
    : null;
  return { rows, hasMore, nextCursor, limit: limitValue };
}

export async function getPatientStats(
  year: number,
  month?: number,
  filters?: {
    searchTerm?: string;
    doctorName?: string;
    serviceType?: "consultant" | "specialist" | "lasik" | "surgery" | "external";
    locationType?: "center" | "external";
    dateFrom?: string;
    dateTo?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const safeYear = Number.isFinite(year) ? Math.trunc(year) : 0;
  const safeMonth = Number.isFinite(month as number) ? Math.trunc(month as number) : undefined;
  if (safeYear < 1900 || safeYear > 3000) {
    return { total: 0, center: 0, external: 0, lasik: 0 };
  }

  const effectiveDate = sql`${patients.lastVisit}`;
  const whereClauses: any[] = [sql`YEAR(${effectiveDate}) = ${safeYear}`];
  if (safeMonth && safeMonth >= 1 && safeMonth <= 12) {
    whereClauses.push(sql`MONTH(${effectiveDate}) = ${safeMonth}`);
  }

  whereClauses.push(...buildPatientFilterClauses(filters));

  const whereClause = and(...whereClauses);

  const rows = await db
    .select({
      total: sql<number>`COUNT(*)`,
      center: sql<number>`SUM(CASE WHEN ${patients.locationType} = 'center' THEN 1 ELSE 0 END)`,
      external: sql<number>`SUM(CASE WHEN ${patients.locationType} = 'external' THEN 1 ELSE 0 END)`,
      lasik: sql<number>`SUM(CASE WHEN ${patients.serviceType} = 'lasik' THEN 1 ELSE 0 END)`,
    })
    .from(patients)
    .where(whereClause);

  const row = rows[0] ?? { total: 0, center: 0, external: 0, lasik: 0 };
  return {
    total: Number(row.total ?? 0),
    center: Number(row.center ?? 0),
    external: Number(row.external ?? 0),
    lasik: Number(row.lasik ?? 0),
  };
}

export async function getTodayPatientsBySheet(dateIso?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const localToday = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  })();
  const target = String(dateIso ?? "").trim() || localToday;
  const rows = await db
    .select({
      id: patients.id,
      patientCode: patients.patientCode,
      fullName: patients.fullName,
      serviceType: patients.serviceType,
      lastVisit: patients.lastVisit,
    })
    .from(patients)
    .where(
      sql`(
        DATE(${patients.lastVisit}) = ${target}
        OR EXISTS (
          SELECT 1 FROM ${visits}
          WHERE ${visits.patientId} = ${patients.id}
            AND DATE(${visits.visitDate}) = ${target}
        )
      )`
    )
    .orderBy(sql`CAST(${patients.patientCode} AS UNSIGNED) ASC, ${patients.patientCode} ASC`);

  const groups: Record<string, { serviceType: string; total: number; patients: Array<{ id: number; patientCode: string; fullName: string }> }> = {
    consultant: { serviceType: "consultant", total: 0, patients: [] },
    specialist: { serviceType: "specialist", total: 0, patients: [] },
    lasik: { serviceType: "lasik", total: 0, patients: [] },
    external: { serviceType: "external", total: 0, patients: [] },
    surgery: { serviceType: "surgery", total: 0, patients: [] },
  };

  for (const raw of rows) {
    const row = decodePatientRow(raw as any);
    const key = String(row.serviceType ?? "").toLowerCase();
    const bucket = groups[key] ?? groups.consultant;
    bucket.total += 1;
    bucket.patients.push({
      id: Number(row.id),
      patientCode: String(row.patientCode ?? ""),
      fullName: String(row.fullName ?? ""),
    });
  }

  return {
    date: target,
    total: rows.length,
    groups: [groups.consultant, groups.specialist, groups.lasik, groups.external, groups.surgery],
  };
}

async function attachTreatingDoctor(patientRows: any[]) {
  const db = await getDb();
  if (!db) return patientRows;
  if (!patientRows.length) return patientRows;

  const patientIds = patientRows.map((p) => p.id).filter((id) => typeof id === "number");
  if (!patientIds.length) return patientRows;

  const stateRows = await db
    .select({
      patientId: patientPageStates.patientId,
      data: patientPageStates.data,
      updatedAt: patientPageStates.updatedAt,
    })
    .from(patientPageStates)
    .where(and(eq(patientPageStates.page, "examination"), inArray(patientPageStates.patientId, patientIds)))
    .orderBy(desc(patientPageStates.updatedAt));

  const latestExamDoctorByPatient = new Map<number, string>();
  const latestExamServiceCodeByPatient = new Map<number, string>();
  const latestExamServiceCodesByPatient = new Map<number, string[]>();
  const latestSheetTypeByServiceCodeByPatient = new Map<number, Record<string, string>>();
  const latestSyncLockManualByPatient = new Map<number, boolean>();
  const latestManualEditedAtByPatient = new Map<number, string>();
  for (const row of stateRows) {
    if (
      latestExamDoctorByPatient.has(row.patientId) &&
      latestExamServiceCodesByPatient.has(row.patientId) &&
      latestSheetTypeByServiceCodeByPatient.has(row.patientId)
    ) {
      continue;
    }
    const payload = (() => {
      if (!row.data) return null;
      if (typeof row.data === "string") {
        try {
          return JSON.parse(row.data);
        } catch {
          return null;
        }
      }
      return row.data as Record<string, unknown>;
    })();
    if (!payload || typeof payload !== "object") continue;

    const directDoctor = String((payload as any).doctorName ?? "").trim();
    const signatureDoctor = String((payload as any).signatures?.doctor ?? "").trim();
    const serviceCode = String(
      (payload as any).serviceCode ??
      (payload as any).srvCode ??
      (payload as any).srv_cd ??
      ""
    ).trim();
    const serviceCodes = Array.isArray((payload as any).serviceCodes)
      ? (payload as any).serviceCodes.map((v: unknown) => String(v ?? "").trim()).filter(Boolean)
      : [];
    const mergedServiceCodes = Array.from(new Set([serviceCode, ...serviceCodes].filter(Boolean)));
    if (mergedServiceCodes.length > 0 && !latestExamServiceCodesByPatient.has(row.patientId)) {
      latestExamServiceCodesByPatient.set(row.patientId, mergedServiceCodes);
    }
    if (serviceCode && !latestExamServiceCodeByPatient.has(row.patientId)) {
      latestExamServiceCodeByPatient.set(row.patientId, serviceCode);
    } else if (mergedServiceCodes.length > 0 && !latestExamServiceCodeByPatient.has(row.patientId)) {
      latestExamServiceCodeByPatient.set(row.patientId, mergedServiceCodes[0]);
    }
    const rawSheetMap = (payload as any).serviceSheetTypeByCode;
    if (rawSheetMap && typeof rawSheetMap === "object" && !latestSheetTypeByServiceCodeByPatient.has(row.patientId)) {
      const normalized: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawSheetMap as Record<string, unknown>)) {
        const key = String(k ?? "").trim();
        const value = String(v ?? "").trim().toLowerCase();
        if (!key || !value) continue;
        normalized[key] = value;
      }
      if (Object.keys(normalized).length > 0) {
        latestSheetTypeByServiceCodeByPatient.set(row.patientId, normalized);
      }
    }
    if (!latestSyncLockManualByPatient.has(row.patientId)) {
      latestSyncLockManualByPatient.set(row.patientId, Boolean((payload as any).syncLockManual));
    }
    if (!latestManualEditedAtByPatient.has(row.patientId)) {
      latestManualEditedAtByPatient.set(row.patientId, String((payload as any).manualEditedAt ?? "").trim());
    }
    const doctorName = directDoctor || signatureDoctor;
    if (!doctorName) continue;
    latestExamDoctorByPatient.set(row.patientId, doctorName);
  }

  const serviceEntryRows = await getPatientServiceEntriesByPatients(patientIds).catch(() => []);
  const serviceCodesByPatient = new Map<number, string[]>();
  for (const row of serviceEntryRows as any[]) {
    const pid = Number((row as any).patientId ?? 0);
    const code = String((row as any).serviceCode ?? "").trim();
    if (!pid || !code) continue;
    const existing = serviceCodesByPatient.get(pid) ?? [];
    if (!existing.includes(code)) existing.push(code);
    serviceCodesByPatient.set(pid, existing);
  }

  const reportRows = await db
    .select({
      patientId: doctorReports.patientId,
      doctorName: users.name,
      doctorUsername: users.username,
      createdAt: doctorReports.createdAt,
    })
    .from(doctorReports)
    .leftJoin(users, eq(doctorReports.doctorId, users.id))
    .where(inArray(doctorReports.patientId, patientIds))
    .orderBy(desc(doctorReports.createdAt));

  const latestDoctorByPatient = new Map<number, string>();
  for (const row of reportRows) {
    if (latestDoctorByPatient.has(row.patientId)) continue;
    const doctorName = String(row.doctorName || row.doctorUsername || "").trim();
    if (!doctorName) continue;
    latestDoctorByPatient.set(row.patientId, doctorName);
  }

  return patientRows.map((patient) => ({
    ...patient,
    treatingDoctor:
      String((patient as any).treatingDoctor ?? "").trim() ||
      latestExamDoctorByPatient.get(patient.id) ||
      latestDoctorByPatient.get(patient.id) ||
      "",
    serviceCode:
      latestExamServiceCodeByPatient.get(patient.id) ??
      serviceCodesByPatient.get(patient.id)?.[0] ??
      String((patient as any).serviceCode ?? "").trim(),
    serviceCodes: Array.from(
      new Set([
        ...(latestExamServiceCodesByPatient.get(patient.id) ?? []),
        ...(serviceCodesByPatient.get(patient.id) ?? []),
      ].filter(Boolean))
    ),
    serviceSheetTypeByCode: latestSheetTypeByServiceCodeByPatient.get(patient.id) ?? {},
    syncLockManual: latestSyncLockManualByPatient.get(patient.id) ?? false,
    manualEditedAt: latestManualEditedAtByPatient.get(patient.id) ?? "",
  }));
}

// ============ APPOINTMENT OPERATIONS ============

export async function createAppointment(appointmentData: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(appointments).values(appointmentData);
  return result;
}

export async function getAppointmentsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(appointments).where(eq(appointments.patientId, patientId));
}

export async function getAllAppointments(branch?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (branch) {
    return await db
      .select()
      .from(appointments)
      .where(eq(appointments.branch, branch as any))
      .orderBy(desc(appointments.appointmentDate));
  }

  return await db.select().from(appointments).orderBy(desc(appointments.appointmentDate));
}

export async function deleteAppointment(appointmentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(appointments).where(eq(appointments.id, appointmentId));
}

export async function updateAppointment(appointmentId: number, updates: Partial<InsertAppointment>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(appointments).set(updates).where(eq(appointments.id, appointmentId));
}

export async function getAppointmentsByDate(date: Date, branch?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  if (branch) {
    return await db.select().from(appointments).where(
      and(
        eq(appointments.branch, branch as any),
        // Add date range filter here
      )
    );
  }
  return await db.select().from(appointments);
}

// ============ VISIT OPERATIONS ============

export async function createVisit(visitData: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(visits).values(visitData);
  return result;
}

export async function getVisitsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(visits).where(eq(visits.patientId, patientId)).orderBy(desc(visits.visitDate));
}

// ============ EXAMINATION OPERATIONS ============

export async function createExamination(examinationData: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(examinations).values(examinationData);
  return result;
}

export async function getExaminationsByVisit(visitId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(examinations).where(eq(examinations.visitId, visitId));
}

export async function getExaminationsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(examinations).where(eq(examinations.patientId, patientId)).orderBy(desc(examinations.createdAt));
}

export async function getAllExaminations() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(examinations).orderBy(desc(examinations.createdAt));
}

export async function updateExamination(examinationId: number, updates: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(examinations).set(updates).where(eq(examinations.id, examinationId));
}

// ============ PENTACAM OPERATIONS ============

export async function createPentacamResult(pentacamData: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(pentacamResults).values(pentacamData);
  return result;
}

export async function getPentacamResultsByVisit(visitId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(pentacamResults).where(eq(pentacamResults.visitId, visitId));
}

// ============ DOCTOR REPORT OPERATIONS ============

export async function createDoctorReport(reportData: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(doctorReports).values(reportData);
  return result;
}

export async function updateDoctorReport(reportId: number, updates: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(doctorReports).set(updates).where(eq(doctorReports.id, reportId));
}

export async function getDoctorReportsByVisit(visitId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(doctorReports).where(eq(doctorReports.visitId, visitId));
}

export async function getAllDoctorReports() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(doctorReports).orderBy(desc(doctorReports.createdAt));
}

export async function getDoctorReportsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(doctorReports).where(eq(doctorReports.patientId, patientId)).orderBy(desc(doctorReports.createdAt));
}

export async function deleteDoctorReport(reportId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(doctorReports).where(eq(doctorReports.id, reportId));
}

// ============ PRESCRIPTION OPERATIONS ============

export async function createPrescription(prescriptionData: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const {
    medicationName,
    dosage,
    frequency,
    duration,
    instructions,
    ...base
  } = prescriptionData ?? {};

  const result = await db.insert(prescriptions).values({
    ...base,
    prescriptionDate: base.prescriptionDate ?? new Date(),
  });

  if (medicationName) {
    const existing = await db.select().from(medications).where(eq(medications.name, medicationName)).limit(1);
    let medicationId: number | undefined;
    if (existing.length > 0) {
      medicationId = existing[0].id;
    } else {
      const inserted = await db.insert(medications).values({
        name: medicationName,
        type: "other",
      });
      medicationId = (inserted as any).insertId as number;
    }

    await db.insert(prescriptionItems).values({
      prescriptionId: (result as any).insertId,
      medicationId,
      dosage: dosage ?? null,
      frequency: frequency ?? null,
      duration: duration ?? null,
      instructions: instructions ?? null,
    });
  }

  return result;
}

export async function getPrescriptionsByVisit(visitId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(prescriptions).where(eq(prescriptions.visitId, visitId));
}

export async function getPrescriptionsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(prescriptions).where(eq(prescriptions.patientId, patientId)).orderBy(desc(prescriptions.prescriptionDate));
}

export async function getPrescriptionsWithItemsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select({
      prescriptionId: prescriptions.id,
      prescriptionDate: prescriptions.prescriptionDate,
      notes: prescriptions.notes,
      itemId: prescriptionItems.id,
      medicationName: medications.name,
      dosage: prescriptionItems.dosage,
      frequency: prescriptionItems.frequency,
      duration: prescriptionItems.duration,
      instructions: prescriptionItems.instructions,
    })
    .from(prescriptions)
    .leftJoin(prescriptionItems, eq(prescriptions.id, prescriptionItems.prescriptionId))
    .leftJoin(medications, eq(prescriptionItems.medicationId, medications.id))
    .where(eq(prescriptions.patientId, patientId))
    .orderBy(desc(prescriptions.prescriptionDate));

  const grouped: Record<number, any> = {};
  for (const row of rows) {
    if (!grouped[row.prescriptionId]) {
      grouped[row.prescriptionId] = {
        id: row.prescriptionId,
        prescriptionDate: row.prescriptionDate,
        notes: row.notes ?? "",
        items: [],
      };
    }
    if (row.itemId) {
      grouped[row.prescriptionId].items.push({
        id: row.itemId,
        medicationName: row.medicationName ?? "",
        dosage: row.dosage ?? "",
        frequency: row.frequency ?? "",
        duration: row.duration ?? "",
        instructions: row.instructions ?? "",
      });
    }
  }

  return Object.values(grouped);
}

export async function createPrescriptionWithItems(data: {
  patientId: number;
  visitId?: number;
  doctorId?: number;
  date?: string;
  notes?: string;
  items: Array<{
    medicationId?: number;
    medicationName: string;
    dosage?: string;
    frequency?: string;
    duration?: string;
    instructions?: string;
  }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const validItems = data.items.filter((item) => {
    const hasId = typeof item.medicationId === "number" && item.medicationId > 0;
    const hasName = Boolean(item.medicationName && item.medicationName.trim());
    return hasId || hasName;
  });
  console.log("[createPrescriptionWithItems] validItems", {
    total: data.items.length,
    valid: validItems.length,
    first: validItems[0],
  });
  if (validItems.length === 0) {
    throw new Error("Cannot create prescription without items");
  }

  const prescription = await db.insert(prescriptions).values({
    patientId: data.patientId,
    visitId: data.visitId ?? null,
    doctorId: data.doctorId ?? null,
    notes: data.notes ?? null,
    prescriptionDate: data.date ? new Date(data.date) : new Date(),
  });

  let prescriptionId = (prescription as any).insertId as number | undefined;
  if (!prescriptionId) {
    const lastIdResult = await db.execute(sql`select last_insert_id() as id`);
    const rows = (lastIdResult as any)?.[0] ?? (lastIdResult as any)?.rows ?? lastIdResult;
    const resolvedId = Array.isArray(rows) ? rows[0]?.id : rows?.id;
    prescriptionId = resolvedId ? Number(resolvedId) : undefined;
  }
  if (!prescriptionId) return prescription;

  for (const item of validItems) {
    const providedId = typeof item.medicationId === "number" && item.medicationId > 0 ? item.medicationId : undefined;
    let medicationId: number | undefined = providedId;
    if (!medicationId) {
      const name = item.medicationName?.trim();
      if (!name) continue;
      const existing = await db.select().from(medications).where(eq(medications.name, name)).limit(1);
      if (existing.length > 0) {
        medicationId = existing[0].id;
      } else {
        const inserted = await db.insert(medications).values({ name, type: "other" });
        medicationId = (inserted as any).insertId as number;
      }
    }

    await db.insert(prescriptionItems).values({
      prescriptionId,
      medicationId,
      dosage: item.dosage ?? null,
      frequency: item.frequency ?? null,
      duration: item.duration ?? null,
      instructions: item.instructions ?? null,
    });
  }

  return prescription;
}

// ============ SURGERY OPERATIONS ============

export async function createSurgery(surgeryData: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(surgeries).values(surgeryData);
  return result;
}

export async function getSurgeriesByPatient(patientId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(surgeries).where(eq(surgeries.patientId, patientId)).orderBy(desc(surgeries.surgeryDate));
}

export async function deleteSurgery(surgeryId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(surgeries).where(eq(surgeries.id, surgeryId));
}

export async function updateSurgery(surgeryId: number, updates: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(surgeries).set(updates).where(eq(surgeries.id, surgeryId));
}

// ============ POST-OP FOLLOWUP OPERATIONS ============

export async function createPostOpFollowup(followupData: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(postOpFollowups).values(followupData);
  return result;
}

export async function getPostOpFollowupsBySurgery(surgeryId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(postOpFollowups).where(eq(postOpFollowups.surgeryId, surgeryId)).orderBy(desc(postOpFollowups.followupDate));
}

export async function getPostOpFollowupsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(postOpFollowups).where(eq(postOpFollowups.patientId, patientId)).orderBy(desc(postOpFollowups.followupDate));
}

// ============ CONSENT FORM OPERATIONS ============

export async function createConsentForm(consentData: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(consentForms).values(consentData);
  return result;
}

export async function getConsentFormsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(consentForms).where(eq(consentForms.patientId, patientId));
}

// ============ MEDICAL HISTORY OPERATIONS ============

export async function createMedicalHistory(historyData: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(medicalHistoryChecklist).values(historyData);
  return result;
}

export async function getMedicalHistoryByPatient(patientId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(medicalHistoryChecklist).where(eq(medicalHistoryChecklist.patientId, patientId));
}

// ============ AUDIT LOG OPERATIONS ============

export async function createAuditLog(logData: InsertAuditLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(auditLogs).values(logData);
  return result;
}

export async function getAuditLogs(limit: number = 100) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
}

// ============ MEDICATION OPERATIONS ============

export async function createMedication(medicationData: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(medications).values(medicationData);
  return result;
}

export async function getAllMedications() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(medications);
}

export async function updateMedication(medicationId: number, updates: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(medications).set(updates).where(eq(medications.id, medicationId));
}

export async function deleteMedication(medicationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(medications).where(eq(medications.id, medicationId));
}

// ============ TEST OPERATIONS ============

export async function createTest(testData: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(tests).values(testData);
  return result;
}

export async function getAllTests() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(tests);
}

export async function updateTest(testId: number, updates: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(tests).set(updates).where(eq(tests.id, testId));
}

export async function deleteTest(testId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(tests).where(eq(tests.id, testId));
}

export async function getTestFavoritesByUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(testFavorites).where(eq(testFavorites.userId, userId));
}

export async function toggleTestFavorite(userId: number, testId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select()
    .from(testFavorites)
    .where(and(eq(testFavorites.userId, userId), eq(testFavorites.testId, testId)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .delete(testFavorites)
      .where(and(eq(testFavorites.userId, userId), eq(testFavorites.testId, testId)));
    return { favorite: false };
  }

  await db.insert(testFavorites).values({
    userId,
    testId,
    createdAt: new Date(),
  });
  return { favorite: true };
}

// ============ TEST REQUEST OPERATIONS ============

export async function createTestRequest(requestData: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(testRequests).values(requestData);
  return result;
}

export async function getTestRequestsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(testRequests).where(eq(testRequests.patientId, patientId));
}

// ============ SYSTEM SETTINGS OPERATIONS ============

export async function getSystemSettings() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(systemSettings);
}

export async function getSystemSetting(key: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
  return rows[0] ?? null;
}

export async function updateSystemSettings(key: string, value: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
  
  if (existing.length > 0) {
    await db.update(systemSettings).set({ value: JSON.stringify(value), updatedAt: new Date() }).where(eq(systemSettings.key, key));
  } else {
    await db.insert(systemSettings).values({ key, value: JSON.stringify(value) });
  }
}

// ============ USER PERMISSIONS ============

export async function getUserPermissions(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db.select().from(userPermissions).where(eq(userPermissions.userId, userId));
  return rows
    .map((row) => String(row.pageId ?? "").trim())
    .filter((pageId) => pageId.length > 0);
}

type TeamRole = "admin" | "manager" | "accountant" | "doctor" | "nurse" | "technician" | "reception";
type TeamPermissionsMap = Record<TeamRole, string[]>;

const TEAM_PERMISSION_ROLES: TeamRole[] = ["admin", "manager", "accountant", "doctor", "nurse", "technician", "reception"];
const TEAM_PERMISSIONS_SETTING_KEY = "team_permissions_v1";

function getDefaultTeamPermissions(): TeamPermissionsMap {
  return {
    admin: [],
    manager: [],
    accountant: ["/appointments", "/ops/mssql-add"],
    reception: [],
    nurse: [],
    technician: [],
    doctor: [],
  };
}

function normalizeTeamPermissions(raw: unknown): TeamPermissionsMap {
  const defaults = getDefaultTeamPermissions();
  if (!raw || typeof raw !== "object") return defaults;

  const next = { ...defaults };
  for (const role of TEAM_PERMISSION_ROLES) {
    const value = (raw as any)[role];
    if (!Array.isArray(value)) continue;
    const cleaned = value
      .map((entry: unknown) => String(entry ?? "").trim())
      .filter((entry: string) => entry.length > 0);
    next[role] = Array.from(new Set(cleaned));
  }
  return next;
}

export async function getTeamPermissions(): Promise<TeamPermissionsMap> {
  const row = await getSystemSetting(TEAM_PERMISSIONS_SETTING_KEY);
  if (!row?.value) return getDefaultTeamPermissions();
  try {
    return normalizeTeamPermissions(JSON.parse(row.value));
  } catch {
    return getDefaultTeamPermissions();
  }
}

export async function setTeamPermissions(input: Partial<Record<TeamRole, string[]>>) {
  const current = await getTeamPermissions();
  const merged = normalizeTeamPermissions({ ...current, ...input });
  await updateSystemSettings(TEAM_PERMISSIONS_SETTING_KEY, merged);
}

export async function getRoleDefaultPermissions(role?: string) {
  const userRole = String(role ?? "").trim().toLowerCase() as TeamRole | "";
  if (!TEAM_PERMISSION_ROLES.includes(userRole as TeamRole)) {
    return [] as string[];
  }
  const teamPermissions = await getTeamPermissions();
  const roleKey = userRole as TeamRole;
  return teamPermissions[roleKey] ?? [];
}

export async function getEffectiveUserPermissions(userId: number, role?: string) {
  const directPermissions = await getUserPermissions(userId);
  const inherited = await getRoleDefaultPermissions(role);
  if (!inherited.length) {
    return Array.from(new Set(directPermissions));
  }
  return Array.from(new Set([...inherited, ...directPermissions]));
}

export async function setUserPermissions(userId: number, pageIds: string[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(userPermissions).where(eq(userPermissions.userId, userId));
  if (pageIds.length === 0) return;

  await db.insert(userPermissions).values(pageIds.map((pageId) => ({
    userId,
    pageId,
    createdAt: new Date(),
  })));
}

// ============ SHEET ENTRIES ============

export async function getSheetEntry(patientId: number, sheetType: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select()
    .from(sheetEntries)
    .where(and(eq(sheetEntries.patientId, patientId), eq(sheetEntries.sheetType, sheetType as any)))
    .orderBy(desc(sheetEntries.updatedAt))
    .limit(1);

  return rows.length > 0 ? rows[0].content : null;
}

export async function upsertSheetEntry(params: { patientId: number; sheetType: string; content: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select()
    .from(sheetEntries)
    .where(and(eq(sheetEntries.patientId, params.patientId), eq(sheetEntries.sheetType, params.sheetType as any)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(sheetEntries)
      .set({ content: params.content, updatedAt: new Date() })
      .where(eq(sheetEntries.id, existing[0].id));
    return { id: existing[0].id };
  }

  const result = await db.insert(sheetEntries).values({
    patientId: params.patientId,
    sheetType: params.sheetType as any,
    content: params.content,
  });
  return { id: (result as any).insertId };
}

// ============ OPERATION LISTS ============

function normalizeListDate(input: string | Date): string | null {
  if (input instanceof Date) {
    return input.toISOString().split("T")[0];
  }
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.valueOf())) {
    return parsed.toISOString().split("T")[0];
  }
  // Handle non-standard timezone like "GM"
  const fixed = raw.replace(/\sGM$/, " GMT");
  const parsedFixed = new Date(fixed);
  if (!Number.isNaN(parsedFixed.valueOf())) {
    return parsedFixed.toISOString().split("T")[0];
  }
  // If already in YYYY-MM-DD, return as-is
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  return null;
}

export async function getOperationList(doctorTab: string, listDate: string | Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const dateValue = normalizeListDate(listDate);
  if (!dateValue) {
    return { id: null, items: [] as any[] };
  }
  const lists = await db
    .select()
    .from(operationLists)
    .where(and(eq(operationLists.doctorTab, doctorTab), eq(operationLists.listDate, dateValue as any)))
    .limit(1);

  if (lists.length === 0) return { id: null, items: [] as any[] };

  const items = await db.select().from(operationListItems).where(eq(operationListItems.listId, lists[0].id)).orderBy(operationListItems.id);
  return {
    id: lists[0].id,
    items,
    operationType: lists[0].operationType ?? null,
    doctorName: lists[0].doctorName ?? null,
    listTime: lists[0].listTime ?? null,
  };
}

export async function getOperationListById(listId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const lists = await db.select().from(operationLists).where(eq(operationLists.id, listId)).limit(1);
  if (lists.length === 0) return { id: null, items: [] as any[] };

  const items = await db.select().from(operationListItems).where(eq(operationListItems.listId, listId)).orderBy(operationListItems.id);
  return {
    id: lists[0].id,
    items,
    operationType: lists[0].operationType ?? null,
    doctorName: lists[0].doctorName ?? null,
    listTime: lists[0].listTime ?? null,
    doctorTab: lists[0].doctorTab,
    listDate: lists[0].listDate,
  };
}

export async function saveOperationList(data: {
  doctorTab: string;
  listDate: string | Date;
  operationType?: string | null;
  doctorName?: string | null;
  listTime?: string | null;
  items: Array<{
    number?: string;
    name: string;
    phone?: string;
    doctor?: string;
    operation?: string;
    center?: boolean;
    payment?: boolean;
    code?: string;
  }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const receiptNumbers = data.items
    .map((item) => String(item.number ?? "").trim())
    .filter((value) => value.length > 0);
  const duplicateInPayload = receiptNumbers.find((value, idx) => receiptNumbers.indexOf(value) !== idx);
  if (duplicateInPayload) {
    throw new Error(`Duplicate receipt number in list: ${duplicateInPayload}`);
  }
  const patientCodes = data.items
    .map((item) => String(item.code ?? "").trim())
    .filter((value) => value.length > 0);
  const duplicateCodeInPayload = patientCodes.find((value, idx) => patientCodes.indexOf(value) !== idx);
  if (duplicateCodeInPayload) {
    throw new Error(`Patient code cannot be repeated: ${duplicateCodeInPayload}`);
  }

  const dateValue = normalizeListDate(data.listDate);
  if (!dateValue) {
    throw new Error("Invalid listDate");
  }
  const existing = await db
    .select()
    .from(operationLists)
    .where(and(eq(operationLists.doctorTab, data.doctorTab), eq(operationLists.listDate, dateValue as any)))
    .limit(1);

  let listId = existing.length > 0 ? existing[0].id : null;
  if (receiptNumbers.length > 0) {
    const conflicts = await db
      .select({
        listId: operationListItems.listId,
        number: operationListItems.number,
      })
      .from(operationListItems)
      .where(inArray(operationListItems.number, receiptNumbers));
    const conflict = conflicts.find((row) => {
      if (!row?.number) return false;
      if (!listId) return true;
      return Number(row.listId) !== Number(listId);
    });
    if (conflict?.number) {
      throw new Error(`Receipt number already exists: ${conflict.number}`);
    }
  }
  if (patientCodes.length > 0) {
    const codeConflicts = await db
      .select({
        listId: operationListItems.listId,
        code: operationListItems.code,
      })
      .from(operationListItems)
      .where(inArray(operationListItems.code, patientCodes));
    const codeConflict = codeConflicts.find((row) => {
      if (!row?.code) return false;
      if (!listId) return true;
      return Number(row.listId) !== Number(listId);
    });
    if (codeConflict?.code) {
      throw new Error(`Patient code already exists in another record: ${codeConflict.code}`);
    }
  }

  if (!listId) {
    const created = await db.insert(operationLists).values({
      doctorTab: data.doctorTab,
      listDate: dateValue as any,
      operationType: data.operationType ?? null,
      doctorName: data.doctorName ?? null,
      listTime: data.listTime ?? null,
    });
    listId = (created as any).insertId;
  } else {
    await db.update(operationLists).set({
      operationType: data.operationType ?? null,
      doctorName: data.doctorName ?? null,
      listTime: data.listTime ?? null,
      updatedAt: new Date(),
    }).where(eq(operationLists.id, listId));
    await db.delete(operationListItems).where(eq(operationListItems.listId, listId));
  }

  if (listId) {
    await db.insert(operationListItems).values(
      data.items.map((item) => ({
        listId,
        number: item.number ?? null,
        name: item.name,
        phone: item.phone ?? null,
        doctor: item.doctor ?? null,
        operation: item.operation ?? null,
        center: item.center ?? false,
        payment: item.payment ?? false,
        code: item.code ?? null,
      }))
    );
  }

  return { id: listId };
}

export async function deleteOperationList(doctorTab: string, listDate: string | Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const dateValue = normalizeListDate(listDate);
  if (!dateValue) return;
  const existing = await db
    .select()
    .from(operationLists)
    .where(and(eq(operationLists.doctorTab, doctorTab), eq(operationLists.listDate, dateValue as any)))
    .limit(1);

  if (existing.length === 0) return;

  await db.delete(operationListItems).where(eq(operationListItems.listId, existing[0].id));
  await db.delete(operationLists).where(eq(operationLists.id, existing[0].id));
}

export async function deleteOperationListById(listId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(operationListItems).where(eq(operationListItems.listId, listId));
  await db.delete(operationLists).where(eq(operationLists.id, listId));
}

export async function getOperationListsHistory() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(operationLists)
    .orderBy(desc(operationLists.listDate), desc(operationLists.updatedAt), desc(operationLists.id));
}

export async function getOperationListsHistoryWithItems() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const lists = await db
    .select()
    .from(operationLists)
    .orderBy(desc(operationLists.listDate), desc(operationLists.updatedAt), desc(operationLists.id));

  if (lists.length === 0) return [];

  const items = await db
    .select()
    .from(operationListItems)
    .orderBy(operationListItems.id);

  const byList = new Map<number, Array<{ id: number; name: string | null }>>();
  items.forEach((item: any) => {
    if (!byList.has(item.listId)) byList.set(item.listId, []);
    byList.get(item.listId)!.push({ id: item.id, name: item.name ?? null });
  });

  return lists.map((list: any) => ({
    ...list,
    items: byList.get(list.id) ?? [],
  }));
}

// ============ PAGE STATE (USER/PATIENT) ============

export async function getUserPageState(userId: number, page: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select()
    .from(userPageStates)
    .where(and(eq(userPageStates.userId, userId), eq(userPageStates.page, page)))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertUserPageState(userId: number, page: string, data: unknown) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db
    .select()
    .from(userPageStates)
    .where(and(eq(userPageStates.userId, userId), eq(userPageStates.page, page)))
    .limit(1);
  if (!existing.length) {
    await db.insert(userPageStates).values({ userId, page, data: data as any });
    return;
  }
  await db.update(userPageStates).set({ data: data as any }).where(eq(userPageStates.id, existing[0].id));
}

const PASSWORD_CHANGE_STATE_PAGE = "__security_password_change__";

export async function isPasswordChangeRequired(userId: number) {
  const state = await getUserPageState(userId, PASSWORD_CHANGE_STATE_PAGE);
  const payload = state?.data as { changedAt?: string } | null | undefined;
  return !(payload && typeof payload.changedAt === "string" && payload.changedAt.trim().length > 0);
}

export async function markPasswordChanged(userId: number) {
  await upsertUserPageState(userId, PASSWORD_CHANGE_STATE_PAGE, {
    changedAt: new Date().toISOString(),
  });
}

export async function getPatientPageState(patientId: number, page: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select()
    .from(patientPageStates)
    .where(and(eq(patientPageStates.patientId, patientId), eq(patientPageStates.page, page)))
    .orderBy(desc(patientPageStates.updatedAt), desc(patientPageStates.id))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertPatientPageState(patientId: number, page: string, data: unknown) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existingRows = await db
    .select()
    .from(patientPageStates)
    .where(and(eq(patientPageStates.patientId, patientId), eq(patientPageStates.page, page)))
    .orderBy(desc(patientPageStates.updatedAt), desc(patientPageStates.id))
    .limit(1);
  if (!existingRows.length) {
    await db.insert(patientPageStates).values({ patientId, page, data: data as any });
    return;
  }
  const target = existingRows[0];
  await db
    .update(patientPageStates)
    .set({ data: data as any, updatedAt: new Date() })
    .where(eq(patientPageStates.id, target.id));
}

export async function upsertPatientServiceEntry(input: {
  patientId: number;
  serviceCode: string;
  serviceName?: string | null;
  source?: "mssql" | "manual" | "import";
  sourceRef: string;
  serviceDate?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const sourceRef = String(input.sourceRef ?? "").trim();
  if (!sourceRef) return;
  const existing = await db
    .select()
    .from(patientServiceEntries)
    .where(eq(patientServiceEntries.sourceRef, sourceRef))
    .limit(1);
  const payload = {
    patientId: Number(input.patientId),
    serviceCode: String(input.serviceCode ?? "").trim(),
    serviceName: input.serviceName ? String(input.serviceName).trim() : null,
    source: (input.source ?? "mssql") as any,
    sourceRef,
    serviceDate: input.serviceDate ? String(input.serviceDate).slice(0, 10) : null,
  };
  if (!payload.patientId || !payload.serviceCode) return;
  if (!existing.length) {
    await db.insert(patientServiceEntries).values(payload as any);
    return;
  }
  await db
    .update(patientServiceEntries)
    .set({
      patientId: payload.patientId,
      serviceCode: payload.serviceCode,
      serviceName: payload.serviceName,
      source: payload.source,
      serviceDate: payload.serviceDate as any,
      updatedAt: new Date(),
    } as any)
    .where(eq(patientServiceEntries.id, existing[0].id));
}

export async function getPatientServiceEntriesByPatients(patientIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const ids = Array.from(new Set(patientIds.filter((id) => Number.isFinite(id))));
  if (!ids.length) return [];
  return await db
    .select()
    .from(patientServiceEntries)
    .where(inArray(patientServiceEntries.patientId, ids))
    .orderBy(desc(patientServiceEntries.updatedAt));
}

export async function getPatientServiceEntriesByPatient(patientId: number) {
  const rows = await getPatientServiceEntriesByPatients([patientId]);
  return rows.filter((row: any) => Number((row as any).patientId) === Number(patientId));
}

// ============ DISEASES ============

export async function getAllDiseases() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(diseases).orderBy(desc(diseases.id));
}

export async function createDisease(name: string, branch?: string | null, abbrev?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(diseases).values({ name, branch: branch || null, abbrev: abbrev || null });
}

export async function updateDisease(diseaseId: number, name: string, branch?: string | null, abbrev?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(diseases).set({ name, branch: branch || null, abbrev: abbrev || null }).where(eq(diseases.id, diseaseId));
}

export async function deleteDisease(diseaseId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(diseases).where(eq(diseases.id, diseaseId));
}


/**
 * Log audit event
 */
export async function logAuditEvent(
  userId: number,
  action: string,
  entityType: string,
  entityId: number,
  changes?: Record<string, any>
) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot log audit event: database not available");
    return;
  }

  const logData: InsertAuditLog = {
    adminId: userId,
    action,
    entityType,
    entityId,
    changes: changes ? JSON.stringify(changes) : null,
    createdAt: new Date(),
  };

  await createAuditLog(logData);
}
