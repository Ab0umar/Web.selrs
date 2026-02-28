import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { getMobileQaEnabled, setMobileQaEnabled } from "@/lib/mobileQa";

type HealthState = {
  ok: boolean;
  env?: string;
  dbConnected?: boolean;
  patientsCount?: number;
  dbError?: string;
  web4000?: boolean;
  api3000?: boolean;
  tunnelConnected?: boolean;
  tunnelInfo?: string;
  latestBackupFile?: string;
  latestBackupAt?: string;
};

const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined"
    ? __APP_VERSION__
    : (import.meta as any)?.env?.VITE_APP_VERSION ?? "unknown";

const BUILD_TIME =
  typeof __BUILD_TIME__ !== "undefined"
    ? __BUILD_TIME__
    : (import.meta as any)?.env?.VITE_BUILD_TIME ?? "unknown";

export default function AdminStatus() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [qaEnabled, setQaEnabled] = useState(false);

  const migrationsQuery = trpc.system.listMigrations.useQuery(undefined, { refetchOnWindowFocus: false });
  const opsHealthQuery = trpc.medical.getOpsHealth.useQuery(undefined, { refetchOnWindowFocus: false });
  const health = (opsHealthQuery.data ?? null) as HealthState | null;
  const buildInfo = useMemo(() => {
    const cssAsset = typeof document !== "undefined"
      ? document.querySelector('link[rel="stylesheet"]')?.getAttribute("href") ?? "-"
      : "-";
    return {
      version: APP_VERSION,
      buildTime: BUILD_TIME,
      origin: typeof window !== "undefined" ? window.location.origin : "-",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "-",
      viewport:
        typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "-",
      cssAsset,
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    setQaEnabled(getMobileQaEnabled());
  }, []);

  if (!isAuthenticated || user?.role !== "admin") return null;

  const migrationCount = (migrationsQuery.data?.migrations ?? []).length;

  const toggleQa = (enabled: boolean) => {
    setQaEnabled(enabled);
    setMobileQaEnabled(enabled);
    window.dispatchEvent(new Event("mobile-qa-toggle"));
  };

  const copyBuildInfo = async () => {
    const payload = [
      `version=${buildInfo.version}`,
      `buildTime=${buildInfo.buildTime}`,
      `origin=${buildInfo.origin}`,
      `viewport=${buildInfo.viewport}`,
      `cssAsset=${buildInfo.cssAsset}`,
      `userAgent=${buildInfo.userAgent}`,
      `mobileQa=${qaEnabled ? "on" : "off"}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      // no-op
    }
  };

  const resetAppCache = async () => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();

      if ("caches" in window) {
        const keys = await window.caches.keys();
        await Promise.all(keys.map((k) => window.caches.delete(k)));
      }
    } finally {
      window.location.reload();
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div />
        <Button onClick={() => window.location.reload()} variant="outline">
          تحديث
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>صحة الخادم</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm">الحالة العامة: {health?.ok ? "متصل" : "غير متصل"}</div>
            <div className="text-sm">البيئة: {health?.env ?? "-"}</div>
            <div className="text-sm">Web (4000): {health?.web4000 ? "متصل" : "غير متصل"}</div>
            <div className="text-sm">API (3000): {health?.api3000 ? "متصل" : "غير متصل"}</div>
            <div className="text-sm">DB: {health?.dbConnected ? "متصل" : "غير متصل"}</div>
            <div className="text-sm">عدد المرضى (DB): {health?.patientsCount ?? "-"}</div>
            <div className="text-sm">Tunnel: {health?.tunnelConnected ? "Connected" : "Not Connected"}</div>
            {health?.dbError ? <div className="text-xs text-destructive">DB Error: {health.dbError}</div> : null}
            {opsHealthQuery.isLoading && <div className="text-xs text-muted-foreground">جارٍ الفحص...</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ترحيلات قاعدة البيانات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm">العدد: {migrationCount}</div>
            <div className="text-sm">الحالة: {migrationsQuery.isLoading ? "جارٍ التحميل..." : "جاهز"}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>النسخ الاحتياطي</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm">Base URL: {window.location.origin}</div>
            <div className="text-sm break-all">Last backup: {health?.latestBackupFile || "-"}</div>
            <div className="text-sm">Backup time: {health?.latestBackupAt || "-"}</div>
            <div className="text-xs text-muted-foreground break-words">{health?.tunnelInfo || ""}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Build Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm">Version: {buildInfo.version}</div>
            <div className="text-sm">Build Time: {buildInfo.buildTime}</div>
            <div className="text-sm">Origin: {buildInfo.origin}</div>
            <div className="text-sm">Viewport: {buildInfo.viewport}</div>
            <div className="text-xs break-all">CSS Asset: {buildInfo.cssAsset}</div>
            <div className="text-xs break-all">UA: {buildInfo.userAgent}</div>
            <Button variant="outline" size="sm" onClick={copyBuildInfo}>
              Copy Build Info
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mobile QA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">Highlight horizontal overflow on sheet pages</div>
              <Switch checked={qaEnabled} onCheckedChange={toggleQa} />
            </div>
            <div className="text-xs text-muted-foreground">
              When enabled, overflowing elements are marked with red dashed outlines while browsing sheets.
            </div>
            <Button variant="outline" size="sm" onClick={resetAppCache}>
              Reset App Cache
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
