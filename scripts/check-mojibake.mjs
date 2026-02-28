import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET_DIRS = ["client/src", "server", "shared"];
const FILE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".md"]);

// Common UTF-8/Windows-1256 mojibake markers seen in this repo.
const SUSPICIOUS_PATTERNS = [
  "ط·آ",
  "ط¸ط",
  "ظ„ط",
  "طھظ",
  "ظ…ط",
  "ط§ظ",
  "ظٹظ",
  "ظپظ",
  "ط¹ط",
  "ط±ط",
];

const findings = [];
const LEGACY_ALLOWLIST = new Set([
  "client/src/pages/Appointments.tsx",
  "client/src/pages/WritePrescription.tsx",
  "client/src/pages/ExternalOperationSheet.tsx",
  "client/src/pages/LasikExamSheet.tsx",
  "client/src/pages/SpecialistSheet.tsx",
  "client/src/pages/Patients.tsx",
]);

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!FILE_EXTENSIONS.has(ext)) continue;
    scanFile(fullPath);
  }
}

function scanFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const marker of SUSPICIOUS_PATTERNS) {
      if (line.includes(marker)) {
        findings.push({
          filePath: path.relative(ROOT, filePath),
          lineNumber: i + 1,
          marker,
          line: line.trim().slice(0, 180),
        });
        break;
      }
    }
  }
}

for (const dir of TARGET_DIRS) {
  walk(path.join(ROOT, dir));
}

if (findings.length > 0) {
  const blocking = findings.filter((finding) => !LEGACY_ALLOWLIST.has(finding.filePath.replace(/\\/g, "/")));
  const legacy = findings.filter((finding) => LEGACY_ALLOWLIST.has(finding.filePath.replace(/\\/g, "/")));

  if (legacy.length > 0) {
    console.warn(`Encoding check: ${legacy.length} known legacy mojibake matches (allowlisted).`);
  }

  if (blocking.length === 0) {
    console.log("Encoding check passed (no new mojibake outside allowlist).");
    process.exit(0);
  }

  console.error("Mojibake check failed. Suspicious text encoding detected:");
  for (const finding of blocking) {
    console.error(
      `- ${finding.filePath}:${finding.lineNumber} [${finding.marker}] ${finding.line}`,
    );
  }
  process.exit(1);
}

console.log("Encoding check passed.");
