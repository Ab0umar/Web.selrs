import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Printer } from "lucide-react";
import { toast } from "sonner";
import { getTrpcErrorMessage } from "@/lib/utils";
import PatientPicker from "@/components/PatientPicker";
import { trpc } from "@/lib/trpc";
import { connectSheetUpdates } from "@/lib/ws";
import { useAppNavigation } from "@/hooks/useAppNavigation";
import { coerceSheetDesignerConfig, DEFAULT_SHEET_DESIGNER_CONFIG, loadSheetDesignerConfig, saveSheetDesignerConfig } from "@/lib/sheetDesigner";

export default function LasikExamSheet() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { goBack } = useAppNavigation();
  const [, params] = useRoute("/sheets/lasik/:id");

  const [operationType, setOperationType] = useState("ليزك");
  const [operationEyes, setOperationEyes] = useState({ right: true, left: false, both: false });
  const formatDateLabel = (value: string) => {
    if (!value) return "لم يتم الاختيار";
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return value;
    return date.toLocaleDateString("ar-EG");
  };

  const [formData, setFormData] = useState({
    patientName: "",
    dateOfBirth: "",
    age: "",
    address: "",
    phone: "",
    patientCode: "",
    job: "",
    examinationDate: new Date().toISOString().split("T")[0],
  });
  const [examData, setExamData] = useState({
    autorefraction: {
      od: { s: "", c: "", axis: "", va: "", iop: "", ucva: "", bcva: "" },
      os: { s: "", c: "", axis: "", va: "", iop: "", ucva: "", bcva: "" },
    },
    pentacam: {
      od: { k1: "", k2: "", ax1: "", ax2: "", thinnest: "", apex: "", residual: "", ttt: "", ablation: "" },
      os: { k1: "", k2: "", ax1: "", ax2: "", thinnest: "", apex: "", residual: "", ttt: "", ablation: "" },
    },
  });
  const [signatures, setSignatures] = useState({
    reception: "",
    nurse: "",
    technician: "",
    doctor: "",
  });
  const [printOffsetXmm, setPrintOffsetXmm] = useState(0);
  const [printOffsetYmm, setPrintOffsetYmm] = useState(0);
  const [printScale, setPrintScale] = useState(1);
  const [customSheetCss, setCustomSheetCss] = useState("");
  const [sheetTemplate, setSheetTemplate] = useState(DEFAULT_SHEET_DESIGNER_CONFIG.templates.lasik);
  const designerSettingsQuery = trpc.medical.getSystemSetting.useQuery(
    { key: "sheet_designer_config" },
    { enabled: isAuthenticated, refetchOnWindowFocus: false }
  );
  const mobileSheetModeQuery = trpc.medical.getSystemSetting.useQuery(
    { key: "mobile_sheet_mode_v1" },
    { enabled: isAuthenticated, refetchOnWindowFocus: false }
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    const localDesigner = loadSheetDesignerConfig();
    setCustomSheetCss(localDesigner.css.lasik || "");
    setSheetTemplate(localDesigner.templates.lasik);
    setPrintOffsetXmm(localDesigner.layout.lasik.offsetXmm);
    setPrintOffsetYmm(localDesigner.layout.lasik.offsetYmm);
    setPrintScale(localDesigner.layout.lasik.scale);
  }, []);

  useEffect(() => {
    if (!designerSettingsQuery.data?.value) return;
    const merged = coerceSheetDesignerConfig(designerSettingsQuery.data.value);
    setCustomSheetCss(merged.css.lasik || "");
    setSheetTemplate(merged.templates.lasik);
    setPrintOffsetXmm(merged.layout.lasik.offsetXmm);
    setPrintOffsetYmm(merged.layout.lasik.offsetYmm);
    setPrintScale(merged.layout.lasik.scale);
    saveSheetDesignerConfig(merged);
  }, [designerSettingsQuery.data]);

  if (!isAuthenticated) return null;

  const mobileSheetModeRaw = (mobileSheetModeQuery.data as any)?.value;
  const mobileSheetModeEnabled = Boolean(
    mobileSheetModeRaw && typeof mobileSheetModeRaw === "object"
      ? mobileSheetModeRaw.enabled
      : mobileSheetModeRaw
  );

  const initialPatientId = params?.id ? Number(params.id) : undefined;
  const patientQuery = trpc.medical.getPatient.useQuery(
    { patientId: initialPatientId ?? 0 },
    { enabled: Boolean(initialPatientId), refetchOnWindowFocus: false }
  );
  const sheetQuery = trpc.medical.getSheetEntry.useQuery(
    { patientId: initialPatientId ?? 0, sheetType: "lasik" },
    { enabled: Boolean(initialPatientId), refetchOnWindowFocus: false }
  );
  const examinationStateQuery = trpc.medical.getPatientPageState.useQuery(
    { patientId: initialPatientId ?? 0, page: "examination" },
    { enabled: Boolean(initialPatientId), refetchOnWindowFocus: false }
  );
  useEffect(() => {
    if (!initialPatientId) return;
    const socket = connectSheetUpdates({
      patientId: initialPatientId,
      onUpdate: () => {
        sheetQuery.refetch();
        patientQuery.refetch();
      },
    });
    return () => socket?.close();
  }, [initialPatientId, sheetQuery, patientQuery]);
  const saveSheetMutation = trpc.medical.saveSheetEntry.useMutation({
    onSuccess: () => {
      toast.success("تم الحفظ");
    },
  });

  const formatDate = (value?: string | Date | null) => {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.valueOf())) return "";
    return date.toISOString().split("T")[0];
  };

  const handleSelectPatient = (patient: {
    id: number;
    fullName: string;
    patientCode?: string | null;
    phone?: string | null;
    age?: number | null;
    dateOfBirth?: string | Date | null;
    address?: string | null;
    occupation?: string | null;
  }) => {
    setFormData((prev) => ({
      ...prev,
      patientName: patient.fullName ?? "",
      phone: patient.phone ?? "",
      age: patient.age != null ? String(patient.age) : "",
      dateOfBirth: formatDate(patient.dateOfBirth),
      address: patient.address ?? "",
      patientCode: patient.patientCode ?? "",
      job: patient.occupation ?? "",
    }));
    if (patient.id) {
      setLocation(`/sheets/lasik/${patient.id}`);
    }
  };

  useEffect(() => {
    if (!patientQuery.data) return;
    const patient = patientQuery.data as any;
    setFormData((prev) => ({
      ...prev,
      patientName: patient.fullName ?? "",
      phone: patient.phone ?? "",
      age: patient.age != null ? String(patient.age) : "",
      dateOfBirth: formatDate(patient.dateOfBirth),
      address: patient.address ?? "",
      patientCode: patient.patientCode ?? "",
      job: patient.occupation ?? "",
    }));
  }, [patientQuery.data]);

  useEffect(() => {
    if (!sheetQuery.data) return;
    try {
      const parsed = JSON.parse(sheetQuery.data);
      if (parsed.formData) {
        setFormData((prev) => ({
          ...prev,
          ...parsed.formData,
          patientName: prev.patientName || parsed.formData.patientName,
          phone: prev.phone || parsed.formData.phone,
          age: prev.age || parsed.formData.age,
          dateOfBirth: prev.dateOfBirth || parsed.formData.dateOfBirth,
          address: prev.address || parsed.formData.address,
        }));
      }
      if (parsed.examData) {
        setExamData((prev) => ({
          autorefraction: {
            od: { ...prev.autorefraction.od, ...(parsed.examData.autorefraction?.od ?? {}) },
            os: { ...prev.autorefraction.os, ...(parsed.examData.autorefraction?.os ?? {}) },
          },
          pentacam: {
            od: { ...prev.pentacam.od, ...(parsed.examData.pentacam?.od ?? {}) },
            os: { ...prev.pentacam.os, ...(parsed.examData.pentacam?.os ?? {}) },
          },
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
      if (parsed.operationDetails) {
        setOperationType(parsed.operationDetails.type ?? "ليزك");
        const parsedEyes = parsed.operationDetails.eyes ?? {};
        const right = Boolean(parsedEyes.right);
        const left = Boolean(parsedEyes.left);
        const both = Boolean(parsedEyes.both) || (right && left);
        setOperationEyes({ right: both ? true : right, left: both ? true : left, both });
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

  const handleSaveSheet = async () => {
    if (!initialPatientId) {
      toast.error("يرجى اختيار المريض أولاً");
      return;
    }
    try {
      const existing = (() => {
        try {
          return sheetQuery.data ? JSON.parse(sheetQuery.data) : {};
        } catch {
          return {};
        }
      })();
      const pickValue = (next: string, prev?: string) => (next && next.trim() ? next : prev);
      const mergedExamData = {
        autorefraction: {
          od: {
            ...(existing.examData?.autorefraction?.od ?? {}),
            ucva: pickValue(examData.autorefraction.od.ucva, existing.examData?.autorefraction?.od?.ucva),
            bcva: pickValue(examData.autorefraction.od.bcva, existing.examData?.autorefraction?.od?.bcva),
            s: pickValue(examData.autorefraction.od.s, existing.examData?.autorefraction?.od?.s),
            c: pickValue(examData.autorefraction.od.c, existing.examData?.autorefraction?.od?.c),
            axis: pickValue(examData.autorefraction.od.axis, existing.examData?.autorefraction?.od?.axis),
            iop: pickValue(examData.autorefraction.od.iop, existing.examData?.autorefraction?.od?.iop),
          },
          os: {
            ...(existing.examData?.autorefraction?.os ?? {}),
            ucva: pickValue(examData.autorefraction.os.ucva, existing.examData?.autorefraction?.os?.ucva),
            bcva: pickValue(examData.autorefraction.os.bcva, existing.examData?.autorefraction?.os?.bcva),
            s: pickValue(examData.autorefraction.os.s, existing.examData?.autorefraction?.os?.s),
            c: pickValue(examData.autorefraction.os.c, existing.examData?.autorefraction?.os?.c),
            axis: pickValue(examData.autorefraction.os.axis, existing.examData?.autorefraction?.os?.axis),
            iop: pickValue(examData.autorefraction.os.iop, existing.examData?.autorefraction?.os?.iop),
          },
        },
        pentacam: {
          od: {
            ...(existing.examData?.pentacam?.od ?? {}),
            k1: pickValue(examData.pentacam.od.k1, existing.examData?.pentacam?.od?.k1),
            k2: pickValue(examData.pentacam.od.k2, existing.examData?.pentacam?.od?.k2),
            ax1: pickValue(examData.pentacam.od.ax1, existing.examData?.pentacam?.od?.ax1),
            ax2: pickValue(examData.pentacam.od.ax2, existing.examData?.pentacam?.od?.ax2),
            thinnest: pickValue(examData.pentacam.od.thinnest, existing.examData?.pentacam?.od?.thinnest),
            apex: pickValue(examData.pentacam.od.apex, existing.examData?.pentacam?.od?.apex),
            residual: pickValue(examData.pentacam.od.residual, existing.examData?.pentacam?.od?.residual),
            ttt: pickValue(examData.pentacam.od.ttt, existing.examData?.pentacam?.od?.ttt),
            ablation: pickValue(examData.pentacam.od.ablation, existing.examData?.pentacam?.od?.ablation),
          },
          os: {
            ...(existing.examData?.pentacam?.os ?? {}),
            k1: pickValue(examData.pentacam.os.k1, existing.examData?.pentacam?.os?.k1),
            k2: pickValue(examData.pentacam.os.k2, existing.examData?.pentacam?.os?.k2),
            ax1: pickValue(examData.pentacam.os.ax1, existing.examData?.pentacam?.os?.ax1),
            ax2: pickValue(examData.pentacam.os.ax2, existing.examData?.pentacam?.os?.ax2),
            thinnest: pickValue(examData.pentacam.os.thinnest, existing.examData?.pentacam?.os?.thinnest),
            apex: pickValue(examData.pentacam.os.apex, existing.examData?.pentacam?.os?.apex),
            residual: pickValue(examData.pentacam.os.residual, existing.examData?.pentacam?.os?.residual),
            ttt: pickValue(examData.pentacam.os.ttt, existing.examData?.pentacam?.os?.ttt),
            ablation: pickValue(examData.pentacam.os.ablation, existing.examData?.pentacam?.os?.ablation),
          },
        },
      };
      await saveSheetMutation.mutateAsync({
        patientId: initialPatientId,
        sheetType: "lasik",
        content: JSON.stringify({
          ...existing,
          formData: { ...(existing.formData ?? {}), ...formData },
          examData: mergedExamData,
          operationDetails: {
            type: operationType,
            eyes: operationEyes,
          },
        }),
      });
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "حدث خطأ أثناء الحفظ"));
    }
  };

  useEffect(() => {
    if (!initialPatientId) return;
    const timeout = setTimeout(() => {
      handleSaveSheet();
    }, 600);
    return () => clearTimeout(timeout);
  }, [formData, examData, operationType, operationEyes, initialPatientId]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={`min-h-screen bg-background sheet-layout ${mobileSheetModeEnabled ? "mobile-sheet-mode" : ""}`} dir="rtl" style={{ direction: 'rtl', textAlign: 'right' }}>
      <style>{`
        ${customSheetCss}
        .refraction-table-center th,
        .refraction-table-center td {
          text-align: center !important;
        }
        .refraction-table-center input {
          text-align: center !important;
        }
        @media print {
          .lasik-print-root {
            transform: translateX(${printOffsetXmm}mm) translateY(${printOffsetYmm}mm) scale(${printScale});
            transform-origin: top center;
          }
        }
      `}</style>
      {/* Header */}
      <header className="bg-primary text-primary-foreground shadow-lg sticky top-0 z-10 print:hidden">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-2 flex-nowrap sheet-header-bar">
            <div className="flex items-center gap-3 whitespace-nowrap">
              <h1 className="text-xl font-bold">{sheetTemplate.sheetTitle}</h1>
              <span className="text-sm opacity-90">{formData.patientName}</span>
            </div>
            <div className="flex gap-1 items-center whitespace-nowrap print:hidden sheet-header-actions">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => goBack()}
                className="text-primary-foreground hover:bg-primary/90"
              >
                رجوع
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setLocation("/dashboard")}
                className="text-primary-foreground hover:bg-primary/90"
              >
                الصفحة الرئيسية
              </Button>
            </div>
            <div className="flex gap-1 flex-nowrap sheet-header-actions">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                type="button"
                className="text-primary-foreground border-primary-foreground hover:bg-primary/80"
              >
                <Printer className="h-4 w-4 mr-2" />
                طباعة
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveSheet}
                type="button"
                className="text-primary-foreground border-primary-foreground hover:bg-primary/80"
              >
                حفظ
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 pb-24 sm:pb-8 print:p-0">
        <div className="mb-4 print:hidden">
          <PatientPicker
            initialPatientId={initialPatientId}
            onSelect={handleSelectPatient}
          />
        </div>
        {/* Operation Details moved under sheet header */}
        <div className="bg-white p-8 print:p-0 lasik-print-root">
          {/* Header */}
          <div className="mb-0 border-b-4 border-primary pb-0 -mx-8 px-8" style={{ textAlign: 'center' }}>
            <h2 className="text-lg font-bold" dir="rtl" style={{ textAlign: 'right' }}>عيون الشروق لليزك وتصحيح الإبصار</h2>
            <p className="text-sm" dir="ltr" style={{ textAlign: 'center' }}>Al Shrouk Eye Center for Lasik & Vision Correction</p>
          </div>

          {/* Operation Details */}
          <div className="sheet-section-card flex flex-wrap sm:flex-nowrap items-center justify-start sm:justify-between gap-2 mb-1 text-xs px-2 py-1 bg-muted/30 overflow-x-hidden text-center" dir="rtl">
            <div className="flex items-center gap-1 min-w-0">
              <span className="font-bold">{sheetTemplate.examinationDateLabel}</span>
              <Input
                type="date"
                value={formData.examinationDate}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, examinationDate: event.target.value }))
                }
                className="text-xs text-right w-[120px] sm:w-[160px] min-w-0"
                dir="rtl"
              />
            </div>
            <div className="flex items-center gap-1 min-w-0">
              <span className="font-bold">نوع العملية</span>
              <select
                value={operationType}
                onChange={(event) => setOperationType(event.target.value)}
                className="text-xs text-right w-[120px] sm:w-[160px] min-w-0 h-8 rounded-md border border-input bg-background px-2"
                dir="rtl"
              >
                <option value=""></option>
                <option value="ليزك">ليزك</option>
                <option value="فيمتو ليزك">فيمتو ليزك</option>
                <option value="PRK">PRK</option>
                <option value="فيمتو سمايل">فيمتو سمايل</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-1 min-w-0">
              <span className="font-bold">العيون</span>
              <label className="flex items-center gap-1 bg-white px-2 py-1">
                <span className="text-xs">يمين (RT)</span>
                <Checkbox
                  id="lasik-rt"
                  checked={operationEyes.right}
                  onCheckedChange={(checked) => {
                    const right = Boolean(checked);
                    setOperationEyes((prev) => ({
                      ...prev,
                      right,
                      both: right && prev.left,
                    }));
                  }}
                />
              </label>
              <label className="flex items-center gap-1 bg-white px-2 py-1">
                <span className="text-xs">يسار (LT)</span>
                <Checkbox
                  id="lasik-lt"
                  checked={operationEyes.left}
                  onCheckedChange={(checked) => {
                    const left = Boolean(checked);
                    setOperationEyes((prev) => ({
                      ...prev,
                      left,
                      both: prev.right && left,
                    }));
                  }}
                />
              </label>
              <label className="flex items-center gap-1 bg-white px-2 py-1">
                <span className="text-xs">OU</span>
                <Checkbox
                  id="lasik-ou"
                  checked={operationEyes.both}
                  onCheckedChange={(checked) => {
                    const both = Boolean(checked);
                    setOperationEyes({
                      right: both ? true : false,
                      left: both ? true : false,
                      both,
                    });
                  }}
                />
              </label>
            </div>
          </div>

          {/* Patient Info */}
          <p className="font-bold text-sm mb-1">{sheetTemplate.patientInfoTitle}</p>
          <div className="sheet-section-card flex flex-col gap-1 mb-2 text-xs" dir="rtl" style={{ whiteSpace: "nowrap" }}>
            <div className="flex flex-nowrap items-center justify-between gap-2 w-full">
              <div className="flex items-center gap-1">
                <label className="font-bold">الاسم</label>
                <Input value={formData.patientName} readOnly className="text-xs border-0" style={{ textAlign: "right" }} />
              </div>
              <div className="flex items-center gap-1">
                <label className="font-bold">تاريخ الميلاد</label>
                <Input value={formData.dateOfBirth} readOnly className="text-xs border-0" style={{ textAlign: "right" }} />
              </div>
              <div className="flex items-center gap-1">
                <label className="font-bold">السن</label>
                <Input value={formData.age} readOnly className="text-xs border-0" style={{ textAlign: "right" }} />
              </div>
              <div className="flex items-center gap-1">
                <label className="font-bold">{sheetTemplate.doctorLabel}</label>
                <Input value={signatures.doctor} readOnly className="text-xs border-0" style={{ textAlign: "right" }} />
              </div>
            </div>

            <div className="flex flex-nowrap items-center justify-between gap-2 w-full">
              <div className="flex items-center gap-1">
                <label className="font-bold">العنوان</label>
                <Input value={formData.address} readOnly className="text-xs border-0" style={{ textAlign: "right" }} />
              </div>
              <div className="flex items-center gap-1">
                <label className="font-bold">الموبايل</label>
                <Input value={formData.phone} readOnly className="text-xs border-0" style={{ textAlign: "right" }} />
              </div>
              <div className="flex items-center gap-1">
                <label className="font-bold">كود العميل</label>
                <Input value={formData.patientCode} readOnly className="text-xs border-0" style={{ textAlign: "right" }} />
              </div>
              <div className="flex items-center gap-1">
                <label className="font-bold">الوظيفة</label>
                <Input value={formData.job} readOnly className="text-xs border-0" style={{ textAlign: "right" }} />
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

          {/* Refraction Table */}
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
                  <td className="border-r p-0.5"><Input placeholder="" className="text-xs" value={examData.autorefraction.od.ucva} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, ucva: e.target.value } } }))} /></td>
                  <td className="border-r p-0.5"><Input placeholder="" className="text-xs" value={examData.autorefraction.od.bcva} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, bcva: e.target.value } } }))} /></td>
                  <td className="border-r p-0.5"><Input placeholder="" className="text-xs" value={examData.autorefraction.od.iop} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, iop: e.target.value } } }))} /></td>
                  <td className="border-r p-0.5" rowSpan={2}><Input placeholder="" className="text-xs" value={examData.autorefraction.od.s} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, s: e.target.value } } }))} /></td>
                  <td className="border-r p-0.5" rowSpan={2}><Input placeholder="" className="text-xs" value={examData.autorefraction.od.c} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, c: e.target.value } } }))} /></td>
                  <td className="border-r p-0.5" rowSpan={2}><Input placeholder="" className="text-xs" value={examData.autorefraction.od.axis} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, axis: e.target.value } } }))} /></td>
                  <td className="border-r p-0.5" rowSpan={2}><Input placeholder="" className="text-xs" value={examData.autorefraction.os.s} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, s: e.target.value } } }))} /></td>
                  <td className="border-r p-0.5" rowSpan={2}><Input placeholder="" className="text-xs" value={examData.autorefraction.os.c} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, c: e.target.value } } }))} /></td>
                  <td className="p-0.5" rowSpan={2}><Input placeholder="" className="text-xs" value={examData.autorefraction.os.axis} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, axis: e.target.value } } }))} /></td>
                </tr>
                <tr className="border-b">
                  <td className="border-r p-0.5 font-bold">OS</td>
                  <td className="border-r p-0.5"><Input placeholder="" className="text-xs" value={examData.autorefraction.os.ucva} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, ucva: e.target.value } } }))} /></td>
                  <td className="border-r p-0.5"><Input placeholder="" className="text-xs" value={examData.autorefraction.os.bcva} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, bcva: e.target.value } } }))} /></td>
                  <td className="border-r p-0.5"><Input placeholder="" className="text-xs" value={examData.autorefraction.os.iop} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, iop: e.target.value } } }))} /></td>
                </tr>
                <tr className="border-b">
                  <td className="border-r p-0.5 font-bold">Fundus</td>
                  <td className="p-0.5" colSpan={9}><Input placeholder="" className="text-xs" /></td>
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

          {/* Keratometry Tables */}
          <div className="grid grid-cols-2 gap-2 mb-4 sheet-section-card">
            <div className="border">
              <div className="bg-gray-100 p-1 text-center font-bold text-xs border-b">
                RT فحص القرنية
              </div>
              <table className="w-full text-xs text-center lasik-table" dir="ltr" style={{ direction: 'ltr', unicodeBidi: 'bidi-override', textAlign: 'center' }}>
                <tbody>
                  <tr className="border-b">
                    <td className="border-r p-0.5 font-bold text-center">K1</td>
                    <td className="border-r p-0.5">
                      <Input
                        placeholder=""
                        className="text-xs"
                        dir="ltr"
                        value={examData.pentacam.od.k1}
                        onChange={(e) =>
                          setExamData((prev) => ({
                            ...prev,
                            pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, k1: e.target.value } },
                          }))
                        }
                      />
                    </td>
                    <td className="border-r p-0.5 font-bold text-center" rowSpan={2}>AX</td>
                    <td className="p-0.5">
                      <Input
                        placeholder=""
                        className="text-xs"
                        dir="ltr"
                        value={examData.pentacam.od.ax1}
                        onChange={(e) =>
                          setExamData((prev) => ({
                            ...prev,
                            pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, ax1: e.target.value } },
                          }))
                        }
                      />
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="border-r p-0.5 font-bold text-center">K2</td>
                    <td className="border-r p-0.5">
                      <Input
                        placeholder=""
                        className="text-xs"
                        dir="ltr"
                        value={examData.pentacam.od.k2}
                        onChange={(e) =>
                          setExamData((prev) => ({
                            ...prev,
                            pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, k2: e.target.value } },
                          }))
                        }
                      />
                    </td>
                    <td className="p-0.5">
                      <Input
                        placeholder=""
                        className="text-xs"
                        dir="ltr"
                        value={examData.pentacam.od.ax2}
                        onChange={(e) =>
                          setExamData((prev) => ({
                            ...prev,
                            pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, ax2: e.target.value } },
                          }))
                        }
                      />
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="border-r p-0.5 font-bold text-center">Thinnest Point</td>
                    <td colSpan={3} className="p-0.5">
                      <Input
                        placeholder=""
                        className="text-xs"
                        dir="ltr"
                        value={examData.pentacam.od.thinnest}
                        onChange={(e) =>
                          setExamData((prev) => ({
                            ...prev,
                            pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, thinnest: e.target.value } },
                          }))
                        }
                      />
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="border-r p-0.5 font-bold text-center">Corneal Apex</td>
                    <td colSpan={3} className="p-0.5">
                      <Input
                        placeholder=""
                        className="text-xs"
                        dir="ltr"
                        value={examData.pentacam.od.apex}
                        onChange={(e) =>
                          setExamData((prev) => ({
                            ...prev,
                            pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, apex: e.target.value } },
                          }))
                        }
                      />
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="border-r p-0.5 font-bold text-center">Residual Stroma</td>
                    <td colSpan={3} className="p-0.5">
                      <Input
                        placeholder=""
                        className="text-xs"
                        dir="ltr"
                        value={examData.pentacam.od.residual}
                        onChange={(e) =>
                          setExamData((prev) => ({
                            ...prev,
                            pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, residual: e.target.value } },
                          }))
                        }
                      />
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="border-r p-0.5 font-bold text-center">Planned TTT</td>
                    <td colSpan={3} className="p-0.5">
                      <Input
                        placeholder=""
                        className="text-xs"
                        dir="ltr"
                        value={examData.pentacam.od.ttt}
                        onChange={(e) =>
                          setExamData((prev) => ({
                            ...prev,
                            pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, ttt: e.target.value } },
                          }))
                        }
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="border-r p-0.5 font-bold text-center">Ablation</td>
                    <td colSpan={3} className="p-0.5">
                      <Input
                        placeholder=""
                        className="text-xs"
                        dir="ltr"
                        value={examData.pentacam.od.ablation}
                        onChange={(e) =>
                          setExamData((prev) => ({
                            ...prev,
                            pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, ablation: e.target.value } },
                          }))
                        }
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="border">
              <div className="bg-gray-100 p-1 text-center font-bold text-xs border-b">
                LT فحص القرنية
              </div>
              <table className="w-full text-xs text-center lasik-table" dir="ltr" style={{ direction: 'ltr', unicodeBidi: 'bidi-override', textAlign: 'center' }}>
                <tbody>
                  <tr className="border-b">
                    <td className="border-r p-0.5 font-bold text-center">K1</td>
                    <td className="border-r p-0.5">
                      <Input
                        placeholder=""
                        className="text-xs"
                        dir="ltr"
                        value={examData.pentacam.os.k1}
                        onChange={(e) =>
                          setExamData((prev) => ({
                            ...prev,
                            pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, k1: e.target.value } },
                          }))
                        }
                      />
                    </td>
                    <td className="border-r p-0.5 font-bold text-center" rowSpan={2}>AX</td>
                    <td className="p-0.5">
                      <Input
                        placeholder=""
                        className="text-xs"
                        dir="ltr"
                        value={examData.pentacam.os.ax1}
                        onChange={(e) =>
                          setExamData((prev) => ({
                            ...prev,
                            pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, ax1: e.target.value } },
                          }))
                        }
                      />
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="border-r p-0.5 font-bold text-center">K2</td>
                    <td className="border-r p-0.5">
                      <Input
                        placeholder=""
                        className="text-xs"
                        dir="ltr"
                        value={examData.pentacam.os.k2}
                        onChange={(e) =>
                          setExamData((prev) => ({
                            ...prev,
                            pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, k2: e.target.value } },
                          }))
                        }
                      />
                    </td>
                    <td className="p-0.5">
                      <Input
                        placeholder=""
                        className="text-xs"
                        dir="ltr"
                        value={examData.pentacam.os.ax2}
                        onChange={(e) =>
                          setExamData((prev) => ({
                            ...prev,
                            pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, ax2: e.target.value } },
                          }))
                        }
                      />
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="border-r p-0.5 font-bold text-center">Thinnest Point</td>
                    <td colSpan={3} className="p-0.5">
                      <Input
                        placeholder=""
                        className="text-xs"
                        dir="ltr"
                        value={examData.pentacam.os.thinnest}
                        onChange={(e) =>
                          setExamData((prev) => ({
                            ...prev,
                            pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, thinnest: e.target.value } },
                          }))
                        }
                      />
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="border-r p-0.5 font-bold text-center">Corneal Apex</td>
                    <td colSpan={3} className="p-0.5">
                      <Input
                        placeholder=""
                        className="text-xs"
                        value={examData.pentacam.os.apex}
                        onChange={(e) =>
                          setExamData((prev) => ({
                            ...prev,
                            pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, apex: e.target.value } },
                          }))
                        }
                      />
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="border-r p-0.5 font-bold text-center">Residual Stroma</td>
                    <td colSpan={3} className="p-0.5">
                      <Input
                        placeholder=""
                        className="text-xs"
                        value={examData.pentacam.os.residual}
                        onChange={(e) =>
                          setExamData((prev) => ({
                            ...prev,
                            pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, residual: e.target.value } },
                          }))
                        }
                      />
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="border-r p-0.5 font-bold text-center">Planned TTT</td>
                    <td colSpan={3} className="p-0.5">
                      <Input
                        placeholder=""
                        className="text-xs"
                        value={examData.pentacam.os.ttt}
                        onChange={(e) =>
                          setExamData((prev) => ({
                            ...prev,
                            pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, ttt: e.target.value } },
                          }))
                        }
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="border-r p-0.5 font-bold text-center">Ablation</td>
                    <td colSpan={3} className="p-0.5">
                      <Input
                        placeholder=""
                        className="text-xs"
                        value={examData.pentacam.os.ablation}
                        onChange={(e) =>
                          setExamData((prev) => ({
                            ...prev,
                            pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, ablation: e.target.value } },
                          }))
                        }
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Target Refraction Table */}
          <div className="mb-4 border sheet-section-card">
            <table className="w-full text-xs text-center lasik-table" dir="ltr" style={{ direction: 'ltr', unicodeBidi: 'bidi-override', textAlign: 'center' }}>
              <thead>
                <tr className="border-b bg-gray-100">
                  <th className="border-r p-0.5 text-center">Target refraction</th>
                  <th className="border-r p-0.5 text-center">OD / OS</th>
                  <th className="border-r p-0.5 text-center">Before Flap</th>
                  <th className="border-r p-0.5 text-center">After Flap</th>
                  <th className="border-r p-0.5 text-center">After Treatment</th>
                  <th className="border-r p-0.5 text-center">After Flap Reposition</th>
                  <th className="border-r p-0.5 text-center">Ciclo 3 مرات</th>
                  <th className="p-0.5 text-center">Note</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="border-r p-0.5">
                    <Input placeholder="" className="text-xs" dir="ltr" />
                  </td>
                  <td className="border-r p-0.5">
                    <Input placeholder="" className="text-xs" dir="ltr" />
                  </td>
                  <td className="border-r p-0.5">
                    <Input placeholder="" className="text-xs" dir="ltr" />
                  </td>
                  <td className="border-r p-0.5">
                    <Input placeholder="" className="text-xs" dir="ltr" />
                  </td>
                  <td className="border-r p-0.5">
                    <Input placeholder="" className="text-xs" dir="ltr" />
                  </td>
                  <td className="border-r p-0.5">
                    <Input placeholder="" className="text-xs" dir="ltr" />
                  </td>
                  <td className="border-r p-0.5">
                    <Input placeholder="" className="text-xs" dir="ltr" />
                  </td>
                  <td className="p-0.5">
                    <Input placeholder="" className="text-xs" dir="ltr" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Comments and Notes (like consultant) */}
          <div className="flex gap-0.5 mb-1 sheet-section-card" dir="rtl">
            <div style={{ flex: "0 0 64%" }}>
              <Textarea
                placeholder="Comments:"
                className="text-xs w-full max-w-none"
                rows={3}
                dir="ltr"
                style={{ maxWidth: "none", width: "100%", marginInlineStart: "0", marginInlineEnd: "0", boxSizing: "border-box", textAlign: "left" }}
              />
            </div>
            <div className="notes-col" style={{ flex: "0 0 32%", paddingInlineStart: "0", marginInlineStart: "0" }}>
              <Textarea
                placeholder={sheetTemplate.notesLabel}
                className="text-xs w-full max-w-none"
                rows={3}
                dir="ltr"
                style={{ maxWidth: "none", width: "100%", boxSizing: "border-box", textAlign: "left" }}
              />
            </div>
          </div>

          {/* Final */}
          <div className="mb-1 w-full">
            <Textarea
              placeholder="Final:"
              className="text-xs w-full max-w-none"
              rows={3}
              dir="ltr"
              style={{ maxWidth: "none", width: "100%", textAlign: "left" }}
            />
          </div>

          {/* Signature Line */}
          <div className="grid grid-cols-4 gap-2 text-xs border-t pt-4">
            <div className="flex items-center justify-end gap-1">
              <span>استقبال</span>
              <Input value={signatures.reception} readOnly className="text-xs border-0 text-right" />
            </div>
            <div className="flex items-center justify-end gap-1">
              <span>تمريض</span>
              <Input value={signatures.nurse} readOnly className="text-xs border-0 text-right" />
            </div>
            <div className="flex items-center justify-end gap-1">
              <span>فني</span>
              <Input value={signatures.technician} readOnly className="text-xs border-0 text-right" />
            </div>
            <div className="flex items-center justify-end gap-1">
              <span>طبيب</span>
              <Input value={signatures.doctor} readOnly className="text-xs border-0 text-right" />
            </div>
          </div>
        </div>
        <div className="sheet-mobile-actions print:hidden">
          <Button type="button" variant="outline" onClick={() => goBack()}>رجوع</Button>
          <Button type="button" variant="outline" onClick={handlePrint}>طباعة</Button>
          <Button type="button" variant="default" onClick={handleSaveSheet}>حفظ</Button>
        </div>
      </main>
    </div>
  );
}
