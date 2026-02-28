import { getPentacamImportRuntimeConfig, runPentacamAutoImportOnce, updatePentacamImportRuntimeConfig } from "../integrations/pentacamAutoImport";

let started = false;

export function startPentacamImportScheduler() {
  if (started) return;
  started = true;

  const tick = async () => {
    try {
      const cfg = await getPentacamImportRuntimeConfig();
      if (cfg.enabled) {
        const summary = await runPentacamAutoImportOnce(cfg);
        console.log(
          `[pentacam-import] scanned=${summary.scanned} processed=${summary.processed} imported=${summary.imported} duplicate=${summary.duplicate} unmatched=${summary.unmatched} failed=${summary.failed} skipped=${summary.skipped}`
        );
      }
      setTimeout(tick, cfg.intervalMs);
    } catch (error: any) {
      console.error(`[pentacam-import] scheduler failed: ${String(error?.message ?? error ?? "unknown error")}`);
      setTimeout(tick, 15000);
    }
  };

  void tick();
}

export async function primePentacamImportRuntimeConfig() {
  const cfg = await getPentacamImportRuntimeConfig();
  await updatePentacamImportRuntimeConfig(cfg);
}

