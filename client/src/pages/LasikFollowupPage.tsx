import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Printer } from "lucide-react";
import PatientPicker from "@/components/PatientPicker";
import { trpc } from "@/lib/trpc";
import { coerceSheetDesignerConfig, DEFAULT_SHEET_DESIGNER_CONFIG, loadSheetDesignerConfig, saveSheetDesignerConfig } from "@/lib/sheetDesigner";

export default function LasikFollowupPage() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/sheets/lasik/:id/followup");
  const initialPatientId = params?.id ? Number(params.id) : undefined;

  const [operationDateLeft, setOperationDateLeft] = useState("");
  const [operationDateRight, setOperationDateRight] = useState("");
  const [operationType, setOperationType] = useState("ليزك");
  const [operationEyes, setOperationEyes] = useState({ right: true, left: false });
  const [designerConfig, setDesignerConfig] = useState(DEFAULT_SHEET_DESIGNER_CONFIG);
  const [patientName, setPatientName] = useState("");
  const [signatures, setSignatures] = useState({ doctor: "" });
  const [followups, setFollowups] = useState([
    { id: 1, date: "", type: "المتابعة الأولى" },
    { id: 2, date: "", type: "المتابعة الثانية" },
    { id: 3, date: "", type: "المتابعة الثالثة" },
    { id: 4, date: "", type: "المتابعة الرابعة" },
  ]);

  const patientQuery = trpc.medical.getPatient.useQuery(
    { patientId: initialPatientId ?? 0 },
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

  useEffect(() => {
    if (!isAuthenticated) setLocation("/");
  }, [isAuthenticated, setLocation]);

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
    const names = designerConfig.followupLasik?.followupNames ?? [];
    setFollowups((prev) => prev.map((item, i) => ({ ...item, type: names[i] ?? item.type })));
  }, [designerConfig.followupLasik?.followupNames]);

  useEffect(() => {
    const p = patientQuery.data as any;
    if (p?.fullName) setPatientName(String(p.fullName));
  }, [patientQuery.data]);

  useEffect(() => {
    const doctorFromState = String((examinationStateQuery.data as any)?.data?.doctorName ?? "").trim();
    const fullName = String(user?.name ?? "").trim();
    setSignatures({ doctor: doctorFromState || fullName || "" });
  }, [examinationStateQuery.data, user?.name]);

  if (!isAuthenticated) return null;

  const followupLabels = designerConfig.followupLasik ?? DEFAULT_SHEET_DESIGNER_CONFIG.followupLasik;

  const onPickPatient = (patient: { id: number }) => {
    if (patient?.id) setLocation(`/sheets/lasik/${patient.id}/followup`);
  };

  return (
    <div className="min-h-screen bg-background sheet-layout" dir="rtl">
      <style>{`
        @media print {
          .followup-print-root {
            transform: translateX(${followupLabels.offsetXmm}mm) scale(${followupLabels.scale});
            transform-origin: top center;
            margin-top: ${followupLabels.offsetYmm}mm;
          }
        }
      `}</style>

      <header className="bg-primary text-primary-foreground shadow-lg sticky top-0 z-[120] print:hidden pointer-events-auto">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="min-w-0 pointer-events-none">
            <h1 className="text-xl font-bold">متابعات الليزك</h1>
            <p className="text-sm opacity-90 truncate">{patientName}</p>
          </div>
          <div className="flex gap-1 relative z-[130] pointer-events-auto shrink-0">
            <div className="w-72 max-w-[45vw]">
              <PatientPicker initialPatientId={initialPatientId} onSelect={onPickPatient} />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => window.location.assign(`/sheets/lasik/${initialPatientId ?? ""}`)} className="text-primary-foreground border-primary-foreground hover:bg-primary/80">الاستمارة</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => window.print()} className="text-primary-foreground border-primary-foreground hover:bg-primary/80"><Printer className="h-4 w-4 mr-2"/>طباعة</Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="mb-3 print:hidden">
          <PatientPicker initialPatientId={initialPatientId} onSelect={onPickPatient} readOnly />
        </div>

        <div className="followup-print-root p-1 bg-white text-slate-900" dir="ltr" style={{ fontFamily: '"Times New Roman", Tahoma, Arial, sans-serif' }}>
          <div className="mb-2 flex items-center justify-between text-[15px] px-1 print:text-[13px]">
            <div className="whitespace-nowrap">{followupLabels.rtLabel}: {operationEyes.right ? "" : "..."} &nbsp;&nbsp; {followupLabels.ltLabel}: {operationEyes.left ? "" : "..."} &nbsp; //</div>
            <div className="whitespace-nowrap">{followupLabels.operationTypeLabel}: <Input value={operationType} onChange={(e) => setOperationType(e.target.value)} className="inline-block w-40 h-7 text-xs mx-1" /></div>
            <div className="whitespace-nowrap">{followupLabels.operationDateLabel}
              <Input type="date" value={operationDateRight} onChange={(e) => setOperationDateRight(e.target.value)} className="inline-block w-32 h-7 text-xs mx-1" />
              <Input type="date" value={operationDateLeft} onChange={(e) => setOperationDateLeft(e.target.value)} className="inline-block w-32 h-7 text-xs" />
            </div>
          </div>

          {followups.map((f) => (
            <table key={f.id} className="w-full border border-black/70 border-collapse text-[15px] table-fixed mb-2 print:text-[12px]" style={{ marginBottom: `${followupLabels.tableGapMm}mm` }}>
              <colgroup>
                <col style={{ width: "14%" }} /><col style={{ width: "14%" }} /><col style={{ width: "12%" }} /><col style={{ width: "12%" }} /><col style={{ width: "12%" }} /><col style={{ width: "12%" }} /><col style={{ width: "12%" }} /><col style={{ width: "12%" }} />
              </colgroup>
              <tbody>
                <tr>
                  <td colSpan={2} className="border border-black/50 px-1 py-0.5 text-center">{followupLabels.nextFollowupLabel} <span className="mx-2">/  /</span></td>
                  <td colSpan={3} className="border border-black/50 px-1 py-0.5 text-center font-semibold"><Input value={f.type} onChange={(e) => setFollowups((prev) => prev.map((x) => x.id === f.id ? { ...x, type: e.target.value } : x))} className="h-7 text-xs" /></td>
                  <td colSpan={3} className="border border-black/50 px-1 py-0.5 text-center">{followupLabels.followupDateLabel} <Input type="date" value={f.date} onChange={(e) => setFollowups((prev) => prev.map((x) => x.id === f.id ? { ...x, date: e.target.value } : x))} className="inline-block w-32 h-7 text-xs mx-1" /></td>
                </tr>
                <tr>
                  <td colSpan={8} className="border border-black/50 py-0.5 text-center font-semibold">Dominant eye _____________</td>
                </tr>
                <tr>
                  <td colSpan={2} className="border border-black/50 py-0.5"></td>
                  <td colSpan={3} className="border border-black/50 py-0.5 text-center font-semibold">OD</td>
                  <td colSpan={3} className="border border-black/50 py-0.5 text-center font-semibold">OS</td>
                </tr>
                <tr>
                  <td colSpan={2} className="border border-black/50 py-1 text-center font-semibold">{followupLabels.vaLabel}</td>
                  <td colSpan={3} className="border border-black/50 py-1"></td>
                  <td colSpan={3} className="border border-black/50 py-1"></td>
                </tr>
                <tr>
                  <td colSpan={2} className="border border-black/50 py-1 text-center font-semibold">{followupLabels.refractionLabel}</td>
                  <td className="border border-black/50 py-1 text-center font-semibold">S</td>
                  <td className="border border-black/50 py-1 text-center font-semibold">C</td>
                  <td className="border border-black/50 py-1 text-center font-semibold">A</td>
                  <td className="border border-black/50 py-1 text-center font-semibold">S</td>
                  <td className="border border-black/50 py-1 text-center font-semibold">C</td>
                  <td className="border border-black/50 py-1 text-center font-semibold">A</td>
                </tr>
                <tr>
                  <td colSpan={2} className="border border-black/50 py-1"></td>
                  <td className="border border-black/50 h-8">&nbsp;</td><td className="border border-black/50 h-8">&nbsp;</td><td className="border border-black/50 h-8">&nbsp;</td><td className="border border-black/50 h-8">&nbsp;</td><td className="border border-black/50 h-8">&nbsp;</td><td className="border border-black/50 h-8">&nbsp;</td>
                </tr>
                <tr>
                  <td rowSpan={2} className="border border-black/50 py-1 text-center font-semibold">{followupLabels.flapLabel}</td>
                  <td className="border border-black/50 py-1 text-center font-semibold">{followupLabels.edgesLabel}</td>
                  <td colSpan={6} className="border border-black/50 py-1"></td>
                </tr>
                <tr>
                  <td className="border border-black/50 py-1 text-center font-semibold">{followupLabels.bedLabel}</td>
                  <td colSpan={6} className="border border-black/50 py-1"></td>
                </tr>
                <tr>
                  <td colSpan={2} className="border border-black/50 py-1 text-center font-semibold">{followupLabels.iopLabel}</td>
                  <td colSpan={6} className="border border-black/50 py-1"></td>
                </tr>
                <tr>
                  <td colSpan={2} className="border border-black/50 py-1 text-center font-semibold">{followupLabels.treatmentLabel}</td>
                  <td colSpan={6} className="border border-black/50 py-1"></td>
                </tr>
                <tr>
                  <td colSpan={2} className="border border-black/50 px-1 py-0.5 text-right font-semibold">{followupLabels.receptionLabel}</td>
                  <td colSpan={3} className="border border-black/50 px-1 py-0.5 text-right font-semibold">{followupLabels.nurseLabel}</td>
                  <td colSpan={3} className="border border-black/50 px-1 py-0.5 text-right font-semibold">{followupLabels.doctorLabel}{signatures.doctor ? `: ${signatures.doctor}` : ""}</td>
                </tr>
              </tbody>
            </table>
          ))}
        </div>
      </main>
    </div>
  );
}
