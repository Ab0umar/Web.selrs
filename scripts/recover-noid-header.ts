import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);
const DIR = process.argv[2] || "E:/Web.selrs.cc/Pentacam";
const TESS = process.env.BLACKICE_OCR_TESSERACT_PATH || "C:/Program Files/Tesseract-OCR/tesseract.exe";
const EXT = /\.(jpg|jpeg|png|webp|bmp|tif|tiff)$/i;

type Row = {
  left: number;
  top: number;
  width: number;
  height: number;
  conf: number;
  text: string;
  block: number;
  par: number;
  line: number;
};

function normalizeIdCode(value: string): string {
  const m = String(value || "").match(/\b\d{3,12}\b/);
  if (!m) return "";
  const raw = m[0];
  return raw.length > 4 ? raw.slice(2) : raw;
}

function parseTsv(tsv: string): Row[] {
  const rows: Row[] = [];
  const lines = String(tsv || "").split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split("\t");
    if (cols.length < 12) continue;
    const txt = String(cols[11] || "").trim();
    if (!txt) continue;
    const top = Number(cols[7] || 0);
    const left = Number(cols[6] || 0);
    const conf = Number(cols[10] || -1);
    rows.push({
      left,
      top,
      width: Number(cols[8] || 0),
      height: Number(cols[9] || 0),
      conf,
      text: txt,
      block: Number(cols[2] || 0),
      par: Number(cols[3] || 0),
      line: Number(cols[4] || 0),
    });
  }
  return rows;
}

async function ocrTsv(filePath: string, psm: number): Promise<Row[]> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pentacam-tsv-"));
  const out = path.join(tmp, "ocr");
  try {
    await execFileAsync(TESS, [filePath, out, "-l", "eng", "--psm", String(psm), "tsv"], {
      windowsHide: true,
      timeout: 120000,
      maxBuffer: 12 * 1024 * 1024,
    });
    const tsv = await fs.readFile(`${out}.tsv`, "utf8");
    return parseTsv(tsv);
  } catch {
    return [];
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

function recoverIdFromRows(rows: Row[]): string {
  // Header area where Pentacam shows Last/First/ID/Eye
  const header = rows.filter((r) => r.left <= 560 && r.top <= 300 && r.conf >= 0);
  if (header.length === 0) return "";

  const byLine = new Map<string, Row[]>();
  for (const r of header) {
    const key = `${r.block}-${r.par}-${r.line}`;
    if (!byLine.has(key)) byLine.set(key, []);
    byLine.get(key)!.push(r);
  }

  // Prefer digits on a line containing ID label
  for (const [, lineRowsRaw] of byLine) {
    const lineRows = [...lineRowsRaw].sort((a, b) => a.left - b.left);
    const words = lineRows.map((r) => r.text);
    const joined = words.join(" ");
    if (!/\b(id|ld|i\s*d)\b/i.test(joined)) continue;

    // 1) direct regex from full line
    const rx = joined.match(/(?:\bID\b|\bLD\b|\bI\s*D\b)\s*[:\-]?\s*(\d{3,12})/i);
    if (rx?.[1]) {
      const n = normalizeIdCode(rx[1]);
      if (n) return n;
    }

    // 2) nearest numeric token to the right side of ID token
    const idIdx = lineRows.findIndex((r) => /^(id|ld|i\s*d)$/i.test(r.text));
    if (idIdx >= 0) {
      for (let i = idIdx + 1; i < lineRows.length; i++) {
        const d = lineRows[i].text.match(/\d{3,12}/)?.[0] || "";
        const n = normalizeIdCode(d);
        if (n) return n;
      }
    }

    // 3) fallback any numeric in line
    for (const w of words) {
      const d = w.match(/\d{3,12}/)?.[0] || "";
      const n = normalizeIdCode(d);
      if (n) return n;
    }
  }

  // Fallback: choose 6-digit number near left header (exclude obvious date/time)
  const numeric = header
    .map((r) => ({ ...r, d: r.text.match(/\d{3,12}/)?.[0] || "" }))
    .filter((r) => r.d)
    .filter((r) => !/^\d{8}$/.test(r.d)) // date
    .filter((r) => !/^\d{6}$/.test(r.d) || (r.left < 260 && r.top < 170)); // allow ID-like 6-digit only in top-left

  for (const r of numeric.sort((a, b) => a.top - b.top || a.left - b.left)) {
    const n = normalizeIdCode(r.d);
    if (n) return n;
  }

  return "";
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function run() {
  const entries = await fs.readdir(DIR, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && EXT.test(e.name) && e.name.startsWith("NOID_"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  let recovered = 0;
  let unchanged = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    const name = files[i];
    const full = path.join(DIR, name);
    try {
      let rows = await ocrTsv(full, 6);
      let id = recoverIdFromRows(rows);
      if (!id) {
        rows = await ocrTsv(full, 4);
        id = recoverIdFromRows(rows);
      }
      if (!id) {
        unchanged++;
        continue;
      }

      const newBase = name.replace(/^NOID_/, `${id}_`);
      let target = path.join(DIR, newBase);
      if (path.resolve(target) === path.resolve(full)) {
        unchanged++;
        continue;
      }
      let c = 1;
      const p = path.parse(newBase);
      while (await exists(target)) {
        target = path.join(DIR, `${p.name}_${c}${p.ext}`);
        c++;
      }
      await fs.rename(full, target);
      recovered++;

      if ((i + 1) % 50 === 0) {
        console.log(`progress ${i + 1}/${files.length} recovered=${recovered} unchanged=${unchanged} failed=${failed}`);
      }
    } catch {
      failed++;
    }
  }

  console.log(`done total=${files.length} recovered=${recovered} unchanged=${unchanged} failed=${failed}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
