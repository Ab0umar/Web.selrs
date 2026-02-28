import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import * as db from "../db";
import { storagePut } from "../storage";

type EyeSide = "OD" | "OS" | "OU" | "unknown";
type ImportStatus = "imported" | "duplicate" | "unmatched" | "failed";

export type PentacamImportConfig = {
  enabled: boolean;
  sourceDir: string;
  intervalMs: number;
  useForgeStorage: boolean;
  localStoreDir: string;
  publicBasePath: string;
  archiveProcessed: boolean;
  archiveDir: string;
  maxFilesPerRun: number;
};

export type PentacamImportRunSummary = {
  scanned: number;
  processed: number;
  imported: number;
  duplicate: number;
  unmatched: number;
  failed: number;
  skipped: number;
  errors: string[];
};

const RUNTIME_SETTING_KEY = "pentacam_import_runtime_v1";
const STATUS_SETTING_KEY = "pentacam_import_runtime_status_v1";
const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".pdf", ".bmp", ".tif", ".tiff"]);

function asBool(value: unknown, fallback = false): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function defaultConfig(): PentacamImportConfig {
  return {
    enabled: asBool(process.env.PENTACAM_IMPORT_ENABLED, false),
    sourceDir: String(process.env.PENTACAM_IMPORT_DIR ?? "").trim(),
    intervalMs: asNumber(process.env.PENTACAM_IMPORT_INTERVAL_MS, 15000, 5000, 60 * 60 * 1000),
    useForgeStorage: asBool(process.env.PENTACAM_IMPORT_USE_FORGE_STORAGE, false),
    localStoreDir: String(process.env.PENTACAM_IMPORT_LOCAL_STORE_DIR ?? "uploads/pentacam").trim(),
    publicBasePath: String(process.env.PENTACAM_IMPORT_PUBLIC_BASE_PATH ?? "/uploads/pentacam").trim() || "/uploads/pentacam",
    archiveProcessed: asBool(process.env.PENTACAM_IMPORT_ARCHIVE_PROCESSED, false),
    archiveDir: String(process.env.PENTACAM_IMPORT_ARCHIVE_DIR ?? "").trim(),
    maxFilesPerRun: asNumber(process.env.PENTACAM_IMPORT_MAX_FILES_PER_RUN, 200, 1, 5000),
  };
}

function normalizeConfig(input: Partial<PentacamImportConfig>, fallback: PentacamImportConfig): PentacamImportConfig {
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : fallback.enabled,
    sourceDir: String(input.sourceDir ?? fallback.sourceDir ?? "").trim(),
    intervalMs: asNumber(input.intervalMs, fallback.intervalMs, 5000, 60 * 60 * 1000),
    useForgeStorage: typeof input.useForgeStorage === "boolean" ? input.useForgeStorage : fallback.useForgeStorage,
    localStoreDir: String(input.localStoreDir ?? fallback.localStoreDir ?? "uploads/pentacam").trim(),
    publicBasePath: String(input.publicBasePath ?? fallback.publicBasePath ?? "/uploads/pentacam").trim() || "/uploads/pentacam",
    archiveProcessed: typeof input.archiveProcessed === "boolean" ? input.archiveProcessed : fallback.archiveProcessed,
    archiveDir: String(input.archiveDir ?? fallback.archiveDir ?? "").trim(),
    maxFilesPerRun: asNumber(input.maxFilesPerRun, fallback.maxFilesPerRun, 1, 5000),
  };
}

export async function getPentacamImportRuntimeConfig(): Promise<PentacamImportConfig> {
  const fallback = defaultConfig();
  try {
    const row = await db.getSystemSetting(RUNTIME_SETTING_KEY);
    const parsed = row?.value ? (JSON.parse(String(row.value)) as Partial<PentacamImportConfig>) : {};
    return normalizeConfig(parsed, fallback);
  } catch {
    return fallback;
  }
}

export async function updatePentacamImportRuntimeConfig(input: Partial<PentacamImportConfig>) {
  const current = await getPentacamImportRuntimeConfig();
  const next = normalizeConfig(input, current);
  await db.updateSystemSettings(RUNTIME_SETTING_KEY, next);
  return next;
}

async function updateRuntimeStatus(patch: Record<string, unknown>) {
  const row = await db.getSystemSetting(STATUS_SETTING_KEY).catch(() => null);
  let current: Record<string, unknown> = {};
  try {
    current = row?.value ? (JSON.parse(String(row.value)) as Record<string, unknown>) : {};
  } catch {
    current = {};
  }
  await db.updateSystemSettings(STATUS_SETTING_KEY, {
    ...current,
    ...patch,
  });
}

export async function getPentacamImportRuntimeStatus() {
  const config = await getPentacamImportRuntimeConfig();
  const row = await db.getSystemSetting(STATUS_SETTING_KEY).catch(() => null);
  let status: Record<string, unknown> = {};
  try {
    status = row?.value ? (JSON.parse(String(row.value)) as Record<string, unknown>) : {};
  } catch {
    status = {};
  }
  return {
    config,
    status,
  };
}

function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".tif" || ext === ".tiff") return "image/tiff";
  return "application/octet-stream";
}

function parseEyeSide(fileName: string): EyeSide {
  const upper = String(fileName ?? "").toUpperCase();
  if (/(^|[_\-\s])OD([_\-\s.]|$)/.test(upper)) return "OD";
  if (/(^|[_\-\s])OS([_\-\s.]|$)/.test(upper)) return "OS";
  if (/(^|[_\-\s])OU([_\-\s.]|$)/.test(upper)) return "OU";
  return "unknown";
}

function parseCapturedAt(fileName: string): Date | null {
  const name = path.parse(fileName).name;
  const ymdHm = name.match(/(20\d{2})[-_]?(\d{2})[-_]?(\d{2})[-_\s]?(\d{2})(\d{2})(\d{2})?/);
  if (!ymdHm) return null;
  const [, y, m, d, hh, mm, ss] = ymdHm;
  const iso = `${y}-${m}-${d}T${hh}:${mm}:${ss ?? "00"}`;
  const dt = new Date(iso);
  if (Number.isNaN(dt.valueOf())) return null;
  return dt;
}

function parsePatientCodeFromFileName(fileName: string): string {
  const base = path.parse(fileName).name.trim();
  if (!base) return "";
  const token = base.split(/[_\-\s]+/).find(Boolean) ?? "";
  const cleaned = token.replace(/[^A-Za-z0-9]/g, "");
  if (cleaned.length >= 3) return cleaned;
  const fallback = base.match(/[A-Za-z]{0,3}\d{2,}/);
  return fallback ? fallback[0] : "";
}

async function listSourceFiles(sourceDir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
    files.push(path.join(sourceDir, entry.name));
  }
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function hashBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function storeLocally(buffer: Buffer, fileName: string, config: PentacamImportConfig) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, "_");
  const rel = `${stamp}_${safeName}`;
  const root = path.resolve(process.cwd(), config.localStoreDir);
  await fs.mkdir(root, { recursive: true });
  const destAbs = path.join(root, rel);
  await fs.writeFile(destAbs, buffer);
  const publicPath = `${config.publicBasePath.replace(/\/+$/, "")}/${encodeURIComponent(rel)}`;
  return { key: rel, url: publicPath };
}

async function archiveSourceFile(sourcePath: string, config: PentacamImportConfig) {
  if (!config.archiveProcessed || !config.archiveDir) return;
  const archiveRoot = path.resolve(process.cwd(), config.archiveDir);
  await fs.mkdir(archiveRoot, { recursive: true });
  const fileName = path.basename(sourcePath);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(archiveRoot, `${stamp}_${fileName}`);
  await fs.rename(sourcePath, target).catch(async () => {
    await fs.copyFile(sourcePath, target);
    await fs.unlink(sourcePath).catch(() => undefined);
  });
}

async function importOneFile(sourcePath: string, config: PentacamImportConfig): Promise<ImportStatus | "skipped"> {
  const absoluteSource = path.resolve(sourcePath);
  const fileName = path.basename(absoluteSource);
  const existingByPath = await db.getPentacamFileBySourcePath(absoluteSource).catch(() => null);
  if (existingByPath) return "skipped";

  const stat = await fs.stat(absoluteSource);
  if (!stat.isFile()) return "skipped";
  const raw = await fs.readFile(absoluteSource);
  const fileHash = hashBuffer(raw);
  const duplicate = await db.getPentacamFileByHash(fileHash).catch(() => null);
  const patientCode = parsePatientCodeFromFileName(fileName);
  const patient = patientCode ? await db.getPatientByCode(patientCode) : null;
  const eyeSide = parseEyeSide(fileName);
  const capturedAt = parseCapturedAt(fileName);
  const mimeType = getMimeType(fileName);

  let importStatus: ImportStatus = "imported";
  let importError: string | null = null;
  let storageKey: string | null = null;
  let storageUrl: string | null = null;

  if (duplicate) {
    importStatus = "duplicate";
    storageKey = String((duplicate as any).storageKey ?? "") || null;
    storageUrl = String((duplicate as any).storageUrl ?? "") || null;
  } else if (!patient) {
    importStatus = "unmatched";
  } else {
    try {
      if (config.useForgeStorage) {
        const stored = await storagePut(`pentacam/${fileName}`, raw, mimeType);
        storageKey = stored.key;
        storageUrl = stored.url;
      } else {
        const stored = await storeLocally(raw, fileName, config);
        storageKey = stored.key;
        storageUrl = stored.url;
      }
    } catch (error: any) {
      importStatus = "failed";
      importError = String(error?.message ?? error ?? "storage error");
    }
  }

  await db.createPentacamFileRecord({
    patientId: patient?.id ?? null,
    patientCode: patientCode || null,
    sourcePath: absoluteSource,
    sourceFileName: fileName,
    mimeType,
    fileSizeBytes: Number(stat.size || 0),
    fileHash,
    eyeSide,
    capturedAt: capturedAt ?? null,
    importStatus,
    importError,
    storageKey,
    storageUrl,
    metadata: {
      sourceMtimeMs: stat.mtimeMs,
      sourceCtimeMs: stat.ctimeMs,
    },
    importedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  if (importStatus !== "failed") {
    await archiveSourceFile(absoluteSource, config);
  }
  return importStatus;
}

let running = false;

export async function runPentacamAutoImportOnce(configInput?: Partial<PentacamImportConfig>): Promise<PentacamImportRunSummary> {
  if (running) {
    return {
      scanned: 0,
      processed: 0,
      imported: 0,
      duplicate: 0,
      unmatched: 0,
      failed: 0,
      skipped: 0,
      errors: ["Importer is already running"],
    };
  }
  running = true;
  const startedAt = new Date().toISOString();
  const summary: PentacamImportRunSummary = {
    scanned: 0,
    processed: 0,
    imported: 0,
    duplicate: 0,
    unmatched: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };
  await updateRuntimeStatus({
    running: true,
    lastRunStartedAt: startedAt,
    lastError: null,
  }).catch(() => undefined);

  try {
    const config = normalizeConfig(configInput ?? {}, await getPentacamImportRuntimeConfig());
    if (!config.sourceDir) {
      throw new Error("PENTACAM_IMPORT_DIR is empty");
    }
    const files = await listSourceFiles(config.sourceDir);
    summary.scanned = files.length;
    for (const filePath of files.slice(0, config.maxFilesPerRun)) {
      try {
        const status = await importOneFile(filePath, config);
        if (status === "skipped") {
          summary.skipped += 1;
          continue;
        }
        summary.processed += 1;
        if (status === "imported") summary.imported += 1;
        else if (status === "duplicate") summary.duplicate += 1;
        else if (status === "unmatched") summary.unmatched += 1;
        else if (status === "failed") summary.failed += 1;
      } catch (error: any) {
        summary.failed += 1;
        summary.errors.push(String(error?.message ?? error ?? "unknown file import error"));
      }
    }
    await updateRuntimeStatus({
      running: false,
      lastRunFinishedAt: new Date().toISOString(),
      lastSummary: summary,
      lastError: summary.errors.length > 0 ? summary.errors[0] : null,
    }).catch(() => undefined);
    return summary;
  } catch (error: any) {
    summary.errors.push(String(error?.message ?? error ?? "unknown importer error"));
    await updateRuntimeStatus({
      running: false,
      lastRunFinishedAt: new Date().toISOString(),
      lastSummary: summary,
      lastError: summary.errors[0] ?? "unknown importer error",
    }).catch(() => undefined);
    return summary;
  } finally {
    running = false;
  }
}

