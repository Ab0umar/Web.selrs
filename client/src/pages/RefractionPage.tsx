import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PatientPicker from "@/components/PatientPicker";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { getTrpcErrorMessage } from "@/lib/utils";
import { useAppNavigation } from "@/hooks/useAppNavigation";

type AutoEye = {
  bcva?: string;
  pd?: string;
  s?: string;
  c?: string;
  axis?: string;
};

type AutoData = {
  od?: AutoEye;
  os?: AutoEye;
};

type RefractionForm = {
  bcvaOD: string;
  bcvaOS: string;
  pdOD: string;
  pdOS: string;
  sOD: string;
  cOD: string;
  aOD: string;
  sOS: string;
  cOS: string;
  aOS: string;
};

const EMPTY_FORM: RefractionForm = {
  bcvaOD: "",
  bcvaOS: "",
  pdOD: "",
  pdOS: "",
  sOD: "",
  cOD: "",
  aOD: "",
  sOS: "",
  cOS: "",
  aOS: "",
};

function parseSheetAuto(content: string | null | undefined): AutoData {
  if (!content) return {};
  try {
    const parsed = JSON.parse(content) as any;
    const auto = parsed?.examData?.autorefraction;
    if (!auto || typeof auto !== "object") return {};
    return {
      od: {
        bcva: String(auto?.od?.bcva ?? "").trim(),
        pd: String(auto?.od?.pd ?? "").trim(),
        s: String(auto?.od?.s ?? "").trim(),
        c: String(auto?.od?.c ?? "").trim(),
        axis: String(auto?.od?.axis ?? "").trim(),
      },
      os: {
        bcva: String(auto?.os?.bcva ?? "").trim(),
        pd: String(auto?.os?.pd ?? "").trim(),
        s: String(auto?.os?.s ?? "").trim(),
        c: String(auto?.os?.c ?? "").trim(),
        axis: String(auto?.os?.axis ?? "").trim(),
      },
    };
  } catch {
    return {};
  }
}

function firstValue(...values: Array<string | undefined>) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

export default function RefractionPage() {
  const [, setLocation] = useLocation();
  const { goBack } = useAppNavigation();
  const [, params] = useRoute("/refraction/:id");
  const patientId = Number(params?.id ?? 0);
  const autoPrintDoneRef = useRef(false);

  const patientQuery = trpc.medical.getPatient.useQuery(
    { patientId },
    { enabled: Number.isFinite(patientId) && patientId > 0, refetchOnWindowFocus: false }
  );
  const consultantQuery = trpc.medical.getSheetEntry.useQuery(
    { patientId, sheetType: "consultant" },
    { enabled: Number.isFinite(patientId) && patientId > 0, refetchOnWindowFocus: false }
  );
  const specialistQuery = trpc.medical.getSheetEntry.useQuery(
    { patientId, sheetType: "specialist" },
    { enabled: Number.isFinite(patientId) && patientId > 0, refetchOnWindowFocus: false }
  );
  const lasikQuery = trpc.medical.getSheetEntry.useQuery(
    { patientId, sheetType: "lasik" },
    { enabled: Number.isFinite(patientId) && patientId > 0, refetchOnWindowFocus: false }
  );
  const externalQuery = trpc.medical.getSheetEntry.useQuery(
    { patientId, sheetType: "external" },
    { enabled: Number.isFinite(patientId) && patientId > 0, refetchOnWindowFocus: false }
  );

  const saveSheetMutation = trpc.medical.saveSheetEntry.useMutation();
  const [form, setForm] = useState<RefractionForm>(EMPTY_FORM);

  const sourceAutos = useMemo(() => {
    const consultant = parseSheetAuto(consultantQuery.data);
    const specialist = parseSheetAuto(specialistQuery.data);
    const lasik = parseSheetAuto(lasikQuery.data);
    const external = parseSheetAuto(externalQuery.data);
    return { consultant, specialist, lasik, external };
  }, [consultantQuery.data, specialistQuery.data, lasikQuery.data, externalQuery.data]);

  useEffect(() => {
    if (!patientId) return;
    const next: RefractionForm = {
      bcvaOD: firstValue(
        sourceAutos.consultant.od?.bcva,
        sourceAutos.specialist.od?.bcva,
        sourceAutos.lasik.od?.bcva,
        sourceAutos.external.od?.bcva
      ),
      bcvaOS: firstValue(
        sourceAutos.consultant.os?.bcva,
        sourceAutos.specialist.os?.bcva,
        sourceAutos.lasik.os?.bcva,
        sourceAutos.external.os?.bcva
      ),
      pdOD: firstValue(
        sourceAutos.consultant.od?.pd,
        sourceAutos.specialist.od?.pd,
        sourceAutos.lasik.od?.pd,
        sourceAutos.external.od?.pd
      ),
      pdOS: firstValue(
        sourceAutos.consultant.os?.pd,
        sourceAutos.specialist.os?.pd,
        sourceAutos.lasik.os?.pd,
        sourceAutos.external.os?.pd
      ),
      sOD: firstValue(
        sourceAutos.consultant.od?.s,
        sourceAutos.specialist.od?.s,
        sourceAutos.lasik.od?.s,
        sourceAutos.external.od?.s
      ),
      cOD: firstValue(
        sourceAutos.consultant.od?.c,
        sourceAutos.specialist.od?.c,
        sourceAutos.lasik.od?.c,
        sourceAutos.external.od?.c
      ),
      aOD: firstValue(
        sourceAutos.consultant.od?.axis,
        sourceAutos.specialist.od?.axis,
        sourceAutos.lasik.od?.axis,
        sourceAutos.external.od?.axis
      ),
      sOS: firstValue(
        sourceAutos.consultant.os?.s,
        sourceAutos.specialist.os?.s,
        sourceAutos.lasik.os?.s,
        sourceAutos.external.os?.s
      ),
      cOS: firstValue(
        sourceAutos.consultant.os?.c,
        sourceAutos.specialist.os?.c,
        sourceAutos.lasik.os?.c,
        sourceAutos.external.os?.c
      ),
      aOS: firstValue(
        sourceAutos.consultant.os?.axis,
        sourceAutos.specialist.os?.axis,
        sourceAutos.lasik.os?.axis,
        sourceAutos.external.os?.axis
      ),
    };
    setForm(next);
  }, [patientId, sourceAutos]);

  const mergeAndSerialize = (content: string | null | undefined, sheetType: "consultant" | "specialist" | "lasik" | "external") => {
    const parsed = (() => {
      if (!content) return {} as any;
      try {
        return JSON.parse(content) as any;
      } catch {
        return {} as any;
      }
    })();
    const next = {
      ...parsed,
      examData: {
        ...(parsed.examData ?? {}),
        autorefraction: {
          ...(parsed.examData?.autorefraction ?? {}),
          od: {
            ...(parsed.examData?.autorefraction?.od ?? {}),
            bcva: form.bcvaOD,
            pd: form.pdOD,
            s: form.sOD,
            c: form.cOD,
            axis: form.aOD,
          },
          os: {
            ...(parsed.examData?.autorefraction?.os ?? {}),
            bcva: form.bcvaOS,
            pd: form.pdOS,
            s: form.sOS,
            c: form.cOS,
            axis: form.aOS,
          },
        },
      },
    } as any;

    if (sheetType === "consultant" || sheetType === "specialist") {
      next.formData = {
        ...(parsed.formData ?? {}),
        bcvaOD: form.bcvaOD,
        bcvaOS: form.bcvaOS,
        pdOD: form.pdOD,
        pdOS: form.pdOS,
        refractionOD: {
          ...(parsed.formData?.refractionOD ?? {}),
          s: form.sOD,
          c: form.cOD,
          a: form.aOD,
        },
        refractionOS: {
          ...(parsed.formData?.refractionOS ?? {}),
          s: form.sOS,
          c: form.cOS,
          a: form.aOS,
        },
      };
    }

    return JSON.stringify(next);
  };

  const handleSave = async () => {
    if (!patientId) return;
    try {
      await Promise.all([
        saveSheetMutation.mutateAsync({
          patientId,
          sheetType: "consultant",
          content: mergeAndSerialize(consultantQuery.data, "consultant"),
        }),
        saveSheetMutation.mutateAsync({
          patientId,
          sheetType: "specialist",
          content: mergeAndSerialize(specialistQuery.data, "specialist"),
        }),
        saveSheetMutation.mutateAsync({
          patientId,
          sheetType: "lasik",
          content: mergeAndSerialize(lasikQuery.data, "lasik"),
        }),
        saveSheetMutation.mutateAsync({
          patientId,
          sheetType: "external",
          content: mergeAndSerialize(externalQuery.data, "external"),
        }),
      ]);
      toast.success("Refraction saved for all sheets");
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to save refraction"));
    }
  };

  const handlePrint = () => {
    if (typeof window === "undefined") return;
    window.print();
  };

  const todayLabel = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (autoPrintDoneRef.current) return;
    if (typeof window === "undefined") return;
    const autoPrint = new URLSearchParams(window.location.search).get("autoprint");
    if (autoPrint !== "1") return;
    autoPrintDoneRef.current = true;
    const timer = window.setTimeout(() => window.print(), 150);
    return () => window.clearTimeout(timer);
  }, [patientId]);

  return (
    <div className="container mx-auto px-4 py-6">
      <style>{`
        @media print {
          @page {
            size: auto;
            margin: 0;
          }
          html, body {
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .container {
            max-width: none !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .refraction-no-print { display: none !important; }
          .refraction-page-card {
            visibility: hidden !important;
            border: 0 !important;
            box-shadow: none !important;
            background: transparent !important;
          }
          .refraction-page-content {
            padding: 0 !important;
            margin: 0 !important;
          }
          .refraction-print-wrapper {
            position: fixed !important;
            inset: 0 !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            visibility: visible !important;
          }
          .refraction-print-card {
            break-inside: avoid;
            page-break-inside: avoid;
            width: 180mm !important;
            max-width: 180mm !important;
            margin: 0 auto !important;
          }
          .refraction-print-card,
          .refraction-print-card * {
            text-align: center !important;
          }
        }
      `}</style>
      <Card className="refraction-page-card">
        <CardHeader className="refraction-no-print">
          <CardTitle>
            Refraction
            {patientQuery.data ? ` - ${String((patientQuery.data as any).fullName ?? "")}` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 refraction-page-content">
          {!Number.isFinite(patientId) || patientId <= 0 ? (
            <div className="space-y-3 refraction-no-print">
              <div className="text-sm text-muted-foreground">Choose patient first</div>
              <PatientPicker
                onSelect={(p) => {
                  const id = Number((p as any)?.id ?? 0);
                  if (!id) return;
                  setLocation(`/refraction/${id}`);
                }}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 refraction-no-print" dir="ltr">
            <div className="font-semibold">OD</div>
            <div className="font-semibold">OS</div>
            <Input placeholder="BCVA" value={form.bcvaOD} onChange={(e) => setForm((p) => ({ ...p, bcvaOD: e.target.value }))} />
            <Input placeholder="BCVA" value={form.bcvaOS} onChange={(e) => setForm((p) => ({ ...p, bcvaOS: e.target.value }))} />
            <Input placeholder="S" value={form.sOD} onChange={(e) => setForm((p) => ({ ...p, sOD: e.target.value }))} />
            <Input placeholder="S" value={form.sOS} onChange={(e) => setForm((p) => ({ ...p, sOS: e.target.value }))} />
            <Input placeholder="C" value={form.cOD} onChange={(e) => setForm((p) => ({ ...p, cOD: e.target.value }))} />
            <Input placeholder="C" value={form.cOS} onChange={(e) => setForm((p) => ({ ...p, cOS: e.target.value }))} />
            <Input placeholder="A" value={form.aOD} onChange={(e) => setForm((p) => ({ ...p, aOD: e.target.value }))} />
            <Input placeholder="A" value={form.aOS} onChange={(e) => setForm((p) => ({ ...p, aOS: e.target.value }))} />
            <Input placeholder="P.D." value={form.pdOD} onChange={(e) => setForm((p) => ({ ...p, pdOD: e.target.value }))} />
            <Input placeholder="P.D." value={form.pdOS} onChange={(e) => setForm((p) => ({ ...p, pdOS: e.target.value }))} />
          </div>

          <div className="flex gap-2 refraction-no-print">
            <Button type="button" onClick={handleSave} disabled={saveSheetMutation.isPending}>
              Save
            </Button>
            <Button type="button" variant="outline" onClick={handlePrint}>
              Print
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => goBack()}
            >
              Back
            </Button>
          </div>

          <div className="refraction-print-wrapper">
            <div
              className="refraction-print-card w-full bg-white text-black"
              dir="ltr"
              style={{ border: "2px solid #2ea3f2", borderTop: "0", borderRadius: 14, padding: 12, textAlign: "center" }}
            >
            <div className="grid grid-cols-2 gap-3 mb-3 text-sm font-semibold text-center">
              <div>Name : {String((patientQuery.data as any)?.fullName ?? "........................")}</div>
              <div>V.A : ........................</div>
              <div>Colour : ........................</div>
              <div>Date : {todayLabel}</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-center text-white font-bold py-1" style={{ background: "#2ea3f2", borderRadius: "8px 8px 0 0" }}>
                  RIGHT
                </div>
                <table className="w-full border-collapse text-center text-sm">
                  <thead>
                    <tr>
                      <th style={{ border: "2px solid #2ea3f2", padding: 6 }}></th>
                      <th style={{ border: "2px solid #2ea3f2", padding: 6 }}>S</th>
                      <th style={{ border: "2px solid #2ea3f2", padding: 6 }}>C</th>
                      <th style={{ border: "2px solid #2ea3f2", padding: 6 }}>A</th>
                      <th style={{ border: "2px solid #2ea3f2", padding: 6 }}>P.D.</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ height: 58 }}>
                      <td style={{ border: "2px solid #2ea3f2", fontWeight: 700 }}>DIST</td>
                      <td style={{ border: "2px solid #2ea3f2" }}>{form.sOD}</td>
                      <td style={{ border: "2px solid #2ea3f2" }}>{form.cOD}</td>
                      <td style={{ border: "2px solid #2ea3f2" }}>{form.aOD}</td>
                      <td style={{ border: "2px solid #2ea3f2" }}>{form.pdOD}</td>
                    </tr>
                    <tr style={{ height: 58 }}>
                      <td style={{ border: "2px solid #2ea3f2", fontWeight: 700 }}>NEAR</td>
                      <td style={{ border: "2px solid #2ea3f2" }}></td>
                      <td style={{ border: "2px solid #2ea3f2" }}></td>
                      <td style={{ border: "2px solid #2ea3f2" }}></td>
                      <td style={{ border: "2px solid #2ea3f2" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div>
                <div className="text-center text-white font-bold py-1" style={{ background: "#2ea3f2", borderRadius: "8px 8px 0 0" }}>
                  LEFT
                </div>
                <table className="w-full border-collapse text-center text-sm">
                  <thead>
                    <tr>
                      <th style={{ border: "2px solid #2ea3f2", padding: 6 }}></th>
                      <th style={{ border: "2px solid #2ea3f2", padding: 6 }}>S</th>
                      <th style={{ border: "2px solid #2ea3f2", padding: 6 }}>C</th>
                      <th style={{ border: "2px solid #2ea3f2", padding: 6 }}>A</th>
                      <th style={{ border: "2px solid #2ea3f2", padding: 6 }}>P.D.</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ height: 58 }}>
                      <td style={{ border: "2px solid #2ea3f2", fontWeight: 700 }}>DIST</td>
                      <td style={{ border: "2px solid #2ea3f2" }}>{form.sOS}</td>
                      <td style={{ border: "2px solid #2ea3f2" }}>{form.cOS}</td>
                      <td style={{ border: "2px solid #2ea3f2" }}>{form.aOS}</td>
                      <td style={{ border: "2px solid #2ea3f2" }}>{form.pdOS}</td>
                    </tr>
                    <tr style={{ height: 58 }}>
                      <td style={{ border: "2px solid #2ea3f2", fontWeight: 700 }}>NEAR</td>
                      <td style={{ border: "2px solid #2ea3f2" }}></td>
                      <td style={{ border: "2px solid #2ea3f2" }}></td>
                      <td style={{ border: "2px solid #2ea3f2" }}></td>
                      <td style={{ border: "2px solid #2ea3f2" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
