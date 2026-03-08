import { syncPatientsFromMssql } from "../integrations/mssqlPatients";
import * as db from "../db";

function asBool(value: unknown, fallback = false): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

let started = false;
const MSSQL_SYNC_RUNTIME_STATUS_KEY = "mssql_sync_runtime_status_v1";

type SyncRuntimeConfig = {
  enabled: boolean;
  intervalMs: number;
  limit: number;
  incremental: boolean;
};

function toNumber(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

async function getRuntimeConfig(): Promise<SyncRuntimeConfig> {
  const envEnabled = asBool(process.env.MSSQL_SYNC_AUTO, true);
  const envInterval = toNumber(process.env.MSSQL_SYNC_INTERVAL_MS, 30_000, 5_000, 3_600_000);
  const envLimit = toNumber(process.env.MSSQL_SYNC_LIMIT, 5000, 1, 20_000);
  const envIncremental = asBool(process.env.MSSQL_SYNC_INCREMENTAL_AUTO, true);

  try {
    const row = await db.getSystemSetting("mssql_sync_runtime_v1");
    const raw = row?.value ? JSON.parse(String(row.value)) : {};
    // Hard env override: when explicitly disabled in env, ignore DB runtime toggle.
    const enabled = envEnabled ? (typeof raw?.enabled === "boolean" ? raw.enabled : envEnabled) : false;
    const intervalMs = toNumber(raw?.intervalMs, envInterval, 5_000, 3_600_000);
    const limit = toNumber(raw?.limit, envLimit, 1, 20_000);
    const incremental =
      typeof raw?.incremental === "boolean" ? raw.incremental : envIncremental;
    return { enabled, intervalMs, limit, incremental };
  } catch {
    return {
      enabled: envEnabled,
      intervalMs: envInterval,
      limit: envLimit,
      incremental: envIncremental,
    };
  }
}

export function startMssqlSyncScheduler() {
  if (started) return;
  started = true;
  let running = false;
  const writeRuntimeStatus = async (patch: Record<string, unknown>) => {
    const row = await db.getSystemSetting(MSSQL_SYNC_RUNTIME_STATUS_KEY).catch(() => null);
    let current: Record<string, unknown> = {};
    try {
      current = row?.value ? (JSON.parse(String(row.value)) as Record<string, unknown>) : {};
    } catch {
      current = {};
    }
    await db.updateSystemSettings(MSSQL_SYNC_RUNTIME_STATUS_KEY, {
      ...current,
      ...patch,
    });
  };

  const run = async (cfg: SyncRuntimeConfig) => {
    if (running) return;
    running = true;
    const startedAt = new Date().toISOString();
    await writeRuntimeStatus({
      running: true,
      lastRunStartedAt: startedAt,
      lastError: null,
    }).catch(() => undefined);
    try {
      const result = await syncPatientsFromMssql({
        limit: cfg.limit,
        dryRun: false,
        incremental: cfg.incremental,
      });
      const finishedAt = new Date().toISOString();
      await writeRuntimeStatus({
        running: false,
        lastRunFinishedAt: finishedAt,
        lastError: null,
        lastChangeCount: Number(result.inserted ?? 0) + Number(result.updated ?? 0),
      }).catch(() => undefined);
      console.log(
        `[mssql-sync] ok mode=${result.incremental ? "incremental" : "full"} fetched=${result.fetched} inserted=${result.inserted} updated=${result.updated} skipped=${result.skipped} interval=${cfg.intervalMs}`
      );
      if (result.errors.length > 0) {
        console.warn(`[mssql-sync] row errors: ${result.errors.slice(0, 5).join(" | ")}`);
      }
    } catch (error: any) {
      await writeRuntimeStatus({
        running: false,
        lastRunFinishedAt: new Date().toISOString(),
        lastError: String(error?.message ?? error ?? "unknown"),
      }).catch(() => undefined);
      console.error(`[mssql-sync] failed: ${String(error?.message ?? error ?? "unknown")}`);
    } finally {
      running = false;
    }
  };

  const tick = async () => {
    const cfg = await getRuntimeConfig();
    const nextRunAt = new Date(Date.now() + cfg.intervalMs).toISOString();
    await writeRuntimeStatus({ nextRunAt }).catch(() => undefined);
    if (cfg.enabled) {
      await run(cfg);
    } else {
      await writeRuntimeStatus({ running: false }).catch(() => undefined);
    }
    setTimeout(tick, cfg.intervalMs);
  };

  void tick();
}
