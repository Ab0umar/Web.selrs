import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);
const DIR = process.argv[2] || "E:/Web.selrs.cc/Pentacam";
const LIMIT = Math.max(0, Number(process.argv[3] || "0"));
const OFFSET = Math.max(0, Number(process.argv[4] || "0"));
const TESS = process.env.BLACKICE_OCR_TESSERACT_PATH || "C:/Program Files/Tesseract-OCR/tesseract.exe";
const EXT = /\.(jpg|jpeg|png|webp|bmp|tif|tiff)$/i;

type Row = {
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

function parseTsv(tsv: string): Row[] {
  const rows: Row[] = [];
  const lines = String(tsv || "").split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split("\t");
    if (cols.length < 12) continue;
    const text = String(cols[11] || "").trim();
    if (!text) continue;
    rows.push({
      left: Number(cols[6] || 0),
      top: Number(cols[7] || 0),
      conf: Number(cols[10] || -1),
      text,
      block: Number(cols[2] || 0),
      paragraph: Number(cols[3] || 0),
      line: Number(cols[4] || 0),
    });
  }
  return rows;
}

async function ocrTsv(filePath: string, psm: number): Promise<Row[]> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pentacam-audit-"));
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

function strictHeaderId(rows: Row[]): string {
  const topBand = rows.filter((r) => r.top <= 420 && r.conf >= 0);
  if (topBand.length === 0) return "";

  const scanForId = (scope: Row[]): string => {
    const lineMap = new Map<string, Row[]>();
    for (const row of scope) {
      const key = `${row.block}-${row.paragraph}-${row.line}`;
      if (!lineMap.has(key)) lineMap.set(key, []);
      lineMap.get(key)!.push(row);
    }

    for (const [, raw] of lineMap) {
      const line = [...raw].sort((a, b) => a.left - b.left);
      const txt = line.map((r) => r.text).join(" ");
      if (!/\b(id|ld|i\s*d)\b/i.test(txt)) continue;

      const direct = txt.match(/(?:\bID\b|\bLD\b|\bI\s*D\b)\s*[:\-]?\s*(\d{6})\b/i)?.[1] || "";
      const n = normalizeIdCode(direct);
      if (n) return n;

      const idIdx = line.findIndex((r) => /^(id|ld|i\s*d)$/i.test(r.text));
      if (idIdx >= 0) {
        for (let i = idIdx + 1; i < line.length; i++) {
          const d = line[i].text.match(/\b\d{6}\b/)?.[0] || "";
          const nn = normalizeIdCode(d);
          if (nn) return nn;
        }
      }
    }
    return "";
  };

  const lineMap = new Map<string, Row[]>();
  for (const row of topBand) {
    const key = `${row.block}-${row.paragraph}-${row.line}`;
    if (!lineMap.has(key)) lineMap.set(key, []);
    lineMap.get(key)!.push(row);
  }
  let anchorTop = Number.POSITIVE_INFINITY;
  for (const [, raw] of lineMap) {
    const line = [...raw].sort((a, b) => a.left - b.left);
    const txt = line.map((r) => r.text).join(" ");
    if (
      (/\boculus\b/i.test(txt) && /\bpentacam\b/i.test(txt)) ||
      /\benhanced\b/i.test(txt) ||
      /\bectasia\b/i.test(txt) ||
      /\btopometric\b/i.test(txt) ||
      /\bkc[-\s]*staging\b/i.test(txt) ||
      /\b4\s*maps\b/i.test(txt)
    ) {
      anchorTop = Math.min(anchorTop, line[0]?.top ?? Number.POSITIVE_INFINITY);
    }
  }
  if (Number.isFinite(anchorTop)) {
    const scoped = topBand.filter((r) => r.top >= anchorTop && r.top <= anchorTop + 240);
    const anchored = scanForId(scoped);
    if (anchored) return anchored;
    const byLine = new Map<string, Row[]>();
    for (const r of scoped) {
      const key = `${r.block}-${r.paragraph}-${r.line}`;
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

function fileId(name: string): string {
  const stem = path.parse(name).name;
  const d = stem.match(/^(\d{3,12})_/i)?.[1] || "";
  return normalizeIdCode(d);
}

async function main() {
  const entries = await fs.readdir(DIR, { withFileTypes: true });
  const allFiles = entries
    .filter((e) => e.isFile() && EXT.test(e.name) && !e.name.startsWith("NOID_"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
  const paged = allFiles.slice(OFFSET);
  const files = LIMIT > 0 ? paged.slice(0, LIMIT) : paged;

  let checked = 0;
  let resolved = 0;
  let mismatched = 0;
  let unreadable = 0;
  let failed = 0;

  const mismatchRows: Array<{file: string; fileId: string; ocrId: string}> = [];

  for (let i = 0; i < files.length; i++) {
    const name = files[i];
    const full = path.join(DIR, name);
    const fid = fileId(name);
    if (!fid) continue;
    checked++;

    try {
      let rows = await ocrTsv(full, 4);
      let oid = strictHeaderId(rows);
      if (!oid) {
        rows = await ocrTsv(full, 6);
        oid = strictHeaderId(rows);
      }
      if (!oid) {
        unreadable++;
        continue;
      }
      resolved++;
      if (oid !== fid) {
        mismatched++;
        mismatchRows.push({ file: name, fileId: fid, ocrId: oid });
      }

      if ((i + 1) % 50 === 0) {
        console.log(`progress ${i + 1}/${files.length} checked=${checked} resolved=${resolved} mismatched=${mismatched} unreadable=${unreadable}`);
      }
    } catch {
      failed++;
    }
  }

  const reportPath = path.join(DIR, "_mismatch_report.json");
  await fs.writeFile(
    reportPath,
    JSON.stringify(
      { offset: OFFSET, limit: LIMIT || "all", checked, resolved, mismatched, unreadable, failed, sample: mismatchRows.slice(0, 5000) },
      null,
      2
    ),
    "utf8"
  );

  console.log(`done checked=${checked} resolved=${resolved} mismatched=${mismatched} unreadable=${unreadable} failed=${failed}`);
  console.log(`report=${reportPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
