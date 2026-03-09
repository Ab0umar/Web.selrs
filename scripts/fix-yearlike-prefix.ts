import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);
const DIR = process.argv[2] || "E:/Web.selrs.cc/Pentacam";
const TESS = process.env.BLACKICE_OCR_TESSERACT_PATH || "C:/Program Files/Tesseract-OCR/tesseract.exe";
const EXT = /\.(jpg|jpeg|png|webp|bmp|tif|tiff)$/i;

type Row = { left:number; top:number; conf:number; text:string; block:number; paragraph:number; line:number };

function normalizeIdCode(value: string): string {
  const m = String(value || "").match(/\b\d{3,12}\b/);
  if (!m) return "";
  const raw = m[0];
  return raw.length > 4 ? raw.slice(2) : raw;
}

async function ocrTsv(filePath: string, psm: number): Promise<Row[]> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "fix-yearlike-"));
  const out = path.join(tmp, "ocr");
  try {
    await execFileAsync(TESS, [filePath, out, "-l", "eng", "--psm", String(psm), "tsv"], { windowsHide: true, timeout: 120000, maxBuffer: 12 * 1024 * 1024 });
    const tsv = await fs.readFile(`${out}.tsv`, "utf8");
    const rows: Row[] = [];
    const lines = tsv.split(/\r?\n/);
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]; if (!line) continue;
      const c = line.split("\t"); if (c.length < 12) continue;
      const text = String(c[11] || "").trim(); if (!text) continue;
      rows.push({ left:Number(c[6]||0), top:Number(c[7]||0), conf:Number(c[10]||-1), text, block:Number(c[2]||0), paragraph:Number(c[3]||0), line:Number(c[4]||0) });
    }
    return rows;
  } catch {
    return [];
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

function strictId(rows: Row[]): string {
  const topBand = rows.filter(r => r.top <= 420 && r.conf >= 0);
  if (!topBand.length) return "";

  const scan = (scope: Row[]): string => {
    const map = new Map<string, Row[]>();
    for (const r of scope) {
      const k = `${r.block}-${r.paragraph}-${r.line}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    for (const [,raw] of map) {
      const line = [...raw].sort((a,b)=>a.left-b.left);
      const txt = line.map(r=>r.text).join(" ");
      if (!/\b(id|ld|i\s*d)\b/i.test(txt)) continue;
      const direct = txt.match(/(?:\bID\b|\bLD\b|\bI\s*D\b)\s*[:\-]?\s*(\d{6})\b/i)?.[1] || "";
      const n = normalizeIdCode(direct); if (n) return n;
      const idx = line.findIndex(r => /^(id|ld|i\s*d)$/i.test(r.text));
      if (idx >= 0) {
        for (let i = idx + 1; i < line.length; i++) {
          const d = line[i].text.match(/\b\d{6}\b/)?.[0] || "";
          const nn = normalizeIdCode(d); if (nn) return nn;
        }
      }
    }
    return "";
  };

  const lineMap = new Map<string, Row[]>();
  for (const r of topBand) {
    const k = `${r.block}-${r.paragraph}-${r.line}`;
    if (!lineMap.has(k)) lineMap.set(k, []);
    lineMap.get(k)!.push(r);
  }
  let anchorTop = Number.POSITIVE_INFINITY;
  for (const [,raw] of lineMap) {
    const line = [...raw].sort((a,b)=>a.left-b.left);
    const txt = line.map(r=>r.text).join(" ");
    if ((/\boculus\b/i.test(txt) && /\bpentacam\b/i.test(txt)) || /\benhanced\b/i.test(txt) || /\bectasia\b/i.test(txt) || /\btopometric\b/i.test(txt) || /\bkc[-\s]*staging\b/i.test(txt) || /\b4\s*maps\b/i.test(txt)) {
      anchorTop = Math.min(anchorTop, line[0]?.top ?? Number.POSITIVE_INFINITY);
    }
  }
  if (Number.isFinite(anchorTop)) {
    const scope = topBand.filter(r => r.top >= anchorTop && r.top <= anchorTop + 240);
    const anchored = scan(scope);
    if (anchored) return anchored;
  }

  return scan(topBand);
}

async function exists(p: string){ try { await fs.access(p); return true; } catch { return false; } }

async function main(){
  const entries = await fs.readdir(DIR, { withFileTypes: true });
  const files = entries
    .filter(e => e.isFile() && EXT.test(e.name) && /^(19\d{2}|20\d{2})_/.test(e.name))
    .map(e => e.name)
    .sort((a,b)=>a.localeCompare(b));

  let fixed=0, unresolved=0, failed=0;
  for (let i=0;i<files.length;i++) {
    const name = files[i];
    const full = path.join(DIR, name);
    try {
      let rows = await ocrTsv(full, 4);
      let id = strictId(rows);
      if (!id) { rows = await ocrTsv(full, 6); id = strictId(rows); }
      if (!id) { unresolved++; continue; }

      const newName = name.replace(/^(19\d{2}|20\d{2})_/, `${id}_`);
      let target = path.join(DIR, newName);
      if (path.resolve(target) === path.resolve(full)) continue;
      let c = 1;
      const p = path.parse(newName);
      while (await exists(target)) { target = path.join(DIR, `${p.name}_${c}${p.ext}`); c++; }
      await fs.rename(full, target);
      fixed++;
      if ((i+1) % 25 === 0) console.log(`progress ${i+1}/${files.length} fixed=${fixed} unresolved=${unresolved} failed=${failed}`);
    } catch {
      failed++;
    }
  }

  console.log(`done total=${files.length} fixed=${fixed} unresolved=${unresolved} failed=${failed}`);
}

main().catch((e)=>{ console.error(e); process.exit(1); });
