export type PrintLayoutSettings = {
  offsetXmm: number;
  offsetYmm: number;
  scale: number;
};

export type PrintLayoutKey = "consultant" | "followup" | "specialist" | "lasik" | "external";

export const DEFAULT_PRINT_LAYOUT: Record<PrintLayoutKey, PrintLayoutSettings> = {
  consultant: { offsetXmm: 0, offsetYmm: 0, scale: 1 },
  followup: { offsetXmm: 4, offsetYmm: 10, scale: 0.96 },
  specialist: { offsetXmm: 0, offsetYmm: 0, scale: 1 },
  lasik: { offsetXmm: 0, offsetYmm: 0, scale: 1 },
  external: { offsetXmm: 0, offsetYmm: 0, scale: 1 },
};

const STORAGE_KEYS: Record<PrintLayoutKey, string> = {
  consultant: "selrs_print_layout_consultant_v1",
  followup: "selrs_print_layout_followup_v1",
  specialist: "selrs_print_layout_specialist_v1",
  lasik: "selrs_print_layout_lasik_v1",
  external: "selrs_print_layout_external_v1",
};

function toNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function loadPrintLayout(key: PrintLayoutKey): PrintLayoutSettings {
  if (typeof window === "undefined") return DEFAULT_PRINT_LAYOUT[key];
  const storageKey = STORAGE_KEYS[key];
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return DEFAULT_PRINT_LAYOUT[key];
  try {
    const parsed = JSON.parse(raw);
    const defaults = DEFAULT_PRINT_LAYOUT[key];
    return {
      offsetXmm: toNumber(parsed?.offsetXmm, defaults.offsetXmm),
      offsetYmm: toNumber(parsed?.offsetYmm, defaults.offsetYmm),
      scale: toNumber(parsed?.scale, defaults.scale),
    };
  } catch {
    return DEFAULT_PRINT_LAYOUT[key];
  }
}

export function savePrintLayout(key: PrintLayoutKey, value: PrintLayoutSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(value));
}
