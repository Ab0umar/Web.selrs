import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);
const DIR = process.argv[2] || "E:/Web.selrs.cc/Pentacam";
const LIMIT = Math.max(0, Number(process.argv[3] || "0"));
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
  const topBand = rows.filter((r) => r.top <= 420 && r.conf >= 0);
  if (topBand.length === 0) return "";

  const scanForId = (scope: Row[]): string => {
    const byLine = new Map<string, Row[]>();
    for (const r of scope) {
      const key = `${r.block}-${r.par}-${r.line}`;
      if (!byLine.has(key)) byLine.set(key, []);
      byLine.get(key)!.push(r);
    }

    for (const [, lineRowsRaw] of byLine) {
      const lineRows = [...lineRowsRaw].sort((a, b) => a.left - b.left);
      const words = lineRows.map((r) => r.text);
      const joined = words.join(" ");
      if (!/\b(id|ld|i\s*d)\b/i.test(joined)) continue;

      const rx = joined.match(/(?:\bID\b|\bLD\b|\bI\s*D\b)\s*[:\-]?\s*(\d{6})\b/i);
      if (rx?.[1]) {
        const n = normalizeIdCode(rx[1]);
        if (n) return n;
      }

      const idIdx = lineRows.findIndex((r) => /^(id|ld|i\s*d)$/i.test(r.text));
      if (idIdx >= 0) {
        for (let i = idIdx + 1; i < lineRows.length; i++) {
          const d = lineRows[i].text.match(/\b\d{6}\b/)?.[0] || "";
          const n = normalizeIdCode(d);
          if (n) return n;
        }
      }
    }
    return "";
  };

  const lineMap = new Map<string, Row[]>();
  for (const r of topBand) {
    const key = `${r.block}-${r.par}-${r.line}`;
    if (!lineMap.has(key)) lineMap.set(key, []);
    lineMap.get(key)!.push(r);
  }

  let anchorTop = Number.POSITIVE_INFINITY;
  for (const [, lineRowsRaw] of lineMap) {
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
    const scope = topBand.filter((r) => r.top >= anchorTop && r.top <= anchorTop + 240);
    const anchored = scanForId(scope);
    if (anchored) return anchored;
    const byLine = new Map<string, Row[]>();
    for (const r of scope) {
      const key = `${r.block}-${r.par}-${r.line}`;
      if (!byLine.has(key)) byLine.set(key, []);
      byLine.get(key)!.push(r);
    }
    const orderedLines = Array.from(byLine.values())
      .map((lineRowsRaw) => [...lineRowsRaw].sort((a, b) => a.left - b.left))
      .sort((a, b) => (a[0]?.top ?? 0) - (b[0]?.top ?? 0));
    for (const lineRows of orderedLines) {
      const lineText = lineRows.map((r) => r.text).join(" ");
      if (/\b(date|birth|exam|time|eye|right|left)\b/i.test(lineText)) continue;
      const tokens = lineText.match(/\b\d{6}\b/g) ?? [];
      for (const token of tokens) {
        const n = normalizeIdCode(token);
        if (n) return n;
      }
    }
  }

  return scanForId(topBand);
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function run() {
  const entries = await fs.readdir(DIR, { withFileTypes: true });
  const allFiles = entries
    .filter((e) => e.isFile() && EXT.test(e.name) && e.name.startsWith("NOID_"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
  const files = LIMIT > 0 ? allFiles.slice(0, LIMIT) : allFiles;

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

  console.log(`done total=${files.length} recovered=${recovered} unchanged=${unchanged} failed=${failed} limit=${LIMIT || "all"}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
