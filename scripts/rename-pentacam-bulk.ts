import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = process.argv[2] || "E:/Web.selrs.cc/Pentacam";
const TESS = process.env.BLACKICE_OCR_TESSERACT_PATH || "C:/Program Files/Tesseract-OCR/tesseract.exe";
const EXT = /\.(jpg|jpeg|png|webp|bmp|tif|tiff)$/i;

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

async function runOcr(filePath: string, psm: number): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pentacam-bulk-"));
  const out = path.join(tmp, "ocr");
  try {
    await execFileAsync(TESS, [filePath, out, "-l", "eng", "--psm", String(psm)], { windowsHide: true, timeout: 120000, maxBuffer: 12 * 1024 * 1024 });
    return await fs.readFile(`${out}.txt`, "utf8");
  } catch {
    return "";
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

function extractFromOcr(txt: string): { id: string; name: string; eye: string } {
  const t = String(txt || "");
  const idRaw = (t.match(/\b(?:id|i\s*d|ld)\s*[:\-]?\s*(\d{3,12})\b/i) || [])[1] || "";
  const id = normalizeIdCode(idRaw);
  const lastRaw = (t.match(/(?:last\s*name|surname)\s*[:\-]?\s*([^\n\r]+)/i) || [])[1] || "";
  const firstRaw = (t.match(/(?:first\s*name|given\s*name)\s*[:\-]?\s*([^\n\r]+)/i) || [])[1] || "";
  const first = sanitizeName(String(firstRaw).split("|")[0] || "");
  const last = sanitizeName(String(lastRaw).split("|")[0] || "");
  const name = [first, last].filter(Boolean).join("_");
  const eye = extractEye(t);
  return { id, name, eye };
}

function finalNameParts(primary: {id:string;name:string;eye:string}, o4: {id:string;name:string;eye:string}, o6: {id:string;name:string;eye:string}) {
  const id = primary.id || o6.id || o4.id || "NOID";
  const name = primary.name || o4.name || o6.name || "UNKNOWN";
  const eye = primary.eye || o4.eye || o6.eye || "ODOS";
  return { id, name, eye };
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
      let o4 = { id: "", name: "", eye: "" };
      let o6 = { id: "", name: "", eye: "" };
      if (!fromName.id || !fromName.name || !fromName.eye) {
        const txt6 = await runOcr(full, 6);
        o6 = extractFromOcr(txt6);
        if (!fromName.name || !fromName.eye) {
          const txt4 = await runOcr(full, 4);
          o4 = extractFromOcr(txt4);
        }
      }
      const { id, name: person, eye } = finalNameParts(fromName, o4, o6);
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
