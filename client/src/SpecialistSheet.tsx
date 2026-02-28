import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Printer } from "lucide-react";
import { toast } from "sonner";
import { getTrpcErrorMessage } from "@/lib/utils";
import PatientPicker from "@/components/PatientPicker";
import { trpc } from "@/lib/trpc";
import { connectSheetUpdates } from "@/lib/ws";
import { coerceSheetDesignerConfig, DEFAULT_SHEET_DESIGNER_CONFIG, loadSheetDesignerConfig, saveSheetDesignerConfig } from "@/lib/sheetDesigner";

export default function SpecialistSheet() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/sheets/specialist/:id");

  const [operationDateRight, setOperationDateRight] = useState("");
  const [operationDateLeft, setOperationDateLeft] = useState("");
  const [operationType, setOperationType] = useState("متابعة");
  const [operationEyes, setOperationEyes] = useState({ right: true, left: false });
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
    ucvaOD: "",
    ucvaOS: "",
    bcvaOD: "",
    bcvaOS: "",
    refractionOD: { s: "", c: "", a: "" },
    refractionOS: { s: "", c: "", a: "" },
    iopOD: "",
    iopOS: "",
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
  const [sheetTemplate, setSheetTemplate] = useState(DEFAULT_SHEET_DESIGNER_CONFIG.templates.specialist);
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
    setCustomSheetCss(localDesigner.css.specialist || "");
    setSheetTemplate(localDesigner.templates.specialist);
    setPrintOffsetXmm(localDesigner.layout.specialist.offsetXmm);
    setPrintOffsetYmm(localDesigner.layout.specialist.offsetYmm);
    setPrintScale(localDesigner.layout.specialist.scale);
  }, []);

  useEffect(() => {
    if (!designerSettingsQuery.data?.value) return;
    const merged = coerceSheetDesignerConfig(designerSettingsQuery.data.value);
    setCustomSheetCss(merged.css.specialist || "");
    setSheetTemplate(merged.templates.specialist);
    setPrintOffsetXmm(merged.layout.specialist.offsetXmm);
    setPrintOffsetYmm(merged.layout.specialist.offsetYmm);
    setPrintScale(merged.layout.specialist.scale);
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
    { patientId: initialPatientId ?? 0, sheetType: "specialist" },
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
      setLocation(`/sheets/specialist/${patient.id}`);
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
          // keep patient info from DB if present
          patientName: prev.patientName || parsed.formData.patientName,
          phone: prev.phone || parsed.formData.phone,
          age: prev.age || parsed.formData.age,
          dateOfBirth: prev.dateOfBirth || parsed.formData.dateOfBirth,
          address: prev.address || parsed.formData.address,
        }));
      }
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
            ucva: pickValue(formData.ucvaOD, existing.examData?.autorefraction?.od?.ucva),
            bcva: pickValue(formData.bcvaOD, existing.examData?.autorefraction?.od?.bcva),
            s: pickValue(formData.refractionOD?.s, existing.examData?.autorefraction?.od?.s),
            c: pickValue(formData.refractionOD?.c, existing.examData?.autorefraction?.od?.c),
            axis: pickValue(formData.refractionOD?.a, existing.examData?.autorefraction?.od?.axis),
            iop: pickValue(formData.iopOD, existing.examData?.autorefraction?.od?.iop),
          },
          os: {
            ...(existing.examData?.autorefraction?.os ?? {}),
            ucva: pickValue(formData.ucvaOS, existing.examData?.autorefraction?.os?.ucva),
            bcva: pickValue(formData.bcvaOS, existing.examData?.autorefraction?.os?.bcva),
            s: pickValue(formData.refractionOS?.s, existing.examData?.autorefraction?.os?.s),
            c: pickValue(formData.refractionOS?.c, existing.examData?.autorefraction?.os?.c),
            axis: pickValue(formData.refractionOS?.a, existing.examData?.autorefraction?.os?.axis),
            iop: pickValue(formData.iopOS, existing.examData?.autorefraction?.os?.iop),
          },
        },
        pentacam: existing.examData?.pentacam ?? {},
      };
      await saveSheetMutation.mutateAsync({
        patientId: initialPatientId,
        sheetType: "specialist",
        content: JSON.stringify({
          ...existing,
          formData: { ...(existing.formData ?? {}), ...formData },
          examData: mergedExamData,
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
  }, [formData, initialPatientId]);

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
          .specialist-print-root {
            transform: translateX(${printOffsetXmm}mm) translateY(${printOffsetYmm}mm) scale(${printScale});
            transform-origin: top center;
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
                  <h1 className="text-2xl font-bold">{sheetTemplate.sheetTitle}</h1>
                  <p className="text-sm opacity-90">{formData.patientName}</p>
                </div>
              </div>
              <div className="flex gap-1 print:hidden sheet-header-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => setLocation("/patients")}
                  className="text-primary-foreground hover:bg-primary/90"
                >
                  رجوع
                </Button>
              </div>
            </div>
            <div className="flex gap-1 flex-wrap sheet-header-actions">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="text-primary-foreground border border-gray-700 hover:bg-primary/80"
              >
                <Printer className="h-4 w-4 mr-2" />
                طباعة
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveSheet}
                className="text-primary-foreground border border-gray-700 hover:bg-primary/80"
              >
                حفظ
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 pb-24 sm:pb-8 print:p-0">
        {/* Patient picker removed */}
        <div className="bg-white p-8 print:p-0 specialist-print-root">
          <div className="mb-2 print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/dashboard")}
              className="border-primary text-primary hover:bg-primary/10"
            >
              الصفحة الرئيسية
            </Button>
          </div>
          {/* Header */}
          <div className="mb-1 border-b-4 border-primary pb-1 -mx-8 px-8" style={{ textAlign: 'center' }}>
            <h2 className="text-lg font-bold" dir="rtl" style={{ textAlign: 'right' }}>عيون الشروق لليزك وتصحيح الإبصار</h2>
            <p className="text-sm" dir="ltr" style={{ textAlign: 'center', unicodeBidi: 'bidi-override', direction: 'ltr' }}>Al Shrouk Eye Center for Lasik & Vision Correction</p>
          </div>

          {/* Operation Details removed per request */}

          {/* Patient Info */}
          <p className="font-bold text-sm mb-1">{sheetTemplate.patientInfoTitle}</p>
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
                <label className="font-bold">{sheetTemplate.doctorLabel}</label>
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
                <Input value={formData.patientCode} readOnly className="text-xs border-0" style={{ textAlign: 'right' }} />
              </div>
              <div className="flex items-center gap-1">
                <label className="font-bold">الوظيفة</label>
                <Input value={formData.job} readOnly className="text-xs border-0" style={{ textAlign: 'right' }} />
              </div>
            </div>
          </div>

          {/* Medical History - Compact */}
          <div className="mb-2 border p-1 sheet-section-card">
            <p className="font-bold text-sm mb-1">التاريخ المرضي:</p>
            <div className="grid grid-cols-4 gap-0.5 text-sm text-center place-items-center">
              <div className="flex items-center gap-1">
                <Checkbox className="border-2 border-gray-700" />
                <label className="text-sm cursor-pointer">قرنية مخروطية</label>
              </div>
              <div className="flex items-center gap-1">
                <Checkbox className="border-2 border-gray-700" />
                <label className="text-sm cursor-pointer">علاج حب الشباب</label>
              </div>
              <div className="flex items-center gap-1">
                <Checkbox className="border-2 border-gray-700" />
                <label className="text-sm cursor-pointer">ضغط  سكر  غده</label>
              </div>
              <div className="flex items-center gap-1">
                <Checkbox className="border-2 border-gray-700" />
                <label className="text-sm cursor-pointer">امراض بالعين</label>
              </div>
            </div>
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
{/* Comments and Notes removed */}
          <div className="mb-1 w-full sheet-section-card">
            <Textarea
              placeholder="Comments:"
              className="text-xs w-full max-w-none"
              rows={5}
              dir="ltr"
              style={{ maxWidth: "none", width: "100%", textAlign: "left" }}
            />
          </div>

          {/* Signature Line */}
          <div className="grid grid-cols-4 gap-2 text-xs border-t pt-2">
            <div className="flex items-center justify-end gap-1">
              <span style={{textAlign: 'right'}}>استقبال</span>
              <Input value={signatures.reception} readOnly className="text-xs border-0 text-right" />
            </div>
            <div className="flex items-center justify-end gap-1">
              <span style={{textAlign: 'right'}}>تمريض</span>
              <Input value={signatures.nurse} readOnly className="text-xs border-0 text-right" />
            </div>
            <div className="flex items-center justify-end gap-1">
              <span style={{textAlign: 'right'}}>فني</span>
              <Input value={signatures.technician} readOnly className="text-xs border-0 text-right" />
            </div>
            <div className="flex items-center justify-end gap-1">
              <span style={{textAlign: 'right'}}>أخصائي</span>
              <Input value={signatures.doctor} readOnly className="text-xs border-0 text-right" />
            </div>
          </div>
        </div>
        <div className="sheet-mobile-actions print:hidden">
          <Button type="button" variant="outline" onClick={() => setLocation("/patients")}>رجوع</Button>
          <Button type="button" variant="outline" onClick={handlePrint}>طباعة</Button>
          <Button type="button" variant="default" onClick={handleSaveSheet}>حفظ</Button>
        </div>
      </main>
    </div>
  );
}


