import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

type JournalEntry = { tag: string };

function splitSql(sql: string) {
  return sql
    .split(/--> statement-breakpoint\s*/g)
    .map((stmt) => stmt.trim())
    .filter(Boolean);
}

async function loadMigrationList(migrationsDir: string) {
  const journalPath = path.join(migrationsDir, "meta", "_journal.json");
  const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

  try {
    const raw = await fs.readFile(journalPath, "utf8");
    const json = JSON.parse(raw) as { entries?: JournalEntry[] };
    const fromJournal = (json.entries ?? []).map((e) => `${e.tag}.sql`);
    const extras = files.filter((f) => !fromJournal.includes(f));
    return [...fromJournal, ...extras];
  } catch {
    return files;
  }
}

async function ensureMigrationsTable(conn: mysql.Connection) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id int AUTO_INCREMENT PRIMARY KEY,
      name varchar(255) NOT NULL UNIQUE,
      appliedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for db:migrate");
  }

  const migrationsDir = path.resolve(process.cwd(), "drizzle");
  const migrationFiles = await loadMigrationList(migrationsDir);

  if (migrationFiles.length === 0) {
    console.log("[db:migrate] No migration files found.");
    return;
  }

  const conn = await mysql.createConnection(databaseUrl);
  try {
    await ensureMigrationsTable(conn);

    const [rows] = await conn.query<{ name: string }[]>(
      "SELECT name FROM schema_migrations ORDER BY appliedAt ASC"
    );
    const applied = new Set(rows.map((r) => r.name));

    let appliedCount = 0;
    for (const file of migrationFiles) {
      if (applied.has(file)) continue;
      const fullPath = path.join(migrationsDir, file);
      const sql = await fs.readFile(fullPath, "utf8");
      const statements = splitSql(sql);
      for (const stmt of statements) {
        try {
          await conn.query(stmt);
        } catch (err: any) {
          const code = err?.code as string | undefined;
          const ignorable = new Set([
            "ER_TABLE_EXISTS_ERROR",
            "ER_DUP_FIELDNAME",
            "ER_DUP_KEYNAME",
            "ER_CANT_DROP_FIELD_OR_KEY",
          ]);
          if (code && ignorable.has(code)) {
            continue;
          }
          throw err;
        }
      }
      await conn.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
      appliedCount += 1;
    }

    console.log(`[db:migrate] Applied ${appliedCount} migration(s).`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("[db:migrate] Failed:", err);
  process.exit(1);
});
