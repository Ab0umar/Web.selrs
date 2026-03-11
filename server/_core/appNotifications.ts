import * as db from "../db";

export const APP_NOTIFICATION_FEED_KEY = "app_notifications_feed_v1";
export const APP_NOTIFICATION_SETTINGS_KEY = "app_notification_settings_v1";
const APP_NOTIFICATION_FEED_LIMIT = 50;

export type AppNotificationEntry = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  kind: "info" | "success" | "warning" | "error";
  source?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  meta?: Record<string, unknown> | null;
};

type PushAppNotificationInput = {
  title: string;
  message: string;
  kind?: AppNotificationEntry["kind"];
  source?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  meta?: Record<string, unknown> | null;
};

export type AppNotificationSettings = {
  mssqlOwnerEnabled: boolean;
  mssqlInAppEnabled: boolean;
  manualPatientInAppEnabled: boolean;
};

const DEFAULT_APP_NOTIFICATION_SETTINGS: AppNotificationSettings = {
  mssqlOwnerEnabled: true,
  mssqlInAppEnabled: true,
  manualPatientInAppEnabled: true,
};

const normalizeFeed = (value: unknown): AppNotificationEntry[] => {
  if (!Array.isArray(value)) return [];
  const normalized: AppNotificationEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    const title = String(row.title ?? "").trim();
    const message = String(row.message ?? "").trim();
    const createdAt = String(row.createdAt ?? "").trim();
    const kindRaw = String(row.kind ?? "info").trim().toLowerCase();
    const kind: AppNotificationEntry["kind"] =
      kindRaw === "success" || kindRaw === "warning" || kindRaw === "error" ? kindRaw : "info";
    if (!id || !title || !message || !createdAt) continue;
    normalized.push({
      id,
      title,
      message,
      createdAt,
      kind,
      source: row.source == null ? null : String(row.source),
      entityType: row.entityType == null ? null : String(row.entityType),
      entityId: Number.isFinite(Number(row.entityId)) ? Number(row.entityId) : null,
      meta: row.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : null,
    });
  }
  return normalized;
};

export async function pushAppNotification(input: PushAppNotificationInput): Promise<AppNotificationEntry> {
  const row = await db.getSystemSetting(APP_NOTIFICATION_FEED_KEY).catch(() => null);
  let existingFeed: AppNotificationEntry[] = [];
  if (row?.value) {
    try {
      existingFeed = normalizeFeed(JSON.parse(String(row.value)));
    } catch {
      existingFeed = [];
    }
  }

  const entry: AppNotificationEntry = {
    id: `app_ntf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: String(input.title ?? "").trim(),
    message: String(input.message ?? "").trim(),
    createdAt: new Date().toISOString(),
    kind: input.kind ?? "info",
    source: input.source ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    meta: input.meta ?? null,
  };

  const nextFeed = [entry, ...existingFeed].slice(0, APP_NOTIFICATION_FEED_LIMIT);
  await db.updateSystemSettings(APP_NOTIFICATION_FEED_KEY, nextFeed);
  return entry;
}

export async function getAppNotificationSettings(): Promise<AppNotificationSettings> {
  const row = await db.getSystemSetting(APP_NOTIFICATION_SETTINGS_KEY).catch(() => null);
  if (!row?.value) return DEFAULT_APP_NOTIFICATION_SETTINGS;
  try {
    const parsed = JSON.parse(String(row.value)) as Record<string, unknown>;
    return {
      mssqlOwnerEnabled:
        typeof parsed.mssqlOwnerEnabled === "boolean"
          ? parsed.mssqlOwnerEnabled
          : DEFAULT_APP_NOTIFICATION_SETTINGS.mssqlOwnerEnabled,
      mssqlInAppEnabled:
        typeof parsed.mssqlInAppEnabled === "boolean"
          ? parsed.mssqlInAppEnabled
          : DEFAULT_APP_NOTIFICATION_SETTINGS.mssqlInAppEnabled,
      manualPatientInAppEnabled:
        typeof parsed.manualPatientInAppEnabled === "boolean"
          ? parsed.manualPatientInAppEnabled
          : DEFAULT_APP_NOTIFICATION_SETTINGS.manualPatientInAppEnabled,
    };
  } catch {
    return DEFAULT_APP_NOTIFICATION_SETTINGS;
  }
}
