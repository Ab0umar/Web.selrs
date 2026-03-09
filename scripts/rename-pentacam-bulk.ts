import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = process.argv[2] || "E:/Web.selrs.cc/Pentacam";
const TESS = process.env.BLACKICE_OCR_TESSERACT_PATH || "C:/Program Files/Tesseract-OCR/tesseract.exe";
const EXT = /\.(jpg|jpeg|png|webp|bmp|tif|tiff)$/i;
type OcrTsvRow = {
  left: number;
  top: number;
  conf: number;
  text: string;
  block: number;
  paragraph: number;
  line: number;
};

function normalizeIdCode(value: string): string {
  const m = String(value || "").match(/\b\d{3,12}\b/);
  if (!m) return "";
  const raw = m[0];
  return raw.length > 4 ? raw.slice(2) : raw;
}

function sanitizeName(v: string): string {
  const stop = new Set([
    "maps","map","refr","refractive","topometric","enhanced","ectasia","large",
    "pentacam","oculus","exam","date","time","right","left","od","os","ou","id"
  ]);
  return String(v || "")
    .replace(/[\[\]{}|]/g, " ")
    .replace(/[^A-Za-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .filter((w) => !stop.has(w.toLowerCase()))
    .slice(0, 4)
    .join("_");
}

function extractEye(text: string): string {
  const t = String(text || "");
  const m = t.match(/(?:\b|[^A-Za-z])(?:eye|jeye)?\s*[:\-]?\s*\[?\s*(right|left|od|os|ou)\b/i) || t.match(/\b(OD|OS|OU|Right|Left)\b/i);
  const raw = String(m?.[1] || "").toUpperCase();
  if (raw === "RIGHT") return "OD";
  if (raw === "LEFT") return "OS";
  if (["OD","OS","OU"].includes(raw)) return raw;
  return "";
}

function extractFromFileName(base: string): { id: string; name: string; eye: string } {
  const stem = path.parse(base).name;
  const idLead = normalizeIdCode((stem.match(/^\s*(\d{3,12})[\s_-]*/) || [])[1] || "");
  const idAny = normalizeIdCode((stem.match(/\b(\d{3,12})\b/) || [])[1] || "");
  const id = idLead || idAny;
  const eye = extractEye(stem);

  const noDates = stem
    .replace(/\b\d{8}\b/g, " ")
    .replace(/\b\d{6}\b/g, " ")
    .replace(/\b\d{3,12}\b/g, " ")
    .replace(/[_-]+/g, " ");
  const name = sanitizeName(noDates);
  return { id, name, eye };
}

async function runOcrTsv(filePath: string, psm: number): Promise<OcrTsvRow[]> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pentacam-bulk-"));
  const out = path.join(tmp, "ocr");
  try {
    await execFileAsync(
      TESS,
      [filePath, out, "-l", "eng", "--psm", String(psm), "tsv"],
      { windowsHide: true, timeout: 120000, maxBuffer: 12 * 1024 * 1024 }
    );
    const tsv = await fs.readFile(`${out}.tsv`, "utf8");
    const rows: OcrTsvRow[] = [];
    const lines = String(tsv ?? "").split(/\r?\n/);
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
  } catch {
    return [];
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

function extractStrictIdFromTsv(rows: OcrTsvRow[]): string {
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
      const n = normalizeIdCode(direct);
      if (n) return n;
      const idTokenIndex = lineRows.findIndex((r) => /^(id|ld|i\s*d)$/i.test(r.text));
      if (idTokenIndex >= 0) {
        for (let i = idTokenIndex + 1; i < lineRows.length; i++) {
          const candidate = lineRows[i].text.match(/\b\d{6}\b/)?.[0] ?? "";
          const nn = normalizeIdCode(candidate);
          if (nn) return nn;
        }
      }
    }
    return "";
  };

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
  }

  return scanForId(topBand);
}

async function exists(p: string) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function main() {
  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile() && EXT.test(e.name)).map((e) => e.name);
  let renamed = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    const name = files[i];
    const full = path.join(ROOT, name);
    const ext = path.extname(name).toLowerCase();

    try {
      const fromName = extractFromFileName(name);
      let recoveredId = "";
      if (!fromName.id) {
        const rows4 = await runOcrTsv(full, 4);
        recoveredId = extractStrictIdFromTsv(rows4);
        if (!recoveredId) {
          const rows6 = await runOcrTsv(full, 6);
          recoveredId = extractStrictIdFromTsv(rows6);
        }
      }
      const id = fromName.id || recoveredId || "NOID";
      const person = fromName.name || "UNKNOWN";
      const eye = fromName.eye || "ODOS";
      const targetBase = `${id}_${person}_${eye}`.replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
      let target = path.join(ROOT, `${targetBase}${ext}`);
      if (path.resolve(target) === path.resolve(full)) { skipped++; continue; }
      let c = 1;
      while (await exists(target)) {
        target = path.join(ROOT, `${targetBase}_${c}${ext}`);
        c++;
      }
      await fs.rename(full, target);
      renamed++;
      if ((i + 1) % 50 === 0) {
        console.log(`progress ${i + 1}/${files.length} renamed=${renamed} skipped=${skipped} failed=${failed}`);
      }
    } catch {
      failed++;
    }
  }

  console.log(`done total=${files.length} renamed=${renamed} skipped=${skipped} failed=${failed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
