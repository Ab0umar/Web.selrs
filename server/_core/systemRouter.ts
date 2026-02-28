import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import * as db from "../db";
import { getBuildInfo } from "./buildInfo";

type MigrationStatus = {
  name: string;
  appliedAt: string | null;
  pending: boolean;
};

type MigrationListResponse = {
  source: "schema" | "journal" | "none";
  dbError?: string | null;
  migrations: MigrationStatus[];
};

function splitSql(sql: string) {
  return sql
    .split(/--> statement-breakpoint\s*/g)
    .map((stmt) => stmt.trim())
    .filter(Boolean);
}

async function loadMigrationList(migrationsDir: string) {
  const journalPath = path.join(migrationsDir, "meta", "_journal.json");
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

  try {
    const raw = await readFile(journalPath, "utf8");
    const json = JSON.parse(raw) as { entries?: Array<{ tag: string }> };
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

async function listDrizzleMigrations(): Promise<MigrationListResponse> {
  const migrationsDir = path.resolve(process.cwd(), "drizzle");
  const metaPath = path.resolve(migrationsDir, "meta", "_journal.json");

  const files = await loadMigrationList(migrationsDir);
  let applied = new Map<string, string | null>();
  let source: MigrationListResponse["source"] = "none";
  let dbError: string | null = null;
  let dbOk = false;

  try {
    const database = await db.getDb();
    if (database) {
      const rows = await database.execute("SELECT name, appliedAt FROM schema_migrations ORDER BY appliedAt ASC") as any;
      const records = rows?.[0] ?? [];
      records.forEach((row: any) => {
        applied.set(row.name, row.appliedAt ? new Date(row.appliedAt).toISOString() : null);
      });
      dbOk = true;
      source = "schema";
    }
  } catch (error: any) {
    dbError = error?.message ?? "Failed to query schema_migrations";
  }

  if (!dbOk) {
    try {
      const raw = await readFile(metaPath, "utf8");
      const json = JSON.parse(raw) as { entries?: Array<{ tag: string; when: number }> };
      (json.entries ?? []).forEach((entry) => {
        applied.set(`${entry.tag}.sql`, entry.when ? new Date(entry.when).toISOString() : null);
      });
      source = "journal";
    } catch {
      applied = new Map();
    }
  }

  return {
    source,
    dbError,
    migrations: files.map((name) => ({
      name,
      appliedAt: applied.get(name) ?? null,
      pending: !applied.has(name),
    })),
  };
}

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(async () => {
      const build = await getBuildInfo().catch(() => ({
        version: "unknown",
        buildTime: "unknown",
        commit: "unknown",
      }));
      return {
        ok: true,
        ...build,
      };
    }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  listMigrations: adminProcedure.query(async () => {
    return await listDrizzleMigrations();
  }),

  applyMigrations: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(50).optional() }).optional())
    .mutation(async ({ input }) => {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error("DATABASE_URL is required");
      }

      const migrationsDir = path.resolve(process.cwd(), "drizzle");
      const migrationFiles = await loadMigrationList(migrationsDir);
      if (migrationFiles.length === 0) {
        return { applied: 0 };
      }

      const conn = await mysql.createConnection(databaseUrl);
      try {
        await ensureMigrationsTable(conn);

        const [rows] = await conn.query(
          "SELECT name FROM schema_migrations ORDER BY appliedAt ASC"
        );
        const appliedRows = Array.isArray(rows) ? (rows as Array<{ name: string }>) : [];
        const applied = new Set(appliedRows.map((r) => r.name));
        const pending = migrationFiles.filter((file) => !applied.has(file));
        const toApply = typeof input?.limit === "number" ? pending.slice(0, input.limit) : pending;

        let appliedCount = 0;
        for (const file of toApply) {
          const fullPath = path.join(migrationsDir, file);
          const sql = await readFile(fullPath, "utf8");
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

        return { applied: appliedCount };
      } finally {
        await conn.end();
      }
    }),
});
