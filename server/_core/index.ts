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

type OcrTsvRow = {
  left: number;
  top: number;
  conf: number;
  text: string;
  block: number;
  paragraph: number;
  line: number;
};

const IMPORTABLE_IMAGE_EXT = /\.(jpg|jpeg|png|webp|bmp|tif|tiff)$/i;
let blackIceDbCycleBusy = false;

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
  // Default flow: incoming source folder -> Pentacam root for web visibility.
  const processedDir = String(process.env.BLACKICE_IMPORT_PROCESSED_DIR || defaultSourceDir).trim();
  const failedDir = String(process.env.BLACKICE_IMPORT_FAILED_DIR || sourceDir).trim();

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

async function renameWithPrefix(filePath: string, prefix: string): Promise<string> {
  const parsed = path.parse(filePath);
  if (parsed.base.startsWith(`${prefix}_`)) return filePath;
  let candidate = path.join(parsed.dir, `${prefix}_${parsed.base}`);
  let i = 1;
  while (await exists(candidate)) {
    candidate = path.join(parsed.dir, `${prefix}_${parsed.name}_${i}${parsed.ext}`);
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

function extractLabeledIdCandidatesFromText(input: string): string[] {
  const text = String(input ?? "");
  if (!text) return [];
  const patterns = [
    /\b(?:id|i\s*d|ld)\s*[:\-]?\s*(\d{3,12})\b/gi,
    /\b(?:patient\s*id|pat(?:ient)?\s*no|mrn)\s*[:\-]?\s*(\d{3,12})\b/gi,
  ];
  const out: string[] = [];
  for (const pattern of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const v = String(m[1] ?? "").trim();
      if (v) out.push(v);
    }
  }
  return Array.from(new Set(out));
}

function normalizeIdCode(value: string): string {
  const match = String(value ?? "").match(/\b\d{3,12}\b/);
  if (!match) return "";
  const raw = match[0];
  // Business rule: drop first 2 digits from machine ID (e.g. 260100 -> 0100).
  return raw.length > 4 ? raw.slice(2) : raw;
}

function pickRenameCodeFromOcrText(input: string): string {
  const labeled = extractLabeledIdCandidatesFromText(input);
  for (const raw of labeled) {
    const normalized = normalizeIdCode(raw);
    if (normalized) return normalized;
  }
  return "";
}

function extractPatientNameFromOcrText(input: string): string {
  const text = String(input ?? "");
  if (!text) return "";
  const clean = text.replace(/\r/g, "");
  const normalizeNameLine = (raw: string): string => {
    const cropped = String(raw ?? "").split("|")[0] ?? "";
    const value = String(cropped)
      .replace(/[\[\]{}|]/g, " ")
      .replace(/[^A-Za-z\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const stop = new Set([
      "id",
      "eye",
      "right",
      "left",
      "date",
      "birth",
      "exam",
      "time",
      "refractive",
      "retractive",
      "oculus",
      "pentacam",
    ]);
    return value
      .split(" ")
      .filter((w) => w && !stop.has(w.toLowerCase()))
      .slice(0, 4)
      .join(" ");
  };
  const lastRaw = clean.match(/(?:last\s*name|surname)\s*[:\-]?\s*([^\n\r]+)/i)?.[1] ?? "";
  const firstRaw = clean.match(/(?:first\s*name|given\s*name)\s*[:\-]?\s*([^\n\r]+)/i)?.[1] ?? "";
  const last = normalizeNameLine(lastRaw);
  const first = normalizeNameLine(firstRaw);
  const full = `${first} ${last}`.trim();
  return sanitizeFilePart(full).replace(/\s+/g, "_");
}

function extractEyeFromOcrText(input: string): string {
  const text = String(input ?? "");
  if (!text) return "";
  const m = text.match(/(?:\b|[^A-Za-z])(?:eye|jeye)\s*[:\-]?\s*\[?\s*(right|left|od|os|ou)\b/i);
  const raw = String(m?.[1] ?? "").toUpperCase();
  if (raw === "RIGHT") return "OD";
  if (raw === "LEFT") return "OS";
  if (raw === "OD" || raw === "OS" || raw === "OU") return raw;
  return "";
}

function isWeakParsedPatientName(input: string): boolean {
  const scoreParsedPatientName = (value: string): number => {
    const v = String(value ?? "").trim().replace(/_/g, " ").toLowerCase();
    const tokens = v.split(/\s+/).filter(Boolean);
    let score = 0;
    score += Math.max(0, 5 - Math.abs(tokens.length - 3));
    if (tokens.some((t) => ["id", "name", "patient", "unknown", "exam", "date", "time", "eye", "right", "left", "od", "os"].includes(t))) {
      score -= 8;
    }
    if (
      tokens.some((t) =>
        [
          "axial",
          "asial",
          "sagittal",
          "curvature",
          "elevation",
          "cornea",
          "refractive",
          "retractive",
          "map",
          "maps",
          "front",
          "back",
          "pachy",
          "oculus",
          "pentacam",
        ].includes(t)
      )
    ) {
      score -= 10;
    }
    if (!/[a-z]/i.test(v)) score -= 5;
    return score;
  };
  const v = String(input ?? "").trim().toLowerCase();
  if (!v) return true;
  if (["id", "name", "patient", "unknown"].includes(v)) return true;
  if (!/[a-z]/i.test(v)) return true;
  return scoreParsedPatientName(v) <= 0;
}

function sanitizeFilePart(input: string): string {
  return String(input ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLeadingIdFromFileName(fileName: string): string {
  const stem = path.parse(String(fileName ?? "")).name;
  const m = stem.match(/^\s*(\d{3,12})[\s_-]+/);
  return normalizeIdCode(String(m?.[1] ?? ""));
}

function extractAnyIdFromFileName(fileName: string): string {
  const stem = path.parse(String(fileName ?? "")).name;
  const m = stem.match(/\b(\d{3,12})\b/);
  return normalizeIdCode(String(m?.[1] ?? ""));
}

function extractPatientNameAndEyeFromFileName(fileName: string): { name: string; eye: string } {
  const stem = path.parse(String(fileName ?? "")).name;
  const rawTokens = stem.split("_").map((t) => String(t ?? "").trim()).filter(Boolean);
  if (rawTokens.length === 0) return { name: "patient", eye: "" };

  const tokens = rawTokens;
  if (tokens.length === 0) return { name: "patient", eye: "" };

  const eyeIdx = tokens.findIndex((t) => /^(OD|OS|OU)$/i.test(t));
  const eye = eyeIdx >= 0 ? String(tokens[eyeIdx] ?? "").toUpperCase() : "";
  const dateIdx = tokens.findIndex((t, i) => /^\d{8}$/.test(t) && /^\d{6}$/.test(tokens[i + 1] ?? ""));
  const baseNameTokens =
    eyeIdx > 0 ? tokens.slice(0, eyeIdx) : dateIdx > 0 ? tokens.slice(0, dateIdx) : tokens;
  const cleaned = baseNameTokens.filter((t) => {
    const upper = t.toUpperCase();
    if (["IMPORTED", "FAILED", "TEST", "TRYNOW", "REALTRY", "REALFMT"].includes(upper)) return false;
    if (/^\d+$/.test(t)) return false;
    return true;
  });
  const name = sanitizeFilePart(cleaned.join(" ")).replace(/\s+/g, "_") || "patient";
  return { name, eye };
}

async function renameToPatientIdentity(
  filePath: string,
  preferredIdCode?: string,
  preferredName?: string,
  preferredEye?: string
): Promise<string> {
  const parsed = path.parse(filePath);
  const parts = extractPatientNameAndEyeFromFileName(parsed.base);
  const cleanPreferredName = sanitizeFilePart(String(preferredName ?? "").trim()).replace(/\s+/g, "_");
  const namePart = cleanPreferredName || parts.name;
  const eyePart = String(preferredEye ?? "").trim().toUpperCase() || parts.eye;
  const idPart = normalizeIdCode(String(preferredIdCode ?? ""));
  const parsedStem = path.parse(parsed.base).name.replace(/[_\s]+/g, " ").trim();
  const looksGenericOnly = /^(?:\d+\s+)?(?:maps?\s+refr(?:active)?|topometric|enhanced\s+ectasia|large\s+map)(?:\s*\(\d+\))?$/i.test(
    parsedStem
  );
  if (!idPart && !cleanPreferredName && looksGenericOnly) {
    return filePath;
  }
  const baseCore = idPart ? `${idPart}_${namePart}` : namePart;
  const withEye = eyePart ? `${baseCore}_${eyePart}` : baseCore;
  const targetBase = sanitizeFilePart(withEye).replace(/\s+/g, "_");
  let candidate = path.join(parsed.dir, `${targetBase}${parsed.ext}`);
  let i = 1;
  while (await exists(candidate)) {
    candidate = path.join(parsed.dir, `${targetBase}_${i}${parsed.ext}`);
    i += 1;
  }
  if (path.resolve(candidate) === path.resolve(filePath)) return filePath;
  await rename(filePath, candidate);
  return candidate;
}

function isLockWaitError(error: any): boolean {
  const message = String(error?.message ?? "").toLowerCase();
  const code = String(error?.code ?? "").toUpperCase();
  return (
    code === "ER_LOCK_WAIT_TIMEOUT" ||
    message.includes("lock wait timeout exceeded") ||
    message.includes("deadlock found")
  );
}

async function prefixProcessedFileWithCode(
  processedDir: string,
  fileName: string | null | undefined,
  idCode: string
): Promise<string | null> {
  const baseFileName = String(fileName ?? "").trim();
  const normalizedCode = normalizeIdCode(idCode);
  if (!baseFileName || !normalizedCode) return null;
  if (baseFileName.startsWith(`${normalizedCode}_`)) return baseFileName;

  const sourcePath = path.join(processedDir, baseFileName);
  if (!(await exists(sourcePath))) return null;

  const prefixedBaseName = `${normalizedCode}_${baseFileName}`;
  const parsed = path.parse(prefixedBaseName);
  let targetPath = path.join(processedDir, prefixedBaseName);
  let i = 1;
  while (await exists(targetPath)) {
    targetPath = path.join(processedDir, `${parsed.name}_${i}${parsed.ext}`);
    i += 1;
  }

  await rename(sourcePath, targetPath);
  return path.basename(targetPath);
}

async function resolvePatientByIds(conn: mysql.Connection, candidates: string[]): Promise<number | null> {
  const expanded = candidates.flatMap((candidate) => {
    const raw = String(candidate ?? "").trim();
    const normalized = normalizeIdCode(raw);
    return [raw, normalized].filter(Boolean);
  });
  const unique = Array.from(new Set(expanded));
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
  cfg: BlackIceOcrLinkOptions,
  psmOverride?: number
): Promise<string> {
  const tmpBase = await mkdtemp(path.join(os.tmpdir(), "blackice-ocr-"));
  const inputPath = path.join(tmpBase, fileName || "input.jpg");
  const outputBase = path.join(tmpBase, "ocr");
  const outputTxt = `${outputBase}.txt`;
  try {
    await writeFile(inputPath, image);
    const psm = Math.max(3, Math.min(13, Number(psmOverride ?? cfg.psm)));
    const args = [inputPath, outputBase, "-l", cfg.lang, "--psm", String(psm)];
    await execFile(cfg.tesseractPath, args, { windowsHide: true, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
    const text = await readFile(outputTxt, "utf8");
    return String(text ?? "").trim();
  } finally {
    await rm(tmpBase, { recursive: true, force: true }).catch(() => undefined);
  }
}

function parseOcrTsv(input: string): OcrTsvRow[] {
  const rows: OcrTsvRow[] = [];
  const lines = String(input ?? "").split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split("\t");
    if (cols.length < 12) continue;
    const text = String(cols[11] ?? "").trim();
    if (!text) continue;
    rows.push({
      left: Number(cols[6] ?? 0),
      top: Number(cols[7] ?? 0),
      conf: Number(cols[10] ?? -1),
      text,
      block: Number(cols[2] ?? 0),
      paragraph: Number(cols[3] ?? 0),
      line: Number(cols[4] ?? 0),
    });
  }
  return rows;
}

function extractStrictHeaderIdFromTsv(rows: OcrTsvRow[]): string {
  const topBand = rows.filter((r) => r.top <= 420 && r.conf >= 0);
  if (topBand.length === 0) return "";

  const scanForId = (scope: OcrTsvRow[]): string => {
    const lineMap = new Map<string, OcrTsvRow[]>();
    for (const row of scope) {
      const key = `${row.block}-${row.paragraph}-${row.line}`;
      if (!lineMap.has(key)) lineMap.set(key, []);
      lineMap.get(key)!.push(row);
    }

    for (const [, lineRowsRaw] of lineMap) {
      const lineRows = [...lineRowsRaw].sort((a, b) => a.left - b.left);
      const lineText = lineRows.map((r) => r.text).join(" ");
      if (!/\b(id|ld|i\s*d)\b/i.test(lineText)) continue;

      const direct = lineText.match(/(?:\bID\b|\bLD\b|\bI\s*D\b)\s*[:\-]?\s*(\d{6})\b/i)?.[1] ?? "";
      const normalizedDirect = normalizeIdCode(direct);
      if (normalizedDirect) return normalizedDirect;

      const idTokenIndex = lineRows.findIndex((r) => /^(id|ld|i\s*d)$/i.test(r.text));
      if (idTokenIndex >= 0) {
        for (let i = idTokenIndex + 1; i < lineRows.length; i++) {
          const candidate = lineRows[i].text.match(/\b\d{6}\b/)?.[0] ?? "";
          const normalized = normalizeIdCode(candidate);
          if (normalized) return normalized;
        }
      }
    }
    return "";
  };

  // First priority: rows under anchor titles (OCULUS/PENTACAM and middle layouts).
  const anchorLines = new Map<string, OcrTsvRow[]>();
  for (const row of topBand) {
    const key = `${row.block}-${row.paragraph}-${row.line}`;
    if (!anchorLines.has(key)) anchorLines.set(key, []);
    anchorLines.get(key)!.push(row);
  }
  let anchorTop = Number.POSITIVE_INFINITY;
  for (const [, lineRowsRaw] of anchorLines) {
    const lineRows = [...lineRowsRaw].sort((a, b) => a.left - b.left);
    const text = lineRows.map((r) => r.text).join(" ");
    if (
      (/\boculus\b/i.test(text) && /\bpentacam\b/i.test(text)) ||
      /\benhanced\b/i.test(text) ||
      /\bectasia\b/i.test(text) ||
      /\btopometric\b/i.test(text) ||
      /\bkc[-\s]*staging\b/i.test(text) ||
      /\b4\s*maps\b/i.test(text)
    ) {
      anchorTop = Math.min(anchorTop, lineRows[0]?.top ?? Number.POSITIVE_INFINITY);
    }
  }
  if (Number.isFinite(anchorTop)) {
    const oculusScope = topBand.filter((r) => r.top >= anchorTop && r.top <= anchorTop + 240);
    const anchored = scanForId(oculusScope);
    if (anchored) return anchored;
    // Fallback 1: in many layouts, ID row is between "First Name" and "Date of Birth".
    const byLine = new Map<string, OcrTsvRow[]>();
    for (const r of oculusScope) {
      const key = `${r.block}-${r.paragraph}-${r.line}`;
      if (!byLine.has(key)) byLine.set(key, []);
      byLine.get(key)!.push(r);
    }
    const orderedLines = Array.from(byLine.values())
      .map((lineRowsRaw) => [...lineRowsRaw].sort((a, b) => a.left - b.left))
      .sort((a, b) => (a[0]?.top ?? 0) - (b[0]?.top ?? 0));
    const firstNameTop = orderedLines.find((lineRows) =>
      /\bfirst\s*name\b/i.test(lineRows.map((r) => r.text).join(" "))
    )?.[0]?.top;
    const birthTop = orderedLines.find((lineRows) =>
      /\b(date\s*of\s*birth|birth|dob)\b/i.test(lineRows.map((r) => r.text).join(" "))
    )?.[0]?.top;
    if (Number.isFinite(firstNameTop) && Number.isFinite(birthTop) && Number(birthTop) > Number(firstNameTop)) {
      for (const lineRows of orderedLines) {
        const y = lineRows[0]?.top ?? 0;
        if (y <= Number(firstNameTop) || y >= Number(birthTop)) continue;
        const lineText = lineRows.map((r) => r.text).join(" ");
        const tokens = lineText.match(/\b\d{6}\b/g) ?? [];
        for (const token of tokens) {
          const normalized = normalizeIdCode(token);
          if (normalized) return normalized;
        }
      }
    }

    // Fallback 2: choose first plausible ID-length token from early rows under the title.
    for (const lineRows of orderedLines) {
      const lineText = lineRows.map((r) => r.text).join(" ");
      if (/\b(date|birth|exam|time|eye|right|left)\b/i.test(lineText)) continue;
      const tokens = lineText.match(/\b\d{6}\b/g) ?? [];
      for (const token of tokens) {
        const normalized = normalizeIdCode(token);
        if (normalized) return normalized;
      }
    }
  }

  const fallback = scanForId(topBand);
  if (fallback) return fallback;

  return "";
}

async function runOcrTsvFromBuffer(
  image: Buffer,
  fileName: string,
  cfg: BlackIceOcrLinkOptions,
  psmOverride?: number
): Promise<OcrTsvRow[]> {
  const tmpBase = await mkdtemp(path.join(os.tmpdir(), "blackice-ocr-tsv-"));
  const inputPath = path.join(tmpBase, fileName || "input.jpg");
  const outputBase = path.join(tmpBase, "ocr");
  const outputTsv = `${outputBase}.tsv`;
  try {
    await writeFile(inputPath, image);
    const psm = Math.max(3, Math.min(13, Number(psmOverride ?? cfg.psm)));
    const args = [inputPath, outputBase, "-l", cfg.lang, "--psm", String(psm), "tsv"];
    await execFile(cfg.tesseractPath, args, { windowsHide: true, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
    const text = await readFile(outputTsv, "utf8");
    return parseOcrTsv(text);
  } finally {
    await rm(tmpBase, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function renameFileWithExtractedId(
  filePath: string,
  ocrText: string
): Promise<string | null> {
  const labeled = extractLabeledIdCandidatesFromText(ocrText);
  const idCode = normalizeIdCode(labeled[0] ?? "");
  if (!idCode) return null;
  const parsed = path.parse(filePath);
  if (parsed.base.startsWith(`${idCode}_`)) return parsed.base;

  let candidate = path.join(parsed.dir, `${idCode}_${parsed.base}`);
  let i = 1;
  while (await exists(candidate)) {
    candidate = path.join(parsed.dir, `${idCode}_${parsed.name}_${i}${parsed.ext}`);
    i += 1;
  }
  await rename(filePath, candidate);
  return path.basename(candidate);
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

    console.log(
      `[blackice-import] Watching ${cfg.sourceDir} every ${cfg.pollIntervalMs}ms (source -> ${cfg.processedDir})`
    );

    let busy = false;
    const runCycle = async () => {
      if (busy) return;
      if (blackIceDbCycleBusy) return;
      busy = true;
      blackIceDbCycleBusy = true;
      try {
        const now = Date.now();
        const entries = await readdir(cfg.sourceDir, { withFileTypes: true });
        const fileNames = entries
          .filter((entry) => {
            if (!entry.isFile() || !IMPORTABLE_IMAGE_EXT.test(entry.name)) return false;
            const n = entry.name;
            if (n.startsWith("IMPORTED_")) return false;
            if (n.startsWith("FAILED_")) return false;
            return true;
          })
          .map((entry) => entry.name)
          .sort((a, b) => a.localeCompare(b))
          .slice(0, cfg.maxFilesPerCycle);
        if (fileNames.length > 0) {
          console.log(`[blackice-import] cycle candidates=${fileNames.length} source=${cfg.sourceDir}`);
        }

        for (const fileName of fileNames) {
          const fullPath = path.join(cfg.sourceDir, fileName);
          const fileInfo = await stat(fullPath).catch(() => null);
          if (!fileInfo?.isFile()) continue;
          if (now - Number(fileInfo.mtimeMs || 0) < cfg.minFileAgeMs) continue;

          let fileData: Buffer | null = null;
          try {
            fileData = await readFile(fullPath);
            if (fileData.length === 0) {
              throw new Error("File is empty");
            }
            const documentId = path.parse(fileName).name.slice(0, 255);
            const mimeType = guessMimeType(fileName);
            const dbFileName = fileName.slice(0, 255);
            const uploadId = await withDb(async (conn) => {
              const [insertResult] = await conn.query(
                `INSERT INTO blackice_uploads
                 (document_id, file_name, mime_type, file_data, source_printer)
                 VALUES (?, ?, ?, ?, ?)`,
                [documentId, dbFileName, mimeType, fileData, cfg.sourcePrinter]
              );
              return Number((insertResult as any)?.insertId ?? 0);
            });

            let importCode = "";
            const ocrCfg = getBlackIceOcrLinkOptions();
            if (ocrCfg.enabled) {
              try {
                const psmCandidates = Array.from(new Set([4, ocrCfg.psm]));
                for (const psm of psmCandidates) {
                  const tsvRows = await runOcrTsvFromBuffer(fileData, fileName, ocrCfg, psm);
                  const renameCode = extractStrictHeaderIdFromTsv(tsvRows);
                  if (renameCode) {
                    importCode = renameCode;
                    break;
                  }
                }
              } catch {
                // Keep import fast/resilient; OCR-based naming is best-effort.
              }
            }

            // Strict rule: only explicit header ID can be used as ID prefix.
            // If ID is not extracted, keep filename-based name/eye rename without any ID prefix.
            const renamedPath = await renameToPatientIdentity(fullPath, importCode, undefined, undefined);
            const movedPath =
              path.resolve(path.dirname(renamedPath)) === path.resolve(cfg.processedDir)
                ? renamedPath
                : await moveToDirAvoidingOverwrite(renamedPath, cfg.processedDir);
            const movedFileName = path.basename(movedPath).slice(0, 255);
            if (uploadId > 0 && movedFileName && movedFileName !== dbFileName) {
              await withDb((conn) =>
                conn.query("UPDATE blackice_uploads SET file_name = ?, document_id = ? WHERE id = ?", [
                  movedFileName,
                  path.parse(movedFileName).name.slice(0, 255),
                  uploadId,
                ])
              );
            }
            console.log(`[blackice-import] Imported ${fileName}`);
          } catch (error: any) {
            const reason = String(error?.message ?? "unknown error");
            if (isLockWaitError(error)) {
              try {
                const ocrCfg = getBlackIceOcrLinkOptions();
                if (ocrCfg.enabled && fileData && fileData.length > 0) {
                  const tsvRows = await runOcrTsvFromBuffer(fileData, fileName, ocrCfg, 4);
                  const strictCode = extractStrictHeaderIdFromTsv(tsvRows);
                  if (strictCode) {
                    const renamedPath = await renameToPatientIdentity(fullPath, strictCode, undefined, undefined);
                    const renamed = path.basename(renamedPath);
                    console.log(`[blackice-import] Renamed by OCR on lock timeout: ${fileName} -> ${renamed}`);
                  }
                }
              } catch {
                // Keep import loop resilient; rename fallback is best-effort only.
              }
              console.warn(`[blackice-import] Lock timeout on ${fileName}; will retry next cycle.`);
              continue;
            }
            console.error(`[blackice-import] Failed ${fileName}: ${reason}`);
            await renameWithPrefix(fullPath, "FAILED").catch(() => undefined);
          }
        }
      } catch (error: any) {
        console.error("[blackice-import] Cycle error:", String(error?.message ?? error));
      } finally {
        blackIceDbCycleBusy = false;
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
    const importCfg = getBlackIceFolderImportOptions();
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
      if (blackIceDbCycleBusy) return;
      busy = true;
      blackIceDbCycleBusy = true;
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
            try {
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

              const labeledOcrCandidates = extractLabeledIdCandidatesFromText(ocrText);
              const ocrCandidates = labeledOcrCandidates.length > 0 ? labeledOcrCandidates : extractIdCandidatesFromText(ocrText);
              const candidates = Array.from(
                new Set([
                  ...labeledOcrCandidates,
                  ...extractIdCandidatesFromText(row.document_id),
                  ...extractIdCandidatesFromText(row.file_name ?? ""),
                  ...ocrCandidates,
                  ...extractIdCandidatesFromText(row.plain_text ?? ""),
                ])
              );
              if (candidates.length === 0) continue;

              const renameCode = normalizeIdCode(labeledOcrCandidates[0] ?? "");
              if (renameCode && row.file_name) {
                const renamedFile = await prefixProcessedFileWithCode(importCfg.processedDir, row.file_name, renameCode);
                if (renamedFile && renamedFile !== row.file_name) {
                  await conn.query("UPDATE blackice_uploads SET file_name = ?, document_id = ? WHERE id = ?", [
                    renamedFile,
                    path.parse(renamedFile).name.slice(0, 255),
                    row.id,
                  ]);
                }
              }

              const patientId = await resolvePatientByIds(conn, candidates);
              if (!patientId) continue;

              await conn.query("UPDATE blackice_uploads SET patient_id = ? WHERE id = ? AND patient_id IS NULL", [
                patientId,
                row.id,
              ]);
              console.log(`[blackice-ocr] Linked upload ${row.id} -> patient_id=${patientId}`);
            } catch (error: any) {
              if (isLockWaitError(error)) {
                console.warn(`[blackice-ocr] Lock timeout on upload ${row.id}; will retry next cycle.`);
                continue;
              }
              throw error;
            }
          }
        });
      } catch (error: any) {
        console.error("[blackice-ocr] Cycle error:", String(error?.message ?? error));
      } finally {
        blackIceDbCycleBusy = false;
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
      if (blackIceDbCycleBusy) {
        res.status(409).json({ ok: false, error: "Black Ice worker is busy, retry shortly" });
        return;
      }
      blackIceDbCycleBusy = true;
      const cfg = getBlackIceOcrLinkOptions();
      const importCfg = getBlackIceFolderImportOptions();
      if (!cfg.enabled) {
        blackIceDbCycleBusy = false;
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
          const labeledOcrCandidates = extractLabeledIdCandidatesFromText(ocrText);
          const ocrCandidates = labeledOcrCandidates.length > 0 ? labeledOcrCandidates : extractIdCandidatesFromText(ocrText);
          const candidates = Array.from(
            new Set([
              ...labeledOcrCandidates,
              ...extractIdCandidatesFromText(row.document_id),
              ...extractIdCandidatesFromText(row.file_name ?? ""),
              ...ocrCandidates,
              ...extractIdCandidatesFromText(row.plain_text ?? ""),
            ])
          );
          if (candidates.length === 0) continue;

          const renameCode = normalizeIdCode(labeledOcrCandidates[0] ?? "");
          if (renameCode && row.file_name) {
            const renamedFile = await prefixProcessedFileWithCode(importCfg.processedDir, row.file_name, renameCode);
            if (renamedFile && renamedFile !== row.file_name) {
              await conn.query("UPDATE blackice_uploads SET file_name = ?, document_id = ? WHERE id = ?", [
                renamedFile,
                path.parse(renamedFile).name.slice(0, 255),
                row.id,
              ]);
            }
          }

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
    } finally {
      blackIceDbCycleBusy = false;
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
