import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileText, Plus, Download, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import PatientPicker from "@/components/PatientPicker";
import { trpc } from "@/lib/trpc";
import { formatDateLabel, getTrpcErrorMessage } from "@/lib/utils";
import PageHeader from "@/components/PageHeader";

export default function MedicalReports() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const reportsQuery = trpc.medical.getMedicalReportsByPatient.useQuery(
    { patientId: selectedPatientId ?? 0 },
    { enabled: Boolean(selectedPatientId), refetchOnWindowFocus: false }
  );
  const userStateQuery = trpc.medical.getUserPageState.useQuery(
    { page: "medical_reports" },
    { refetchOnWindowFocus: false }
  );
  const saveUserStateMutation = trpc.medical.saveUserPageState.useMutation();
  const userStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patientQuery = trpc.medical.getPatient.useQuery(
    { patientId: selectedPatientId ?? 0 },
    { enabled: Boolean(selectedPatientId), refetchOnWindowFocus: false }
  );
  const prescriptionsQuery = trpc.medical.getPrescriptionsByPatient.useQuery(
    { patientId: selectedPatientId ?? 0 },
    { enabled: Boolean(selectedPatientId), refetchOnWindowFocus: false }
  );
  const sheetQuery = trpc.medical.getSheetEntry.useQuery(
    { patientId: selectedPatientId ?? 0, sheetType: "consultant" },
    { enabled: Boolean(selectedPatientId), refetchOnWindowFocus: false }
  );
  const createReportMutation = trpc.medical.createMedicalReport.useMutation({
    onSuccess: () => {
      toast.success("تم إنشاء التقرير بنجاح");
      reportsQuery.refetch();
    },
  });
  const updateReportMutation = trpc.medical.updateMedicalReport.useMutation({
    onSuccess: () => {
      toast.success("تم تعديل التقرير");
      reportsQuery.refetch();
    },
  });
  const deleteReportMutation = trpc.medical.deleteMedicalReport.useMutation({
    onSuccess: () => {
      toast.success("تم حذف التقرير");
      reportsQuery.refetch();
    },
  });
  const diseasesQuery = trpc.medical.getAllDiseases.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ReportRow | null>(null);
  const [diseaseSearch, setDiseaseSearch] = useState("");
  const [expandedDiseaseGroups, setExpandedDiseaseGroups] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    patientName: "",
    patientCode: "",
    phone: "",
    age: "",
    address: "",
    visitDate: new Date().toISOString().split("T")[0],
    operationType: "",
    diagnosis: "",
    diseases: [] as string[],
    recommendation: "",
    prescription: "",
    notes: "",
  });

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    const raw = localStorage.getItem("user_state_medical_reports");
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data.expandedDiseaseGroups)) setExpandedDiseaseGroups(data.expandedDiseaseGroups);
      if (typeof data.diseaseSearch === "string") setDiseaseSearch(data.diseaseSearch);
    } catch {
      // ignore bad cache
    }
  }, []);

  useEffect(() => {
    const data = (userStateQuery.data as any)?.data;
    if (!data) return;
    if (Array.isArray(data.expandedDiseaseGroups)) setExpandedDiseaseGroups(data.expandedDiseaseGroups);
    if (typeof data.diseaseSearch === "string") setDiseaseSearch(data.diseaseSearch);
  }, [userStateQuery.data]);

  useEffect(() => {
    const payload = {
      expandedDiseaseGroups,
      diseaseSearch,
    };
    localStorage.setItem("user_state_medical_reports", JSON.stringify(payload));
    if (userStateTimerRef.current) clearTimeout(userStateTimerRef.current);
    userStateTimerRef.current = setTimeout(() => {
      saveUserStateMutation.mutate({ page: "medical_reports", data: payload });
    }, 800);
    return () => {
      if (userStateTimerRef.current) clearTimeout(userStateTimerRef.current);
    };
  }, [expandedDiseaseGroups, diseaseSearch, saveUserStateMutation]);

  if (!isAuthenticated) return null;

  const canWriteReports = ["doctor", "admin"].includes(user?.role || "");
  type ReportRow = {
    id: number;
    patientName: string;
    patientCode: string;
    patientAge?: string;
    date: string;
    doctor: string;
    diagnosis: string;
    diseases?: string[];
    recommendation: string;
    prescription?: string;
    notes?: string;
    operationType?: string;
    visitDate?: string;
  };

  const handleCreateReport = async () => {
    if (!selectedPatientId) {
      toast.error("يرجى اختيار المريض أولاً");
      return;
    }
    if (!formData.patientName || formData.diseases.length === 0) {
      toast.error("يرجى اختيار الأمراض");
      return;
    }

    try {
      if (selectedReport) {
        await updateReportMutation.mutateAsync({
          reportId: selectedReport.id,
          visitDate: formData.visitDate,
          diagnosis: formData.diagnosis,
          diseases: formData.diseases,
          prescription: formData.prescription,
          recommendations: formData.recommendation,
          clinicalOpinion: formData.notes,
          operationType: formData.operationType,
          additionalNotes: formData.notes,
        });
      } else {
        await createReportMutation.mutateAsync({
        patientId: selectedPatientId,
        visitDate: formData.visitDate,
        diagnosis: formData.diagnosis,
        diseases: formData.diseases,
        clinicalOpinion: formData.notes,
        recommendations: formData.recommendation,
        operationType: formData.operationType,
        prescription: formData.prescription,
        additionalNotes: formData.notes,
        });
      }
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "حدث خطأ أثناء إنشاء التقرير"));
      return;
    }

    setFormData({
      patientName: "",
      patientCode: "",
      phone: "",
      age: "",
      address: "",
      visitDate: new Date().toISOString().split("T")[0],
      operationType: "",
      diagnosis: "",
      diseases: [],
      recommendation: "",
      prescription: "",
      notes: "",
    });
    setIsDialogOpen(false);
    setSelectedReport(null);
  };

  const handleDeleteReport = async (id: number) => {
    if (!window.confirm("هل أنت متأكد من حذف التقرير؟")) return;
    try {
      await deleteReportMutation.mutateAsync({ reportId: id });
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "حدث خطأ أثناء حذف التقرير"));
    }
  };

  const handleViewReport = (report: any) => {
    setSelectedReport(report);
  };

  const handleDownloadReportPdf = (report?: ReportRow | null) => {
    if (report) {
      setSelectedReport(report);
    }
    window.setTimeout(() => {
      window.print();
    }, 100);
  };

  const handleSelectPatient = (patient: {
    id: number;
    fullName: string;
    patientCode?: string | null;
  }) => {
    setSelectedPatientId(patient.id);
    setFormData((prev) => ({
      ...prev,
      patientName: patient.fullName ?? "",
      patientCode: patient.patientCode ?? "",
    }));
  };

  useEffect(() => {
    const patient = patientQuery.data as any;
    if (!patient) return;
    setFormData((prev) => ({
      ...prev,
      patientName: patient.fullName ?? prev.patientName,
      patientCode: patient.patientCode ?? prev.patientCode,
      phone: patient.phone ?? "",
      age: patient.age != null ? String(patient.age) : "",
      address: patient.address ?? "",
    }));
  }, [patientQuery.data]);

  useEffect(() => {
    const diagnosisFromDiseases = formData.diseases.join("، ");
    if (formData.diagnosis === diagnosisFromDiseases) return;
    setFormData((prev) => ({
      ...prev,
      diagnosis: diagnosisFromDiseases,
    }));
  }, [formData.diseases, formData.diagnosis]);

  useEffect(() => {
    if (!sheetQuery.data) return;
    try {
      const parsed = JSON.parse(sheetQuery.data);
      if (parsed?.examData?.autorefraction) {
        const auto = parsed.examData.autorefraction;
        const summary = [
          `UCVA OD: ${auto?.od?.ucva ?? "-"}`,
          `UCVA OS: ${auto?.os?.ucva ?? "-"}`,
          `BCVA OD: ${auto?.od?.bcva ?? "-"}`,
          `BCVA OS: ${auto?.os?.bcva ?? "-"}`,
          `IOP OD: ${auto?.od?.iop ?? "-"}`,
          `IOP OS: ${auto?.os?.iop ?? "-"}`,
        ].join(" | ");
        setFormData((prev) => ({
          ...prev,
          notes: prev.notes ? prev.notes : summary,
        }));
      }
    } catch {
      // ignore
    }
  }, [sheetQuery.data]);

  useEffect(() => {
    const latest = (prescriptionsQuery.data ?? [])[0] as any;
    if (!latest) return;
    setFormData((prev) => ({
      ...prev,
      prescription: prev.prescription || latest.notes || "",
    }));
  }, [prescriptionsQuery.data]);

  const parsedReports = useMemo(() => {
    const rows = reportsQuery.data ?? [];
    const patientName = (patientQuery.data as any)?.fullName ?? formData.patientName;
    const patientCode = (patientQuery.data as any)?.patientCode ?? formData.patientCode;
    const patientAgeRaw = (patientQuery.data as any)?.age;
    const patientAge = patientAgeRaw != null ? String(patientAgeRaw) : "";
    return rows.map((report: any) => {
      const diseases = (() => {
        try {
          return report.diseases ? JSON.parse(report.diseases) : [];
        } catch {
          return [];
        }
      })();
      return {
        id: report.id,
        patientName,
        patientCode,
        patientAge,
        date: (() => {
          const date = report.createdAt instanceof Date ? report.createdAt : new Date(report.createdAt);
          return Number.isNaN(date.valueOf()) ? "" : date.toISOString().split("T")[0];
        })(),
        doctor: user?.name || "",
        diagnosis: report.diagnosis ?? "",
        diseases,
        recommendation: report.recommendations ?? report.operationType ?? "",
        prescription: report.treatment ?? "",
        notes: report.clinicalOpinion ?? report.additionalNotes ?? "",
        operationType: report.operationType ?? "",
        visitDate: report.visitDate ? String(report.visitDate).split("T")[0] : "",
      };
    });
  }, [reportsQuery.data, formData.patientName, formData.patientCode, user?.name]);

  return (
    <div className="min-h-screen bg-background text-right">
      {/* Header */}
      <PageHeader backTo="/dashboard" />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 print:p-0">
        <div className="mb-6 print:hidden">
          <PatientPicker onSelect={handleSelectPatient} />
        </div>
        {/* Create Report Button */}
        {canWriteReports && (
          <div className="mb-8 print:hidden">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90">
                  <Plus className="h-4 w-4 mr-2" />
                  إنشاء تقرير جديد
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto text-right" dir="rtl">
                <DialogHeader>
                  <DialogTitle>إنشاء تقرير طبي جديد</DialogTitle>
                  <DialogDescription>
                    أدخل بيانات التقرير الطبي والروشتة
                  </DialogDescription>
                </DialogHeader>
                <div className="mb-4">
                  <PatientPicker onSelect={handleSelectPatient} />
                </div>
                <Tabs defaultValue="patient-info" className="w-full">
                  <TabsList className="grid w-full grid-cols-3" dir="rtl">
                    <TabsTrigger value="prescription">الروشتة</TabsTrigger>
                    <TabsTrigger value="diagnosis">التشخيص</TabsTrigger>
                    <TabsTrigger value="patient-info">المريض</TabsTrigger>
                  </TabsList>

                  {/* Patient Info Tab */}
                  <TabsContent value="patient-info" className="space-y-4">
                    <div>
                      <Label htmlFor="patient-name">اسم المريض</Label>
                      <Input
                        id="patient-name"
                        placeholder="أدخل اسم المريض"
                        value={formData.patientName}
                        onChange={(e) =>
                          setFormData({ ...formData, patientName: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="patient-phone">الهاتف</Label>
                      <Input
                        id="patient-phone"
                        value={formData.phone}
                        readOnly
                      />
                    </div>
                    <div>
                      <Label htmlFor="patient-age">العمر</Label>
                      <Input
                        id="patient-age"
                        value={formData.age}
                        readOnly
                      />
                    </div>
                    <div>
                      <Label htmlFor="patient-address">العنوان</Label>
                      <Input
                        id="patient-address"
                        value={formData.address}
                        readOnly
                      />
                    </div>
                    <div>
                      <Label htmlFor="patient-code">كود المريض</Label>
                      <Input
                        id="patient-code"
                        placeholder="P001"
                        value={formData.patientCode}
                        readOnly
                      />
                    </div>
                  </TabsContent>

                  {/* Diagnosis Tab */}
                  <TabsContent value="diagnosis" className="space-y-4">
                    <div>
                      <Label htmlFor="visit-date">تاريخ الزيارة</Label>
                      <Input
                        id="visit-date"
                        type="date"
                        value={formData.visitDate}
                        onChange={(e) =>
                          setFormData({ ...formData, visitDate: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="operation-type">نوع العملية</Label>
                      <Input
                        id="operation-type"
                        value={formData.operationType}
                        onChange={(e) =>
                          setFormData({ ...formData, operationType: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label>التشخيص</Label>
                      <Input
                        value={diseaseSearch}
                        onChange={(e) => setDiseaseSearch(e.target.value)}
                        placeholder="ابحث عن تشخيص..."
                        className="mt-2 text-right"
                        dir="rtl"
                      />
                      <div className="mt-2 space-y-3">
                        {Object.entries(
                          (diseasesQuery.data ?? [])
                            .filter((d: any) => {
                              const label = `${d.abbrev || ""} ${d.name || ""}`.toLowerCase();
                              return label.includes(diseaseSearch.trim().toLowerCase());
                            })
                            .reduce((acc: Record<string, any[]>, d: any) => {
                              const key = d.branch || "other";
                              if (!acc[key]) acc[key] = [];
                              acc[key].push(d);
                              return acc;
                            }, {})
                        ).map(([branch, items]) => (
                          <div key={branch} className="border rounded-lg p-3">
                            <button
                              type="button"
                              className="w-full flex items-center justify-between font-semibold"
                              onClick={() =>
                                setExpandedDiseaseGroups((prev) =>
                                  prev.includes(branch) ? prev.filter((b) => b !== branch) : [...prev, branch]
                                )
                              }
                            >
                              <span>{branch}</span>
                              <span className="text-xs text-muted-foreground">
                                {expandedDiseaseGroups.includes(branch) ? "" : ""}
                              </span>
                            </button>
                            {expandedDiseaseGroups.includes(branch) && (
                              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                                {items.map((d: any) => {
                                  const label = d.abbrev || d.name;
                                  return (
                                    <label key={d.id} className="flex items-center gap-2">
                                      <Checkbox
                                        checked={formData.diseases.includes(label)}
                                        onCheckedChange={(checked) => {
                                          const next = new Set(formData.diseases);
                                          if (checked) next.add(label);
                                          else next.delete(label);
                                          setFormData({ ...formData, diseases: Array.from(next) });
                                        }}
                                      />
                                      <span>{label}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                        {(!diseasesQuery.data || (diseasesQuery.data ?? []).length === 0) && (
                          <div className="text-sm text-muted-foreground">لا توجد أمراض بعد</div>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="recommendation">التوصية / نوع العملية</Label>
                      <Textarea
                        id="recommendation"
                        placeholder="أدخل التوصية أو نوع العملية المقترحة"
                        value={formData.recommendation}
                        onChange={(e) =>
                          setFormData({ ...formData, recommendation: e.target.value })
                        }
                        className="h-20"
                      />
                    </div>
                    <div>
                      <Label htmlFor="notes">ملاحظات إضافية</Label>
                      <Textarea
                        id="notes"
                        placeholder="أي ملاحظات أخرى"
                        value={formData.notes}
                        onChange={(e) =>
                          setFormData({ ...formData, notes: e.target.value })
                        }
                        className="h-20"
                      />
                    </div>
                  </TabsContent>

                  {/* Prescription Tab */}
                  <TabsContent value="prescription" className="space-y-4">
                    <div className="rounded-lg border p-4">
                      <Label htmlFor="prescription">الروشتة الطبية</Label>
                      <Textarea
                        id="prescription"
                        placeholder="أدخل الأدوية والتعليمات"
                        value={formData.prescription}
                        onChange={(e) =>
                          setFormData({ ...formData, prescription: e.target.value })
                        }
                        className="h-32 mt-2"
                      />
                      <div className="mt-4">
                        <p className="text-sm text-muted-foreground">
                          <strong>مثال على الروشتة:</strong>
                        </p>
                        <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                          <li>• قطرة Refresh Plus - 4 مرات يومياً</li>
                          <li>• مرهم Refresh PM - قبل النوم</li>
                          <li>• تجنب الأنشطة الشاقة لمدة أسبوع</li>
                        </ul>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <Button
                  onClick={handleCreateReport}
                  className="w-full bg-primary hover:bg-primary/90 mt-4"
                >
                  {selectedReport ? " " : " "}
                </Button>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Reports List */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 print:hidden">
            <Card>
              <CardHeader>
                <CardTitle>التقارير الطبية</CardTitle>
                <CardDescription>
                  عدد التقارير: {parsedReports.length}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {!selectedPatientId ? (
                    <p className="text-center text-muted-foreground py-8">
                      اختر مريضاً لعرض تقاريره
                    </p>
                  ) : reportsQuery.isLoading ? (
                    <p className="text-center text-muted-foreground py-8">
                      جاري تحميل التقارير...
                    </p>
                  ) : parsedReports.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      لا توجد تقارير
                    </p>
                  ) : (
                    parsedReports.map((report) => (
                      <div
                        key={report.id}
                        className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-semibold">{report.patientName}</h3>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">
                              {report.date ? formatDateLabel(report.date) : ""}
                            </p>
                            <p className="text-xs font-medium text-primary">
                              {report.doctor}
                            </p>
                          </div>
                        </div>

                        <div className="mb-3 text-sm">
                          <p className="mb-2">
                            <span className="font-semibold">التشخيص:</span>{" "}
                            {report.diagnosis}
                          </p>
                          <p>
                            <span className="font-semibold">التوصية:</span>{" "}
                            {report.recommendation}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewReport(report)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            عرض
                          </Button>
                          {canWriteReports && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedReport(report);
                                setFormData((prev) => ({
                                  ...prev,
                                  patientName: report.patientName,
                                  patientCode: report.patientCode,
                                  diagnosis: report.diagnosis ?? "",
                                  diseases: report.diseases ?? [],
                                  recommendation: report.recommendation ?? "",
                                  prescription: report.prescription ?? "",
                                  notes: report.notes ?? "",
                                  operationType: report.operationType ?? "",
                                  visitDate: report.visitDate ?? prev.visitDate,
                                }));
                                setIsDialogOpen(true);
                              }}
                            >
                              تعديل
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => handleDownloadReportPdf(report)}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            تحميل PDF
                          </Button>
                          {canWriteReports && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteReport(report.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              حذف
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Report Details */}
          <div>
            {selectedReport ? (
              <>
                <Card>
                <CardHeader className="space-y-3 print:hidden">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <CardTitle>تقرير طبي</CardTitle>
                      </div>
                      <div className="flex items-center gap-3 print:hidden">
                        <img src="/logo.png" alt="Shorouk-Eyes Center" className="h-12 w-12 object-contain" />
                        <div className="text-right">
                          <p className="font-semibold leading-tight">Shorouk-Eyes Center</p>
                          <p className="text-xs text-muted-foreground leading-tight">For Lasik & Refractive Surgery</p>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                  <div className="hidden print:flex items-center justify-between gap-4 border-b pb-3">
                    <div></div>
                  </div>
                    <div className="hidden print:flex items-center justify-center gap-10 text-sm" dir="rtl">
                      <span className="inline-flex items-center gap-1" dir="rtl">
                        <span className="font-semibold">الاسم:</span>
                        <span>{selectedReport.patientName}</span>
                      </span>
                      {selectedReport.patientAge ? (
                        <span className="inline-flex items-center gap-1" dir="rtl">
                          <span className="font-semibold">السن:</span>
                          <span dir="ltr">{selectedReport.patientAge}</span>
                        </span>
                      ) : null}
                      {selectedReport.date ? (
                        <span className="inline-flex items-center gap-1" dir="rtl">
                          <span className="font-semibold">التاريخ:</span>
                          <span dir="ltr">{formatDateLabel(selectedReport.date)}</span>
                        </span>
                      ) : null}
                    </div>
                    <div className="print:hidden">
                      <p className="text-sm font-semibold text-muted-foreground">
                        المريض
                      </p>
                      <p className="text-lg font-bold">{selectedReport.patientName}</p>
                      {selectedReport.patientAge ? (
                        <p className="text-sm text-muted-foreground">السن: {selectedReport.patientAge}</p>
                      ) : null}
                    </div>

                    <div className="border-t pt-4">
                      <p className="text-sm font-semibold text-muted-foreground mb-2">
                        التشخيص
                      </p>
                      <p className="text-sm">{selectedReport.diagnosis}</p>
                    </div>

                    <div className="border-t pt-4">
                      <p className="text-sm font-semibold text-muted-foreground mb-2">
                        التوصية
                      </p>
                      <p className="text-sm">{selectedReport.recommendation}</p>
                    </div>

                    <Button
                      className="w-full bg-primary hover:bg-primary/90 mt-4 print:hidden"
                      onClick={() => handleDownloadReportPdf(selectedReport)}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      تحميل كـ PDF
                    </Button>
                  </CardContent>
                </Card>
                <div className="hidden print:flex flex-col items-end pt-3 text-sm" dir="rtl">
                  <span className="font-semibold">الطبيب المعالج</span>
                  <span className="mt-1">{selectedReport.doctor}</span>
                </div>
              </>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">
                    اختر تقريراً لعرض التفاصيل
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
