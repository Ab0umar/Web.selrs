import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

type PentacamRow = {
  id: number;
  patientId: number;
  patientCode: string | null;
  fullName: string | null;
  notes: string | null;
};

type PatientRow = {
  id: number;
  patientCode: string;
  fullName: string | null;
};

function normalizeNameText(input: string): string {
  return String(input ?? "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeName(input: string): string[] {
  return normalizeNameText(input)
    .split(" ")
    .map((v) => v.trim())
    .filter((v) => v.length >= 2);
}

function normalizePhoneticToken(token: string): string {
  const raw = normalizeNameText(token).replace(/\s+/g, "");
  if (!raw) return "";
  const arabicMap: Record<string, string> = {
    "ا": "a", "أ": "a", "إ": "a", "آ": "a", "ء": "",
    "ؤ": "w", "ئ": "y", "ب": "b", "ت": "t", "ث": "s",
    "ج": "g", "ح": "h", "خ": "kh", "د": "d", "ذ": "z",
    "ر": "r", "ز": "z", "س": "s", "ش": "sh", "ص": "s",
    "ض": "d", "ط": "t", "ظ": "z", "ع": "a", "غ": "g",
    "ف": "f", "ق": "k", "ك": "k", "ل": "l", "م": "m",
    "ن": "n", "ه": "h", "ة": "h", "و": "w", "ي": "y", "ى": "y",
  };
  const mapped = Array.from(raw)
    .map((ch) => arabicMap[ch] ?? ch)
    .join("")
    .toLowerCase()
    .replace(/ph/g, "f")
    .replace(/ch/g, "sh")
    .replace(/^ab[dt]e?l?/, "abd");
  return mapped
    .replace(/[aeiouyw]+/g, "")
    .replace(/(.)\1+/g, "$1")
    .replace(/[^a-z0-9]+/g, "");
}

function buildTokenSignatures(tokens: string[]): Set<string> {
  const out = new Set<string>();
  for (const token of tokens) {
    const s = normalizePhoneticToken(token);
    if (s.length >= 2) out.add(s);
  }
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const s = normalizePhoneticToken(`${tokens[i]}${tokens[i + 1]}`);
    if (s.length >= 3) out.add(s);
  }
  return out;
}

function extractNameFragment(fileName: string): string {
  const stem = path.parse(String(fileName ?? "")).name;
  const cleaned = stem
    .replace(/_(OD|OS)_\d{8}_\d{6}(?:_.+)?$/i, "")
    .replace(/_\d{8}_\d{6}(?:_.+)?$/i, "")
    .replace(/^\d{3,12}_/, "")
    .replace(/_/g, " ")
    .trim();
  return normalizeNameText(cleaned);
}

function pickByCodeAndName(fileName: string, candidates: PatientRow[]): PatientRow | null {
  const nameFragment = extractNameFragment(fileName);
  const fileTokenList = tokenizeName(nameFragment);
  const fileTokens = new Set(fileTokenList);
  const fileSignatures = buildTokenSignatures(fileTokenList);
  if (fileTokens.size < 2 && fileSignatures.size < 2) return null;

  const scored = candidates
    .map((patient) => {
      const name = String(patient.fullName ?? "").trim();
      const patientTokenList = tokenizeName(name);
      const patientTokens = new Set(patientTokenList);
      const patientSignatures = buildTokenSignatures(patientTokenList);
      let overlap = 0;
      for (const token of fileTokens) {
        if (patientTokens.has(token)) overlap += 1;
      }
      let sigOverlap = 0;
      for (const sig of fileSignatures) {
        if (patientSignatures.has(sig)) sigOverlap += 1;
      }
      const coverage = overlap / Math.max(1, Math.min(fileTokens.size, patientTokens.size));
      const score = overlap * 100 + sigOverlap * 35;
      return { patient, overlap, sigOverlap, coverage, score };
    })
    .filter((entry) => entry.score >= 135 && (entry.overlap >= 2 || entry.sigOverlap >= 2))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.overlap !== a.overlap) return b.overlap - a.overlap;
      if (b.sigOverlap !== a.sigOverlap) return b.sigOverlap - a.sigOverlap;
      return b.coverage - a.coverage;
    });

  if (scored.length === 0) return null;
  if (scored.length === 1) return scored[0].patient;

  const top = scored[0];
  const second = scored[1];
  if (top.score >= second.score + 70) return top.patient;
  if (top.overlap > second.overlap && top.sigOverlap >= second.sigOverlap) return top.patient;
  if (top.overlap === second.overlap && top.coverage >= second.coverage + 0.25) return top.patient;
  return null;
}

function extractPatientCodeCandidatesFromFileName(fileName: string): string[] {
  const stem = path.parse(String(fileName ?? "")).name;
  const tokens = stem.split(/[^0-9A-Za-z]+/).filter(Boolean);
  const timestampMatch = stem.match(/_(\d{8})_(\d{6})_/);
  const timestampDate = String(timestampMatch?.[1] ?? "");
  const timestampTime = String(timestampMatch?.[2] ?? "");
  const out = new Set<string>();

  const addNumericVariants = (rawDigits: string) => {
    const digits = String(rawDigits ?? "").trim();
    if (!/^\d{3,12}$/.test(digits)) return;
    out.add(digits);
    out.add(digits.padStart(4, "0"));
  };

  for (const token of tokens) {
    const normalized = String(token ?? "").trim();
    if (!normalized) continue;
    if (normalized === timestampDate || normalized === timestampTime) continue;

    if (/^\d{3,12}$/.test(normalized)) {
      addNumericVariants(normalized);
      continue;
    }

    if (/^[A-Za-z]{1,5}\d{3,12}$/.test(normalized) || /^\d{3,12}[A-Za-z]{1,5}$/.test(normalized)) {
      out.add(normalized);
      addNumericVariants(normalized.replace(/\D+/g, ""));
    }
  }

  for (const match of stem.matchAll(/(?<!\d)\d{3,12}(?!\d)/g)) {
    const token = String(match[0] ?? "").trim();
    if (!token) continue;
    if (token === timestampDate || token === timestampTime) continue;
    addNumericVariants(token);
  }
  return Array.from(out);
}

function getLocalFileNameFromNotes(notes: string | null): string {
  const raw = String(notes ?? "").trim();
  if (!raw || raw[0] !== "{") return "";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (String(parsed.kind ?? "") !== "local-pentacam-export-v1") return "";
    const original = String(parsed.originalFileName ?? "").trim();
    const source = String(parsed.sourceFileName ?? "").trim();
    return original || source;
  } catch {
    return "";
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const shouldApply = process.argv.includes("--apply");
  const resolveAmbiguousByName = process.argv.includes("--resolve-ambiguous");
  const reportPathArg = process.argv.find((arg) => arg.startsWith("--report="));
  const reportPath = reportPathArg
    ? reportPathArg.slice("--report=".length)
    : path.resolve(process.cwd(), "Pentacam", "_wrong_code_fixes_report.json");

  const conn = await mysql.createConnection(databaseUrl);
  try {
    const [patients] = await conn.query<PatientRow[]>(
      "SELECT id, patientCode, fullName FROM patients WHERE patientCode IS NOT NULL AND patientCode <> ''"
    );
    const byCode = new Map<string, PatientRow>();
    for (const p of patients) {
      byCode.set(String(p.patientCode).trim(), p);
    }

    const [rows] = await conn.query<PentacamRow[]>(
      `SELECT pr.id, pr.patientId, p.patientCode, p.fullName, pr.notes
       FROM pentacamResults pr
       LEFT JOIN patients p ON p.id = pr.patientId
       ORDER BY pr.id DESC`
    );

    const fixes: Array<{
      resultId: number;
      fromPatientId: number;
      fromPatientCode: string;
      toPatientId: number;
      toPatientCode: string;
      fileName: string;
      codeCandidates: string[];
      method: "code-only" | "code+name";
    }> = [];
    let skippedNoMeta = 0;
    let skippedNoCodes = 0;
    let skippedAlreadyCorrect = 0;
    let skippedAmbiguous = 0;

    for (const row of rows) {
      const fileName = getLocalFileNameFromNotes(row.notes);
      if (!fileName) {
        skippedNoMeta += 1;
        continue;
      }

      const codeCandidates = extractPatientCodeCandidatesFromFileName(fileName)
        .map((value) => String(value).trim())
        .filter((value) => /^\d{3,12}$/.test(value));
      if (codeCandidates.length === 0) {
        skippedNoCodes += 1;
        continue;
      }

      const currentCode = String(row.patientCode ?? "").trim();
      if (currentCode && codeCandidates.includes(currentCode)) {
        skippedAlreadyCorrect += 1;
        continue;
      }

      const uniqueTargetCodes = Array.from(
        new Set(codeCandidates.filter((code) => byCode.has(code)))
      );
      let target: PatientRow | null = null;
      let method: "code-only" | "code+name" = "code-only";
      if (uniqueTargetCodes.length === 1) {
        target = byCode.get(uniqueTargetCodes[0])!;
      } else if (resolveAmbiguousByName && uniqueTargetCodes.length > 1) {
        const candidatePatients = uniqueTargetCodes
          .map((code) => byCode.get(code))
          .filter((value): value is PatientRow => Boolean(value));
        const picked = pickByCodeAndName(fileName, candidatePatients);
        if (picked) {
          target = picked;
          method = "code+name";
        }
      }
      if (!target) {
        skippedAmbiguous += 1;
        continue;
      }
      if (Number(target.id) === Number(row.patientId)) {
        skippedAlreadyCorrect += 1;
        continue;
      }

      fixes.push({
        resultId: Number(row.id),
        fromPatientId: Number(row.patientId),
        fromPatientCode: currentCode,
        toPatientId: Number(target.id),
        toPatientCode: String(target.patientCode),
        fileName,
        codeCandidates,
        method,
      });
    }

    if (shouldApply && fixes.length > 0) {
      await conn.beginTransaction();
      try {
        for (const fix of fixes) {
          await conn.query("UPDATE pentacamResults SET patientId = ?, updatedAt = NOW() WHERE id = ?", [
            fix.toPatientId,
            fix.resultId,
          ]);
        }
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      }
    }

    const report = {
      applied: shouldApply,
      totalRows: rows.length,
      fixesFound: fixes.length,
      skippedNoMeta,
      skippedNoCodes,
      skippedAlreadyCorrect,
      skippedAmbiguous,
      fixes,
      generatedAt: new Date().toISOString(),
    };
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

    console.log(
      [
        `total=${rows.length}`,
        `fixes=${fixes.length}`,
        `noMeta=${skippedNoMeta}`,
        `noCodes=${skippedNoCodes}`,
        `alreadyCorrect=${skippedAlreadyCorrect}`,
        `ambiguous=${skippedAmbiguous}`,
        `resolveAmbiguousByName=${resolveAmbiguousByName ? "yes" : "no"}`,
        `applied=${shouldApply ? "yes" : "no"}`,
      ].join(" ")
    );
    console.log(`report=${reportPath}`);
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error("Failed:", error);
  process.exit(1);
});
