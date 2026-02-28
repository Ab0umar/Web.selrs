import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAppNavigation } from "@/hooks/useAppNavigation";
import { Link, useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Download, Printer } from "lucide-react";
import PatientPicker from "@/components/PatientPicker";
import { trpc } from "@/lib/trpc";
import { connectSheetUpdates } from "@/lib/ws";
import { coerceSheetDesignerConfig, DEFAULT_SHEET_DESIGNER_CONFIG, loadSheetDesignerConfig, saveSheetDesignerConfig } from "@/lib/sheetDesigner";

export default function ConsultantSheet() {
  const { user, isAuthenticated } = useAuth();
  const { goBack, goHome } = useAppNavigation();
  const [location, setLocation] = useLocation();
  const [, params] = useRoute("/sheets/consultant/:id");
  const initialPatientId = params?.id ? Number(params.id) : undefined;
  const [operationDateLeft, setOperationDateLeft] = useState("");
  const [operationDateRight, setOperationDateRight] = useState("");
  const formatDateLabel = (value: string) => {
    if (!value) return "لم يتم الاختيار";
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return value;
    return date.toLocaleDateString("ar-EG");
  };

  const [operationType, setOperationType] = useState("");
  const [operationEyes, setOperationEyes] = useState({ right: false, left: false });
  const [designerConfig, setDesignerConfig] = useState(DEFAULT_SHEET_DESIGNER_CONFIG);

  const [formData, setFormData] = useState({
    // Patient Info
    patientName: "",
    dateOfBirth: "",
    age: "",
    phone: "",
    address: "",
    code: "",
    job: "",
    knowledgeType: "",
    consultantName: "",
    examinationDate: "",

    // Medical History
    keratoconusHistory: false,
    familyHistory: false,
    eyeDiseases: false,
    tearSubstitute: false,
    tearIncreasePregnancy: false,
    sandySensation: false,
    treatmentUsed: false,
    dryEyeSymptoms: false,
    sensitivityMedicines: false,
    blueWaterTreatment: false,
    supplements: false,
    thyroidDiseases: false,
    immuneDiseases: false,

    // Examination Data
    dominantEye: "OD",
    ucvaOD: "",
    ucvaOS: "",
    bcvaOD: "",
    bcvaOS: "",
    refractionOD: { s: "", c: "", a: "" },
    refractionOS: { s: "", c: "", a: "" },
    drOD: "",
    drOS: "",
    fundusOD: "",
    fundusOS: "",
    iopOD: "",
    iopOS: "",

    // Comments
    comments: "",
    final: "",
  });
  const [signatures, setSignatures] = useState({
    reception: "",
    nurse: "",
    technician: "",
    doctor: "",
  });

  const [followups, setFollowups] = useState([
    { id: 1, date: "", type: "المتابعة الأولى", right: true, left: false },
    { id: 2, date: "", type: "المتابعة الثانية", right: false, left: true },
    { id: 3, date: "", type: "المتابعة الثالثة", right: false, left: false },
    { id: 4, date: "", type: "المتابعة الرابعة", right: true, left: true },
  ]);

  const handleFollowupDateChange = (id: number, value: string) => {
    setFollowups((prev) =>
      prev.map((item) => (item.id === id ? { ...item, date: value } : item))
    );
  };

  const handleFollowupTypeChange = (id: number, value: string) => {
    setFollowups((prev) =>
      prev.map((item) => (item.id === id ? { ...item, type: value } : item))
    );
  };

  const handleFollowupEyeChange = (id: number, eye: "right" | "left", checked: boolean) => {
    setFollowups((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [eye]: checked } : item
      )
    );
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  if (!isAuthenticated) return null;
  const patientQuery = trpc.medical.getPatient.useQuery(
    { patientId: initialPatientId ?? 0 },
    { enabled: Boolean(initialPatientId), refetchOnWindowFocus: false }
  );
  const sheetQuery = trpc.medical.getSheetEntry.useQuery(
    { patientId: initialPatientId ?? 0, sheetType: "consultant" },
    { enabled: Boolean(initialPatientId), refetchOnWindowFocus: false }
  );
  const examinationStateQuery = trpc.medical.getPatientPageState.useQuery(
    { patientId: initialPatientId ?? 0, page: "examination" },
    { enabled: Boolean(initialPatientId), refetchOnWindowFocus: false }
  );
  const designerSettingsQuery = trpc.medical.getSystemSetting.useQuery(
    { key: "sheet_designer_config" },
    { enabled: isAuthenticated, refetchOnWindowFocus: false }
  );
  const mobileSheetModeQuery = trpc.medical.getSystemSetting.useQuery(
    { key: "mobile_sheet_mode_v1" },
    { enabled: isAuthenticated, refetchOnWindowFocus: false }
  );
  const syncRefetchTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!initialPatientId) return;
    const socket = connectSheetUpdates({
      patientId: initialPatientId,
      onUpdate: () => {
        if (syncRefetchTimerRef.current != null) return;
        syncRefetchTimerRef.current = window.setTimeout(() => {
          syncRefetchTimerRef.current = null;
          sheetQuery.refetch();
          patientQuery.refetch();
        }, 250);
      },
    });
    return () => {
      socket?.close();
      if (syncRefetchTimerRef.current != null) {
        window.clearTimeout(syncRefetchTimerRef.current);
        syncRefetchTimerRef.current = null;
      }
    };
  }, [initialPatientId, sheetQuery, patientQuery]);

  const mobileSheetModeRaw = (mobileSheetModeQuery.data as any)?.value;
  const mobileSheetModeEnabled = Boolean(
    mobileSheetModeRaw && typeof mobileSheetModeRaw === "object"
      ? mobileSheetModeRaw.enabled
      : mobileSheetModeRaw
  );

  const formatDate = (value?: string | Date | null) => {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.valueOf())) return "";
    return date.toISOString().split("T")[0];
  };

  useEffect(() => {
    if (!patientQuery.data) return;
    const patient = patientQuery.data as any;
    setFormData((prev) => ({
      ...prev,
      patientName: patient.fullName ?? "",
      dateOfBirth: formatDate(patient.dateOfBirth),
      age: patient.age != null ? String(patient.age) : "",
      phone: patient.phone ?? "",
      address: patient.address ?? "",
      code: patient.patientCode ?? "",
      job: patient.occupation ?? "",
    }));
  }, [patientQuery.data]);

  useEffect(() => {
    if (!sheetQuery.data) return;
    try {
      const parsed = JSON.parse(sheetQuery.data);
      if (parsed.examData?.autorefraction) {
        const auto = parsed.examData.autorefraction;
        setFormData((prev) => ({
          ...prev,
          ucvaOD: auto.od?.ucva ? auto.od.ucva : prev.ucvaOD,
          ucvaOS: auto.os?.ucva ? auto.os.ucva : prev.ucvaOS,
          bcvaOD: auto.od?.bcva ? auto.od.bcva : prev.bcvaOD,
          bcvaOS: auto.os?.bcva ? auto.os.bcva : prev.bcvaOS,
          refractionOD: {
            s: auto.od?.s ? auto.od.s : prev.refractionOD.s,
            c: auto.od?.c ? auto.od.c : prev.refractionOD.c,
            a: auto.od?.axis ? auto.od.axis : prev.refractionOD.a,
          },
          refractionOS: {
            s: auto.os?.s ? auto.os.s : prev.refractionOS.s,
            c: auto.os?.c ? auto.os.c : prev.refractionOS.c,
            a: auto.os?.axis ? auto.os.axis : prev.refractionOS.a,
          },
          iopOD: auto.od?.iop ? auto.od.iop : prev.iopOD,
          iopOS: auto.os?.iop ? auto.os.iop : prev.iopOS,
        }));
      }
      if (parsed.signatures) {
        setSignatures({
          reception: parsed.signatures.reception ?? "",
          nurse: parsed.signatures.nurse ?? "",
          technician: parsed.signatures.technician ?? "",
          doctor: parsed.signatures.doctor ?? "",
        });
      }
    } catch {
      // ignore malformed data
    }
  }, [sheetQuery.data]);

  useEffect(() => {
    const stateData = (examinationStateQuery.data as any)?.data;
    if (!stateData) return;
    const doctorFromState =
      String(stateData.doctorName ?? "").trim() ||
      String(stateData.signatures?.doctor ?? "").trim();
    if (!doctorFromState) return;
    setSignatures((prev) => ({ ...prev, doctor: doctorFromState }));
  }, [examinationStateQuery.data]);

  useEffect(() => {
    const fullName = String(user?.name ?? "").trim();
    if (!fullName) return;
    const role = String(user?.role ?? "").toLowerCase();
    setSignatures((prev) => ({
      ...prev,
      reception: role === "reception" ? fullName : prev.reception,
      nurse: role === "nurse" ? fullName : prev.nurse,
      technician: role === "technician" ? fullName : prev.technician,
      doctor: role === "doctor" ? (prev.doctor || fullName) : prev.doctor,
    }));
  }, [user?.name, user?.role, sheetQuery.data, examinationStateQuery.data]);

  useEffect(() => {
    setDesignerConfig(loadSheetDesignerConfig());
  }, []);

  useEffect(() => {
    if (!designerSettingsQuery.data?.value) return;
    const merged = coerceSheetDesignerConfig(designerSettingsQuery.data.value);
    setDesignerConfig(merged);
    saveSheetDesignerConfig(merged);
  }, [designerSettingsQuery.data]);

  useEffect(() => {
    setFollowups((prev) =>
      prev.map((item, index) => ({
        ...item,
        type: designerConfig.followupConsultant.followupNames[index] ?? item.type,
      }))
    );
  }, [designerConfig.followupConsultant.followupNames]);

  const handleSelectPatient = (patient: {
    id: number;
    fullName: string;
    phone?: string | null;
    age?: number | null;
    dateOfBirth?: string | Date | null;
    address?: string | null;
    patientCode?: string | null;
    occupation?: string | null;
  }) => {
    setFormData((prev) => ({
      ...prev,
      patientName: patient.fullName ?? "",
      dateOfBirth: formatDate(patient.dateOfBirth),
      age: patient.age != null ? String(patient.age) : "",
      phone: patient.phone ?? "",
      address: patient.address ?? "",
      code: patient.patientCode ?? "",
      job: patient.occupation ?? "",
    }));
    if (patient.id) {
      setLocation(`/sheets/consultant/${patient.id}`);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    window.print();
  };

  const handleBackNav = () => {
    goBack();
  };

  const handleHomeNav = () => {
    goHome();
  };

  const getInitialTab = () => {
    if (typeof window === "undefined") return "sheet";
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") === "followup" ? "followup" : "sheet";
  };
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const followupLabels = designerConfig.followupConsultant;
  const consultantTemplate = designerConfig.templates.consultant;

  const renderFollowupSection = () => (
    <div className="p-1 print:p-0 followup-print-root bg-white text-slate-900" dir="ltr" style={{ fontFamily: '"Times New Roman", Tahoma, Arial, sans-serif' }}>
      <div className="mb-2 print:mb-1 flex items-center justify-between text-[15px] print:text-[13px] px-1 print:px-0">
        <div className="whitespace-nowrap">{followupLabels.rtLabel}: {operationEyes.right ? "" : "..."} &nbsp;&nbsp; {followupLabels.ltLabel}: {operationEyes.left ? "" : "..."} &nbsp; //</div>
        <div className="whitespace-nowrap">
          {followupLabels.operationTypeLabel}:
          <span className="inline-block min-w-[140px] border-b border-black/60 mx-1 text-center">{operationType || " "}</span>
        </div>
        <div className="whitespace-nowrap">
          {followupLabels.operationDateLabel}
          <span className="inline-block min-w-[95px] border-b border-black/60 mx-1 text-center">{operationDateRight || " /  / "}</span>
          <span className="inline-block min-w-[95px] border-b border-black/60 text-center">{operationDateLeft || " /  / "}</span>
        </div>
      </div>

      {followups.map((followup) => (
        <table
          key={followup.id}
          className="w-full border border-black/70 border-collapse text-[15px] print:text-[12px] table-fixed"
              style={{ marginBottom: `${designerConfig.followupConsultant.tableGapMm}mm` }}
        >
          <colgroup>
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
          </colgroup>
          <tbody>
            <tr>
              <td colSpan={2} className="border border-black/50 px-1 py-0.5 print:py-0 text-center">{followupLabels.nextFollowupLabel} <span className="mx-2 print:mx-1">{"/  /"}</span></td>
              <td colSpan={3} className="border border-black/50 px-1 py-0.5 print:py-0 text-center font-semibold">{followup.type}</td>
              <td colSpan={3} className="border border-black/50 border-r-0 px-1 py-0.5 print:py-0 text-center">
                {followupLabels.followupDateLabel}
                <span className="inline-block min-w-[88px] border-b border-black/60 mx-1 text-center">{followup.date || " /  / "}</span>
              </td>
            </tr>
            <tr>
              <td colSpan={8} className="border border-black/50 py-0.5 text-center font-semibold">Dominant eye _____________</td>
            </tr>
            <tr>
              <td colSpan={2} className="border border-black/50 py-0.5"></td>
              <td colSpan={3} className="border border-black/50 py-0.5 text-center font-semibold">OD</td>
              <td colSpan={3} className="border border-black/50 border-r-0 py-0.5 text-center font-semibold">OS</td>
            </tr>
            <tr>
              <td colSpan={2} className="border border-black/50 py-1 print:py-0.5 text-center font-semibold">{followupLabels.vaLabel}</td>
              <td colSpan={3} className="border border-black/50 border-r-0 py-1 print:py-0.5"></td>
              <td colSpan={3} className="border border-black/50 py-1 print:py-0.5"></td>
            </tr>
            <tr>
              <td colSpan={2} className="border border-black/50 py-1 print:py-0.5 text-center font-semibold">{followupLabels.refractionLabel}</td>
              <td className="border border-black/50 py-1 print:py-0.5 text-center font-semibold">S</td>
              <td className="border border-black/50 py-1 print:py-0.5 text-center font-semibold">C</td>
              <td className="border border-black/50 border-r-0 py-1 print:py-0.5 text-center font-semibold">A</td>
              <td className="border border-black/50 py-1 print:py-0.5 text-center font-semibold">S</td>
              <td className="border border-black/50 py-1 print:py-0.5 text-center font-semibold">C</td>
              <td className="border border-black/50 py-1 print:py-0.5 text-center font-semibold">A</td>
            </tr>
            <tr>
              <td colSpan={2} className="border border-black/50 py-1 print:py-0.5"></td>
              <td className="border border-black/50 border-r-0 h-8 print:h-4">&nbsp;</td>
              <td className="border border-black/50 h-8 print:h-4">&nbsp;</td>
              <td className="border border-black/50 h-8 print:h-4">&nbsp;</td>
              <td className="border border-black/50 h-8 print:h-4">&nbsp;</td>
              <td className="border border-black/50 h-8 print:h-4">&nbsp;</td>
              <td className="border border-black/50 h-8 print:h-4">&nbsp;</td>
            </tr>
            <tr>
              <td rowSpan={2} className="border border-black/50 py-1 print:py-0.5 text-center font-semibold">{followupLabels.flapLabel}</td>
              <td className="border border-black/50 py-1 print:py-0.5 text-center font-semibold">{followupLabels.edgesLabel}</td>
              <td colSpan={6} className="border border-black/50 border-r-0 py-1 print:py-0.5"></td>
            </tr>
            <tr>
              <td className="border border-black/50 py-1 print:py-0.5 text-center font-semibold">{followupLabels.bedLabel}</td>
              <td colSpan={6} className="border border-black/50 border-r-0 py-1 print:py-0.5"></td>
            </tr>
            <tr>
              <td colSpan={2} className="border border-black/50 py-1 print:py-0.5 text-center font-semibold">{followupLabels.iopLabel}</td>
              <td colSpan={6} className="border border-black/50 border-r-0 py-1 print:py-0.5"></td>
            </tr>
            <tr>
              <td colSpan={2} className="border border-black/50 py-1 print:py-0.5 text-center font-semibold">{followupLabels.treatmentLabel}</td>
              <td colSpan={6} className="border border-black/50 border-r-0 py-1 print:py-0.5"></td>
            </tr>
            <tr>
              <td colSpan={2} className="border border-black/50 px-1 py-0.5 print:py-0 text-right font-semibold">{followupLabels.receptionLabel}</td>
              <td colSpan={3} className="border border-black/50 px-1 py-0.5 print:py-0 text-right font-semibold">{followupLabels.nurseLabel}</td>
              <td colSpan={3} className="border border-black/50 border-r-0 px-1 py-0.5 print:py-0 text-right font-semibold">
                {followupLabels.doctorLabel}
                {signatures.doctor ? `: ${signatures.doctor}` : ""}
              </td>
            </tr>
          </tbody>
        </table>
      ))}
    </div>
  );

  return (
    <div className={`min-h-screen bg-background sheet-layout ${mobileSheetModeEnabled ? "mobile-sheet-mode" : ""}`} dir="rtl" style={{ direction: 'rtl', textAlign: 'right' }}>
      <style>{`
        ${designerConfig.css.consultant || ""}
        .refraction-table-center th,
        .refraction-table-center td {
          text-align: center !important;
        }
        .refraction-table-center input {
          text-align: center !important;
        }
        @media print {
          @page {
            size: A4 portrait;
            margin: 5mm;
          }
          .consultant-drawing {
            min-height: 430px !important;
          }
          .consultant-note-field {
            border: 1px solid #000 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .consultant-main-print-root {
            transform: translateX(${designerConfig.layout.consultant.offsetXmm}mm) translateY(${designerConfig.layout.consultant.offsetYmm}mm) scale(${designerConfig.layout.consultant.scale});
            transform-origin: top center;
          }
          .followup-print-root {
          transform: translateX(${designerConfig.followupConsultant.offsetXmm}mm) scale(${designerConfig.followupConsultant.scale});
            transform-origin: top center;
            width: 104%;
            margin-left: auto;
            margin-right: auto;
          margin-top: ${designerConfig.followupConsultant.offsetYmm}mm;
          }
        }
      `}</style>
      {/* Header */}
      <header className="bg-primary text-primary-foreground shadow-lg sticky top-0 z-10 print:hidden">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between sheet-header-bar">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <div>
                  <h1 className="text-2xl font-bold">{consultantTemplate.sheetTitle}</h1>
                  <p className="text-sm opacity-90">{formData.patientName}</p>
                </div>
              </div>
              <div className="flex gap-1 print:hidden"></div>
            </div>
            <div className="flex gap-1 flex-wrap sheet-header-actions">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleBackNav}
                className="text-primary-foreground border-primary-foreground hover:bg-primary/80"
              >
                رجوع
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="text-primary-foreground border-primary-foreground hover:bg-primary/80"
              >
                <Printer className="h-4 w-4 mr-2" />
                طباعة
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadPDF}
                className="text-primary-foreground border-primary-foreground hover:bg-primary/80"
              >
                <Download className="h-4 w-4 mr-2" />
                تحميل PDF
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 pb-24 sm:pb-8 print:p-0">
        <div className="mb-2 print:hidden">
          <PatientPicker
            initialPatientId={initialPatientId}
            onSelect={handleSelectPatient}
          />
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full print:hidden">
        <TabsList className="grid w-full grid-cols-2 mb-2 print:hidden">
          <TabsTrigger value="followup">المتابعات</TabsTrigger>
          <TabsTrigger value="sheet">الفحوصات</TabsTrigger>
        </TabsList>

          {/* Main Sheet Tab */}
          <TabsContent value="sheet" className="space-y-0">
            {activeTab === "sheet" ? <div className="bg-white p-8 print:p-0">
              {/* Header with Logo and Center Name */}
              <div className="mb-1 border-b-4 border-primary pb-1 -mx-8 px-8" style={{ textAlign: 'center' }}>
                <h2 className="text-lg font-bold" dir="rtl" style={{ textAlign: 'right' }}>عيون الشروق لليزك وتصحيح الإبصار</h2>
                <p className="text-sm" dir="ltr" style={{ textAlign: 'center', unicodeBidi: 'bidi-override', direction: 'ltr' }}>Al Shrouk Eye Center for Lasik & Vision Correction</p>
                
              </div>

              {/* Patient Info */}
              <p className="font-bold text-sm mb-1">{consultantTemplate.patientInfoTitle}</p>
              <div className="sheet-section-card flex flex-col gap-1 mb-2 text-xs" dir="rtl" style={{ whiteSpace: "nowrap" }}>
                <div className="flex flex-nowrap items-center justify-between gap-2 w-full">
                  <div className="flex items-center gap-1">
                    <label className="font-bold">الاسم</label>
                    <Input value={formData.patientName} readOnly className="text-xs border-0" style={{ textAlign: 'right' }} />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="font-bold">تاريخ الميلاد</label>
                    <Input value={formData.dateOfBirth} readOnly className="text-xs border-0" style={{ textAlign: 'right' }} />
                  </div>
                <div className="flex items-center gap-1">
                  <label className="font-bold">السن</label>
                  <Input value={formData.age} readOnly className="text-xs border-0" style={{ textAlign: 'right' }} />
                </div>
                <div className="flex items-center gap-1">
                  <label className="font-bold">{consultantTemplate.doctorLabel}</label>
                  <Input value={signatures.doctor} readOnly className="text-xs border-0" style={{ textAlign: 'right' }} />
                </div>
              </div>
                <div className="flex flex-nowrap items-center justify-between gap-2 w-full">
                  <div className="flex items-center gap-1">
                    <label className="font-bold">العنوان</label>
                    <Input value={formData.address} readOnly className="text-xs border-0" style={{ textAlign: 'right' }} />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="font-bold">الموبايل</label>
                    <Input value={formData.phone} readOnly className="text-xs border-0" style={{ textAlign: 'right' }} />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="font-bold">كود العميل</label>
                    <Input value={formData.code} readOnly className="text-xs border-0" style={{ textAlign: 'right' }} />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="font-bold">الوظيفة</label>
                    <Input value={formData.job} readOnly className="text-xs border-0" style={{ textAlign: 'right' }} />
                  </div>
                </div>
              </div>

              {/* Medical History Table */}
              <div className="mb-4 sheet-section-card">
                <table className="w-full text-xs text-center border lasik-table" dir="rtl">
                  <tbody>
                    <tr className="border-b">
                      <td className="border-r p-0.5 text-right">أمراض عامة؟ (ضغط / سكر / غدة)</td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="border-r p-0.5 text-right">هل سمعت عن مرض القرنية المخروطية في أحد أفراد العائلة؟</td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="p-0.5"><Checkbox /></td>
                    </tr>
                    <tr className="border-b">
                      <td className="border-r p-0.5 text-right">حمل أو رضاعة؟</td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="border-r p-0.5 text-right">هل تستخدم بديل دموع / زيادة في إفراز الدموع / إحساس بالرمل؟</td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="p-0.5"><Checkbox /></td>
                    </tr>
                    <tr className="border-b">
                      <td className="border-r p-0.5 text-right">هل تستخدم مضادات حساسية أو مكملات غذائية/كورتيزون/أدوية ضغط؟</td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="border-r p-0.5 text-right">هل تزيد هذه الأعراض عند وجود هواء أو تكييف؟</td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="p-0.5"><Checkbox /></td>
                    </tr>
                    <tr className="border-b">
                      <td className="border-r p-0.5 text-right">هل تستخدم علاج لحب الشباب؟ (اسم العلاج)</td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="border-r p-0.5 text-right">هل تعالج من ماء زرقاء؟</td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="p-0.5"><Checkbox /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mb-4 border sheet-section-card">
                <table className="w-full text-xs text-center lasik-table refraction-table-center" dir="ltr" style={{ direction: "ltr", unicodeBidi: "bidi-override", textAlign: "center" }}>
                  <thead>
                    <tr className="border-b bg-gray-100">
                      <th className="border-r p-0.5 text-center" colSpan={4}>Dominant eye _____________</th>
                      <th className="p-0.5 text-center" colSpan={6}>Refraction</th>
                    </tr>
                    <tr className="border-b bg-gray-100">
                      <th className="border-r p-0.5"></th>
                      <th className="border-r p-0.5">UCVA</th>
                      <th className="border-r p-0.5">BCVA</th>
                      <th className="border-r p-0.5">IOP</th>
                      <th className="border-r p-0.5" colSpan={3}>OD</th>
                      <th className="p-0.5" colSpan={3}>OS</th>
                    </tr>
                    <tr className="border-b">
                      <th className="border-r p-0.5"></th>
                      <th className="border-r p-0.5"></th>
                      <th className="border-r p-0.5"></th>
                      <th className="border-r p-0.5"></th>
                      <th className="border-r p-0.5">S</th>
                      <th className="border-r p-0.5">C</th>
                      <th className="border-r p-0.5">A</th>
                      <th className="border-r p-0.5">S</th>
                      <th className="border-r p-0.5">C</th>
                      <th className="p-0.5">A</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="border-r p-0.5 font-bold">OD</td>
                      <td className="border-r p-0.5"><Input placeholder="" className="text-xs" value={formData.ucvaOD} onChange={(e) => setFormData((prev) => ({ ...prev, ucvaOD: e.target.value }))} /></td>
                      <td className="border-r p-0.5"><Input placeholder="" className="text-xs" value={formData.bcvaOD} onChange={(e) => setFormData((prev) => ({ ...prev, bcvaOD: e.target.value }))} /></td>
                      <td className="border-r p-0.5"><Input placeholder="" className="text-xs" value={formData.iopOD} onChange={(e) => setFormData((prev) => ({ ...prev, iopOD: e.target.value }))} /></td>
                      <td className="border-r p-0.5" rowSpan={2}><Input placeholder="" className="text-xs" value={formData.refractionOD.s} onChange={(e) => setFormData((prev) => ({ ...prev, refractionOD: { ...prev.refractionOD, s: e.target.value } }))} /></td>
                      <td className="border-r p-0.5" rowSpan={2}><Input placeholder="" className="text-xs" value={formData.refractionOD.c} onChange={(e) => setFormData((prev) => ({ ...prev, refractionOD: { ...prev.refractionOD, c: e.target.value } }))} /></td>
                      <td className="border-r p-0.5" rowSpan={2}><Input placeholder="" className="text-xs" value={formData.refractionOD.a} onChange={(e) => setFormData((prev) => ({ ...prev, refractionOD: { ...prev.refractionOD, a: e.target.value } }))} /></td>
                      <td className="border-r p-0.5" rowSpan={2}><Input placeholder="" className="text-xs" value={formData.refractionOS.s} onChange={(e) => setFormData((prev) => ({ ...prev, refractionOS: { ...prev.refractionOS, s: e.target.value } }))} /></td>
                      <td className="border-r p-0.5" rowSpan={2}><Input placeholder="" className="text-xs" value={formData.refractionOS.c} onChange={(e) => setFormData((prev) => ({ ...prev, refractionOS: { ...prev.refractionOS, c: e.target.value } }))} /></td>
                      <td className="p-0.5" rowSpan={2}><Input placeholder="" className="text-xs" value={formData.refractionOS.a} onChange={(e) => setFormData((prev) => ({ ...prev, refractionOS: { ...prev.refractionOS, a: e.target.value } }))} /></td>
                    </tr>
                    <tr className="border-b">
                      <td className="border-r p-0.5 font-bold">OS</td>
                      <td className="border-r p-0.5"><Input placeholder="" className="text-xs" value={formData.ucvaOS} onChange={(e) => setFormData((prev) => ({ ...prev, ucvaOS: e.target.value }))} /></td>
                      <td className="border-r p-0.5"><Input placeholder="" className="text-xs" value={formData.bcvaOS} onChange={(e) => setFormData((prev) => ({ ...prev, bcvaOS: e.target.value }))} /></td>
                      <td className="border-r p-0.5"><Input placeholder="" className="text-xs" value={formData.iopOS} onChange={(e) => setFormData((prev) => ({ ...prev, iopOS: e.target.value }))} /></td>
                    </tr>
                    <tr className="border-b">
                      <td className="border-r p-0.5 font-bold">Fundus</td>
                      <td className="p-0.5" colSpan={9}><Input placeholder="" className="text-xs" value={formData.fundusOD} onChange={(e) => setFormData((prev) => ({ ...prev, fundusOD: e.target.value }))} /></td>
                    </tr>
                    <tr>
                      <td className="border-r p-0.5 font-bold">Tear film</td>
                      <td className="border-r p-0.5" colSpan={3}>BUT</td>
                      <td className="border-r p-0.5" colSpan={3}>Schirmer T</td>
                      <td className="p-0.5" colSpan={3}>Lid Margin</td>
                    </tr>
                  </tbody>
                </table>
              </div>
{/* Drawing/Explanation Space */}
              <div className="consultant-drawing border-2 border-dashed border-gray-400 p-2 mb-1 bg-white" style={{ minHeight: "390px" }}>
              </div>

              {/* Comments and Notes */}
              <div className="w-full sheet-section-card">
                <div className="flex gap-0.5 mb-1" dir="rtl">
                  <div style={{ flex: "0 0 64%" }}>
                    <Textarea
                      placeholder="Comments:"
                      className="consultant-note-field !border !border-black rounded-none shadow-none text-xs w-full max-w-none"
                      rows={3}
                      dir="ltr"
                      style={{ maxWidth: "none", width: "100%", marginInlineStart: "0", marginInlineEnd: "0", boxSizing: "border-box", border: "1px solid #000", WebkitAppearance: "none", appearance: "none", textAlign: "left" }}
                    />
                  </div>
                  <div className="notes-col" style={{ flex: "0 0 32%", paddingInlineStart: "0", marginInlineStart: "0" }}>
                    <Textarea
                      placeholder={consultantTemplate.notesLabel}
                      className="consultant-note-field !border !border-black rounded-none shadow-none text-xs w-full max-w-none"
                      rows={3}
                      dir="ltr"
                      style={{ maxWidth: "none", width: "100%", boxSizing: "border-box", border: "1px solid #000", WebkitAppearance: "none", appearance: "none", textAlign: "left" }}
                    />
                  </div>
                </div>
                <div className="mb-1 w-full">
                  <Textarea
                    placeholder="Final:"
                    className="consultant-note-field !border !border-black rounded-none shadow-none text-xs w-full max-w-none"
                    rows={5}
                    dir="ltr"
                    style={{ maxWidth: "none", width: "100%", border: "1px solid #000", WebkitAppearance: "none", appearance: "none", textAlign: "left" }}
                  />
                </div>
              </div>

              {/* Final Diagnosis */}
              {/* Final moved next to Comments/Notes */}

              {/* Signature Line */}
              <div className="grid grid-cols-4 gap-2 text-xs border-t pt-2">
                <div className="flex items-center justify-end gap-1">
                  <span style={{textAlign: 'right'}}>استقبال</span>
                  <Input value={signatures.reception} readOnly className="text-xs border-0 text-right" style={{ textAlign: "right" }} />
                </div>
                <div className="flex items-center justify-end gap-1">
                  <span style={{textAlign: 'right'}}>تمريض</span>
                  <Input value={signatures.nurse} readOnly className="text-xs border-0 text-right" style={{ textAlign: "right" }} />
                </div>
                <div className="flex items-center justify-end gap-1">
                  <span style={{textAlign: 'right'}}>فني</span>
                  <Input value={signatures.technician} readOnly className="text-xs border-0 text-right" style={{ textAlign: "right" }} />
                </div>
                <div className="flex items-center justify-end gap-1">
                  <span style={{textAlign: 'right'}}>الطبيب</span>
                  <Input value={signatures.doctor} readOnly className="text-xs border-0 text-right" style={{ textAlign: "right" }} />
                </div>
              </div>
            </div> : null}
          </TabsContent>

          {/* Followup Tab */}
          <TabsContent value="followup" className="space-y-0">
            {activeTab === "followup" ? renderFollowupSection() : null}
          </TabsContent>
        </Tabs>

        {/* Print both: sheet then followup (back side) */}
        <div className="hidden print:block">
          <div className="space-y-0 consultant-main-print-root">
            <div className="bg-white p-8 print:p-0">
              {/* Header with Logo and Center Name */}
              <div className="mb-1 border-b-4 border-primary pb-1 -mx-8 px-8" style={{ textAlign: 'center' }}>
                <h2 className="text-lg font-bold" dir="rtl" style={{ textAlign: 'right' }}>عيون الشروق لليزك وتصحيح الإبصار</h2>
                <p className="text-sm" dir="ltr" style={{ textAlign: 'center', unicodeBidi: 'bidi-override', direction: 'ltr' }}>Al Shrouk Eye Center for Lasik & Vision Correction</p>
              </div>

              {/* Patient Info */}
              <p className="font-bold text-sm mb-1">{consultantTemplate.patientInfoTitle}</p>
              <div className="flex flex-col gap-1 mb-2 text-xs" dir="rtl" style={{ whiteSpace: "nowrap" }}>
                <div className="flex flex-nowrap items-center justify-between gap-2 w-full">
                  <div className="flex items-center gap-1">
                    <label className="font-bold">الاسم</label>
                    <Input value={formData.patientName} readOnly className="text-xs border-0" style={{ textAlign: 'right' }} />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="font-bold">تاريخ الميلاد</label>
                    <Input value={formData.dateOfBirth} readOnly className="text-xs border-0" style={{ textAlign: 'right' }} />
                  </div>
                <div className="flex items-center gap-1">
                  <label className="font-bold">السن</label>
                  <Input value={formData.age} readOnly className="text-xs border-0" style={{ textAlign: 'right' }} />
                </div>
                <div className="flex items-center gap-1">
                  <label className="font-bold">{consultantTemplate.doctorLabel}</label>
                  <Input value={signatures.doctor} readOnly className="text-xs border-0" style={{ textAlign: 'right' }} />
                </div>
              </div>
                <div className="flex flex-nowrap items-center justify-between gap-2 w-full">
                  <div className="flex items-center gap-1">
                    <label className="font-bold">العنوان</label>
                    <Input value={formData.address} readOnly className="text-xs border-0" style={{ textAlign: 'right' }} />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="font-bold">الموبايل</label>
                    <Input value={formData.phone} readOnly className="text-xs border-0" style={{ textAlign: 'right' }} />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="font-bold">كود العميل</label>
                    <Input value={formData.code} readOnly className="text-xs border-0" style={{ textAlign: 'right' }} />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="font-bold">الوظيفة</label>
                    <Input value={formData.job} readOnly className="text-xs border-0" style={{ textAlign: 'right' }} />
                  </div>
                </div>
              </div>

              {/* Medical History Table */}
              <div className="mb-4">
                <table className="w-full text-xs text-center border lasik-table" dir="rtl">
                  <tbody>
                    <tr className="border-b">
                      <td className="border-r p-0.5 text-right">أمراض عامة؟ (ضغط / سكر / غدة)</td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="border-r p-0.5 text-right">هل سمعت عن مرض القرنية المخروطية في أحد أفراد العائلة؟</td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="p-0.5"><Checkbox /></td>
                    </tr>
                    <tr className="border-b">
                      <td className="border-r p-0.5 text-right">حمل أو رضاعة؟</td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="border-r p-0.5 text-right">هل تستخدم بديل دموع / زيادة في إفراز الدموع / إحساس بالرمل؟</td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="p-0.5"><Checkbox /></td>
                    </tr>
                    <tr className="border-b">
                      <td className="border-r p-0.5 text-right">هل تستخدم مضادات حساسية أو مكملات غذائية/كورتيزون/أدوية ضغط؟</td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="border-r p-0.5 text-right">هل تزيد هذه الأعراض عند وجود هواء أو تكييف؟</td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="p-0.5"><Checkbox /></td>
                    </tr>
                    <tr className="border-b">
                      <td className="border-r p-0.5 text-right">هل تستخدم علاج لحب الشباب؟ (اسم العلاج)</td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="border-r p-0.5 text-right">هل تعالج من ماء زرقاء؟</td>
                      <td className="border-r p-0.5"><Checkbox /></td>
                      <td className="p-0.5"><Checkbox /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mb-4 border">
                <table className="w-full text-xs text-center lasik-table refraction-table-center" dir="ltr" style={{ direction: "ltr", unicodeBidi: "bidi-override", textAlign: "center" }}>
                  <thead>
                    <tr className="border-b bg-gray-100">
                      <th className="border-r p-0.5 text-center" colSpan={4}>Dominant eye _____________</th>
                      <th className="p-0.5 text-center" colSpan={6}>Refraction</th>
                    </tr>
                    <tr className="border-b bg-gray-100">
                      <th className="border-r p-0.5"></th>
                      <th className="border-r p-0.5">UCVA</th>
                      <th className="border-r p-0.5">BCVA</th>
                      <th className="border-r p-0.5">IOP</th>
                      <th className="border-r p-0.5" colSpan={3}>OD</th>
                      <th className="p-0.5" colSpan={3}>OS</th>
                    </tr>
                    <tr className="border-b">
                      <th className="border-r p-0.5"></th>
                      <th className="border-r p-0.5"></th>
                      <th className="border-r p-0.5"></th>
                      <th className="border-r p-0.5"></th>
                      <th className="border-r p-0.5">S</th>
                      <th className="border-r p-0.5">C</th>
                      <th className="border-r p-0.5">A</th>
                      <th className="border-r p-0.5">S</th>
                      <th className="border-r p-0.5">C</th>
                      <th className="p-0.5">A</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="border-r p-0.5 font-bold">OD</td>
                      <td className="border-r p-0.5"><Input placeholder="" className="text-xs" value={formData.ucvaOD} readOnly /></td>
                      <td className="border-r p-0.5"><Input placeholder="" className="text-xs" value={formData.bcvaOD} readOnly /></td>
                      <td className="border-r p-0.5"><Input placeholder="" className="text-xs" value={formData.iopOD} readOnly /></td>
                      <td className="border-r p-0.5" rowSpan={2}><Input placeholder="" className="text-xs" value={formData.refractionOD.s} readOnly /></td>
                      <td className="border-r p-0.5" rowSpan={2}><Input placeholder="" className="text-xs" value={formData.refractionOD.c} readOnly /></td>
                      <td className="border-r p-0.5" rowSpan={2}><Input placeholder="" className="text-xs" value={formData.refractionOD.a} readOnly /></td>
                      <td className="border-r p-0.5" rowSpan={2}><Input placeholder="" className="text-xs" value={formData.refractionOS.s} readOnly /></td>
                      <td className="border-r p-0.5" rowSpan={2}><Input placeholder="" className="text-xs" value={formData.refractionOS.c} readOnly /></td>
                      <td className="p-0.5" rowSpan={2}><Input placeholder="" className="text-xs" value={formData.refractionOS.a} readOnly /></td>
                    </tr>
                    <tr className="border-b">
                      <td className="border-r p-0.5 font-bold">OS</td>
                      <td className="border-r p-0.5"><Input placeholder="" className="text-xs" value={formData.ucvaOS} readOnly /></td>
                      <td className="border-r p-0.5"><Input placeholder="" className="text-xs" value={formData.bcvaOS} readOnly /></td>
                      <td className="border-r p-0.5"><Input placeholder="" className="text-xs" value={formData.iopOS} readOnly /></td>
                    </tr>
                    <tr className="border-b">
                      <td className="border-r p-0.5 font-bold">Fundus</td>
                      <td className="p-0.5" colSpan={9}><Input placeholder="" className="text-xs" value={formData.fundusOD} readOnly /></td>
                    </tr>
                    <tr>
                      <td className="border-r p-0.5 font-bold">Tear film</td>
                      <td className="border-r p-0.5" colSpan={3}>BUT</td>
                      <td className="border-r p-0.5" colSpan={3}>Schirmer T</td>
                      <td className="p-0.5" colSpan={3}>Lid Margin</td>
                    </tr>
                  </tbody>
                </table>
              </div>
{/* Drawing/Explanation Space */}
              <div className="consultant-drawing border-2 border-dashed border-gray-400 p-2 mb-1 bg-white" style={{ minHeight: "390px" }}>
              </div>

              {/* Comments and Notes */}
              <div className="w-full">
                <div className="flex gap-0.5 mb-1" dir="rtl">
                  <div style={{ flex: "0 0 64%" }}>
                    <Textarea
                      placeholder="Comments:"
                      className="consultant-note-field !border !border-black rounded-none shadow-none text-xs w-full max-w-none"
                      rows={3}
                      dir="ltr"
                      style={{ maxWidth: "none", width: "100%", marginInlineStart: "0", marginInlineEnd: "0", boxSizing: "border-box", border: "1px solid #000", WebkitAppearance: "none", appearance: "none", textAlign: "left" }}
                    />
                  </div>
                  <div className="notes-col" style={{ flex: "0 0 32%", paddingInlineStart: "0", marginInlineStart: "0" }}>
                    <Textarea
                      placeholder={consultantTemplate.notesLabel}
                      className="consultant-note-field !border !border-black rounded-none shadow-none text-xs w-full max-w-none"
                      rows={3}
                      dir="ltr"
                      style={{ maxWidth: "none", width: "100%", boxSizing: "border-box", border: "1px solid #000", WebkitAppearance: "none", appearance: "none", textAlign: "left" }}
                    />
                  </div>
                </div>
                <div className="mb-1 w-full">
                  <Textarea
                    placeholder="Final:"
                    className="consultant-note-field !border !border-black rounded-none shadow-none text-xs w-full max-w-none"
                    rows={5}
                    dir="ltr"
                    style={{ maxWidth: "none", width: "100%", border: "1px solid #000", WebkitAppearance: "none", appearance: "none", textAlign: "left" }}
                  />
                </div>
              </div>

              {/* Signature Line */}
              <div className="grid grid-cols-4 gap-2 text-xs border-t pt-2">
                <div className="flex items-center justify-end gap-1">
                  <span style={{textAlign: 'right'}}>استقبال</span>
                  <Input value={signatures.reception} readOnly className="text-xs border-0 text-right" style={{ textAlign: "right" }} />
                </div>
                <div className="flex items-center justify-end gap-1">
                  <span style={{textAlign: 'right'}}>تمريض</span>
                  <Input value={signatures.nurse} readOnly className="text-xs border-0 text-right" style={{ textAlign: "right" }} />
                </div>
                <div className="flex items-center justify-end gap-1">
                  <span style={{textAlign: 'right'}}>فني</span>
                  <Input value={signatures.technician} readOnly className="text-xs border-0 text-right" style={{ textAlign: "right" }} />
                </div>
                <div className="flex items-center justify-end gap-1">
                  <span style={{textAlign: 'right'}}>الطبيب</span>
                  <Input value={signatures.doctor} readOnly className="text-xs border-0 text-right" style={{ textAlign: "right" }} />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-0 print:break-before-page">
            {renderFollowupSection()}
          </div>
        </div>
        <div className="sheet-mobile-actions print:hidden">
          <Button type="button" variant="outline" onClick={handleBackNav}>رجوع</Button>
          <Button type="button" variant="outline" onClick={handlePrint}>طباعة</Button>
          <Button type="button" variant="default" onClick={handleDownloadPDF}>تحميل</Button>
        </div>
      </main>
    </div>
  );
}

