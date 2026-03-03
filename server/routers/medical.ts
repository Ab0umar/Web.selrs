import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, doctorProcedure, nurseProcedure, technicianProcedure, receptionProcedure, managerProcedure, adminProcedure } from "../_core/procedures";
import { authService } from "../_core/auth";
import * as db from "../db";
import { broadcastSheetUpdate } from "../_core/ws";
import { getBuildInfo } from "../_core/buildInfo";
import {
  backfillPapatSrvNamesInMssql,
  deletePatientFromMssqlByCode,
  ensurePatientServiceInMssql,
  getMssqlSyncStatus,
  insertPatientToMssql,
  syncPatientsFromMssql,
  upsertPatientToMssql,
} from "../integrations/mssqlPatients";

const doctorLocationTypeSchema = z.preprocess((value) => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "external" || raw === "خارجي" || raw === "outside" || raw === "out") return "external";
  return "center";
}, z.enum(["center", "external"]));

const doctorDirectoryEntrySchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  isActive: z.boolean().default(true),
  locationType: doctorLocationTypeSchema.default("center"),
});

const serviceDirectoryEntrySchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  serviceType: z.enum(["consultant", "specialist", "lasik", "surgery", "external"]),
  srvTyp: z
    .preprocess((value) => {
      const raw = String(value ?? "").trim();
      if (!raw) return undefined;
      return raw;
    }, z.enum(["1", "2"]).optional()),
  defaultSheet: z
    .enum([
      "consultant",
      "specialist",
      "lasik",
      "surgery",
      "external",
      "pentacam",
      "surgery_center",
      "surgery_external",
      "pentacam_center",
      "pentacam_external",
      "radiology_center",
      "radiology_external",
    ])
    .optional(),
  isActive: z.boolean().default(true),
});

const inferSrvTyp = (entry: {
  serviceType: "consultant" | "specialist" | "lasik" | "surgery" | "external";
  defaultSheet?: string;
  srvTyp?: "1" | "2";
}): "1" | "2" => {
  if (entry.srvTyp === "1" || entry.srvTyp === "2") return entry.srvTyp;
  const sheet = String(entry.defaultSheet ?? "").trim().toLowerCase();
  if (
    entry.serviceType === "external" ||
    sheet === "external" ||
    sheet === "surgery_external" ||
    sheet === "pentacam_external" ||
    sheet === "radiology_external"
  ) {
    return "2";
  }
  return "1";
};

const normalizeServiceDefaultSheet = (
  value: unknown,
  fallbackServiceType: "consultant" | "specialist" | "lasik" | "surgery" | "external"
) => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallbackServiceType;
  if (raw === "pentacam" || raw === "radiology_center") return "pentacam_center";
  if (raw === "radiology_external") return "pentacam_external";
  if (raw === "surgery") return "surgery_center";
  if (raw === "external") {
    if (fallbackServiceType === "surgery") return "surgery_external";
    if (fallbackServiceType === "specialist") return "pentacam_external";
    return fallbackServiceType;
  }
  return raw;
};

const MOJIBAKE_HINT = /[ØÙÃÂ]/;
const decodeMojibake = (value: unknown) => {
  const raw = String(value ?? "");
  if (!raw || !MOJIBAKE_HINT.test(raw)) return raw;
  try {
    return Buffer.from(raw, "latin1").toString("utf8");
  } catch {
    return raw;
  }
};

function normalizeVisitType(raw: string): "consultation" | "examination" | "surgery" | "followup" {
  const value = raw?.trim().toLowerCase();
  switch (value) {
    case "consultation":
    case "استشارة":
      return "consultation";
    case "examination":
    case "exam":
    case "checkup":
    case "فحص":
    case "فحص عام":
    case "كشف":
      return "examination";
    case "surgery":
    case "operation":
    case "جراحة":
    case "عملية":
      return "surgery";
    case "followup":
    case "follow-up":
    case "follow up":
    case "متابعة":
      return "followup";
    default:
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Invalid visitType: ${raw}`,
      });
  }
}

function readDoctorNameFromStateData(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const payload = value as Record<string, any>;
  const direct = String(payload.doctorName ?? "").trim();
  if (direct) return direct;
  const signed = String(payload.signatures?.doctor ?? "").trim();
  return signed;
}

function normalizePhoneKey(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D+/g, "");
  return digits || raw.toLowerCase();
}

async function findExistingPatientByNameOrPhone(fullNameRaw?: string | null, phoneRaw?: string | null) {
  const fullName = String(fullNameRaw ?? "").trim();
  const phone = String(phoneRaw ?? "").trim();
  if (!fullName && !phone) return null;

  const byId = new Map<number, any>();
  const collect = (rows: any[]) => {
    for (const row of rows ?? []) {
      const id = Number((row as any)?.id ?? 0);
      if (!Number.isFinite(id) || id <= 0) continue;
      if (!byId.has(id)) byId.set(id, row);
    }
  };

  if (fullName) collect(await db.searchPatients(fullName));
  if (phone && phone !== fullName) collect(await db.searchPatients(phone));
  if (byId.size === 0) return null;

  const targetName = fullName.toLowerCase();
  const targetPhone = normalizePhoneKey(phone);
  const candidates = Array.from(byId.values());
  for (const candidate of candidates) {
    const candidateName = String((candidate as any)?.fullName ?? "").trim().toLowerCase();
    const candidatePhone = normalizePhoneKey((candidate as any)?.phone ?? "");
    const candidateAltPhone = normalizePhoneKey((candidate as any)?.alternatePhone ?? "");
    const nameMatch = Boolean(targetName) && candidateName === targetName;
    const phoneMatch = Boolean(targetPhone) && (candidatePhone === targetPhone || candidateAltPhone === targetPhone);
    if (nameMatch || phoneMatch) return candidate;
  }
  return null;
}

async function resolveServiceCodeForType(serviceType: string | undefined): Promise<string> {
  const type = String(serviceType ?? "").trim();
  if (!type) return "";
  const row = await db.getSystemSetting("service_directory").catch(() => null);
  const value = (row as any)?.value;
  const list = Array.isArray(value) ? value : [];
  const match = list.find(
    (entry: any) =>
      entry &&
      entry.isActive !== false &&
      String(entry.serviceType ?? "").trim() === type &&
      String(entry.code ?? "").trim()
  );
  const configured = String(match?.code ?? "").trim();
  if (configured) return configured;

  // Fallbacks keep MSSQL service-link working even if service_directory is empty/misconfigured.
  const fallbackFromEnv: Record<string, string> = {
    consultant: String(process.env.MSSQL_SERVICE_CODE_CONSULTANT ?? "").trim(),
    specialist: String(process.env.MSSQL_SERVICE_CODE_SPECIALIST ?? "").trim(),
    lasik: String(process.env.MSSQL_SERVICE_CODE_LASIK ?? "").trim(),
    surgery: String(process.env.MSSQL_SERVICE_CODE_SURGERY ?? "").trim(),
    external: String(process.env.MSSQL_SERVICE_CODE_EXTERNAL ?? "").trim(),
  };
  if (fallbackFromEnv[type]) return fallbackFromEnv[type];

  const fallbackDefaults: Record<string, string> = {
    consultant: "1586",
    specialist: "1604",
    lasik: "1590",
  };
  return fallbackDefaults[type] ?? "";
}

async function pushNewPatientToMssql(patient: {
  patientCode: string;
  fullName: string;
  phone?: string | null;
  address?: string | null;
  age?: number | null;
  gender?: string | null;
  dateOfBirth?: string | Date | null;
  branch?: string | null;
  serviceType?: string | null;
  locationType?: "center" | "external" | null;
  enteredBy?: string | null;
}) {
  const requestedServiceType = String(patient.serviceType ?? "").trim();
  const serviceCode = requestedServiceType
    ? await resolveServiceCodeForType(requestedServiceType)
    : "";
  if (requestedServiceType && !serviceCode) {
    throw new Error(`Missing MSSQL service code for serviceType='${requestedServiceType}'`);
  }
  return await insertPatientToMssql({
    patientCode: patient.patientCode,
    fullName: patient.fullName,
    phone: patient.phone,
    address: patient.address,
    age: patient.age,
    gender: patient.gender,
    dateOfBirth: patient.dateOfBirth,
    branch: patient.branch,
    locationType: patient.locationType ?? null,
    enteredBy: patient.enteredBy ?? null,
    serviceCode: serviceCode || undefined,
  });
}

async function canPushToMssql(user: { id: number; role: string }): Promise<boolean> {
  const role = String(user.role ?? "").trim().toLowerCase();
  if (role === "admin") return true;
  const required = "/ops/mssql-add";

  // Primary check: merged permissions (role defaults + user overrides).
  try {
    const effective = await db.getEffectiveUserPermissions(user.id, role);
    if (Array.isArray(effective) && effective.includes(required)) return true;
  } catch {
    // Continue to explicit fallbacks.
  }

  // Fallbacks: check role defaults and direct user permissions independently.
  try {
    const roleDefaults = await db.getRoleDefaultPermissions(role);
    if (Array.isArray(roleDefaults) && roleDefaults.includes(required)) return true;
  } catch {
    // ignore
  }
  try {
    const direct = await db.getUserPermissions(user.id);
    if (Array.isArray(direct) && direct.includes(required)) return true;
  } catch {
    // ignore
  }

  return false;
}

export const medicalRouter = router({
  // ============ PATIENT ROUTERS ============
  
  // Reception: Create new patient
  createPatient: receptionProcedure
    .input(z.object({
      patientCode: z.string().optional(),
      fullName: z.string(),
      dateOfBirth: z.string().optional(),
      age: z.number().optional(),
      gender: z.enum(["male", "female"]).optional(),
      nationalId: z.string().optional(),
      phone: z.string(),
      alternatePhone: z.string().optional(),
      address: z.string().optional(),
      occupation: z.string().optional(),
      referralSource: z.string().optional(),
      branch: z.enum(["examinations", "surgery"]).optional(),
      serviceType: z.enum(["consultant", "specialist", "lasik", "surgery", "external"]).optional(),
      locationType: z.enum(["center", "external"]).optional(),
      lastVisit: z.string().optional(),
      skipIfExists: z.boolean().optional(),
    }))
    .mutation(async (opts) => {
      const { input, ctx } = opts;
      try {
        const { skipIfExists, ...patientInput } = input;
        const existingByIdentity = await findExistingPatientByNameOrPhone(patientInput.fullName, patientInput.phone);
        if (existingByIdentity) {
          const existingId = Number((existingByIdentity as any)?.id ?? 0);
          const existingCode = String((existingByIdentity as any)?.patientCode ?? "").trim();
          let pushResult: { inserted: boolean; note?: string; trNo?: number | null } | null = null;
          if (existingId > 0) {
            await db.updatePatient(existingId, {
              lastVisit: patientInput.lastVisit ? new Date(patientInput.lastVisit) : new Date(),
              ...(patientInput.serviceType ? { serviceType: patientInput.serviceType } : {}),
              ...(patientInput.locationType ? { locationType: patientInput.locationType } : {}),
            }).catch(() => null);
          }
          if (!existingCode) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Existing patient has no patientCode" });
          }
          pushResult = await pushNewPatientToMssql({
              patientCode: existingCode,
              fullName: String((existingByIdentity as any)?.fullName ?? patientInput.fullName ?? "").trim(),
              phone: String((existingByIdentity as any)?.phone ?? patientInput.phone ?? "").trim() || null,
              address: String((existingByIdentity as any)?.address ?? patientInput.address ?? "").trim() || null,
              age: Number.isFinite(Number((existingByIdentity as any)?.age))
                ? Number((existingByIdentity as any)?.age)
                : Number.isFinite(Number(patientInput.age))
                  ? Number(patientInput.age)
                  : null,
              gender: String((existingByIdentity as any)?.gender ?? "").trim() || null,
              dateOfBirth: (existingByIdentity as any)?.dateOfBirth ?? patientInput.dateOfBirth ?? null,
              branch: String((existingByIdentity as any)?.branch ?? patientInput.branch ?? "examinations").trim() || "examinations",
              serviceType: null,
              locationType:
                (patientInput.serviceType === "external" ? "external" : patientInput.locationType) ??
                (String((existingByIdentity as any)?.locationType ?? "").trim() === "external" ? "external" : "center"),
              enteredBy: String((ctx.user as any)?.name ?? (ctx.user as any)?.username ?? "").trim() || null,
            });
          if (!pushResult?.inserted) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Failed to create new receipt in MSSQL for existing patient ${existingCode}${pushResult?.note ? `: ${pushResult.note}` : ""}`,
            });
          }
          await db.logAuditEvent(ctx.user.id, "CREATE_PATIENT_RECEIPT_EXISTING", "patient", existingId, {
            message: `Created new receipt for existing patient (name/phone match): ${String((existingByIdentity as any)?.fullName ?? "")}`,
            patientCode: existingCode,
          });
          return { success: true, reused: true, patientId: existingId, patientCode: existingCode, receiptNo: pushResult?.trNo ?? null };
        }
        const code =
          patientInput.patientCode && patientInput.patientCode.trim()
            ? patientInput.patientCode.trim()
            : await db.getNextPatientCode();
        const existing = await db.getPatientByCode(code);
        if (existing) {
          if (skipIfExists) {
            return { success: true, skipped: true, patientId: existing.id ?? 0, patientCode: code };
          }
          throw new TRPCError({ code: "CONFLICT", message: "Patient code already exists" });
        }
        await db.createPatient({
          ...patientInput,
          patientCode: code,
          branch: patientInput.branch || "examinations",
          serviceType: patientInput.serviceType || "consultant",
          locationType:
            patientInput.serviceType === "external"
              ? "external"
              : patientInput.locationType || "center",
          // Opening date is the reference date for patient timeline/stats.
          lastVisit: patientInput.lastVisit ? new Date(patientInput.lastVisit) : new Date(),
          status: "new",
        });

        const created = await db.getPatientByCode(code);
        let pushResult: { inserted: boolean; note?: string; trNo?: number | null } | null = null;
        if (created?.patientCode && created?.fullName) {
          pushResult = await pushNewPatientToMssql({
            patientCode: String(created.patientCode),
            fullName: String(created.fullName),
            phone: created.phone,
            address: created.address,
            age: created.age,
            gender: (created as any).gender ?? null,
            dateOfBirth: (created as any).dateOfBirth ?? null,
            branch: (created as any).branch ?? "examinations",
            serviceType: null,
            locationType: (created as any).locationType ?? "center",
            enteredBy: String((ctx.user as any)?.name ?? (ctx.user as any)?.username ?? "").trim() || null,
          }).catch((error) => {
            console.warn("[mssql-push] createPatient failed", {
              patientCode: String(created.patientCode),
              message: String((error as any)?.message ?? error ?? "unknown"),
            });
            return null;
          });
        }
        await db.logAuditEvent(ctx.user.id, "CREATE_PATIENT", "patient", created?.id ?? 0, {
          message: `Created patient: ${input.fullName}`,
        });

        return { success: true, patientId: created?.id ?? 0, patientCode: code, receiptNo: pushResult?.trNo ?? null };
      } catch (error) {
        throw new Error(`Failed to create patient: ${error}`);
      }
    }),

  stagePatientsImport: adminProcedure
    .input(
      z.object({
        rows: z.array(
          z.object({
            rowNumber: z.number().int().positive(),
            patientCode: z.string().optional(),
            fullName: z.string().optional(),
            dateOfBirth: z.string().optional(),
            gender: z.enum(["male", "female", ""]).optional(),
            phone: z.string().optional(),
            address: z.string().optional(),
            branch: z.enum(["examinations", "surgery", ""]).optional(),
            serviceType: z.enum(["consultant", "specialist", "lasik", "surgery", "external", ""]).optional(),
            locationType: z.enum(["center", "external", ""]).optional(),
            doctorCode: z.string().optional(),
            doctorName: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const batchId = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const summary = await db.stagePatientImportRows(batchId, input.rows);
      await db.logAuditEvent(ctx.user.id, "STAGE_PATIENT_IMPORT", "patient_import_staging", 0, {
        batchId,
        total: summary.total,
        valid: summary.valid,
        invalid: summary.invalid,
      });
      return summary;
    }),

  applyPatientsImport: adminProcedure
    .input(z.object({ batchId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const result = await db.applyPatientImportBatch(input.batchId);
      await db.logAuditEvent(ctx.user.id, "APPLY_PATIENT_IMPORT", "patient_import_staging", 0, {
        batchId: input.batchId,
        inserted: result.inserted,
        updated: result.updated,
        failed: result.failed,
      });
      return result;
    }),

  getPatientImportErrors: adminProcedure
    .input(z.object({ batchId: z.string().min(1) }))
    .query(async ({ input }) => {
      return await db.getPatientImportErrors(input.batchId);
    }),

  getPatientImportPreview: adminProcedure
    .input(z.object({ batchId: z.string().min(1), limit: z.number().int().min(1).max(500).optional() }))
    .query(async ({ input }) => {
      return await db.getPatientImportPreview(input.batchId, input.limit ?? 100);
    }),

  getOpsHealth: adminProcedure
    .query(async () => {
      return await db.getOpsHealthStatus();
    }),

  getBuildInfo: protectedProcedure
    .query(async () => {
      return await getBuildInfo();
    }),

  syncPatientsFromMssql: adminProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(20000).optional(),
          dryRun: z.boolean().optional(),
          incremental: z.boolean().optional(),
        })
        .optional()
    )
    .mutation(async ({ input, ctx }) => {
      const result = await syncPatientsFromMssql({
        limit: input?.limit,
        dryRun: input?.dryRun ?? false,
        incremental: input?.incremental ?? false,
      });
      await db.logAuditEvent(ctx.user.id, "SYNC_PATIENTS_FROM_MSSQL", "patient", 0, {
        fetched: result.fetched,
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped,
        dryRun: result.dryRun,
        incremental: result.incremental,
        incrementalSince: result.incrementalSince,
        lastMarker: result.lastMarker,
      });
      return result;
    }),

  getMssqlSyncStatus: adminProcedure
    .query(async () => {
      return await getMssqlSyncStatus();
    }),

  backfillMssqlServiceNames: adminProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(50000).optional(),
        })
        .optional()
    )
    .mutation(async ({ input, ctx }) => {
      const result = await backfillPapatSrvNamesInMssql(input?.limit);
      await db.logAuditEvent(ctx.user.id, "BACKFILL_MSSQL_PAPAT_SRV_NAMES", "systemSetting", 0, {
        limit: input?.limit ?? null,
        updated: result.updated,
        note: result.note ?? "",
      });
      return result;
    }),

  getMssqlSyncRuntimeConfig: adminProcedure
    .query(async () => {
      const row = await db.getSystemSetting("mssql_sync_runtime_v1");
      const fallback = {
        enabled: true,
        intervalMs: Math.max(5_000, Number(process.env.MSSQL_SYNC_INTERVAL_MS ?? 30_000)),
        limit: Math.max(1, Math.min(20_000, Number(process.env.MSSQL_SYNC_LIMIT ?? 5000))),
        incremental: String(process.env.MSSQL_SYNC_INCREMENTAL_AUTO ?? "true").toLowerCase() !== "false",
        overwriteExisting: String(process.env.MSSQL_SYNC_UPDATE_EXISTING ?? "false").toLowerCase() === "true",
        preserveManualEdits:
          String(process.env.MSSQL_SYNC_PRESERVE_MANUAL_EDITS ?? "true").toLowerCase() !== "false",
        linkServicesForExisting:
          String(process.env.MSSQL_SYNC_LINK_SERVICES_FOR_EXISTING ?? "true").toLowerCase() !== "false",
      };
      if (!row?.value) return fallback;
      try {
        const parsed = JSON.parse(String(row.value ?? "{}")) as Record<string, unknown>;
        return {
          enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : fallback.enabled,
          intervalMs:
            Number.isFinite(Number(parsed.intervalMs)) && Number(parsed.intervalMs) >= 5_000
              ? Math.trunc(Number(parsed.intervalMs))
              : fallback.intervalMs,
          limit:
            Number.isFinite(Number(parsed.limit)) && Number(parsed.limit) >= 1
              ? Math.min(20_000, Math.trunc(Number(parsed.limit)))
              : fallback.limit,
          incremental:
            typeof parsed.incremental === "boolean" ? parsed.incremental : fallback.incremental,
          overwriteExisting:
            typeof parsed.overwriteExisting === "boolean"
              ? parsed.overwriteExisting
              : fallback.overwriteExisting,
          preserveManualEdits:
            typeof parsed.preserveManualEdits === "boolean"
              ? parsed.preserveManualEdits
              : fallback.preserveManualEdits,
          linkServicesForExisting:
            typeof parsed.linkServicesForExisting === "boolean"
              ? parsed.linkServicesForExisting
              : fallback.linkServicesForExisting,
        };
      } catch {
        return fallback;
      }
    }),

  updateMssqlSyncRuntimeConfig: adminProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        intervalMs: z.number().int().min(5000).max(3600000),
        limit: z.number().int().min(1).max(20000),
        incremental: z.boolean(),
        overwriteExisting: z.boolean().optional(),
        preserveManualEdits: z.boolean().optional(),
        linkServicesForExisting: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.overwriteExisting) {
        await db.logAuditEvent(ctx.user.id, "MSSQL_SYNC_OVERWRITE_MODE_ENABLED", "systemSetting", 0, {
          warning:
            "Overwrite mode will backfill patient fields. Existing user-edited values may be changed if empty-check allows update path.",
        });
      }
      await db.updateSystemSettings("mssql_sync_runtime_v1", {
        enabled: input.enabled,
        intervalMs: input.intervalMs,
        limit: input.limit,
        incremental: input.incremental,
        overwriteExisting:
          typeof input.overwriteExisting === "boolean"
            ? input.overwriteExisting
            : String(process.env.MSSQL_SYNC_UPDATE_EXISTING ?? "false").toLowerCase() === "true",
        preserveManualEdits:
          typeof input.preserveManualEdits === "boolean"
            ? input.preserveManualEdits
            : String(process.env.MSSQL_SYNC_PRESERVE_MANUAL_EDITS ?? "true").toLowerCase() !== "false",
        linkServicesForExisting:
          typeof input.linkServicesForExisting === "boolean"
            ? input.linkServicesForExisting
            : String(process.env.MSSQL_SYNC_LINK_SERVICES_FOR_EXISTING ?? "true").toLowerCase() !== "false",
      });
      await db.logAuditEvent(ctx.user.id, "UPDATE_MSSQL_SYNC_RUNTIME_CONFIG", "systemSetting", 0, {
        ...input,
      });
      return { success: true };
    }),

  // Create patient from examination (any authenticated user)
  createPatientFromExamination: protectedProcedure
    .input(z.object({
      patientCode: z.string().optional(),
      fullName: z.string(),
      dateOfBirth: z.string().optional(),
      age: z.number().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      occupation: z.string().optional(),
      serviceType: z.enum(["consultant", "specialist", "lasik", "surgery", "external"]).optional(),
      locationType: z.enum(["center", "external"]).default("center"),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const existingByIdentity = await findExistingPatientByNameOrPhone(input.fullName, input.phone ?? "");
        if (existingByIdentity) {
          const existingId = Number((existingByIdentity as any)?.id ?? 0);
          const existingCode = String((existingByIdentity as any)?.patientCode ?? "").trim();
          let pushResult: { inserted: boolean; note?: string; trNo?: number | null } | null = null;
          if (existingId > 0) {
            await db.updatePatient(existingId, {
              lastVisit: new Date(),
              ...(input.serviceType ? { serviceType: input.serviceType } : {}),
              ...(input.locationType ? { locationType: input.locationType } : {}),
            }).catch(() => null);
          }
          if (!existingCode) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Existing patient has no patientCode" });
          }
          pushResult = await pushNewPatientToMssql({
              patientCode: existingCode,
              fullName: String((existingByIdentity as any)?.fullName ?? input.fullName ?? "").trim(),
              phone: String((existingByIdentity as any)?.phone ?? input.phone ?? "").trim() || null,
              address: String((existingByIdentity as any)?.address ?? input.address ?? "").trim() || null,
              age: Number.isFinite(Number((existingByIdentity as any)?.age))
                ? Number((existingByIdentity as any)?.age)
                : Number.isFinite(Number(input.age))
                  ? Number(input.age)
                  : null,
              gender: String((existingByIdentity as any)?.gender ?? "").trim() || null,
              dateOfBirth: (existingByIdentity as any)?.dateOfBirth ?? input.dateOfBirth ?? null,
              branch: String((existingByIdentity as any)?.branch ?? "examinations").trim() || "examinations",
              serviceType: null,
              locationType:
                (input.serviceType === "external" ? "external" : input.locationType) ??
                (String((existingByIdentity as any)?.locationType ?? "").trim() === "external" ? "external" : "center"),
              enteredBy: String((ctx.user as any)?.name ?? (ctx.user as any)?.username ?? "").trim() || null,
            });
          if (!pushResult?.inserted) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Failed to create new receipt in MSSQL for existing patient ${existingCode}${pushResult?.note ? `: ${pushResult.note}` : ""}`,
            });
          }
          await db.logAuditEvent(ctx.user.id, "CREATE_PATIENT_RECEIPT_EXISTING", "patient", existingId, {
            message: `Created new receipt for existing patient (name/phone match): ${String((existingByIdentity as any)?.fullName ?? "")}`,
            patientCode: existingCode,
          });
          return {
            id: existingId,
            patientCode: existingCode,
            fullName: String((existingByIdentity as any)?.fullName ?? input.fullName ?? ""),
            receiptNo: pushResult?.trNo ?? null,
          };
        }

        const code =
          input.patientCode && input.patientCode.trim()
            ? input.patientCode.trim()
            : await db.getNextPatientCode();

        const existing = await db.getPatientByCode(code);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Patient code already exists" });
        }

        await db.createPatient({
          patientCode: code,
          fullName: input.fullName,
          dateOfBirth: input.dateOfBirth || null,
          age: input.age ?? null,
          phone: input.phone || "",
          address: input.address || "",
          occupation: input.occupation || "",
          branch: "examinations",
          serviceType: input.serviceType || "consultant",
          locationType: input.serviceType === "external" ? "external" : input.locationType,
          lastVisit: new Date(),
          status: "new",
        });

        const created = await db.getPatientByCode(code);
        let pushResult: { inserted: boolean; note?: string; trNo?: number | null } | null = null;
        if (created?.patientCode && created?.fullName) {
          pushResult = await pushNewPatientToMssql({
            patientCode: String(created.patientCode),
            fullName: String(created.fullName),
            phone: created.phone,
            address: created.address,
            age: created.age,
            gender: (created as any).gender ?? null,
            dateOfBirth: (created as any).dateOfBirth ?? null,
            branch: (created as any).branch ?? "examinations",
            serviceType: null,
            locationType: (created as any).locationType ?? "center",
            enteredBy: String((ctx.user as any)?.name ?? (ctx.user as any)?.username ?? "").trim() || null,
          }).catch((error) => {
            console.warn("[mssql-push] createPatientFromExamination failed", {
              patientCode: String(created.patientCode),
              message: String((error as any)?.message ?? error ?? "unknown"),
            });
            return null;
          });
        }
        await db.logAuditEvent(ctx.user.id, "CREATE_PATIENT", "patient", created?.id ?? 0, {
          message: `Created patient: ${input.fullName}`,
        });

        return { id: created?.id ?? 0, patientCode: code, fullName: input.fullName, receiptNo: pushResult?.trNo ?? null };
      } catch (error) {
        throw new Error(`Failed to create patient: ${error}`);
      }
    }),

  // Get patient by ID
  getPatient: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => {
      return await db.getPatientById(input.patientId);
    }),

  getPatientServiceEntries: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => {
      return await db.getPatientServiceEntriesByPatient(input.patientId);
    }),

  // Search patients
  searchPatients: protectedProcedure
    .input(
      z.object({
        searchTerm: z.string(),
        sheetType: z.enum(["consultant", "specialist", "lasik", "external"]).optional(),
      })
    )
    .query(async ({ input }) => {
      return await db.searchPatients(input.searchTerm, input.sheetType);
    }),

  // Get all patients
  getAllPatients: protectedProcedure
    .input(
      z.object({
        branch: z.enum(["examinations", "surgery"]).optional(),
        searchTerm: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        doctorName: z.string().optional(),
        serviceType: z.enum(["consultant", "specialist", "lasik", "surgery", "external"]).optional(),
        locationType: z.enum(["center", "external"]).optional(),
        limit: z.number().int().min(1).max(500).optional(),
        cursor: z
          .object({
            codeNum: z.number(),
            patientCode: z.string(),
            id: z.number().int().positive(),
          })
          .optional(),
      })
    )
    .query(async ({ input }) => {
      return await db.getAllPatients(input);
    }),

  getPatientStats: adminProcedure
    .input(
      z.object({
        year: z.number().int().min(1900).max(3000),
        month: z.number().int().min(1).max(12).optional(),
        searchTerm: z.string().optional(),
        doctorName: z.string().optional(),
        serviceType: z.enum(["consultant", "specialist", "lasik", "surgery", "external"]).optional(),
        locationType: z.enum(["center", "external"]).optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      return await db.getPatientStats(input.year, input.month, {
        searchTerm: input.searchTerm,
        doctorName: input.doctorName,
        serviceType: input.serviceType,
        locationType: input.locationType,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      });
    }),

  getTodayPatientsBySheet: protectedProcedure
    .input(z.object({ date: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return await db.getTodayPatientsBySheet(input?.date);
    }),

  // Update patient
  updatePatient: receptionProcedure
    .input(z.object({
      patientId: z.number(),
      updates: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const nextUpdates = { ...input.updates } as Record<string, any>;
        const beforePatient = await db.getPatientById(input.patientId);
        if (Object.prototype.hasOwnProperty.call(nextUpdates, "dateOfBirth")) {
          const rawDob = nextUpdates.dateOfBirth;
          if (rawDob == null || String(rawDob).trim() === "") {
            nextUpdates.dateOfBirth = null;
          } else {
            const raw = String(rawDob).trim();
            const ymd = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (ymd) {
              nextUpdates.dateOfBirth = `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
            } else {
              const parsed = new Date(raw.replace(/\bGM\b/g, "GMT"));
              if (Number.isNaN(parsed.valueOf())) {
                delete nextUpdates.dateOfBirth;
              } else {
                nextUpdates.dateOfBirth = parsed.toISOString().slice(0, 10);
              }
            }
          }
        }
        if (nextUpdates.serviceType === "external") {
          nextUpdates.locationType = "external";
        }
        await db.updatePatient(input.patientId, nextUpdates);
        const updated = await db.getPatientById(input.patientId);

        // Push patient details only to MSSQL (no service linking from update flow).
        if (updated?.patientCode && updated?.fullName && (await canPushToMssql(ctx.user))) {
          await upsertPatientToMssql({
            patientCode: String(updated.patientCode),
            fullName: String(updated.fullName),
            phone: String((updated as any).phone ?? "").trim() || null,
            address: String((updated as any).address ?? "").trim() || null,
            age: Number.isFinite(Number((updated as any).age)) ? Number((updated as any).age) : null,
            gender: String((updated as any).gender ?? "").trim() || null,
            dateOfBirth: (updated as any).dateOfBirth ?? null,
            branch: String((updated as any).branch ?? "").trim() || null,
            locationType: String((updated as any).locationType ?? "").trim() || null,
            enteredBy: String((ctx.user as any)?.name ?? (ctx.user as any)?.username ?? "").trim() || null,
          }).catch((error) => {
            console.warn("[mssql-push] updatePatient upsert failed", {
              patientCode: String(updated.patientCode),
              message: String((error as any)?.message ?? error ?? "unknown"),
            });
          });
        }

        // Service linking to MSSQL is explicit only via linkPatientServiceToMssql mutation.
        // Keep updatePatient from adding extra service rows based on serviceType changes.
        
        await db.logAuditEvent(
          ctx.user.id,
          "UPDATE_PATIENT",
          "patient",
          input.patientId,
          { message: `Updated patient data` }
        );
        
        return { success: true };
      } catch (error) {
        throw new Error(`Failed to update patient: ${error}`);
      }
    }),

  bulkAssignDoctorToPatients: adminProcedure
    .input(
      z.object({
        patientIds: z.array(z.number()).min(1),
        doctorName: z.string().min(1),
        doctorLocationType: z.enum(["center", "external"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const uniqueIds = Array.from(new Set(input.patientIds.filter((id) => Number.isFinite(id))));
      const nextDoctorName = input.doctorName.trim();
      const nextLocationType = input.doctorLocationType;
      const snapshots: Array<{
        patientId: number;
        serviceType: string | null;
        locationType: string | null;
        doctorName: string;
      }> = [];

      for (const patientId of uniqueIds) {
        const patient = await db.getPatientById(patientId);
        if (!patient) continue;
        const existingState = await db.getPatientPageState(patientId, "examination");
        const existingData =
          existingState && typeof (existingState as any).data === "object" && (existingState as any).data
            ? ((existingState as any).data as Record<string, any>)
            : {};
        const previousDoctorName = readDoctorNameFromStateData(existingData);
        snapshots.push({
          patientId,
          serviceType: (patient as any).serviceType ?? null,
          locationType: (patient as any).locationType ?? null,
          doctorName: previousDoctorName,
        });

        const nextUpdates: Record<string, any> = {
          locationType: nextLocationType,
        };
        if (nextLocationType === "external") {
          nextUpdates.serviceType = "external";
        }
        await db.updatePatient(patientId, nextUpdates);
        await db.upsertPatientPageState(patientId, "examination", {
          ...existingData,
          doctorName: nextDoctorName,
          signatures: {
            ...(existingData.signatures ?? {}),
            doctor: nextDoctorName,
          },
        });
      }

      await db.logAuditEvent(ctx.user.id, "BULK_ASSIGN_DOCTOR", "patient", 0, {
        count: snapshots.length,
        fromLocationCounts: snapshots.reduce<Record<string, number>>((acc, item) => {
          const key = String(item.locationType ?? "unknown");
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {}),
        fromDoctorSamples: Array.from(new Set(snapshots.map((s) => s.doctorName).filter(Boolean))).slice(0, 10),
        toDoctor: nextDoctorName,
        doctorName: nextDoctorName,
        doctorLocationType: nextLocationType,
        patientIds: uniqueIds.slice(0, 200),
      });

      return { success: true, updatedCount: snapshots.length, snapshots };
    }),

  bulkAssignSheetTypeToPatients: adminProcedure
    .input(
      z.object({
        patientIds: z.array(z.number()).min(1),
        sheetType: z.enum(["consultant", "specialist", "lasik", "external", "surgery"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const uniqueIds = Array.from(new Set(input.patientIds.filter((id) => Number.isFinite(id))));
      const nextSheetType = input.sheetType;
      const snapshots: Array<{
        patientId: number;
        serviceType: string | null;
        locationType: string | null;
        doctorName: string;
      }> = [];

      for (const patientId of uniqueIds) {
        const patient = await db.getPatientById(patientId);
        if (!patient) continue;
        const existingState = await db.getPatientPageState(patientId, "examination");
        const existingData =
          existingState && typeof (existingState as any).data === "object" && (existingState as any).data
            ? ((existingState as any).data as Record<string, any>)
            : {};
        snapshots.push({
          patientId,
          serviceType: (patient as any).serviceType ?? null,
          locationType: (patient as any).locationType ?? null,
          doctorName: readDoctorNameFromStateData(existingData),
        });

        await db.updatePatient(patientId, {
          serviceType: nextSheetType,
          locationType: nextSheetType === "external" ? "external" : "center",
        });
      }

      await db.logAuditEvent(ctx.user.id, "BULK_ASSIGN_SHEET_TYPE", "patient", 0, {
        count: snapshots.length,
        fromServiceTypeCounts: snapshots.reduce<Record<string, number>>((acc, item) => {
          const key = String(item.serviceType ?? "unknown");
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {}),
        fromLocationCounts: snapshots.reduce<Record<string, number>>((acc, item) => {
          const key = String(item.locationType ?? "unknown");
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {}),
        toSheetType: nextSheetType,
        sheetType: nextSheetType,
        patientIds: uniqueIds.slice(0, 200),
      });

      return { success: true, updatedCount: snapshots.length, snapshots };
    }),

  bulkRestorePatients: adminProcedure
    .input(
      z.object({
        snapshots: z.array(
          z.object({
            patientId: z.number(),
            serviceType: z.string().nullable().optional(),
            locationType: z.string().nullable().optional(),
            doctorName: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const snapshots = input.snapshots.filter((item) => Number.isFinite(item.patientId));
      let restoredCount = 0;
      for (const snapshot of snapshots) {
        const nextUpdates: Record<string, any> = {};
        if (snapshot.serviceType) nextUpdates.serviceType = snapshot.serviceType;
        if (snapshot.locationType) nextUpdates.locationType = snapshot.locationType;
        if (Object.keys(nextUpdates).length > 0) {
          await db.updatePatient(snapshot.patientId, nextUpdates);
        }

        if (snapshot.doctorName !== undefined) {
          const existingState = await db.getPatientPageState(snapshot.patientId, "examination");
          const existingData =
            existingState && typeof (existingState as any).data === "object" && (existingState as any).data
              ? ((existingState as any).data as Record<string, any>)
              : {};
          const doctorName = String(snapshot.doctorName ?? "").trim();
          await db.upsertPatientPageState(snapshot.patientId, "examination", {
            ...existingData,
            doctorName,
            signatures: {
              ...(existingData.signatures ?? {}),
              doctor: doctorName,
            },
          });
        }
        restoredCount += 1;
      }

      await db.logAuditEvent(ctx.user.id, "BULK_RESTORE_PATIENTS", "patient", 0, {
        count: restoredCount,
        patientIds: snapshots.map((s) => s.patientId).slice(0, 200),
      });
      return { success: true, restoredCount };
    }),

  // Delete patient
  deletePatient: receptionProcedure
    .input(z.object({ patientId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      try {
        await db.deletePatient(input.patientId);
        await db.logAuditEvent(ctx.user.id, "DELETE_PATIENT", "patient", input.patientId, { message: "Deleted patient" });
        return { success: true };
      } catch (error) {
        throw new Error(`Failed to delete patient: ${error}`);
      }
    }),

  deleteAllPatients: adminProcedure
    .mutation(async ({ ctx }) => {
      try {
        await db.deleteAllPatientsData();
        await db.logAuditEvent(ctx.user.id, "DELETE_ALL_PATIENTS", "patient", 0, {
          message: "Deleted all patient records and related patient data",
        });
        return { success: true };
      } catch (error) {
        throw new Error(`Failed to delete all patients: ${error}`);
      }
    }),

  deletePatientFromMssql: adminProcedure
    .input(
      z.object({
        patientId: z.number().optional(),
        patientCode: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const codeFromInput = String(input.patientCode ?? "").trim();
      let patientCode = codeFromInput;
      if (!patientCode && input.patientId) {
        const patient = await db.getPatientById(input.patientId);
        patientCode = String((patient as any)?.patientCode ?? "").trim();
      }
      if (!patientCode) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Missing patient code for MSSQL delete" });
      }

      const result = await deletePatientFromMssqlByCode(patientCode);
      await db.logAuditEvent(ctx.user.id, "DELETE_PATIENT_MSSQL", "patient", Number(input.patientId ?? 0), {
        patientCode,
        deleted: result.deleted,
        note: result.note ?? "",
      });
      return { success: true, ...result, patientCode };
    }),

  linkPatientServiceToMssql: protectedProcedure
    .input(
      z.object({
        patientId: z.number(),
        serviceCode: z.string().min(1),
        quantity: z.number().int().min(1).max(10).optional(),
        doctorCode: z.string().optional(),
        doctorName: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const allowed = await canPushToMssql(ctx.user);
      if (!allowed) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No permission for MSSQL adding" });
      }
      const patient = await db.getPatientById(input.patientId);
      const patientCode = String((patient as any)?.patientCode ?? "").trim();
      if (!patientCode) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Patient code missing" });
      }
      const serviceCode = String(input.serviceCode ?? "").trim();
      const result = await ensurePatientServiceInMssql(
        patientCode,
        serviceCode,
        input.quantity ?? null,
        String(input.doctorCode ?? "").trim() || null,
        String(input.doctorName ?? "").trim() || null
      );
      if (!result.linked) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.note ? `MSSQL add failed: ${result.note}` : "MSSQL add failed",
        });
      }
      await db.logAuditEvent(ctx.user.id, "LINK_PATIENT_SERVICE_MSSQL", "patient", input.patientId, {
        patientCode,
        serviceCode,
        quantity: input.quantity ?? null,
        doctorCode: String(input.doctorCode ?? "").trim(),
        doctorName: String(input.doctorName ?? "").trim(),
        linked: result.linked,
        note: result.note ?? "",
      });
      return { success: true, linked: true, note: result.note ?? "", patientCode, serviceCode };
    }),

  // ============ APPOINTMENT ROUTERS ============

  // Create appointment
  createAppointment: receptionProcedure
    .input(z.object({
      patientId: z.number(),
      doctorId: z.number().optional(),
      appointmentDate: z.string(),
      appointmentType: z.enum(["examination", "surgery", "followup"]),
      branch: z.enum(["examinations", "surgery"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        await db.createAppointment({
          ...input,
          appointmentDate: new Date(input.appointmentDate),
          status: "scheduled",
        });
        
        await db.logAuditEvent(ctx.user.id, "CREATE_APPOINTMENT", "appointment", 0, { message: `Created appointment for patient ${input.patientId}` });
        
        return { success: true };
      } catch (error) {
        throw new Error(`Failed to create appointment: ${error}`);
      }
    }),

  // Get appointments by patient
  getAppointmentsByPatient: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => {
      return await db.getAppointmentsByPatient(input.patientId);
    }),
  // Get all appointments
  getAppointments: protectedProcedure
    .query(async () => {
      return await db.getAllAppointments();
    }),
  // Alias: Get all appointments
  getAllAppointments: protectedProcedure
    .query(async () => {
      return await db.getAllAppointments();
    }),
  // Delete appointment
  deleteAppointment: managerProcedure
    .input(z.object({ appointmentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteAppointment(input.appointmentId);
      await db.logAuditEvent(
        ctx.user.id,
        "DELETE_APPOINTMENT",
        "appointment",
        input.appointmentId,
        { message: "Deleted appointment" }
      );
      return { success: true };
    }),
  // Update appointment (status/notes)
  updateAppointment: managerProcedure
    .input(z.object({
      appointmentId: z.number(),
      updates: z
        .object({
          status: z.enum(["scheduled", "completed", "cancelled", "no_show"]).optional(),
          notes: z.string().optional(),
        })
        .partial(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.updateAppointment(input.appointmentId, input.updates);
      await db.logAuditEvent(
        ctx.user.id,
        "UPDATE_APPOINTMENT",
        "appointment",
        input.appointmentId,
        { message: "Updated appointment" }
      );
      return { success: true };
    }),

  // ============ EXAMINATION ROUTERS ============

  // Nurse: Create examination data
  createExamination: nurseProcedure
    .input(z.object({
      visitId: z.number(),
      patientId: z.number(),
      ucvaOD: z.string().optional(),
      ucvaOS: z.string().optional(),
      bcvaOD: z.string().optional(),
      bcvaOS: z.string().optional(),
      refOD_S: z.number().optional(),
      refOD_C: z.number().optional(),
      refOD_A: z.number().optional(),
      refOS_S: z.number().optional(),
      refOS_C: z.number().optional(),
      refOS_A: z.number().optional(),
      iopOD: z.number().optional(),
      iopOS: z.number().optional(),
      examinationNotes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        await db.createExamination({
          ...input,
          examinedBy: ctx.user.id,
        });
        
        await db.logAuditEvent(ctx.user.id, "CREATE_EXAMINATION", "examination", 0, { message: `Created examination for patient ${input.patientId}` });
        
        return { success: true };
      } catch (error) {
        throw new Error(`Failed to create examination: ${error}`);
      }
    }),

  // Get examinations by patient
  getExaminationsByPatient: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => {
      return await db.getExaminationsByPatient(input.patientId);
    }),

  // Get all examinations
  getAllExaminations: protectedProcedure
    .query(async () => {
      return await db.getAllExaminations();
    }),

  // Update examination
  updateExamination: nurseProcedure
    .input(z.object({
      examinationId: z.number(),
      updates: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.updateExamination(input.examinationId, input.updates);
      await db.logAuditEvent(ctx.user.id, "UPDATE_EXAMINATION", "examination", input.examinationId, { message: "Updated examination" });
      return { success: true };
    }),

  // ============ PENTACAM ROUTERS ============

  // Technician: Record Pentacam results
  createPentacamResult: technicianProcedure
    .input(z.object({
      visitId: z.number(),
      patientId: z.number(),
      ltK1: z.number().optional(),
      ltK2: z.number().optional(),
      ltAX: z.number().optional(),
      ltThinnestPoint: z.number().optional(),
      rtK1: z.number().optional(),
      rtK2: z.number().optional(),
      rtAX: z.number().optional(),
      rtThinnestPoint: z.number().optional(),
      techniciansNotes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        await db.createPentacamResult({
          ...input,
          recordedBy: ctx.user.id,
        });
        
        await db.logAuditEvent(ctx.user.id, "CREATE_PENTACAM", "pentacamResult", 0, { message: `Recorded Pentacam results for patient ${input.patientId}` });
        
        return { success: true };
      } catch (error) {
        throw new Error(`Failed to create pentacam result: ${error}`);
      }
    }),

  // Get Pentacam results by visit
  getPentacamResultsByVisit: protectedProcedure
    .input(z.object({ visitId: z.number() }))
    .query(async ({ input }) => {
      return await db.getPentacamResultsByVisit(input.visitId);
    }),

  // ============ DOCTOR REPORT ROUTERS ============

  // Doctor: Create report
  createDoctorReport: doctorProcedure
    .input(z.object({
      visitId: z.number(),
      patientId: z.number(),
      diagnosis: z.string(),
      clinicalOpinion: z.string().optional(),
      recommendedTreatment: z.string().optional(),
      surgeryType: z.string().optional(),
      surgeryScheduledDate: z.string().optional(),
      additionalNotes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        await db.createDoctorReport({
          ...input,
          doctorId: ctx.user.id,
          surgeryScheduledDate: input.surgeryScheduledDate ? new Date(input.surgeryScheduledDate) : null,
        });
        
        await db.logAuditEvent(ctx.user.id, "CREATE_DOCTOR_REPORT", "doctorReport", 0, { message: `Created doctor report for patient ${input.patientId}` });
        
        return { success: true };
      } catch (error) {
        throw new Error(`Failed to create doctor report: ${error}`);
      }
    }),

  // Get doctor reports by visit
  getDoctorReportsByVisit: protectedProcedure
    .input(z.object({ visitId: z.number() }))
    .query(async ({ input }) => {
  return await db.getDoctorReportsByVisit(input.visitId);
  }),
  getMedicalReportsByPatient: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => {
      return await db.getDoctorReportsByPatient(input.patientId);
    }),
  getDoctorReports: protectedProcedure.query(async () => {
    return await db.getAllDoctorReports();
  }),
  createMedicalReport: doctorProcedure
    .input(z.object({
      patientId: z.number(),
      visitDate: z.string().optional(),
      diagnosis: z.string(),
      diseases: z.array(z.string()).optional(),
      prescription: z.string().optional(),
      clinicalOpinion: z.string().optional(),
      surgeryType: z.string().optional(),
      operationType: z.string().optional(),
      treatment: z.string().optional(),
      recommendations: z.string().optional(),
      additionalNotes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.createDoctorReport({
        visitId: 0,
        patientId: input.patientId,
        doctorId: ctx.user.id,
        diagnosis: input.diagnosis,
        diseases: input.diseases ? JSON.stringify(input.diseases) : null,
        treatment: input.prescription || input.treatment || "",
        recommendations: input.recommendations || "",
        visitDate: input.visitDate ? new Date(input.visitDate) : null,
        operationType: input.operationType || input.surgeryType || null,
        clinicalOpinion: input.clinicalOpinion || null,
        additionalNotes: input.additionalNotes || null,
        followUpDate: new Date(),
      });
      await db.logAuditEvent(
        ctx.user.id,
        "CREATE_MEDICAL_REPORT",
        "doctorReport",
        0,
        { message: "Created medical report" }
      );
    return { success: true };
  }),
  updateMedicalReport: doctorProcedure
    .input(z.object({
      reportId: z.number(),
      visitDate: z.string().optional(),
      diagnosis: z.string().optional(),
      diseases: z.array(z.string()).optional(),
      prescription: z.string().optional(),
      clinicalOpinion: z.string().optional(),
      operationType: z.string().optional(),
      recommendations: z.string().optional(),
      additionalNotes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.updateDoctorReport(input.reportId, {
        visitDate: input.visitDate ? new Date(input.visitDate) : null,
        diagnosis: input.diagnosis ?? null,
        diseases: input.diseases ? JSON.stringify(input.diseases) : null,
        treatment: input.prescription ?? null,
        recommendations: input.recommendations ?? null,
        clinicalOpinion: input.clinicalOpinion ?? null,
        operationType: input.operationType ?? null,
        additionalNotes: input.additionalNotes ?? null,
      });
      await db.logAuditEvent(
        ctx.user.id,
        "UPDATE_MEDICAL_REPORT",
        "doctorReport",
        input.reportId,
        { message: "Updated medical report" }
      );
      return { success: true };
    }),
  deleteMedicalReport: doctorProcedure
    .input(z.object({ reportId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteDoctorReport(input.reportId);
      await db.logAuditEvent(
        ctx.user.id,
        "DELETE_MEDICAL_REPORT",
        "doctorReport",
        input.reportId,
        { message: "Deleted medical report" }
      );
      return { success: true };
    }),

  // ============ MEDICATION ROUTERS ============

  getMedications: protectedProcedure.query(async () => {
    return await db.getAllMedications();
  }),
  getAllMedications: protectedProcedure.query(async () => {
    return await db.getAllMedications();
  }),

  createMedication: managerProcedure
    .input(z.object({
      name: z.string(),
      type: z.enum(["tablet", "drops", "ointment", "injection", "suspension", "other"]),
      activeIngredient: z.string().optional(),
      strength: z.string().optional(),
      manufacturer: z.string().optional(),
      dosage: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.createMedication({
        name: input.name,
        type: input.type,
        activeIngredient: input.activeIngredient || "",
        strength: input.strength || "",
        manufacturer: input.manufacturer || "",
        dosage: input.dosage || "",
        description: input.description || "",
      });
      await db.logAuditEvent(ctx.user.id, "CREATE_MEDICATION", "medication", 0, { message: `Added medication ${input.name}` });
      return { success: true };
    }),

  updateMedication: managerProcedure
    .input(z.object({
      medicationId: z.number(),
      updates: z.object({
        name: z.string().optional(),
        type: z.enum(["tablet", "drops", "ointment", "injection", "suspension", "other"]).optional(),
        activeIngredient: z.string().optional(),
        strength: z.string().optional(),
        manufacturer: z.string().optional(),
        dosage: z.string().optional(),
        description: z.string().optional(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.updateMedication(input.medicationId, input.updates);
      await db.logAuditEvent(ctx.user.id, "UPDATE_MEDICATION", "medication", input.medicationId, { message: "Updated medication" });
      return { success: true };
    }),

  deleteMedication: managerProcedure
    .input(z.object({ medicationId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteMedication(input.medicationId);
      await db.logAuditEvent(ctx.user.id, "DELETE_MEDICATION", "medication", input.medicationId, { message: "Deleted medication" });
      return { success: true };
    }),

  // ============ DISEASE ROUTERS ============

  getAllDiseases: protectedProcedure.query(async () => {
    return await db.getAllDiseases();
  }),

  createDisease: managerProcedure
    .input(z.object({ name: z.string(), branch: z.string().optional(), abbrev: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await db.createDisease(input.name, input.branch ?? null, input.abbrev ?? null);
      await db.logAuditEvent(ctx.user.id, "CREATE_DISEASE", "disease", 0, { message: `Added disease ${input.name}` });
      return { success: true };
    }),

  updateDisease: managerProcedure
    .input(z.object({ diseaseId: z.number(), name: z.string(), branch: z.string().optional(), abbrev: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await db.updateDisease(input.diseaseId, input.name, input.branch ?? null, input.abbrev ?? null);
      await db.logAuditEvent(ctx.user.id, "UPDATE_DISEASE", "disease", input.diseaseId, { message: "Updated disease" });
      return { success: true };
    }),

  deleteDisease: managerProcedure
    .input(z.object({ diseaseId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteDisease(input.diseaseId);
      await db.logAuditEvent(ctx.user.id, "DELETE_DISEASE", "disease", input.diseaseId, { message: "Deleted disease" });
      return { success: true };
    }),

  // ============ TEST ROUTERS ============

  getTests: protectedProcedure.query(async () => {
    return await db.getAllTests();
  }),
  getAllTests: protectedProcedure.query(async () => {
    return await db.getAllTests();
  }),

  createTest: managerProcedure
    .input(z.object({
      name: z.string(),
      type: z.enum(["examination", "lab", "imaging", "other"]),
      category: z.string().optional(),
      normalRange: z.string().optional(),
      unit: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.createTest({
        name: input.name,
        type: input.type,
        category: input.category || "",
        normalRange: input.normalRange || "",
        unit: input.unit || "",
        description: input.description || "",
      });
      await db.logAuditEvent(ctx.user.id, "CREATE_TEST", "test", 0, { message: `Added test ${input.name}` });
      return { success: true };
    }),

  updateTest: managerProcedure
    .input(z.object({
      testId: z.number(),
      updates: z.object({
        name: z.string().optional(),
        type: z.enum(["examination", "lab", "imaging", "other"]).optional(),
        category: z.string().optional(),
        normalRange: z.string().optional(),
        unit: z.string().optional(),
        description: z.string().optional(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      const updates = {
        ...input.updates,
        category: input.updates.category ?? "",
      };
      await db.updateTest(input.testId, updates);
      await db.logAuditEvent(ctx.user.id, "UPDATE_TEST", "test", input.testId, { message: "Updated test" });
      return { success: true };
    }),

  deleteTest: managerProcedure
    .input(z.object({ testId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteTest(input.testId);
      await db.logAuditEvent(ctx.user.id, "DELETE_TEST", "test", input.testId, { message: "Deleted test" });
      return { success: true };
    }),

  getMyTestFavorites: doctorProcedure
    .query(async ({ ctx }) => {
      return await db.getTestFavoritesByUser(ctx.user.id);
    }),

  toggleTestFavorite: doctorProcedure
    .input(z.object({ testId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      return await db.toggleTestFavorite(ctx.user.id, input.testId);
    }),

  // ============ TEST REQUESTS ============

  createTestRequest: doctorProcedure
    .input(z.object({
      patientId: z.number(),
      visitId: z.number().optional(),
      date: z.string().optional(),
      priority: z.string().optional(),
      notes: z.string().optional(),
      items: z.array(z.object({
        testId: z.number(),
        notes: z.string().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.createTestRequest({
        patientId: input.patientId,
        visitId: input.visitId,
        requestDate: new Date(),
        status: "pending",
      });
      await db.logAuditEvent(ctx.user.id, "CREATE_TEST_REQUEST", "testRequest", 0, { message: `Created test request for patient ${input.patientId}` });
      return { success: true };
    }),

  getTestRequestsByPatient: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => {
      return await db.getTestRequestsByPatient(input.patientId);
    }),

  // ============ PRESCRIPTION ROUTERS ============

  // Doctor: Create prescription
  createPrescription: doctorProcedure
    .input(z.object({
      visitId: z.number(),
      patientId: z.number(),
      medicationName: z.string(),
      dosage: z.string(),
      frequency: z.string().optional(),
      duration: z.string().optional(),
      instructions: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        await db.createPrescription({
          ...input,
          doctorId: ctx.user.id,
        });
        
        await db.logAuditEvent(ctx.user.id, "CREATE_PRESCRIPTION", "prescription", 0, { message: `Created prescription for patient ${input.patientId}` });
        
        return { success: true };
      } catch (error) {
        throw new Error(`Failed to create prescription: ${error}`);
      }
    }),

  // Get prescriptions by visit
  getPrescriptionsByVisit: protectedProcedure
    .input(z.object({ visitId: z.number() }))
    .query(async ({ input }) => {
      return await db.getPrescriptionsByVisit(input.visitId);
    }),

  createPrescriptionWithItems: doctorProcedure
    .input(z.object({
      patientId: z.number(),
      visitId: z.number().optional(),
      date: z.string().optional(),
      notes: z.string().optional(),
      items: z.array(z.object({
        medicationId: z.number().optional(),
        medicationName: z.string(),
        dosage: z.string().optional(),
        frequency: z.string().optional(),
        duration: z.string().optional(),
        instructions: z.string().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      console.log("[createPrescriptionWithItems] input", {
        patientId: input.patientId,
        itemsCount: input.items.length,
        firstItem: input.items[0],
      });
      await db.createPrescriptionWithItems({
        patientId: input.patientId,
        visitId: input.visitId,
        doctorId: ctx.user.id,
        date: input.date,
        notes: input.notes,
        items: input.items,
      });
      await db.logAuditEvent(ctx.user.id, "CREATE_PRESCRIPTION", "prescription", 0, { message: `Created prescription for patient ${input.patientId}` });
      return { success: true };
    }),

  // Get prescriptions by patient
  getPrescriptionsByPatient: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => {
      return await db.getPrescriptionsByPatient(input.patientId);
    }),
  getPrescriptionsWithItemsByPatient: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => {
      return await db.getPrescriptionsWithItemsByPatient(input.patientId);
    }),

  // ============ SURGERY ROUTERS ============

  // Doctor: Create surgery record
  createSurgery: doctorProcedure
    .input(z.object({
      patientId: z.number(),
      appointmentId: z.number().optional(),
      surgeryType: z.string(),
      surgeryDate: z.string(),
      preOpUCVA_OD: z.string().optional(),
      preOpUCVA_OS: z.string().optional(),
      preOpBCVA_OD: z.string().optional(),
      preOpBCVA_OS: z.string().optional(),
      surgeryNotes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        await db.createSurgery({
          ...input,
          doctorId: ctx.user.id,
          surgeryDate: new Date(input.surgeryDate),
          status: "scheduled",
        });
        
        await db.logAuditEvent(ctx.user.id, "CREATE_SURGERY", "surgery", 0, { message: `Created surgery record for patient ${input.patientId}` });
        
        return { success: true };
      } catch (error) {
        throw new Error(`Failed to create surgery: ${error}`);
      }
    }),

  // Get surgeries by patient
  getSurgeriesByPatient: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => {
      return await db.getSurgeriesByPatient(input.patientId);
    }),

  // Delete surgery
  deleteSurgery: doctorProcedure
    .input(z.object({ surgeryId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteSurgery(input.surgeryId);
      await db.logAuditEvent(ctx.user.id, "DELETE_SURGERY", "surgery", input.surgeryId, { message: "Deleted surgery" });
      return { success: true };
    }),

  // Post-op followup
  createPostOpFollowup: doctorProcedure
    .input(z.object({
      surgeryId: z.number(),
      patientId: z.number().optional(),
      date: z.string().optional(),
      followupDate: z.string().optional(),
      findings: z.string().optional(),
      recommendations: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.createPostOpFollowup({
        surgeryId: input.surgeryId,
        patientId: input.patientId ?? 0,
        followupDate: input.followupDate
          ? new Date(input.followupDate)
          : input.date
            ? new Date(input.date)
            : new Date(),
        findings: input.findings ?? null,
        recommendations: input.recommendations ?? null,
      });
      await db.logAuditEvent(ctx.user.id, "CREATE_POST_OP", "postOpFollowup", input.surgeryId, { message: "Created followup" });
      return { success: true };
    }),

  getPostOpFollowupsByPatient: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => {
      return await db.getPostOpFollowupsByPatient(input.patientId);
    }),

  getPostOpFollowupsBySurgery: protectedProcedure
    .input(z.object({ surgeryId: z.number() }))
    .query(async ({ input }) => {
      return await db.getPostOpFollowupsBySurgery(input.surgeryId);
    }),

  // ============ AUDIT LOG ROUTERS ============

  // Manager/Admin: Get audit logs
  getAuditLogs: managerProcedure
    .input(z.object({
      limit: z.number().default(100),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      return await db.getAuditLogs(input.limit);
    }),

  // ============ OPERATION LISTS ============

  getOperationList: protectedProcedure
    .input(z.object({
      doctorTab: z.string(),
      listDate: z.string(),
    }))
    .query(async ({ input }) => {
      if (!input.listDate) {
        return { id: null, items: [] as any[] };
      }
      return await db.getOperationList(input.doctorTab, input.listDate);
    }),
  getOperationListById: protectedProcedure
    .input(z.object({ listId: z.number() }))
    .query(async ({ input }) => {
      return await db.getOperationListById(input.listId);
    }),

  saveOperationList: receptionProcedure
    .input(z.object({
      doctorTab: z.string(),
      listDate: z.string(),
      operationType: z.string().optional().nullable(),
      doctorName: z.string().optional().nullable(),
      listTime: z.string().optional().nullable(),
      items: z.array(z.object({
        number: z.string().optional(),
        name: z.string(),
        phone: z.string().optional(),
        doctor: z.string().optional(),
        operation: z.string().optional(),
        center: z.boolean().optional(),
        payment: z.boolean().optional(),
        code: z.string().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.saveOperationList({
        doctorTab: input.doctorTab,
        listDate: input.listDate,
        operationType: input.operationType ?? null,
        doctorName: input.doctorName ?? null,
        listTime: input.listTime ?? null,
        items: input.items,
      });
      await db.logAuditEvent(ctx.user.id, "SAVE_OPERATION_LIST", "operationList", 0, { message: `Saved operation list for ${input.doctorTab}` });
      return { success: true };
    }),

  getOperationListsHistory: protectedProcedure
    .query(async () => {
      return await db.getOperationListsHistoryWithItems();
    }),

  deleteOperationList: receptionProcedure
    .input(z.object({
      doctorTab: z.string(),
      listDate: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteOperationList(input.doctorTab, input.listDate);
      await db.logAuditEvent(ctx.user.id, "DELETE_OPERATION_LIST", "operationList", 0, { message: `Deleted operation list for ${input.doctorTab}` });
      return { success: true };
    }),
  deleteOperationListById: receptionProcedure
    .input(z.object({ listId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteOperationListById(input.listId);
      await db.logAuditEvent(ctx.user.id, "DELETE_OPERATION_LIST", "operationList", input.listId, { message: "Deleted operation list by id" });
      return { success: true };
    }),

  // ============ PAGE STATE (USER/PATIENT) ============

  getUserPageState: protectedProcedure
    .input(z.object({ page: z.string() }))
    .query(async ({ input, ctx }) => {
      return await db.getUserPageState(ctx.user.id, input.page);
    }),

  saveUserPageState: protectedProcedure
    .input(z.object({ page: z.string(), data: z.any() }))
    .mutation(async ({ input, ctx }) => {
      await db.upsertUserPageState(ctx.user.id, input.page, input.data);
      return { success: true };
    }),

  getPatientPageState: protectedProcedure
    .input(z.object({ patientId: z.number(), page: z.string() }))
    .query(async ({ input }) => {
      return await db.getPatientPageState(input.patientId, input.page);
    }),

  savePatientPageState: protectedProcedure
    .input(z.object({ patientId: z.number(), page: z.string(), data: z.any() }))
    .mutation(async ({ input }) => {
      await db.upsertPatientPageState(input.patientId, input.page, input.data);
      return { success: true };
    }),

  // ============ SYSTEM SETTINGS ============

  getSystemSetting: protectedProcedure
    .input(z.object({ key: z.string().min(1) }))
    .query(async ({ input }) => {
      const row = await db.getSystemSetting(input.key);
      if (!row) return null;
      try {
        return {
          key: row.key,
          value: row.value ? JSON.parse(row.value) : null,
          updatedAt: row.updatedAt,
        };
      } catch {
        return {
          key: row.key,
          value: row.value,
          updatedAt: row.updatedAt,
        };
      }
    }),

  updateSystemSetting: adminProcedure
    .input(z.object({ key: z.string().min(1), value: z.any() }))
    .mutation(async ({ input, ctx }) => {
      await db.updateSystemSettings(input.key, input.value);
      await db.logAuditEvent(ctx.user.id, "UPDATE_SYSTEM_SETTING", "systemSetting", 0, {
        key: input.key,
      });
      return { success: true };
    }),

  getDoctorDirectory: protectedProcedure.query(async () => {
    const row = await db.getSystemSetting("doctor_directory");
    const fallbackFromUsers = async (): Promise<Array<z.infer<typeof doctorDirectoryEntrySchema>>> => {
      const doctors = await db.getDoctors();
      return doctors.map((doctor) => ({
        id: String(doctor.id),
        code: decodeMojibake(doctor.code),
        name: decodeMojibake(doctor.name),
        isActive: true,
        locationType: "center" as const,
      }));
    };
    if (!row?.value) return await fallbackFromUsers();
    try {
      const parsed = JSON.parse(row.value);
      const normalized = z.array(doctorDirectoryEntrySchema).safeParse(parsed);
      if (!normalized.success) return await fallbackFromUsers();
      const rows = normalized.data.map((doctor) => ({
        ...doctor,
        code: decodeMojibake(doctor.code),
        name: decodeMojibake(doctor.name),
        locationType: doctor.locationType ?? "center",
      }));
      if (rows.length === 0) return await fallbackFromUsers();
      return rows;
    } catch {
      return await fallbackFromUsers();
    }
  }),

  updateDoctorDirectory: adminProcedure
    .input(z.object({ doctors: z.array(doctorDirectoryEntrySchema) }))
    .mutation(async ({ input, ctx }) => {
      await db.updateSystemSettings("doctor_directory", input.doctors);
      await db.logAuditEvent(ctx.user.id, "UPDATE_DOCTOR_DIRECTORY", "systemSetting", 0, {
        count: input.doctors.length,
      });
      return { success: true };
    }),

  getServiceDirectory: protectedProcedure.query(async () => {
    const row = await db.getSystemSetting("service_directory");
    if (!row?.value) return [] as Array<z.infer<typeof serviceDirectoryEntrySchema>>;
    try {
      const parsed = JSON.parse(row.value);
      const normalized = z.array(serviceDirectoryEntrySchema).safeParse(parsed);
      if (!normalized.success) return [] as Array<z.infer<typeof serviceDirectoryEntrySchema>>;
      return normalized.data.map((entry) => ({
        ...entry,
        defaultSheet: normalizeServiceDefaultSheet(entry.defaultSheet ?? entry.serviceType, entry.serviceType),
        srvTyp: inferSrvTyp(entry),
        code: decodeMojibake(entry.code),
        name: decodeMojibake(entry.name),
      }));
    } catch {
      return [] as Array<z.infer<typeof serviceDirectoryEntrySchema>>;
    }
  }),

  updateServiceDirectory: adminProcedure
    .input(z.object({ services: z.array(serviceDirectoryEntrySchema) }))
    .mutation(async ({ input, ctx }) => {
      await db.updateSystemSettings("service_directory", input.services);
      await db.logAuditEvent(ctx.user.id, "UPDATE_SERVICE_DIRECTORY", "systemSetting", 0, {
        count: input.services.length,
      });
      return { success: true };
    }),

  // ============ SHEET ENTRIES ============

  getSheetEntry: protectedProcedure
    .input(z.object({
      patientId: z.number(),
      sheetType: z.enum(["consultant", "specialist", "lasik", "external"]),
    }))
    .query(async ({ input }) => {
      return await db.getSheetEntry(input.patientId, input.sheetType);
    }),

  saveSheetEntry: protectedProcedure
    .input(z.object({
      patientId: z.number(),
      sheetType: z.enum(["consultant", "specialist", "lasik", "external"]),
      content: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.upsertSheetEntry({
        patientId: input.patientId,
        sheetType: input.sheetType,
        content: input.content,
      });
      broadcastSheetUpdate(input.patientId, input.sheetType);
      await db.logAuditEvent(ctx.user.id, "SAVE_SHEET", "sheetEntry", input.patientId, { sheetType: input.sheetType });
      return { success: true };
    }),

  saveExaminationForm: protectedProcedure
    .input(z.object({
      patientId: z.number(),
      visitDate: z.string(),
      visitType: z.string(),
      data: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ input, ctx }) => {
      const allowedRoles = ["reception", "nurse", "technician", "doctor", "admin", "manager"];
      if (!allowedRoles.includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions for examination form" });
      }
      const visit = await db.createVisit({
        patientId: input.patientId,
        visitDate: new Date(input.visitDate),
        visitType: normalizeVisitType(input.visitType),
      });
      await db.createExamination({
        patientId: input.patientId,
        visitId: (visit as any)?.insertId ?? 0,
        ...input.data,
      });
      await db.logAuditEvent(ctx.user.id, "CREATE_EXAMINATION_FORM", "examination", input.patientId, { message: "Saved examination form" });
      return { success: true };
    }),

  // ============ ADMIN USERS ============

  getDoctors: protectedProcedure.query(async () => {
    return await db.getDoctors();
  }),

  getAllUsers: adminProcedure.query(async () => {
    return await db.getAllUsers();
  }),

  createUser: adminProcedure
    .input(z.object({
      username: z.string().min(3),
      password: z.string().min(6),
      name: z.string().optional(),
      email: z.string().email().optional(),
      role: z.enum(["admin", "doctor", "nurse", "technician", "reception", "manager", "accountant"]).optional(),
      branch: z.enum(["examinations", "surgery", "both"]).optional(),
      shift: z.union([z.literal(1), z.literal(2)]).optional(),
      writeToMssql: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const hashedPassword = await authService.hashPassword(input.password);
      const user = await db.createUser({
        username: input.username,
        password: hashedPassword as any,
        name: input.name,
        email: input.email,
        role: input.role,
        branch: input.branch,
        shift: input.shift,
      } as any);
      const createdUserId = (user as any)?.insertId ?? 0;
      const createdRole = input.role ?? "reception";
      const roleDefaults = await db.getRoleDefaultPermissions(createdRole);
      const pageIds = input.writeToMssql
        ? Array.from(new Set([...roleDefaults, "/ops/mssql-add"]))
        : roleDefaults;
      await db.setUserPermissions(createdUserId, pageIds);
      await db.logAuditEvent(ctx.user.id, "CREATE_USER", "user", 0, { username: input.username });
      return { success: true, userId: createdUserId };
    }),

  updateUser: adminProcedure
    .input(z.object({
      userId: z.number(),
      updates: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ input, ctx }) => {
      const updates = { ...input.updates };
      if (typeof updates.password === "string" && updates.password.length > 0) {
        updates.password = await authService.hashPassword(updates.password);
      }
      await db.updateUser(input.userId, updates);
      if (typeof updates.role === "string" && updates.role.trim().length > 0) {
        const roleDefaults = await db.getRoleDefaultPermissions(updates.role);
        await db.setUserPermissions(input.userId, roleDefaults);
      }
      await db.logAuditEvent(ctx.user.id, "UPDATE_USER", "user", input.userId, { updates: Object.keys(input.updates) });
      return { success: true };
    }),

  deleteUser: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteUser(input.userId);
      await db.logAuditEvent(ctx.user.id, "DELETE_USER", "user", input.userId);
      return { success: true };
    }),

  getUserPermissions: adminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      return await db.getUserPermissions(input.userId);
    }),

  getMyPermissions: protectedProcedure.query(async ({ ctx }) => {
    const permissions = await db.getEffectiveUserPermissions(ctx.user.id, ctx.user.role);
    if (ctx.user.role === "reception" && !permissions.includes("/examination")) {
      permissions.push("/examination");
    }
    return permissions;
  }),

  getTeamPermissions: adminProcedure.query(async () => {
    return await db.getTeamPermissions();
  }),

  setTeamPermissions: adminProcedure
    .input(z.object({
      admin: z.array(z.string()),
      manager: z.array(z.string()),
      accountant: z.array(z.string()),
      reception: z.array(z.string()),
      nurse: z.array(z.string()),
      technician: z.array(z.string()),
      doctor: z.array(z.string()),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.setTeamPermissions(input);
      const users = await db.getAllUsers();
      for (const user of users) {
        const role = String(user.role ?? "").trim().toLowerCase() as keyof typeof input;
        const rolePermissions = input[role];
        await db.setUserPermissions(user.id, Array.isArray(rolePermissions) ? rolePermissions : []);
      }
      await db.logAuditEvent(ctx.user.id, "SET_TEAM_PERMISSIONS", "systemSetting", 0, {
        roles: Object.keys(input),
      });
      return { success: true };
    }),

  setUserPermissions: adminProcedure
    .input(z.object({
      userId: z.number(),
      pageIds: z.array(z.string()),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.setUserPermissions(input.userId, input.pageIds);
      await db.logAuditEvent(ctx.user.id, "SET_USER_PERMISSIONS", "user", input.userId, { count: input.pageIds.length });
      return { success: true };
    }),
});
