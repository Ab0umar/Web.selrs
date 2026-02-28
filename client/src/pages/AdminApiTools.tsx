import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getTrpcErrorMessage } from "@/lib/utils";

export default function AdminApiTools() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const [patientId, setPatientId] = useState("");
  const [visitId, setVisitId] = useState("");
  const [examinationId, setExaminationId] = useState("");

  const [appointmentDate, setAppointmentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [appointmentType, setAppointmentType] = useState<"examination" | "surgery" | "followup">("examination");
  const [appointmentBranch, setAppointmentBranch] = useState<"examinations" | "surgery">("examinations");

  const [diagnosis, setDiagnosis] = useState("Demo diagnosis");
  const [clinicalOpinion, setClinicalOpinion] = useState("");
  const [recommendedTreatment, setRecommendedTreatment] = useState("");

  const [pentacamLtK1, setPentacamLtK1] = useState("");
  const [syncLimit, setSyncLimit] = useState("500");
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [autoSyncIncremental, setAutoSyncIncremental] = useState(true);
  const [autoSyncOverwriteExisting, setAutoSyncOverwriteExisting] = useState(false);
  const [autoSyncPreserveManualEdits, setAutoSyncPreserveManualEdits] = useState(true);
  const [autoSyncLinkServices, setAutoSyncLinkServices] = useState(true);
  const [autoSyncIntervalMs, setAutoSyncIntervalMs] = useState("30000");
  const [lastSyncResult, setLastSyncResult] = useState<null | {
    fetched: number;
    inserted: number;
    updated: number;
    skipped: number;
    dryRun: boolean;
    startedAt: string;
    finishedAt: string;
  }>(null);

  const appointmentsQuery = trpc.medical.getAllAppointments.useQuery(undefined, { enabled: false });
  const appointmentsByPatientQuery = trpc.medical.getAppointmentsByPatient.useQuery(
    { patientId: Number(patientId || 0) },
    { enabled: false }
  );
  const examinationsQuery = trpc.medical.getAllExaminations.useQuery(undefined, { enabled: false });
  const pentacamByVisitQuery = trpc.medical.getPentacamResultsByVisit.useQuery(
    { visitId: Number(visitId || 0) },
    { enabled: false }
  );
  const doctorReportsByVisitQuery = trpc.medical.getDoctorReportsByVisit.useQuery(
    { visitId: Number(visitId || 0) },
    { enabled: false }
  );
  const mssqlSyncStatusQuery = trpc.medical.getMssqlSyncStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchInterval: 5000,
  });
  const mssqlSyncRuntimeQuery = trpc.medical.getMssqlSyncRuntimeConfig.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchInterval: 10000,
  });

  const createAppointmentMutation = trpc.medical.createAppointment.useMutation({
    onSuccess: () => toast.success("تم إنشاء الموعد"),
    onError: (error: unknown) => toast.error(getTrpcErrorMessage(error, "فشل إنشاء الموعد")),
  });

  const createExaminationMutation = trpc.medical.createExamination.useMutation({
    onSuccess: () => toast.success("تم إنشاء الفحص"),
    onError: (error: unknown) => toast.error(getTrpcErrorMessage(error, "فشل إنشاء الفحص")),
  });

  const updateExaminationMutation = trpc.medical.updateExamination.useMutation({
    onSuccess: () => toast.success("تم تحديث الفحص"),
    onError: (error: unknown) => toast.error(getTrpcErrorMessage(error, "فشل تحديث الفحص")),
  });

  const createPentacamMutation = trpc.medical.createPentacamResult.useMutation({
    onSuccess: () => toast.success("تم حفظ بنتاكام"),
    onError: (error: unknown) => toast.error(getTrpcErrorMessage(error, "فشل حفظ بنتاكام")),
  });

  const createDoctorReportMutation = trpc.medical.createDoctorReport.useMutation({
    onSuccess: () => toast.success("تم حفظ تقرير الطبيب"),
    onError: (error: unknown) => toast.error(getTrpcErrorMessage(error, "فشل حفظ التقرير")),
  });

  const syncMssqlPatientsMutation = trpc.medical.syncPatientsFromMssql.useMutation({
    onSuccess: (result) => {
      setLastSyncResult({
        fetched: Number(result.fetched ?? 0),
        inserted: Number(result.inserted ?? 0),
        updated: Number(result.updated ?? 0),
        skipped: Number(result.skipped ?? 0),
        dryRun: Boolean(result.dryRun),
        startedAt: String(result.startedAt ?? ""),
        finishedAt: String(result.finishedAt ?? ""),
      });
      void mssqlSyncStatusQuery.refetch();
      toast.success("MSSQL patient sync completed");
    },
    onError: (error: unknown) => toast.error(getTrpcErrorMessage(error, "MSSQL sync failed")),
  });
  const updateMssqlSyncRuntimeMutation = trpc.medical.updateMssqlSyncRuntimeConfig.useMutation({
    onSuccess: async () => {
      toast.success("Auto sync config saved");
      await mssqlSyncRuntimeQuery.refetch();
    },
    onError: (error: unknown) =>
      toast.error(getTrpcErrorMessage(error, "Failed to save auto sync config")),
  });

  useEffect(() => {
    const cfg = mssqlSyncRuntimeQuery.data;
    if (!cfg) return;
    setAutoSyncEnabled(Boolean(cfg.enabled));
    setAutoSyncIncremental(Boolean(cfg.incremental));
    setAutoSyncOverwriteExisting(Boolean((cfg as any).overwriteExisting));
    setAutoSyncPreserveManualEdits(Boolean((cfg as any).preserveManualEdits ?? true));
    setAutoSyncLinkServices(Boolean((cfg as any).linkServicesForExisting ?? true));
    setAutoSyncIntervalMs(String(cfg.intervalMs ?? 30000));
    setSyncLimit(String(cfg.limit ?? 500));
  }, [mssqlSyncRuntimeQuery.data]);

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  if (!isAuthenticated) return null;
  if (user?.role !== "admin") return null;

  const patientIdNum = Number(patientId || 0);
  const visitIdNum = Number(visitId || 0);
  const examIdNum = Number(examinationId || 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>المعرفات الأساسية</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="patientId"
            />
            <Input
              value={visitId}
              onChange={(e) => setVisitId(e.target.value)}
              placeholder="visitId"
            />
            <Input
              value={examinationId}
              onChange={(e) => setExaminationId(e.target.value)}
              placeholder="examinationId"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>المواعيد (Appointments)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input type="date" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} />
              <Select value={appointmentType} onValueChange={(v) => setAppointmentType(v as any)}>
                <SelectTrigger><SelectValue placeholder="نوع الموعد" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="examination">فحص</SelectItem>
                  <SelectItem value="surgery">عملية</SelectItem>
                  <SelectItem value="followup">متابعة</SelectItem>
                </SelectContent>
              </Select>
              <Select value={appointmentBranch} onValueChange={(v) => setAppointmentBranch(v as any)}>
                <SelectTrigger><SelectValue placeholder="الفرع" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="examinations">فحوصات</SelectItem>
                  <SelectItem value="surgery">عمليات</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  createAppointmentMutation.mutate({
                    patientId: patientIdNum,
                    appointmentDate,
                    appointmentType,
                    branch: appointmentBranch,
                  })
                }
              >
                إنشاء موعد
              </Button>
              <Button variant="outline" onClick={() => appointmentsQuery.refetch()}>
                جميع المواعيد
              </Button>
              <Button variant="outline" onClick={() => appointmentsByPatientQuery.refetch()}>
                مواعيد المريض
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
               : {appointmentsQuery.data ? appointmentsQuery.data.length : "-"} |  :{" "}
              {appointmentsByPatientQuery.data ? appointmentsByPatientQuery.data.length : "-"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>الفحوصات (Examinations)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                onClick={() =>
                  createExaminationMutation.mutate({
                    visitId: visitIdNum,
                    patientId: patientIdNum,
                    ucvaOD: "6/6",
                  })
                }
              >
                إنشاء فحص
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  updateExaminationMutation.mutate({
                    examinationId: examIdNum,
                    updates: { findings: "Updated findings" },
                  })
                }
              >
                تحديث فحص
              </Button>
              <Button variant="outline" onClick={() => examinationsQuery.refetch()}>
                جميع الفحوصات
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
               : {examinationsQuery.data ? examinationsQuery.data.length : "-"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>البنتاكام (Pentacam)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              value={pentacamLtK1}
              onChange={(e) => setPentacamLtK1(e.target.value)}
              placeholder="ltK1"
            />
            <div className="flex gap-2">
              <Button
                onClick={() =>
                  createPentacamMutation.mutate({
                    visitId: visitIdNum,
                    patientId: patientIdNum,
                    ltK1: pentacamLtK1 ? Number(pentacamLtK1) : undefined,
                  })
                }
              >
                إنشاء بنتاكام
              </Button>
              <Button variant="outline" onClick={() => pentacamByVisitQuery.refetch()}>
                بنتاكام حسب الزيارة
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
               : {pentacamByVisitQuery.data ? pentacamByVisitQuery.data.length : "-"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>تقارير الطبيب (Doctor Reports)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="التشخيص" />
              <Input value={clinicalOpinion} onChange={(e) => setClinicalOpinion(e.target.value)} placeholder="الرأي الطبي" />
              <Input value={recommendedTreatment} onChange={(e) => setRecommendedTreatment(e.target.value)} placeholder="العلاج المقترح" />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() =>
                  createDoctorReportMutation.mutate({
                    visitId: visitIdNum,
                    patientId: patientIdNum,
                    diagnosis,
                    clinicalOpinion,
                    recommendedTreatment,
                  })
                }
              >
                إنشاء تقرير طبيب
              </Button>
              <Button variant="outline" onClick={() => doctorReportsByVisitQuery.refetch()}>
                تقارير حسب الزيارة
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
               : {doctorReportsByVisitQuery.data ? doctorReportsByVisitQuery.data.length : "-"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>MSSQL Patient Sync</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                value={syncLimit}
                onChange={(e) => setSyncLimit(e.target.value)}
                placeholder="Sync limit (e.g. 500)"
              />
              <Input
                value={autoSyncIntervalMs}
                onChange={(e) => setAutoSyncIntervalMs(e.target.value)}
                placeholder="Auto interval ms (min 5000)"
              />
              <Select value={autoSyncEnabled ? "on" : "off"} onValueChange={(v) => setAutoSyncEnabled(v === "on")}>
                <SelectTrigger>
                  <SelectValue placeholder="Auto Sync" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">Auto Sync ON</SelectItem>
                  <SelectItem value="off">Auto Sync OFF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select value={autoSyncIncremental ? "incremental" : "full"} onValueChange={(v) => setAutoSyncIncremental(v === "incremental")}>
                <SelectTrigger>
                  <SelectValue placeholder="Auto Sync Mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="incremental">Incremental</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                disabled={updateMssqlSyncRuntimeMutation.isPending}
                onClick={() => {
                  if (autoSyncOverwriteExisting) {
                    const ok = window.confirm(
                      "WARNING: Overwrite mode can update existing patient records from MSSQL sync.\nOnly enable if you are sure. Continue?"
                    );
                    if (!ok) return;
                  }
                  updateMssqlSyncRuntimeMutation.mutate({
                    enabled: autoSyncEnabled,
                    incremental: autoSyncIncremental,
                    intervalMs: Math.max(5000, Number(autoSyncIntervalMs || 30000) || 30000),
                    limit: Math.max(1, Math.min(20000, Number(syncLimit || 500) || 500)),
                    overwriteExisting: autoSyncOverwriteExisting,
                    preserveManualEdits: autoSyncPreserveManualEdits,
                    linkServicesForExisting: autoSyncLinkServices,
                  });
                }}
              >
                Save Auto Sync Config
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                value={autoSyncOverwriteExisting ? "on" : "off"}
                onValueChange={(v) => setAutoSyncOverwriteExisting(v === "on")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Overwrite Existing" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Overwrite Existing: OFF (Safe)</SelectItem>
                  <SelectItem value="on">Overwrite Existing: ON (Danger)</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={autoSyncPreserveManualEdits ? "on" : "off"}
                onValueChange={(v) => setAutoSyncPreserveManualEdits(v === "on")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Preserve Manual Edits" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">Preserve Manual Edits: ON (Recommended)</SelectItem>
                  <SelectItem value="off">Preserve Manual Edits: OFF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                value={autoSyncLinkServices ? "on" : "off"}
                onValueChange={(v) => setAutoSyncLinkServices(v === "on")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Link Services For Existing" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">Link Services: ON</SelectItem>
                  <SelectItem value="off">Link Services: OFF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground">
              {mssqlSyncStatusQuery.data
                ? `State: ${(mssqlSyncStatusQuery.data as any).running ? "Running" : "Idle"} | Last Sync: ${mssqlSyncStatusQuery.data.lastSuccessAt ? new Date(mssqlSyncStatusQuery.data.lastSuccessAt).toLocaleString() : "Never"} | Last Mode: ${mssqlSyncStatusQuery.data.lastMode ?? "-"} | Marker: ${mssqlSyncStatusQuery.data.lastMarker ?? "-"} | Last Changes: ${String((mssqlSyncStatusQuery.data as any).lastChangeCount ?? "-")} | Next Run: ${(mssqlSyncStatusQuery.data as any).nextRunAt ? new Date((mssqlSyncStatusQuery.data as any).nextRunAt).toLocaleString() : "-"}${(mssqlSyncStatusQuery.data as any).lastError ? ` | Last Error: ${String((mssqlSyncStatusQuery.data as any).lastError)}` : ""}`
                : "Loading sync status..."}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={syncMssqlPatientsMutation.isPending}
                onClick={() =>
                  syncMssqlPatientsMutation.mutate({
                    dryRun: true,
                    limit: Math.max(1, Number(syncLimit || 500) || 500),
                  })
                }
              >
                Dry Run MSSQL Sync
              </Button>
              <Button
                variant="outline"
                disabled={syncMssqlPatientsMutation.isPending}
                onClick={() =>
                  syncMssqlPatientsMutation.mutate({
                    dryRun: false,
                    incremental: true,
                    limit: Math.max(1, Number(syncLimit || 500) || 500),
                  })
                }
              >
                Run Incremental Sync
              </Button>
              <Button
                disabled={syncMssqlPatientsMutation.isPending}
                onClick={() =>
                  syncMssqlPatientsMutation.mutate({
                    dryRun: false,
                    incremental: false,
                    limit: Math.max(1, Number(syncLimit || 500) || 500),
                  })
                }
              >
                Run MSSQL Sync
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
              {syncMssqlPatientsMutation.isPending
                ? "Sync running..."
                : lastSyncResult
                  ? `Fetched: ${lastSyncResult.fetched} | Inserted: ${lastSyncResult.inserted} | Updated: ${lastSyncResult.updated} | Skipped: ${lastSyncResult.skipped} | Mode: ${lastSyncResult.dryRun ? "Dry Run" : "Live"}`
                  : "No sync result yet"}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}


