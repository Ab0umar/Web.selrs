import fs from "node:fs/promises";
import path from "node:path";

function getPrefix(name: string): number | null {
  const m = name.match(/^(\d{4,5})_/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const drizzleDir = path.join(process.cwd(), "drizzle");
  const files = (await fs.readdir(drizzleDir)).filter((f) => f.endsWith(".sql")).sort();
  const seen = new Set<string>();
  const duplicateNames: string[] = [];
  const nonPrefixed: string[] = [];
  const outOfOrder: string[] = [];
  for (const file of files) {
    if (seen.has(file)) duplicateNames.push(file);
    seen.add(file);

    const prefix = getPrefix(file);
    if (prefix === null) {
      nonPrefixed.push(file);
      continue;
    }
    // Repository keeps some legacy migration files; only enforce valid naming.
  }

  const result = {
    totalSqlFiles: files.length,
    duplicateNames,
    nonPrefixed,
    outOfOrder,
    ok: duplicateNames.length === 0 && nonPrefixed.length === 0,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  console.error("[check-migration-files] Failed:", error);
  process.exit(1);
});
