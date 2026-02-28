import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const repoRoot = process.cwd();
  const migrationsDir = path.join(repoRoot, "drizzle");
  const files = (await fs.readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const conn = await mysql.createConnection(databaseUrl);
  try {
    await conn.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        id int AUTO_INCREMENT PRIMARY KEY,
        name varchar(255) NOT NULL UNIQUE,
        appliedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    );

    const [rows] = await conn.query<any[]>(
      "SELECT name FROM schema_migrations ORDER BY appliedAt ASC"
    );
    const applied = new Set(rows.map((row) => String(row.name)));
    const repo = new Set(files);

    const missingInDb = files.filter((f) => !applied.has(f));
    const extraInDb = Array.from(applied).filter((f) => !repo.has(f)).sort();

    const result = {
      inRepo: files.length,
      inDb: applied.size,
      missingInDb,
      extraInDb,
      inSync: missingInDb.length === 0 && extraInDb.length === 0,
    };

    console.log(JSON.stringify(result, null, 2));
    if (!result.inSync) process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error("[check-db-sync] Failed:", error);
  process.exit(1);
});

