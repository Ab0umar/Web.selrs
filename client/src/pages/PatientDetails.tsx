import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Download, PrinterIcon } from "lucide-react";
import { toast } from "sonner";
import PatientPicker from "@/components/PatientPicker";
import PentacamFilesPanel from "@/components/PentacamFilesPanel";
import { trpc } from "@/lib/trpc";
import { useAppNavigation } from "@/hooks/useAppNavigation";

function parseJson(value?: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatDate(value?: string | Date | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return date.toISOString().split("T")[0];
}

export default function PatientDetails() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { goBack } = useAppNavigation();
  const [, params] = useRoute("/patients/:id");
  const patientId = params?.id ? Number(params.id) : undefined;

  const patientQuery = trpc.medical.getPatient.useQuery(
    { patientId: patientId ?? 0 },
    { enabled: Boolean(patientId), refetchOnWindowFocus: false }
  );
  const updatePatientMutation = trpc.medical.updatePatient.useMutation({
    onSuccess: () => {
      patientQuery.refetch();
      toast.success("تم تحديث كود المريض");
    },
    onError: () => {
      toast.error("فشل تحديث كود المريض");
    },
  });

  const examinationsQuery = trpc.medical.getExaminationsByPatient.useQuery(
    { patientId: patientId ?? 0 },
    { enabled: Boolean(patientId) }
  );

  const reportsQuery = trpc.medical.getMedicalReportsByPatient.useQuery(
    { patientId: patientId ?? 0 },
    { enabled: Boolean(patientId) }
  );

  const prescriptionsQuery = trpc.medical.getPrescriptionsByPatient.useQuery(
    { patientId: patientId ?? 0 },
    { enabled: Boolean(patientId) }
  );

  const surgeriesQuery = trpc.medical.getSurgeriesByPatient.useQuery(
    { patientId: patientId ?? 0 },
    { enabled: Boolean(patientId) }
  );

  const followupsQuery = trpc.medical.getPostOpFollowupsByPatient.useQuery(
    { patientId: patientId ?? 0 },
    { enabled: Boolean(patientId) }
  );

  const [activeTab, setActiveTab] = useState("overview");
  const [patientCodeDraft, setPatientCodeDraft] = useState("");
  const [serviceTypeDraft, setServiceTypeDraft] = useState("");
  const [serviceCodeDraft, setServiceCodeDraft] = useState("");
  const patientStateQuery = trpc.medical.getPatientPageState.useQuery(
    { patientId: patientId ?? 0, page: "patient-details" },
    { enabled: Boolean(patientId), refetchOnWindowFocus: false }
  );
  const examStateQuery = trpc.medical.getPatientPageState.useQuery(
    { patientId: patientId ?? 0, page: "examination" },
    { enabled: Boolean(patientId), refetchOnWindowFocus: false }
  );
  const serviceDirectoryQuery = trpc.medical.getSystemSetting.useQuery(
    { key: "service_directory" },
    { refetchOnWindowFocus: false }
  );
  const doctorDirectoryQuery = trpc.medical.getDoctorDirectory.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const savePatientStateMutation = trpc.medical.savePatientPageState.useMutation();
  const patientStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    if (!patientId) return;
    const raw = localStorage.getItem(`patient_state_details_${patientId}`);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (data.activeTab !== undefined) setActiveTab(data.activeTab ?? "overview");
    } catch {
      // ignore bad cache
    }
  }, [patientId]);

  useEffect(() => {
    const data = (patientStateQuery.data as any)?.data;
    if (!data) return;
    if (data.activeTab !== undefined) setActiveTab(data.activeTab ?? "overview");
  }, [patientStateQuery.data]);

  useEffect(() => {
    if (!patientId) return;
    if (patientStateTimerRef.current) clearTimeout(patientStateTimerRef.current);
    const payload = { activeTab };
    localStorage.setItem(`patient_state_details_${patientId}`, JSON.stringify(payload));
    patientStateTimerRef.current = setTimeout(() => {
      savePatientStateMutation.mutate({ patientId, page: "patient-details", data: payload });
    }, 600);
    return () => {
      if (patientStateTimerRef.current) clearTimeout(patientStateTimerRef.current);
    };
  }, [patientId, activeTab, savePatientStateMutation]);

  if (!isAuthenticated) return null;

  const initialPatientId = patientId;
  const patient = patientQuery.data as any;

  const examinations = examinationsQuery.data ?? [];
  const reports = reportsQuery.data ?? [];
  const prescriptions = prescriptionsQuery.data ?? [];
  const surgeries = surgeriesQuery.data ?? [];
  const followups = followupsQuery.data ?? [];

  const latestReport = reports[0];
  const latestReportContent =
    parseJson((latestReport as any)?.content ?? latestReport?.diagnosis) ??
    (latestReport as any)?.content ??
    latestReport?.diagnosis ??
    latestReport?.treatment ??
    null;

  const handleSelectPatient = (p: {
    id: number;
    fullName: string;
    patientCode?: string | null;
  }) => {
    if (p.id) {
      setLocation(`/patients/${p.id}`);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    window.print();
  };

  const patientName = patient?.fullName ?? "";
  const patientCode = patient?.patientCode ?? "";
  const serviceType = String(patient?.serviceType ?? "").trim();
  const serviceCode = String((examStateQuery.data as any)?.data?.serviceCode ?? "").trim();
  const serviceDirectory = useMemo(() => {
    const raw = (serviceDirectoryQuery.data as any)?.value;
    return Array.isArray(raw) ? raw : [];
  }, [serviceDirectoryQuery.data]);
  const activeServiceOptions = useMemo(
    () =>
      serviceDirectory
        .filter((s: any) => s && s.isActive !== false)
        .map((s: any) => ({
          code: String(s.code ?? "").trim(),
          name: String(s.name ?? "").trim(),
          serviceType: String(s.serviceType ?? "").trim(),
        }))
        .filter((s: any) => s.code && s.name),
    [serviceDirectory]
  );
  const serviceByCode = useMemo(() => {
    const map = new Map<string, { code: string; name: string; serviceType: string }>();
    for (const item of activeServiceOptions) map.set(item.code, item);
    return map;
  }, [activeServiceOptions]);
  const selectedDoctorName = useMemo(() => {
    const fromExam = String((examStateQuery.data as any)?.data?.doctorName ?? "").trim();
    const fromPatient = String((patient as any)?.treatingDoctor ?? "").trim();
    return fromExam || fromPatient;
  }, [examStateQuery.data, patient]);
  const selectedDoctor = useMemo(() => {
    const list = Array.isArray(doctorDirectoryQuery.data) ? (doctorDirectoryQuery.data as any[]) : [];
    if (!selectedDoctorName) return null;
    return (
      list.find((d) => String(d?.name ?? "").trim() === selectedDoctorName && d?.isActive !== false) ??
      null
    );
  }, [doctorDirectoryQuery.data, selectedDoctorName]);
  const filteredServiceOptions = useMemo(() => {
    const normalizedServiceType = String(serviceTypeDraft || serviceType || "").trim().toLowerCase();
    const doctorType = String((selectedDoctor as any)?.doctorType ?? "").trim().toLowerCase();

    let targetType = normalizedServiceType;
    if (!targetType && (doctorType === "consultant" || doctorType === "specialist")) {
      targetType = doctorType;
    }

    if (!targetType) return activeServiceOptions;
    return activeServiceOptions.filter(
      (opt: any) => String(opt.serviceType ?? "").trim().toLowerCase() === targetType
    );
  }, [activeServiceOptions, serviceTypeDraft, serviceType, selectedDoctor]);
  const selectedServiceOption = useMemo(
    () => (serviceCodeDraft ? serviceByCode.get(serviceCodeDraft) : undefined),
    [serviceByCode, serviceCodeDraft]
  );
  const multiServiceCodes = useMemo(() => {
    const fromExamRaw = Array.isArray((examStateQuery.data as any)?.data?.serviceCodes)
      ? ((examStateQuery.data as any).data.serviceCodes as unknown[])
      : [];
    const fromPatientRaw = Array.isArray((patient as any)?.serviceCodes)
      ? ((patient as any).serviceCodes as unknown[])
      : [];
    return Array.from(
      new Set(
        [
          ...fromExamRaw.map((v) => String(v ?? "").trim()),
          ...fromPatientRaw.map((v) => String(v ?? "").trim()),
          String((examStateQuery.data as any)?.data?.serviceCode ?? "").trim(),
          String((patient as any)?.serviceCode ?? "").trim(),
          serviceCodeDraft,
        ].filter(Boolean)
      )
    );
  }, [examStateQuery.data, patient, serviceCodeDraft]);
  const serviceSelectOptions = useMemo(() => {
    const map = new Map<string, { code: string; name: string; serviceType: string }>();
    for (const opt of filteredServiceOptions) map.set(opt.code, opt);
    for (const code of multiServiceCodes) {
      if (!code) continue;
      if (!map.has(code)) {
        const known = serviceByCode.get(code);
        map.set(code, { code, name: known?.name || code, serviceType: known?.serviceType || "" });
      }
    }
    return Array.from(map.values());
  }, [filteredServiceOptions, multiServiceCodes, serviceByCode]);

  useEffect(() => {
    setPatientCodeDraft(patient?.patientCode ?? "");
  }, [patient?.patientCode]);

  useEffect(() => {
    setServiceTypeDraft(serviceType);
  }, [serviceType]);

  useEffect(() => {
    setServiceCodeDraft(serviceCode);
  }, [serviceCode]);

  const overviewStats = useMemo(
    () => ({
      age: patient?.age ?? "",
      gender: patient?.gender ?? "",
      status: patient?.status ?? "",
      registrationDate: formatDate(patient?.createdAt),
    }),
    [patient]
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground shadow-lg sticky top-0 z-10 print:hidden">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => goBack()}
                className="text-primary-foreground hover:bg-primary/80"
              >
                <ArrowRight className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">{patientName}</h1>
                <p className="text-sm opacity-90">{patientCode}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                type="button"
                className="text-primary-foreground border-primary-foreground hover:bg-primary/80"
              >
                <PrinterIcon className="h-4 w-4 mr-2" />
                طباعة
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPDF}
                type="button"
                className="text-primary-foreground border-primary-foreground hover:bg-primary/80"
              >
                <Download className="h-4 w-4 mr-2" />
                تحميل PDF
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 print:p-0">
        <div className="mb-4 flex items-center gap-3 print:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={() => goBack()}
          >
            <ArrowRight className="h-4 w-4 ml-2" />
            رجوع
          </Button>
          <PatientPicker initialPatientId={initialPatientId} onSelect={handleSelectPatient} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-1">العمر</p>
              <p className="text-2xl font-bold">{overviewStats.age} سنة</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-1">الجنس</p>
              <p className="text-2xl font-bold">{overviewStats.gender}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-1">الحالة</p>
              <Badge className="bg-blue-500">{overviewStats.status}</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-1">تاريخ التسجيل</p>
              <p className="text-sm font-semibold">{overviewStats.registrationDate}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6 mb-8 print:hidden" dir="rtl" style={{ direction: "rtl" }}>
            <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
            <TabsTrigger value="examinations">الفحوصات</TabsTrigger>
            <TabsTrigger value="pentacam">بنتاكام</TabsTrigger>
            <TabsTrigger value="diagnosis">التشخيص</TabsTrigger>
            <TabsTrigger value="treatment">العلاج</TabsTrigger>
            <TabsTrigger value="followup">المتابعة</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>البيانات الشخصية</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">الاسم</p>
                    <p className="font-semibold">{patientName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">رقم المريض</p>
                    <div className="flex items-center gap-2">
                      <Input
                        value={patientCodeDraft}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPatientCodeDraft(e.target.value)}
                        placeholder="كود المريض"
                        className="max-w-xs"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (!patientId) return;
                          updatePatientMutation.mutateAsync({
                            patientId,
                            updates: { patientCode: patientCodeDraft.trim() },
                          });
                        }}
                      >
                        حفظ
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">الهاتف</p>
                    <p className="font-semibold">{patient?.phone ?? ""}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">الخدمة</p>
                    <div className="flex items-center gap-2">
                      <Select value={serviceCodeDraft || "__none"} onValueChange={(value) => setServiceCodeDraft(value === "__none" ? "" : value)}>
                        <SelectTrigger className="max-w-xs">
                          <SelectValue placeholder="اختر الخدمة" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">—</SelectItem>
                          {serviceSelectOptions.map((opt: any) => (
                            <SelectItem key={opt.code} value={opt.code}>
                              {opt.code} - {opt.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (!patientId) return;
                          const selected = serviceCodeDraft ? serviceByCode.get(serviceCodeDraft) : undefined;
                          const nextServiceType = selected?.serviceType || serviceTypeDraft || serviceType || "";
                          try {
                            await updatePatientMutation.mutateAsync({
                              patientId,
                              updates: { serviceType: nextServiceType || undefined },
                            });
                            const existingExamData =
                              (examStateQuery.data as any)?.data &&
                              typeof (examStateQuery.data as any).data === "object"
                                ? { ...((examStateQuery.data as any).data as Record<string, unknown>) }
                                : {};
                            await savePatientStateMutation.mutateAsync({
                              patientId,
                              page: "examination",
                              data: {
                                ...existingExamData,
                                serviceCode: serviceCodeDraft || "",
                                serviceCodes: Array.from(
                                  new Set(
                                    [
                                      ...(Array.isArray((existingExamData as any).serviceCodes)
                                        ? ((existingExamData as any).serviceCodes as unknown[]).map((v) => String(v ?? "").trim())
                                        : []),
                                      serviceCodeDraft || "",
                                    ].filter(Boolean)
                                  )
                                ),
                              },
                            });
                            setServiceTypeDraft(nextServiceType);
                            toast.success("تم تحديث الخدمة");
                          } catch {
                            toast.error("فشل تحديث الخدمة");
                          }
                        }}
                      >
                        حفظ
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Service Type</p>
                    <p className="font-semibold">{selectedServiceOption?.serviceType || serviceTypeDraft || serviceType || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">العنوان</p>
                    <p className="font-semibold">{patient?.address ?? ""}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>الملاحظات الطبية</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {patient?.medicalHistory ?? "   "}
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="examinations" className="space-y-6">
            {examinations.length === 0 && (
              <Card>
                <CardContent className="pt-6 text-muted-foreground">
                  لا توجد فحوصات محفوظة
                </CardContent>
              </Card>
            )}
            {examinations.map((exam: any) => {
              const findings = parseJson(exam.findings);
              return (
                <Card key={exam.id}>
                  <CardHeader>
                    <CardTitle>{exam.type}</CardTitle>
                    <CardDescription>{formatDate(exam.createdAt)}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {findings ? (
                      <pre className="bg-muted/40 p-3 rounded-md text-xs overflow-x-auto">
                        {JSON.stringify(findings, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-sm">{exam.findings ?? ""}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="pentacam" className="space-y-6">
            <PentacamFilesPanel patientId={patientId} />
          </TabsContent>

          <TabsContent value="diagnosis">
            <Card>
              <CardHeader>
                <CardTitle>التشخيص الطبي</CardTitle>
                <CardDescription>{latestReport ? formatDate(latestReport.createdAt) : ""}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {latestReportContent ? (
                  typeof latestReportContent === "string" ? (
                    <p className="text-sm whitespace-pre-wrap">{latestReportContent}</p>
                  ) : (
                    <pre className="bg-muted/40 p-3 rounded-md text-xs overflow-x-auto">
                      {JSON.stringify(latestReportContent, null, 2)}
                    </pre>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">لا توجد تقارير طبية</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="treatment">
            <Card>
              <CardHeader>
                <CardTitle>العلاج والروشتة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {prescriptions.length === 0 && (
                  <p className="text-sm text-muted-foreground">لا توجد روشتات محفوظة</p>
                )}
                {prescriptions.map((prescription: any) => {
                  const notes = parseJson(prescription.notes);
                  return (
                    <div key={prescription.id} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{prescription.medicationName ?? ""}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(prescription.prescriptionDate)}</span>
                      </div>
                      {notes ? (
                        <pre className="bg-muted/40 p-2 rounded-md text-xs overflow-x-auto">
                          {JSON.stringify(notes, null, 2)}
                        </pre>
                      ) : (
                        <p className="text-sm text-muted-foreground">{prescription.notes ?? ""}</p>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="followup">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>العمليات</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {surgeries.length === 0 && (
                    <p className="text-sm text-muted-foreground">لا توجد عمليات محفوظة</p>
                  )}
                  {surgeries.map((surgery: any) => (
                    <div key={surgery.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">عملية #{surgery.id}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(surgery.surgeryDate)}</span>
                      </div>
                      {surgery.notes && (
                        <p className="text-sm text-muted-foreground mt-2">{surgery.notes}</p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>متابعات ما بعد العملية</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {followups.length === 0 && (
                    <p className="text-sm text-muted-foreground">لا توجد متابعات محفوظة</p>
                  )}
                  {followups.map((followup: any) => (
                    <div key={followup.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">متابعة #{followup.id}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(followup.followupDate)}</span>
                      </div>
                      {followup.findings && (
                        <p className="text-sm text-muted-foreground mt-2">{followup.findings}</p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
