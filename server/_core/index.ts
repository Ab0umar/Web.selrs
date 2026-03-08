import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "node:path";
import { readdir, stat, mkdir, readFile, rename, access, writeFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerAuthRoutes } from "./auth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerWsServer } from "./ws";
import { startMssqlSyncScheduler } from "./mssqlSyncScheduler";
import mysql from "mysql2/promise";
import { getBuildInfo } from "./buildInfo";
const execFile = promisify(execFileCb);

type BlackIceUploadRow = {
  id: number;
  document_id: string;
  file_name: string | null;
  mime_type: string | null;
  ocr_text: string | null;
  plain_text: string | null;
  source_printer: string | null;
  patient_id: number | null;
  patient_name: string | null;
  patient_code: string | null;
  created_at: Date | string;
};

type BlackIceFolderImportOptions = {
  enabled: boolean;
  sourceDir: string;
  processedDir: string;
  failedDir: string;
  pollIntervalMs: number;
  minFileAgeMs: number;
  maxFilesPerCycle: number;
  sourcePrinter: string;
};

type BlackIceOcrLinkOptions = {
  enabled: boolean;
  pollIntervalMs: number;
  batchSize: number;
  tesseractPath: string;
  lang: string;
  psm: number;
};

const IMPORTABLE_IMAGE_EXT = /\.(jpg|jpeg|png|webp|bmp|tif|tiff)$/i;

function parseBooleanEnv(rawValue: string | undefined, fallback: boolean): boolean {
  if (rawValue == null) return fallback;
  const value = String(rawValue).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function getBlackIceFolderImportOptions(): BlackIceFolderImportOptions {
  const defaultSourceDir = path.resolve(process.cwd(), "Pentacam");
  const sourceDir = String(process.env.BLACKICE_IMPORT_SOURCE_DIR || defaultSourceDir).trim();
  const pollIntervalMs = Math.max(2_000, Number(process.env.BLACKICE_IMPORT_POLL_MS || 10_000));
  const minFileAgeMs = Math.max(1_000, Number(process.env.BLACKICE_IMPORT_MIN_FILE_AGE_MS || 5_000));
  const maxFilesPerCycle = Math.max(1, Math.min(200, Number(process.env.BLACKICE_IMPORT_MAX_FILES_PER_CYCLE || 20)));
  const sourcePrinter = String(process.env.BLACKICE_IMPORT_SOURCE_PRINTER || "Pentacam").trim() || "Pentacam";

  const enabled = parseBooleanEnv(process.env.BLACKICE_IMPORT_ENABLED, true);
  const processedDir = String(process.env.BLACKICE_IMPORT_PROCESSED_DIR || path.join(sourceDir, "_processed")).trim();
  const failedDir = String(process.env.BLACKICE_IMPORT_FAILED_DIR || path.join(sourceDir, "_failed")).trim();

  return {
    enabled,
    sourceDir,
    processedDir,
    failedDir,
    pollIntervalMs,
    minFileAgeMs,
    maxFilesPerCycle,
    sourcePrinter,
  };
}

function getBlackIceOcrLinkOptions(): BlackIceOcrLinkOptions {
  return {
    enabled: parseBooleanEnv(process.env.BLACKICE_OCR_ENABLED, false),
    pollIntervalMs: Math.max(3_000, Number(process.env.BLACKICE_OCR_POLL_MS || 20_000)),
    batchSize: Math.max(1, Math.min(100, Number(process.env.BLACKICE_OCR_BATCH_SIZE || 10))),
    tesseractPath: String(process.env.BLACKICE_OCR_TESSERACT_PATH || "tesseract").trim() || "tesseract",
    lang: String(process.env.BLACKICE_OCR_LANG || "eng").trim() || "eng",
    psm: Math.max(3, Math.min(13, Number(process.env.BLACKICE_OCR_PSM || 6))),
  };
}

function guessMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".tif" || ext === ".tiff") return "image/tiff";
  return "application/octet-stream";
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function moveToDirAvoidingOverwrite(filePath: string, targetDir: string): Promise<string> {
  const parsed = path.parse(filePath);
  let candidate = path.join(targetDir, `${parsed.name}${parsed.ext}`);
  let i = 1;
  while (await exists(candidate)) {
    candidate = path.join(targetDir, `${parsed.name}_${i}${parsed.ext}`);
    i += 1;
  }
  await rename(filePath, candidate);
  return candidate;
}

function extractIdCandidatesFromText(input: string): string[] {
  const text = String(input ?? "");
  const matches = text.match(/\b\d{3,12}\b/g) ?? [];
  return Array.from(new Set(matches.map((value) => value.trim()).filter(Boolean)));
}

async function resolvePatientByIds(conn: mysql.Connection, candidates: string[]): Promise<number | null> {
  const unique = Array.from(new Set(candidates));
  for (const candidate of unique) {
    const [rows] = await conn.query("SELECT id FROM patients WHERE patientCode = ? LIMIT 2", [candidate]);
    const result = rows as Array<{ id: number }>;
    if (result.length === 1) return result[0].id;
  }
  for (const candidate of unique) {
    if (!/^\d+$/.test(candidate)) continue;
    const patientId = Number(candidate);
    if (!Number.isFinite(patientId) || patientId <= 0) continue;
    const [rows] = await conn.query("SELECT id FROM patients WHERE id = ? LIMIT 2", [patientId]);
    const result = rows as Array<{ id: number }>;
    if (result.length === 1) return result[0].id;
  }
  return null;
}

async function runOcrFromBuffer(
  image: Buffer,
  fileName: string,
  cfg: BlackIceOcrLinkOptions
): Promise<string> {
  const tmpBase = await mkdtemp(path.join(os.tmpdir(), "blackice-ocr-"));
  const inputPath = path.join(tmpBase, fileName || "input.jpg");
  const outputBase = path.join(tmpBase, "ocr");
  const outputTxt = `${outputBase}.txt`;
  try {
    await writeFile(inputPath, image);
    const args = [inputPath, outputBase, "-l", cfg.lang, "--psm", String(cfg.psm)];
    await execFile(cfg.tesseractPath, args, { windowsHide: true, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
    const text = await readFile(outputTxt, "utf8");
    return String(text ?? "").trim();
  } finally {
    await rm(tmpBase, { recursive: true, force: true }).catch(() => undefined);
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = parseInt(process.env.PORT || "4000")): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const pentacamExportsDir = path.resolve(process.cwd(), "Pentacam");
  registerWsServer(server);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && (err as any)?.status === 400 && "body" in err) {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }
    next(err);
  });
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      if (!req.path.startsWith("/api/")) return;
      const ms = Date.now() - start;
      if (ms >= 500) {
        console.warn(`[slow-api] ${req.method} ${req.path} -> ${res.statusCode} in ${ms}ms`);
      } else if (process.env.NODE_ENV !== "production") {
        console.log(`[api] ${req.method} ${req.path} -> ${res.statusCode} in ${ms}ms`);
      }
    });
    next();
  });

  async function withDb<T>(run: (conn: mysql.Connection) => Promise<T>) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is missing");
    }
    const conn = await mysql.createConnection(databaseUrl);
    try {
      return await run(conn);
    } finally {
      await conn.end();
    }
  }

  async function startBlackIceFolderImporter() {
    const cfg = getBlackIceFolderImportOptions();
    if (!cfg.enabled) {
      console.log("[blackice-import] Disabled");
      return;
    }
    if (!cfg.sourceDir) {
      console.warn("[blackice-import] Disabled: BLACKICE_IMPORT_SOURCE_DIR is missing");
      return;
    }

    await mkdir(cfg.sourceDir, { recursive: true });
    await mkdir(cfg.processedDir, { recursive: true });
    await mkdir(cfg.failedDir, { recursive: true });

    console.log(
      `[blackice-import] Watching ${cfg.sourceDir} every ${cfg.pollIntervalMs}ms (processed=${cfg.processedDir}, failed=${cfg.failedDir})`
    );

    let busy = false;
    const runCycle = async () => {
      if (busy) return;
      busy = true;
      try {
        const now = Date.now();
        const entries = await readdir(cfg.sourceDir, { withFileTypes: true });
        const fileNames = entries
          .filter((entry) => entry.isFile() && IMPORTABLE_IMAGE_EXT.test(entry.name))
          .map((entry) => entry.name)
          .sort((a, b) => a.localeCompare(b))
          .slice(0, cfg.maxFilesPerCycle);

        for (const fileName of fileNames) {
          const fullPath = path.join(cfg.sourceDir, fileName);
          const fileInfo = await stat(fullPath).catch(() => null);
          if (!fileInfo?.isFile()) continue;
          if (now - Number(fileInfo.mtimeMs || 0) < cfg.minFileAgeMs) continue;

          try {
            const fileData = await readFile(fullPath);
            if (fileData.length === 0) {
              throw new Error("File is empty");
            }
            const documentId = path.parse(fileName).name.slice(0, 255);
            const mimeType = guessMimeType(fileName);
            const dbFileName = fileName.slice(0, 255);

            await withDb((conn) =>
              conn.query(
                `INSERT INTO blackice_uploads
                 (document_id, file_name, mime_type, file_data, source_printer)
                 VALUES (?, ?, ?, ?, ?)`,
                [documentId, dbFileName, mimeType, fileData, cfg.sourcePrinter]
              )
            );
            await moveToDirAvoidingOverwrite(fullPath, cfg.processedDir);
            console.log(`[blackice-import] Imported ${fileName}`);
          } catch (error: any) {
            const reason = String(error?.message ?? "unknown error");
            console.error(`[blackice-import] Failed ${fileName}: ${reason}`);
            await moveToDirAvoidingOverwrite(fullPath, cfg.failedDir).catch(() => undefined);
          }
        }
      } catch (error: any) {
        console.error("[blackice-import] Cycle error:", String(error?.message ?? error));
      } finally {
        busy = false;
      }
    };

    void runCycle();
    setInterval(() => {
      void runCycle();
    }, cfg.pollIntervalMs);
  }

  async function startBlackIceOcrLinker() {
    const cfg = getBlackIceOcrLinkOptions();
    if (!cfg.enabled) {
      console.log("[blackice-ocr] Disabled");
      return;
    }
    try {
      await execFile(cfg.tesseractPath, ["--version"], { windowsHide: true, timeout: 15_000 });
    } catch (error: any) {
      console.error(
        `[blackice-ocr] Disabled: Tesseract is not available at "${cfg.tesseractPath}" (${String(error?.message ?? error)})`
      );
      return;
    }
    console.log(
      `[blackice-ocr] Enabled (poll=${cfg.pollIntervalMs}ms, batch=${cfg.batchSize}, lang=${cfg.lang}, psm=${cfg.psm})`
    );

    let busy = false;
    const runCycle = async () => {
      if (busy) return;
      busy = true;
      try {
        await withDb(async (conn) => {
          const [rows] = await conn.query(
            `SELECT id, document_id, file_name, file_data, ocr_text, plain_text
             FROM blackice_uploads
             WHERE patient_id IS NULL
             ORDER BY id DESC
             LIMIT ?`,
            [cfg.batchSize]
          );
          const uploads = rows as Array<{
            id: number;
            document_id: string;
            file_name: string | null;
            file_data: Buffer | null;
            ocr_text: string | null;
            plain_text: string | null;
          }>;

          for (const row of uploads) {
            if (!row.file_data || row.file_data.length === 0) continue;
            let ocrText = String(row.ocr_text ?? "").trim();
            if (!ocrText) {
              try {
                ocrText = await runOcrFromBuffer(row.file_data, row.file_name || `${row.id}.jpg`, cfg);
                if (ocrText) {
                  await conn.query("UPDATE blackice_uploads SET ocr_text = ? WHERE id = ?", [ocrText, row.id]);
                }
              } catch (error: any) {
                console.error(`[blackice-ocr] OCR failed for upload ${row.id}: ${String(error?.message ?? error)}`);
                continue;
              }
            }

            const candidates = Array.from(
              new Set([
                ...extractIdCandidatesFromText(row.document_id),
                ...extractIdCandidatesFromText(row.file_name ?? ""),
                ...extractIdCandidatesFromText(ocrText),
                ...extractIdCandidatesFromText(row.plain_text ?? ""),
              ])
            );
            if (candidates.length === 0) continue;

            const patientId = await resolvePatientByIds(conn, candidates);
            if (!patientId) continue;

            await conn.query("UPDATE blackice_uploads SET patient_id = ? WHERE id = ? AND patient_id IS NULL", [
              patientId,
              row.id,
            ]);
            console.log(`[blackice-ocr] Linked upload ${row.id} -> patient_id=${patientId}`);
          }
        });
      } catch (error: any) {
        console.error("[blackice-ocr] Cycle error:", String(error?.message ?? error));
      } finally {
        busy = false;
      }
    };

    void runCycle();
    setInterval(() => {
      void runCycle();
    }, cfg.pollIntervalMs);
  }

  // Black Ice uploads: list recent uploaded docs for UI.
  app.get("/api/blackice/uploads", async (req, res) => {
    try {
      const limitRaw = Number(req.query.limit ?? 100);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, limitRaw)) : 100;
      const search = String(req.query.search ?? "").trim();
      const patientIdRaw = Number(req.query.patientId ?? 0);
      const patientId = Number.isFinite(patientIdRaw) && patientIdRaw > 0 ? Math.trunc(patientIdRaw) : 0;

      const rows = await withDb(async (conn) => {
        if (patientId > 0) {
          const [result] = await conn.query(
            `SELECT b.id, b.document_id, b.file_name, b.mime_type, b.ocr_text, b.plain_text, b.source_printer,
                    b.patient_id, p.fullName AS patient_name, p.patientCode AS patient_code, b.created_at
             FROM blackice_uploads b
             LEFT JOIN patients p ON p.id = b.patient_id
             WHERE b.patient_id = ?
             ORDER BY b.id DESC
             LIMIT ?`,
            [patientId, limit]
          );
          return result as BlackIceUploadRow[];
        }

        if (search) {
          const isNumericSearch = /^\d+$/.test(search);
          const [result] = await conn.query(
            `SELECT b.id, b.document_id, b.file_name, b.mime_type, b.ocr_text, b.plain_text, b.source_printer,
                    b.patient_id, p.fullName AS patient_name, p.patientCode AS patient_code, b.created_at
             FROM blackice_uploads b
             LEFT JOIN patients p ON p.id = b.patient_id
             WHERE b.document_id LIKE ? OR b.file_name LIKE ? OR p.fullName LIKE ? OR p.patientCode LIKE ?
                   OR b.ocr_text LIKE ? OR b.plain_text LIKE ?
             ${isNumericSearch ? "OR b.id = ? OR b.patient_id = ?" : ""}
             ORDER BY b.id DESC
             LIMIT ?`,
            isNumericSearch
              ? [
                  `%${search}%`,
                  `%${search}%`,
                  `%${search}%`,
                  `%${search}%`,
                  `%${search}%`,
                  `%${search}%`,
                  Number(search),
                  Number(search),
                  limit,
                ]
              : [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, limit]
          );
          return result as BlackIceUploadRow[];
        }

        const [result] = await conn.query(
          `SELECT b.id, b.document_id, b.file_name, b.mime_type, b.ocr_text, b.plain_text, b.source_printer,
                  b.patient_id, p.fullName AS patient_name, p.patientCode AS patient_code, b.created_at
           FROM blackice_uploads b
           LEFT JOIN patients p ON p.id = b.patient_id
           ORDER BY b.id DESC
           LIMIT ?`,
          [limit]
        );
        return result as BlackIceUploadRow[];
      });

      res.status(200).json({
        ok: true,
        count: rows.length,
        rows: rows.map((row) => ({
          ocrIdCandidates: Array.from(new Set(String(row.ocr_text ?? "").match(/\b\d{4,12}\b/g) ?? [])).slice(0, 10),
          id: row.id,
          documentId: row.document_id,
          fileName: row.file_name,
          mimeType: row.mime_type,
          hasOcr: Boolean((row.ocr_text ?? "").trim()),
          hasText: Boolean((row.plain_text ?? "").trim()),
          sourcePrinter: row.source_printer,
          patientId: row.patient_id,
          patientName: row.patient_name,
          patientCode: row.patient_code,
          createdAt: new Date(row.created_at).toISOString(),
          viewUrl: `/api/blackice/uploads/${row.id}`,
          downloadUrl: `/api/blackice/uploads/${row.id}?download=1`,
        })),
      });
    } catch (error: any) {
      res.status(500).json({
        ok: false,
        count: 0,
        rows: [],
        error: String(error?.message ?? "Failed to list uploads"),
      });
    }
  });

  // Black Ice uploads: stream a single file for inline view or download.
  app.get("/api/blackice/uploads/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ ok: false, error: "Invalid upload id" });
        return;
      }

      const row = await withDb(async (conn) => {
        const [result] = await conn.query(
          `SELECT id, document_id, file_name, mime_type, file_data, created_at
           FROM blackice_uploads
           WHERE id = ?
           LIMIT 1`,
          [id]
        );
        return (result as any[])[0] as
          | {
              id: number;
              document_id: string;
              file_name: string | null;
              mime_type: string | null;
              file_data: Buffer | null;
              created_at: Date | string;
            }
          | undefined;
      });

      if (!row) {
        res.status(404).json({ ok: false, error: "Upload not found" });
        return;
      }
      if (!row.file_data || row.file_data.length === 0) {
        res.status(404).json({ ok: false, error: "Upload has no binary data" });
        return;
      }

      const mimeType = String(row.mime_type ?? "").trim() || "application/octet-stream";
      const fileName =
        String(row.file_name ?? "").trim() ||
        `${String(row.document_id || "document").replace(/[^\w.-]+/g, "_")}.bin`;
      const download = String(req.query.download ?? "0") === "1";

      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Length", String(row.file_data.length));
      res.setHeader("Cache-Control", "private, max-age=60");
      res.setHeader(
        "Content-Disposition",
        `${download ? "attachment" : "inline"}; filename="${fileName.replace(/"/g, "")}"`
      );
      res.status(200).send(row.file_data);
    } catch (error: any) {
      res.status(500).json({
        ok: false,
        error: String(error?.message ?? "Failed to read upload"),
      });
    }
  });

  app.post("/api/blackice/uploads/ocr-link/run", async (_req, res) => {
    try {
      const cfg = getBlackIceOcrLinkOptions();
      if (!cfg.enabled) {
        res.status(400).json({ ok: false, error: "BLACKICE_OCR_ENABLED is false" });
        return;
      }
      let linked = 0;
      let processed = 0;
      await withDb(async (conn) => {
        const [rows] = await conn.query(
          `SELECT id, document_id, file_name, file_data, ocr_text, plain_text
           FROM blackice_uploads
           WHERE patient_id IS NULL
           ORDER BY id DESC
           LIMIT ?`,
          [cfg.batchSize]
        );
        const uploads = rows as Array<{
          id: number;
          document_id: string;
          file_name: string | null;
          file_data: Buffer | null;
          ocr_text: string | null;
          plain_text: string | null;
        }>;

        for (const row of uploads) {
          if (!row.file_data || row.file_data.length === 0) continue;
          processed += 1;
          let ocrText = String(row.ocr_text ?? "").trim();
          if (!ocrText) {
            ocrText = await runOcrFromBuffer(row.file_data, row.file_name || `${row.id}.jpg`, cfg);
            if (ocrText) {
              await conn.query("UPDATE blackice_uploads SET ocr_text = ? WHERE id = ?", [ocrText, row.id]);
            }
          }
          const candidates = Array.from(
            new Set([
              ...extractIdCandidatesFromText(row.document_id),
              ...extractIdCandidatesFromText(row.file_name ?? ""),
              ...extractIdCandidatesFromText(ocrText),
              ...extractIdCandidatesFromText(row.plain_text ?? ""),
            ])
          );
          if (candidates.length === 0) continue;
          const patientId = await resolvePatientByIds(conn, candidates);
          if (!patientId) continue;
          await conn.query("UPDATE blackice_uploads SET patient_id = ? WHERE id = ? AND patient_id IS NULL", [
            patientId,
            row.id,
          ]);
          linked += 1;
        }
      });
      res.status(200).json({ ok: true, processed, linked });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: String(error?.message ?? error) });
    }
  });

  app.get("/healthz", async (_req, res) => {
    const build = await getBuildInfo().catch(() => ({ version: "unknown", buildTime: "unknown", commit: "unknown" }));
    const payload: {
      ok: boolean;
      env: string;
      dbConnected: boolean;
      version: string;
      buildTime: string;
      commit: string;
      patientsCount?: number;
      dbError?: string;
    } = {
      ok: true,
      env: process.env.NODE_ENV || "development",
      dbConnected: false,
      version: build.version,
      buildTime: build.buildTime,
      commit: build.commit,
    };
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      payload.dbError = "DATABASE_URL is missing";
      res.status(200).json(payload);
      return;
    }
    let conn: mysql.Connection | null = null;
    try {
      conn = await mysql.createConnection(databaseUrl);
      const [rows] = await conn.query("SELECT COUNT(*) AS c FROM patients");
      const first = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;
      payload.dbConnected = true;
      payload.patientsCount = Number(first?.c ?? 0);
    } catch (error: any) {
      payload.dbConnected = false;
      payload.dbError = String(error?.code || error?.message || "DB ping failed");
    } finally {
      if (conn) await conn.end();
    }
    res.status(200).json(payload);
  });
  // Local auth routes
  registerAuthRoutes(app);

  // Local Pentacam exports: list files and serve image assets.
  app.get("/api/pentacam/exports", async (req, res) => {
    try {
      const limitRaw = Number(req.query.limit ?? 500);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(10000, limitRaw)) : 500;
      const dirEntries = await readdir(pentacamExportsDir, { withFileTypes: true }).catch(() => []);
      const files: Array<{ name: string; size: number; mtime: string; url: string }> = [];

      for (const entry of dirEntries) {
        if (!entry.isFile()) continue;
        const name = String(entry.name ?? "").trim();
        if (!/\.(jpg|jpeg|png|webp)$/i.test(name)) continue;
        const fullPath = path.join(pentacamExportsDir, name);
        const info = await stat(fullPath).catch(() => null);
        if (!info?.isFile()) continue;
        files.push({
          name,
          size: Number(info.size ?? 0),
          mtime: new Date(info.mtime).toISOString(),
          url: `/pentacam-exports/${encodeURIComponent(name)}`,
        });
      }

      files.sort((a, b) => Date.parse(b.mtime) - Date.parse(a.mtime));
      const sliced = files.slice(0, limit);
      res.status(200).json({ ok: true, count: sliced.length, files: sliced });
    } catch (error: any) {
      res.status(500).json({
        ok: false,
        count: 0,
        files: [],
        error: String(error?.message ?? "Failed to list Pentacam exports"),
      });
    }
  });
  app.use("/pentacam-exports", express.static(pentacamExportsDir, { maxAge: "1h", fallthrough: true }));

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "4000");
  // Bind to all interfaces by default to allow LAN/mobile access.
  const host = process.env.HOST || "0.0.0.0";
  const branchName = process.env.BRANCH || "clinic";
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`[${branchName}] Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, host, () => {
    console.log(`[${branchName}] Server running on http://${host}:${port}/`);
  });
  startMssqlSyncScheduler();
  await startBlackIceFolderImporter();
  await startBlackIceOcrLinker();
}

startServer().catch(console.error);
