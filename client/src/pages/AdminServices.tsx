import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getTrpcErrorMessage } from "@/lib/utils";

type ServiceType = "consultant" | "specialist" | "lasik" | "surgery" | "external";
type ServiceTypeUi = ServiceType | "surgery_external" | "pentacam_center" | "pentacam_external";
type SheetType =
  | ServiceType
  | "pentacam"
  | "surgery_center"
  | "surgery_external"
  | "pentacam_center"
  | "pentacam_external";

type ServiceEntry = {
  id: string;
  code: string;
  name: string;
  serviceType: ServiceType;
  srvTyp: "1" | "2";
  defaultSheet: SheetType;
  isActive: boolean;
};

const makeId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `srv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const isServiceType = (value: unknown): value is ServiceType =>
  value === "consultant" || value === "specialist" || value === "lasik" || value === "surgery" || value === "external";
const uiToServiceType = (value: ServiceTypeUi): ServiceType => {
  if (value === "surgery_external" || value === "pentacam_external") return "external";
  if (value === "pentacam_center") return "specialist";
  return value;
};
const serviceTypeOptions: Array<{ value: ServiceTypeUi; label: string }> = [
  { value: "consultant", label: "استشاري" },
  { value: "specialist", label: "اخصائي" },
  { value: "pentacam_center", label: "بنتاكام مركز" },
  { value: "pentacam_external", label: "بنتاكام خارجي" },
  { value: "lasik", label: "فحوصات الليزك" },
  { value: "surgery", label: "عمليات مركز" },
  { value: "surgery_external", label: "عمليات خارجي" },
  { value: "external", label: "خارجي" },
];

const isSheetType = (value: unknown): value is SheetType =>
  isServiceType(value) ||
  value === "pentacam" ||
  value === "surgery_center" ||
  value === "surgery_external" ||
  value === "pentacam_center" ||
  value === "pentacam_external";

const sheetOptions: Array<{ value: SheetType; label: string }> = [
  { value: "consultant", label: "استشاري" },
  { value: "specialist", label: "اخصائي" },
  { value: "lasik", label: "فحوصات الليزك" },
  { value: "surgery", label: "عمليات مركز (قديم)" },
  { value: "surgery_center", label: "عمليات مركز" },
  { value: "surgery_external", label: "عمليات خارجي" },
  { value: "pentacam_center", label: "بنتاكام مركز" },
  { value: "pentacam_external", label: "بنتاكام خارجي" },
];

const inferServiceWiring = (code: string, name: string): { serviceType: ServiceType; defaultSheet: SheetType } => {
  const hay = `${String(code ?? "").toLowerCase()} ${String(name ?? "").toLowerCase()}`;
  const has = (...terms: string[]) => terms.some((term) => hay.includes(term));
  const isExternal = has("external", "outside", "out", "خارجي");

  if (has("radiology", "xray", "x-ray", "scan", "oct", "bscan", "ultrasound", "echo", "اشعه", "اشعة")) {
    return {
      serviceType: isExternal ? "external" : "specialist",
      defaultSheet: isExternal ? "pentacam_external" : "pentacam_center",
    };
  }
  if (has("pentacam", "topography", "corneal map")) {
    return { serviceType: "specialist", defaultSheet: "pentacam_center" };
  }
  if (has("ضغط", "pressure", "tonometry", "iop", "قياس ضغط العين")) {
    return { serviceType: "specialist", defaultSheet: "specialist" };
  }
  if (has("lasik", "femto", "moria", "metal")) {
    return { serviceType: "lasik", defaultSheet: "lasik" };
  }
  if (has("operation", "surgery", "prk", "phaco", "عمليه", "عملية", "عمليات")) {
    return {
      serviceType: isExternal ? "external" : "surgery",
      defaultSheet: isExternal ? "surgery_external" : "surgery_center",
    };
  }
  if (isExternal) {
    return { serviceType: "external", defaultSheet: "external" };
  }
  if (has("specialist", "اخصائي")) {
    return { serviceType: "specialist", defaultSheet: "specialist" };
  }
  return { serviceType: "consultant", defaultSheet: "consultant" };
};

const normalizeStoredDefaultSheet = (value: unknown, inferred: SheetType): SheetType => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return inferred;
  if (raw === "pentacam" || raw === "radiology_center") return "pentacam_center";
  if (raw === "radiology_external") return "pentacam_external";
  if (raw === "surgery") return "surgery_center";
  if (raw === "external") return inferred;
  return isSheetType(raw) ? raw : inferred;
};

const normalizeSrvTyp = (value: unknown, serviceType: ServiceType, defaultSheet: SheetType): "1" | "2" => {
  const raw = String(value ?? "").trim();
  if (raw === "1" || raw === "2") return raw;
  if (
    serviceType === "external" ||
    defaultSheet === "external" ||
    defaultSheet === "surgery_external" ||
    defaultSheet === "pentacam_external"
  ) {
    return "2";
  }
  return "1";
};

export default function AdminServices() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const [services, setServices] = useState<ServiceEntry[]>([]);
  const [groupTab, setGroupTab] = useState<"exam" | "operations" | "misc">("exam");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [moveTarget, setMoveTarget] = useState<"exam" | "operations" | "misc">("operations");
  const [moveSheetType, setMoveSheetType] = useState<SheetType>("consultant");
  const [newService, setNewService] = useState<{ code: string; name: string; serviceType: ServiceType; srvTyp: "1" | "2"; defaultSheet: SheetType }>({
    code: "",
    name: "",
    serviceType: "consultant",
    srvTyp: "1",
    defaultSheet: "consultant",
  });

  const servicesQuery = trpc.medical.getSystemSetting.useQuery({ key: "service_directory" }, { refetchOnWindowFocus: false });
  const updateServicesMutation = trpc.medical.updateSystemSetting.useMutation();
  const syncPatientsMutation = trpc.medical.syncPatientsFromMssql.useMutation();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isAuthenticated) setLocation("/");
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    const raw = (servicesQuery.data as any)?.value;
    const rows = Array.isArray(raw) ? raw : [];
    const normalized = rows.map((item: any) => {
      const inferred = inferServiceWiring(String(item?.code ?? ""), String(item?.name ?? ""));
      const storedServiceType = isServiceType(item?.serviceType) ? item.serviceType : inferred.serviceType;
      const storedDefaultSheet = normalizeStoredDefaultSheet(item?.defaultSheet, inferred.defaultSheet);
      const storedSrvTyp = normalizeSrvTyp(item?.srvTyp, storedServiceType, storedDefaultSheet);
      const isStillDefault = storedServiceType === "consultant" && storedDefaultSheet === "consultant";
      return {
        id: String(item?.id ?? makeId()),
        code: String(item?.code ?? "").trim(),
        name: String(item?.name ?? "").trim(),
        // Auto-upgrade rows that are still untouched defaults.
        serviceType: isStillDefault ? inferred.serviceType : storedServiceType,
        defaultSheet: isStillDefault ? inferred.defaultSheet : storedDefaultSheet,
        srvTyp: storedSrvTyp,
        isActive: item?.isActive !== false,
      } as ServiceEntry;
    });
    setServices(normalized);
  }, [servicesQuery.data]);

  const parseCsvLine = (line: string) => {
    const sep: "," | ";" | "\t" = line.includes(";") ? ";" : line.includes("\t") ? "\t" : ",";
    const parts: string[] = [];
    let current = "";
    let quote: '"' | "'" | null = null;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if ((ch === '"' || ch === "'") && (!quote || quote === ch)) {
        quote = quote === ch ? null : (ch as '"' | "'");
        continue;
      }
      if (!quote && ch === sep) {
        parts.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    parts.push(current.trim());
    return parts;
  };

  const sortedServices = useMemo(
    () => [...services].sort((a, b) => String(a.code ?? "").localeCompare(String(b.code ?? ""), "en", { numeric: true })),
    [services]
  );

  const isExamGroup = (service: ServiceEntry) => service.serviceType === "consultant" || service.serviceType === "specialist";
  const isOperationsGroup = (service: ServiceEntry) => service.serviceType === "surgery" || service.serviceType === "lasik";

  const groupedServices = useMemo(() => {
    return sortedServices.filter((service) => {
      if (groupTab === "exam") return isExamGroup(service);
      if (groupTab === "operations") return isOperationsGroup(service);
      return !isExamGroup(service) && !isOperationsGroup(service);
    });
  }, [groupTab, sortedServices]);

  const visibleIds = useMemo(() => groupedServices.map((s) => s.id), [groupedServices]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  const addService = () => {
    const code = newService.code.trim();
    const name = newService.name.trim();
    if (!code || !name) {
      toast.error("Code and name are required");
      return;
    }
    if (services.some((s) => s.code.trim().toLowerCase() === code.toLowerCase())) {
      toast.error("Service code already exists");
      return;
    }
    const inferred = inferServiceWiring(code, name);
    const autoMode = newService.serviceType === "consultant" && newService.defaultSheet === "consultant";
    const resolvedServiceType = autoMode ? inferred.serviceType : newService.serviceType;
    const resolvedDefaultSheet = autoMode ? inferred.defaultSheet : newService.defaultSheet;
    setServices((prev) => [...prev, { id: makeId(), code, name, serviceType: resolvedServiceType, srvTyp: normalizeSrvTyp(newService.srvTyp, resolvedServiceType, resolvedDefaultSheet), defaultSheet: resolvedDefaultSheet, isActive: true }]);
    setNewService({ code: "", name: "", serviceType: "consultant", srvTyp: "1", defaultSheet: "consultant" });
  };

  const moveSelectedToGroup = () => {
    const selectedVisible = selectedIds.filter((id) => visibleIds.includes(id));
    if (selectedVisible.length === 0) return;
    const nextType: ServiceType = moveTarget === "exam" ? "consultant" : moveTarget === "operations" ? "surgery" : "external";
    setServices((prev) => prev.map((s) => (selectedVisible.includes(s.id) ? { ...s, serviceType: nextType } : s)));
    setSelectedIds((prev) => prev.filter((id) => !selectedVisible.includes(id)));
  };

  const moveSelectedToSheetType = () => {
    const selectedVisible = selectedIds.filter((id) => visibleIds.includes(id));
    if (selectedVisible.length === 0) return;
    setServices((prev) => prev.map((s) => (selectedVisible.includes(s.id) ? { ...s, defaultSheet: moveSheetType } : s)));
    setSelectedIds((prev) => prev.filter((id) => !selectedVisible.includes(id)));
  };

  const saveServices = async () => {
    try {
      await updateServicesMutation.mutateAsync({ key: "service_directory", value: services });
      const sync = await syncPatientsMutation.mutateAsync({ dryRun: false, incremental: true });
      toast.success(`Saved. Sync fetched ${sync?.fetched ?? 0}, updated ${sync?.updated ?? 0}, inserted ${sync?.inserted ?? 0}`);
      servicesQuery.refetch();
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to save service directory or start sync"));
    }
  };

  const importServicesCsv = async (file: File) => {
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const next = [...services];
      let imported = 0;
      for (const line of lines) {
        const parts = parseCsvLine(line);
        if (parts.length < 2) continue;
        const code = String(parts[0] ?? "").trim();
        const name = String(parts[1] ?? "").trim();
        if (!code || !name) continue;
        if (/^(srv[_\s-]*cd|code)$/i.test(code) && /^(name|service)$/i.test(name)) continue;
        if (next.some((s) => s.code.trim().toLowerCase() === code.toLowerCase())) continue;
        const inferred = inferServiceWiring(code, name);
        const importedSrvTyp = String(parts[2] ?? "").trim();
        const srvTyp = normalizeSrvTyp(importedSrvTyp, inferred.serviceType, inferred.defaultSheet);
        next.push({ id: makeId(), code, name, serviceType: inferred.serviceType, srvTyp, defaultSheet: inferred.defaultSheet, isActive: true });
        imported += 1;
      }
      setServices(next);
      toast.success(imported > 0 ? `Imported ${imported} services` : "No rows imported");
    } catch {
      toast.error("Failed to import CSV");
    }
  };

  if (!isAuthenticated || user?.role !== "admin") return null;

  return (
    <div className="container mx-auto px-4 py-8 text-right" dir="rtl">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Service Directory (SRV_CD)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
            <Input placeholder="كود الخدمة" value={newService.code} onChange={(e) => setNewService((prev) => ({ ...prev, code: e.target.value }))} dir="ltr" />
            <Input placeholder="اسم الخدمة" value={newService.name} onChange={(e) => setNewService((prev) => ({ ...prev, name: e.target.value }))} />
            <Select value={newService.serviceType} onValueChange={(v) => setNewService((prev) => ({ ...prev, serviceType: uiToServiceType(v as ServiceTypeUi) }))}>
              <SelectTrigger><SelectValue placeholder="نوع الخدمة" /></SelectTrigger>
              <SelectContent>
                {serviceTypeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={newService.srvTyp} onValueChange={(v) => setNewService((prev) => ({ ...prev, srvTyp: v as "1" | "2" }))}>
              <SelectTrigger><SelectValue placeholder="SRV_TYP" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">SRV_TYP 1 (Center)</SelectItem>
                <SelectItem value="2">SRV_TYP 2 (External)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={newService.defaultSheet} onValueChange={(v) => setNewService((prev) => ({ ...prev, defaultSheet: v as SheetType }))}>
              <SelectTrigger><SelectValue placeholder="الشيت الافتراضي" /></SelectTrigger>
              <SelectContent>{sheetOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={addService}>إضافة خدمة</Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={saveServices} disabled={updateServicesMutation.isPending || syncPatientsMutation.isPending}>حفظ الدليل</Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.currentTarget.value = "";
                if (!file) return;
                await importServicesCsv(file);
              }}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>استيراد CSV</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Services ({groupedServices.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={groupTab} onValueChange={(v) => setGroupTab(v as "exam" | "operations" | "misc")}> 
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="exam">كشف / فحص</TabsTrigger>
              <TabsTrigger value="operations">عمليات</TabsTrigger>
              <TabsTrigger value="misc">ايرادات متنوعة</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-2 rounded border p-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={allVisibleSelected}
                onCheckedChange={(checked) => {
                  if (Boolean(checked)) {
                    setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
                    return;
                  }
                  setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
                }}
              />
              Select All
            </label>
            <Select value={moveTarget} onValueChange={(v) => setMoveTarget(v as "exam" | "operations" | "misc")}> 
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="نقل إلى" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="exam">كشف / فحص</SelectItem>
                <SelectItem value="operations">عمليات</SelectItem>
                <SelectItem value="misc">ايرادات متنوعة</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={moveSelectedToGroup} disabled={selectedIds.length === 0}>نقل المحدد</Button>

            <Select value={moveSheetType} onValueChange={(v) => setMoveSheetType(v as SheetType)}>
              <SelectTrigger className="w-[240px]"><SelectValue placeholder="نقل حسب نوع الشيت" /></SelectTrigger>
              <SelectContent>{sheetOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" onClick={moveSelectedToSheetType} disabled={selectedIds.length === 0}>نقل حسب الشيت</Button>
          </div>

          <div className="space-y-2">
            {groupedServices.map((service) => (
              <div key={service.id} className="grid grid-cols-1 gap-2 rounded border p-2 md:grid-cols-[auto_1fr_2fr_1fr_1fr_1fr_auto_auto] md:items-center">
                <Checkbox checked={selectedIds.includes(service.id)} onCheckedChange={(checked) => setSelectedIds((prev) => Boolean(checked) ? Array.from(new Set([...prev, service.id])) : prev.filter((id) => id !== service.id))} />
                <Input value={service.code} onChange={(e) => setServices((prev) => prev.map((s) => s.id === service.id ? { ...s, code: e.target.value } : s))} dir="ltr" />
                <Input value={service.name} onChange={(e) => setServices((prev) => prev.map((s) => s.id === service.id ? { ...s, name: e.target.value } : s))} />

                <Select value={service.serviceType} onValueChange={(v) => setServices((prev) => prev.map((s) => s.id === service.id ? { ...s, serviceType: uiToServiceType(v as ServiceTypeUi) } : s))}>
                  <SelectTrigger><SelectValue placeholder="نوع الخدمة" /></SelectTrigger>
                  <SelectContent>
                    {serviceTypeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={service.defaultSheet} onValueChange={(v) => setServices((prev) => prev.map((s) => s.id === service.id ? { ...s, defaultSheet: v as SheetType } : s))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{sheetOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={service.srvTyp} onValueChange={(v) => setServices((prev) => prev.map((s) => s.id === service.id ? { ...s, srvTyp: v as "1" | "2" } : s))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 (Center)</SelectItem>
                    <SelectItem value="2">2 (External)</SelectItem>
                  </SelectContent>
                </Select>

                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={service.isActive} onCheckedChange={(checked) => setServices((prev) => prev.map((s) => s.id === service.id ? { ...s, isActive: Boolean(checked) } : s))} />
                  Active
                </label>
                <Button variant="destructive" size="sm" onClick={() => setServices((prev) => prev.filter((s) => s.id !== service.id))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
