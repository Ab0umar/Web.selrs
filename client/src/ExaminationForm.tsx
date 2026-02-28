import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { getTrpcErrorMessage } from "@/lib/utils";
import PatientPicker from "@/components/PatientPicker";
import { trpc } from "@/lib/trpc";
import { formatDateLabel } from "@/lib/utils";
import PageHeader from "@/components/PageHeader";

interface DoctorOption {
  id: string;
  username?: string;
  name: string;
  code: string;
  isActive?: boolean;
  locationType?: "center" | "external";
}

export default function ExaminationForm() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [, routeParams] = useRoute("/examination/:id");
  const formRef = useRef<HTMLFormElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [receptionSignature, setReceptionSignature] = useState("");
  const [nurseSignature, setNurseSignature] = useState("");
  const [technicianSignature, setTechnicianSignature] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [sheetSelection, setSheetSelection] = useState("");
  const [isFollowup, setIsFollowup] = useState(false);
  const [patientInfo, setPatientInfo] = useState({
    id: 0,
    name: "",
    code: "",
  });
  const [patientDetails, setPatientDetails] = useState({
    dateOfBirth: "",
    age: "",
    address: "",
    phone: "",
    job: "",
  });
  const [locationType, setLocationType] = useState<"center" | "external">("center");
  const lastAgeSyncRef = useRef<"dob" | "age" | null>(null);
  const [medicalChecklist, setMedicalChecklist] = useState({
    generalDiseases: false,
    pregnancyOrLactation: false,
    usesAllergySupplementsSteroidsOrPressureMeds: false,
    acneTreatment: false,
    familyKeratoconus: false,
    usesTearSubstituteOrExcessTearsOrSandySensation: false,
    symptomsWorseWithAirOrAC: false,
    glaucomaTreatment: false,
  });
  const patientStateQuery = trpc.medical.getPatientPageState.useQuery(
    { patientId: patientInfo.id ?? 0, page: "examination" },
    { enabled: Boolean(patientInfo.id), refetchOnWindowFocus: false }
  );
  const doctorsQuery = trpc.medical.getDoctorDirectory.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const savePatientStateMutation = trpc.medical.savePatientPageState.useMutation();
  const patientStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [examData, setExamData] = useState({
    autorefraction: {
      od: { s: "", c: "", axis: "", ucva: "", bcva: "", iop: "" },
      os: { s: "", c: "", axis: "", ucva: "", bcva: "", iop: "" },
    },
    pentacam: {
      od: { k1: "", k2: "", ax1: "", ax2: "", thinnest: "", apex: "", residual: "", ttt: "", ablation: "" },
      os: { k1: "", k2: "", ax1: "", ax2: "", thinnest: "", apex: "", residual: "", ttt: "", ablation: "" },
    },
  });
  const saveExamMutation = trpc.medical.saveExaminationForm.useMutation();
  const updatePatientMutation = trpc.medical.updatePatient.useMutation({
    onError: (error: unknown) => {
      toast.error(getTrpcErrorMessage(error, "فشل حفظ بيانات المريض"));
    },
  });
  const createPatientFromExamMutation = trpc.medical.createPatientFromExamination.useMutation({
    onError: (error: unknown) => {
      toast.error(getTrpcErrorMessage(error, "فشل إنشاء مريض جديد"));
    },
  });
  const saveSheetMutation = trpc.medical.saveSheetEntry.useMutation();
  const utils = trpc.useUtils();
  const lastSyncedRef = useRef<Record<string, string>>({});
  const hasPatient = Boolean(patientInfo.id);
  const normalizedRole = String((user as any)?.role ?? "").toLowerCase();
  const canEditPatientData = normalizedRole === "admin";
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const currentUserDisplayName = String((user as any)?.name ?? (user as any)?.username ?? "").trim();

  useEffect(() => {
    const routeId = Number((routeParams as any)?.id ?? 0);
    if (!Number.isFinite(routeId) || routeId <= 0) return;
    setPatientInfo((prev) => (prev.id === routeId ? prev : { ...prev, id: routeId }));
  }, [routeParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setIsMobileViewport(mq.matches);
    apply();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
    mq.addListener(apply);
    return () => mq.removeListener(apply);
  }, []);

  useEffect(() => {
    if (!currentUserDisplayName) return;
    const role = String((user as any)?.role ?? "").toLowerCase();
    if (role === "reception") {
      setReceptionSignature((prev) => prev || currentUserDisplayName);
      return;
    }
    if (role === "nurse") {
      setNurseSignature((prev) => prev || currentUserDisplayName);
      return;
    }
    if (role === "technician") {
      setTechnicianSignature((prev) => prev || currentUserDisplayName);
      return;
    }
    if (role === "doctor") {
      setDoctorName((prev) => prev || currentUserDisplayName);
    }
  }, [currentUserDisplayName, (user as any)?.role]);

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  if (!isAuthenticated) return null;
  const doctors = (doctorsQuery.data ?? []) as DoctorOption[];
  const availableDoctors = useMemo(
    () =>
      doctors.filter(
        (doctor) =>
          doctor.isActive !== false &&
          (doctor.locationType ? doctor.locationType === locationType : locationType === "center")
      ),
    [doctors, locationType]
  );
  const doctorLookup = useMemo(() => {
    const map = new Map<string, string>();
    availableDoctors.forEach((doctor) => {
      const name = (doctor.name || "").trim();
      const username = (doctor.username || "").trim();
      const code = (doctor.code || "").trim();
      if (doctor.isActive === false) return;
      if (name) map.set(name.toLowerCase(), name);
      if (username) map.set(username.toLowerCase(), name || username);
      if (code) map.set(code.toLowerCase(), name || code);
    });
    return map;
  }, [availableDoctors]);

  const normalizeDoctorInput = (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return "";
    return doctorLookup.get(normalized) ?? value.trim();
  };
  const digitsOnly = (value: string) => value.replace(/\D+/g, "");
  const handleSelectPatient = (patient: {
    id: number;
    fullName: string;
    patientCode?: string | null;
  }) => {
    setPatientInfo({
      id: patient.id,
      name: patient.fullName ?? "",
      code: patient.patientCode ?? "",
    });
    setExamData({
      autorefraction: {
        od: { s: "", c: "", axis: "", ucva: "", bcva: "", iop: "" },
        os: { s: "", c: "", axis: "", ucva: "", bcva: "", iop: "" },
      },
      pentacam: {
        od: { k1: "", k2: "", ax1: "", ax2: "", thinnest: "", apex: "", residual: "", ttt: "", ablation: "" },
        os: { k1: "", k2: "", ax1: "", ax2: "", thinnest: "", apex: "", residual: "", ttt: "", ablation: "" },
      },
    });
    lastSyncedRef.current = {};
  };

  const patientQuery = trpc.medical.getPatient.useQuery(
    { patientId: patientInfo.id },
    { enabled: Boolean(patientInfo.id), refetchOnWindowFocus: false }
  );
  const normalizeSheetType = (raw: unknown) => {
    const v = String(raw ?? "").toLowerCase();
    if (v.includes("consultant") || v.includes("استشاري")) return "consultant";
    if (v.includes("specialist") || v.includes("أخصائي") || v.includes("اخصائي")) return "specialist";
    if (v.includes("lasik") || v.includes("ليزك")) return "lasik";
    if (v.includes("external") || v.includes("خارج")) return "external";
    return "consultant";
  };
  useEffect(() => {
    if (!patientQuery.data) return;
    const data = patientQuery.data as any;
    setPatientInfo((prev) => ({
      ...prev,
      name: data.fullName ?? prev.name,
      code: data.patientCode ?? prev.code,
    }));
    setPatientDetails({
      dateOfBirth: data.dateOfBirth ? String(data.dateOfBirth).split("T")[0] : "",
      age: data.age != null ? String(data.age) : "",
      address: data.address ?? "",
      phone: data.phone ?? "",
      job: data.occupation ?? "",
    });
    if (data.locationType) {
      setLocationType(data.locationType === "external" ? "external" : "center");
    }
  }, [patientQuery.data]);

  useEffect(() => {
    if (!patientDetails.dateOfBirth) return;
    if (lastAgeSyncRef.current === "age") {
      lastAgeSyncRef.current = null;
      return;
    }
    const dob = new Date(patientDetails.dateOfBirth);
    if (Number.isNaN(dob.valueOf())) return;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age -= 1;
    }
    lastAgeSyncRef.current = "dob";
    setPatientDetails((prev) => ({
      ...prev,
      age: Number.isFinite(age) && age >= 0 ? String(age) : prev.age,
    }));
  }, [patientDetails.dateOfBirth]);

  useEffect(() => {
    if (!patientDetails.age) return;
    if (lastAgeSyncRef.current === "dob") {
      lastAgeSyncRef.current = null;
      return;
    }
    const ageNum = Number(patientDetails.age);
    if (!Number.isFinite(ageNum) || ageNum < 0) return;
    const today = new Date();
    const year = today.getFullYear() - ageNum;
    const month = today.getMonth();
    const day = today.getDate();
    const inferred = new Date(year, month, day);
    const yyyy = inferred.getFullYear();
    const mm = String(inferred.getMonth() + 1).padStart(2, "0");
    const dd = String(inferred.getDate()).padStart(2, "0");
    const formatted = `${yyyy}-${mm}-${dd}`;
    lastAgeSyncRef.current = "age";
    setPatientDetails((prev) => ({
      ...prev,
      dateOfBirth: prev.dateOfBirth || formatted,
    }));
  }, [patientDetails.age]);

  useEffect(() => {
    if (!patientInfo.id) return;
    const raw = localStorage.getItem(`patient_state_examination_${patientInfo.id}`);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (data.sheetSelection) setSheetSelection(data.sheetSelection);
      if (data.visitDate) setVisitDate(data.visitDate);
      if (data.doctorName !== undefined) setDoctorName(data.doctorName ?? "");
      if (data.medicalChecklist) {
        setMedicalChecklist((prev) => ({ ...prev, ...data.medicalChecklist }));
      }
      if (typeof data.isFollowup === "boolean") {
        setIsFollowup(data.isFollowup);
      }
    } catch {
      // ignore bad cache
    }
  }, [patientInfo.id]);

  useEffect(() => {
    const data = (patientStateQuery.data as any)?.data;
    if (!data) return;
    if (data.sheetSelection) setSheetSelection(data.sheetSelection);
    if (data.visitDate) setVisitDate(data.visitDate);
    if (data.doctorName !== undefined) setDoctorName(data.doctorName ?? "");
    if (data.medicalChecklist) {
      setMedicalChecklist((prev) => ({ ...prev, ...data.medicalChecklist }));
    }
    if (typeof data.isFollowup === "boolean") {
      setIsFollowup(data.isFollowup);
    }
  }, [patientStateQuery.data]);

  useEffect(() => {
    if (!patientInfo.id) return;
    if (patientStateTimerRef.current) clearTimeout(patientStateTimerRef.current);
    const payload = {
      sheetSelection,
      visitDate,
      doctorName,
      medicalChecklist,
      isFollowup,
    };
    localStorage.setItem(`patient_state_examination_${patientInfo.id}`, JSON.stringify(payload));
    patientStateTimerRef.current = setTimeout(() => {
      savePatientStateMutation.mutate({ patientId: patientInfo.id, page: "examination", data: payload });
    }, 800);
    return () => {
      if (patientStateTimerRef.current) clearTimeout(patientStateTimerRef.current);
    };
  }, [patientInfo.id, sheetSelection, visitDate, doctorName, medicalChecklist, isFollowup, savePatientStateMutation]);

  const currentSheetType = normalizeSheetType((patientQuery.data as any)?.serviceType);
  const sheetQuery = trpc.medical.getSheetEntry.useQuery(
    { patientId: patientInfo.id, sheetType: currentSheetType },
    { enabled: hasPatient, refetchOnWindowFocus: false }
  );

  useEffect(() => {
    if (!patientQuery.data) return;
    const patient = patientQuery.data as any;
    setPatientDetails({
      dateOfBirth: patient.dateOfBirth ? String(patient.dateOfBirth).split("T")[0] : "",
      age: patient.age != null ? String(patient.age) : "",
      address: patient.address ?? "",
      phone: patient.phone ?? "",
      job: patient.occupation ?? "",
    });
  }, [patientQuery.data]);

  useEffect(() => {
    if (!sheetQuery.data) return;
    try {
      const parsed = JSON.parse(sheetQuery.data);
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
        setReceptionSignature((prev) => prev || parsed.signatures.reception || "");
        setNurseSignature((prev) => prev || parsed.signatures.nurse || "");
        setTechnicianSignature((prev) => prev || parsed.signatures.technician || "");
        setDoctorName((prev) => prev || parsed.signatures.doctor || "");
      }
    } catch {
      // ignore malformed data
    }
  }, [sheetQuery.data]);

  useEffect(() => {
    if (!patientInfo.id) return;
    const serialized = JSON.stringify({
      patient: {
        name: patientInfo.name,
        code: patientInfo.code,
        dateOfBirth: patientDetails.dateOfBirth,
        age: patientDetails.age,
        address: patientDetails.address,
        phone: patientDetails.phone,
        job: patientDetails.job,
      },
      medicalChecklist,
      examData,
      signatures: {
        reception: receptionSignature,
        nurse: nurseSignature,
        technician: technicianSignature,
        doctor: doctorName,
      },
    });
    const sheetTypes: Array<"consultant" | "specialist" | "lasik" | "external"> = [
      "consultant",
      "specialist",
      "lasik",
      "external",
    ];

    const timeout = setTimeout(async () => {
      try {
        const pickValue = (next: string | undefined, prev?: string) =>
          next && String(next).trim() ? next : prev;
        await Promise.all(
          sheetTypes.map(async (sheetType) => {
            if (lastSyncedRef.current[sheetType] === serialized) return;
            const existingRaw = await utils.medical.getSheetEntry.fetch({
              patientId: patientInfo.id,
              sheetType,
            });
            let existing: any = {};
            try {
              existing = existingRaw ? JSON.parse(existingRaw) : {};
            } catch {
              existing = {};
            }

            const updated = {
              ...existing,
              patient: {
                name: patientInfo.name,
                code: patientInfo.code,
                dateOfBirth: patientDetails.dateOfBirth,
                age: patientDetails.age,
                address: patientDetails.address,
                phone: patientDetails.phone,
                job: patientDetails.job,
              },
              medicalChecklist,
              examData: {
                autorefraction: {
                  od: {
                    ...(existing.examData?.autorefraction?.od ?? {}),
                    s: pickValue(examData.autorefraction.od.s, existing.examData?.autorefraction?.od?.s),
                    c: pickValue(examData.autorefraction.od.c, existing.examData?.autorefraction?.od?.c),
                    axis: pickValue(examData.autorefraction.od.axis, existing.examData?.autorefraction?.od?.axis),
                    ucva: pickValue(examData.autorefraction.od.ucva, existing.examData?.autorefraction?.od?.ucva),
                    bcva: pickValue(examData.autorefraction.od.bcva, existing.examData?.autorefraction?.od?.bcva),
                    iop: pickValue(examData.autorefraction.od.iop, existing.examData?.autorefraction?.od?.iop),
                  },
                  os: {
                    ...(existing.examData?.autorefraction?.os ?? {}),
                    s: pickValue(examData.autorefraction.os.s, existing.examData?.autorefraction?.os?.s),
                    c: pickValue(examData.autorefraction.os.c, existing.examData?.autorefraction?.os?.c),
                    axis: pickValue(examData.autorefraction.os.axis, existing.examData?.autorefraction?.os?.axis),
                    ucva: pickValue(examData.autorefraction.os.ucva, existing.examData?.autorefraction?.os?.ucva),
                    bcva: pickValue(examData.autorefraction.os.bcva, existing.examData?.autorefraction?.os?.bcva),
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
              },
              signatures: {
                reception: receptionSignature,
                nurse: nurseSignature,
                technician: technicianSignature,
                doctor: doctorName,
              },
            };

            await saveSheetMutation.mutateAsync({
              patientId: patientInfo.id,
              sheetType,
              content: JSON.stringify(updated),
            });
            lastSyncedRef.current[sheetType] = serialized;
          })
        );
      } catch {
        // ignore sync errors
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [
    examData,
    patientInfo.id,
    patientInfo.name,
    patientInfo.code,
    patientDetails.dateOfBirth,
    patientDetails.age,
    patientDetails.address,
    patientDetails.phone,
    patientDetails.job,
    medicalChecklist,
    receptionSignature,
    nurseSignature,
    technicianSignature,
    doctorName,
    saveSheetMutation,
    utils.medical,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasAutoInput = Object.values(examData.autorefraction.od).some((v) => String(v || "").trim()) ||
      Object.values(examData.autorefraction.os).some((v) => String(v || "").trim());
    const hasPentacamInput = Object.values(examData.pentacam.od).some((v) => String(v || "").trim()) ||
      Object.values(examData.pentacam.os).some((v) => String(v || "").trim());

    if (!receptionSignature.trim()) {
      toast.error("يرجى إدخال توقيع الاستقبال");
      return;
    }
    if (hasAutoInput && !nurseSignature.trim()) {
      toast.error("يرجى إدخال توقيع التمريض");
      return;
    }
    if (hasPentacamInput && !technicianSignature.trim()) {
      toast.error("يرجى إدخال توقيع الفني");
      return;
    }
    setLoading(true);
    try {
      let effectivePatientId = patientInfo.id;
      if (!effectivePatientId) {
        if (!canEditPatientData) {
          toast.error("Please search and select an existing patient.");
          return;
        }
        if (!patientInfo.name.trim()) {
          toast.error("يرجى إدخال اسم المريض");
          return;
        }
        const created = await createPatientFromExamMutation.mutateAsync({
          patientCode: patientInfo.code || undefined,
          fullName: patientInfo.name.trim(),
          dateOfBirth: patientDetails.dateOfBirth || undefined,
          age: patientDetails.age ? Number(patientDetails.age) : undefined,
          phone: patientDetails.phone || undefined,
          address: patientDetails.address || undefined,
          occupation: patientDetails.job || undefined,
          serviceType: (sheetSelection as any) || "consultant",
          locationType,
        });
        effectivePatientId = created.id;
        setPatientInfo((prev) => ({
          ...prev,
          id: effectivePatientId,
          code: created.patientCode || prev.code,
        }));
      } else if (canEditPatientData) {
        await updatePatientMutation.mutateAsync({
          patientId: effectivePatientId,
          updates: {
            fullName: patientInfo.name,
            patientCode: patientInfo.code,
            dateOfBirth: patientDetails.dateOfBirth || null,
            age: patientDetails.age ? Number(patientDetails.age) : null,
            address: patientDetails.address,
            phone: patientDetails.phone,
            occupation: patientDetails.job,
            serviceType: sheetSelection || undefined,
            locationType,
            status: isFollowup ? "followup" : undefined,
          },
        });
      }
      const form = formRef.current;
      const formData = form ? new FormData(form) : new FormData();
      const payload: Record<string, string> = {};
      formData.forEach((value, key) => {
        payload[key] = String(value);
      });
      payload["medical-general-diseases"] = medicalChecklist.generalDiseases ? "yes" : "";
      payload["medical-pregnancy-lactation"] = medicalChecklist.pregnancyOrLactation ? "yes" : "";
      payload["medical-allergy-supplements-steroids-pressure"] = medicalChecklist.usesAllergySupplementsSteroidsOrPressureMeds ? "yes" : "";
      payload["medical-acne-treatment"] = medicalChecklist.acneTreatment ? "yes" : "";
      payload["medical-family-keratoconus"] = medicalChecklist.familyKeratoconus ? "yes" : "";
      payload["medical-tear-substitute-excess-tears-sandy"] = medicalChecklist.usesTearSubstituteOrExcessTearsOrSandySensation ? "yes" : "";
      payload["medical-symptoms-air-ac"] = medicalChecklist.symptomsWorseWithAirOrAC ? "yes" : "";
      payload["medical-glaucoma-treatment"] = medicalChecklist.glaucomaTreatment ? "yes" : "";

      await saveExamMutation.mutateAsync({
        patientId: effectivePatientId,
        visitDate: payload["visit-date"] || new Date().toISOString().split("T")[0],
        visitType: payload["visit-type"] || "فحص عام",
        data: payload,
      });
      toast.success("تم حفظ البيانات بنجاح");
      if (sheetSelection) {
        const target = isFollowup ? "consultant" : sheetSelection;
        const suffix = isFollowup ? "?tab=followup" : "";
        setLocation(`/sheets/${target}/${effectivePatientId}${suffix}`);
      } else {
        setLocation("/patients");
      }
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "حدث خطأ أثناء حفظ البيانات"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <PageHeader backTo="/dashboard" />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <form ref={formRef} onSubmit={handleSubmit} dir="rtl">
          <Tabs defaultValue="patient-info" className="w-full">
            <TabsList className="flex w-full flex-wrap gap-2 h-auto">
              <TabsTrigger value="pentacam" className="flex-1 min-w-[120px] whitespace-normal text-center">
                البنتاكام
              </TabsTrigger>
              <TabsTrigger value="auto-air" className="flex-1 min-w-[180px] whitespace-normal text-center">
                الأوتوريفراكشن / الإيرباف
              </TabsTrigger>
              <TabsTrigger value="patient-info" className="flex-1 min-w-[120px] whitespace-normal text-center">
                بيانات المريض
              </TabsTrigger>
            </TabsList>

            {/* Patient Info Tab */}
            <TabsContent value="patient-info">
              <Card>
                {/* no header */}
                <CardContent>
                  <div className="mb-4 flex justify-end">
                    <PatientPicker onSelect={handleSelectPatient} />
                  </div>
                  <div className="space-y-3 text-xs" dir="rtl" style={{ textAlign: "center" }}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
                      <div className="flex items-center gap-2 min-w-0">
                        <Label htmlFor="patient-name" className="font-bold">الاسم</Label>
                        <Input
                          name="patient-name"
                          id="patient-name"
                          value={patientInfo.name}
                          onChange={(e) =>
                            setPatientInfo((prev) => ({ ...prev, name: e.target.value }))
                          }
                          readOnly={!canEditPatientData}
                          className="text-xs border-0 flex-1 min-w-0"
                          style={{ textAlign: "right" }}
                        />
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <Label htmlFor="patient-dob" className="font-bold">تاريخ الميلاد</Label>
                        <Input
                          name="patient-dob"
                          id="patient-dob"
                          type="date"
                          value={patientDetails.dateOfBirth}
                          onChange={(e) =>
                            setPatientDetails((prev) => ({ ...prev, dateOfBirth: e.target.value }))
                          }
                          readOnly={!canEditPatientData}
                          disabled={!canEditPatientData}
                          className="text-xs border-0 flex-1 min-w-0"
                          style={{ textAlign: "right" }}
                        />
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <Label htmlFor="patient-age" className="font-bold">السن</Label>
                        <Input
                          name="patient-age"
                          id="patient-age"
                          value={patientDetails.age}
                          onChange={(e) =>
                            setPatientDetails((prev) => ({ ...prev, age: digitsOnly(e.target.value) }))
                          }
                          readOnly={!canEditPatientData}
                          className="text-xs border-0 flex-1 min-w-0"
                          style={{ textAlign: "right" }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
                      <div className="flex items-center gap-2 min-w-0">
                        <Label htmlFor="patient-address" className="font-bold">العنوان</Label>
                        <Input
                          name="patient-address"
                          id="patient-address"
                          value={patientDetails.address}
                          onChange={(e) =>
                            setPatientDetails((prev) => ({ ...prev, address: e.target.value }))
                          }
                          readOnly={!canEditPatientData}
                          className="text-xs border-0 flex-1 min-w-0"
                          style={{ textAlign: "right" }}
                        />
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <Label htmlFor="patient-phone" className="font-bold">الموبايل</Label>
                        <Input
                          name="patient-phone"
                          id="patient-phone"
                          value={patientDetails.phone}
                          onChange={(e) =>
                            setPatientDetails((prev) => ({ ...prev, phone: digitsOnly(e.target.value) }))
                          }
                          readOnly={!canEditPatientData}
                          className="text-xs border-0 flex-1 min-w-0"
                          style={{ textAlign: "right" }}
                        />
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <Label htmlFor="patient-code" className="font-bold">كود العميل</Label>
                        <Input
                          name="patient-code"
                          id="patient-code"
                          value={patientInfo.code}
                          readOnly
                          disabled
                          className="text-xs border-0 flex-1 min-w-0"
                          style={{ textAlign: "right" }}
                        />
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <Label htmlFor="patient-job" className="font-bold">الوظيفة</Label>
                        <Input
                          name="patient-job"
                          id="patient-job"
                          placeholder=""
                          value={patientDetails.job}
                          onChange={(e) =>
                            setPatientDetails((prev) => ({ ...prev, job: e.target.value }))
                          }
                          readOnly={!canEditPatientData}
                          className="text-xs border-0 flex-1 min-w-0"
                          style={{ textAlign: "right" }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-sm">الطبيب</span>
                        <Input
                          id="doctor-name"
                          name="doctor-name"
                          value={doctorName}
                          onChange={(e) => setDoctorName(e.target.value)}
                          onBlur={() => setDoctorName((prev) => normalizeDoctorInput(prev))}
                          list="doctors-by-code-or-name"
                          className="text-xs border-0 w-full sm:w-40 min-w-0"
                          style={{ textAlign: "right" }}
                        />
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <Label htmlFor="visit-date" className="font-bold">تاريخ الكشف</Label>
                        <div className="flex items-center gap-3 w-full">
                          <Input
                            name="visit-date"
                            id="visit-date"
                            type="date"
                            value={visitDate}
                            onChange={(event) => setVisitDate(event.target.value)}
                            dir="ltr"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-4 flex-wrap w-full">
                    {[
                      { type: "external", label: "خارجي" },
                      { type: "lasik", label: "فحوصات الليزك" },
                      { type: "specialist", label: "اخصائي" },
                      { type: "consultant", label: "استشاري", isFirst: true },
                    ].map((sheet) => (
                      <label key={sheet.type} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={sheetSelection === sheet.type}
                          onCheckedChange={(checked) => {
                            if (!checked) return;
                            setSheetSelection(sheet.type);
                          }}
                        />
                        <span>{sheet.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-6 flex-wrap w-full">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={locationType === "center"}
                        disabled={!canEditPatientData}
                        onCheckedChange={(checked) => {
                          if (!checked) return;
                          setLocationType("center");
                        }}
                      />
                      <span>مركز</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={locationType === "external"}
                        disabled={!canEditPatientData}
                        onCheckedChange={(checked) => {
                          if (!checked) return;
                          setLocationType("external");
                        }}
                      />
                      <span>خارجي</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={isFollowup}
                        onCheckedChange={(checked) => setIsFollowup(Boolean(checked))}
                      />
                      <span>متابعة</span>
                    </label>
                  </div>
                  
                  <div className="mt-6">
                    <div className="space-y-1 pr-6 flex flex-col items-end w-full">
                      <Label htmlFor="reception-signature" className="font-bold text-right">توقيع الاستقبال</Label>
                      <Input
                        id="reception-signature"
                        name="reception-signature"
                        value={receptionSignature}
                        onChange={(e) => setReceptionSignature(e.target.value)}
                        className="text-right w-full max-w-sm ms-auto"
                      />
                    </div>
                </div>

                <datalist id="doctors-by-code-or-name">
                  {availableDoctors.map((doctor) => (
                    <option key={`doc-name-${doctor.id}`} value={doctor.name}>
                      {doctor.code}
                    </option>
                  ))}
                  {availableDoctors.map((doctor) => (
                    <option key={`doc-code-${doctor.id}`} value={doctor.code}>
                      {doctor.name}
                    </option>
                  ))}
                  {availableDoctors.filter((d) => d.username).map((doctor) => (
                    <option key={`doc-username-${doctor.id}`} value={doctor.username || ""}>
                      {doctor.name}
                    </option>
                  ))}
                </datalist>
              </CardContent>
            </Card>
            {sheetSelection === "lasik" && (
            <Card className="mt-4" dir="rtl">
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 border-b pb-1" dir="rtl">
                      <span className="text-right flex-1">هل سمعت عن مرض القرنية المخروطية في أحد أفراد العائلة؟</span>
                      <Checkbox
                        checked={medicalChecklist.familyKeratoconus}
                        onCheckedChange={(checked) =>
                          setMedicalChecklist((prev) => ({ ...prev, familyKeratoconus: Boolean(checked) }))
                        }
                        className="border-2 border-gray-700"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 border-b pb-1" dir="rtl">
                      <span className="text-right flex-1">هل تستخدم بديل دموع / زيادة في إفراز الدموع / إحساس بالرمل؟</span>
                      <Checkbox
                        checked={medicalChecklist.usesTearSubstituteOrExcessTearsOrSandySensation}
                        onCheckedChange={(checked) =>
                          setMedicalChecklist((prev) => ({ ...prev, usesTearSubstituteOrExcessTearsOrSandySensation: Boolean(checked) }))
                        }
                        className="border-2 border-gray-700"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 border-b pb-1" dir="rtl">
                      <span className="text-right flex-1">هل تزيد هذه الأعراض عند وجود هواء أو تكييف؟</span>
                      <Checkbox
                        checked={medicalChecklist.symptomsWorseWithAirOrAC}
                        onCheckedChange={(checked) =>
                          setMedicalChecklist((prev) => ({ ...prev, symptomsWorseWithAirOrAC: Boolean(checked) }))
                        }
                        className="border-2 border-gray-700"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2" dir="rtl">
                      <span className="text-right flex-1">هل تعالج من ماء زرقاء؟</span>
                      <Checkbox
                        checked={medicalChecklist.glaucomaTreatment}
                        onCheckedChange={(checked) =>
                          setMedicalChecklist((prev) => ({ ...prev, glaucomaTreatment: Boolean(checked) }))
                        }
                        className="border-2 border-gray-700"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 border-b pb-1" dir="rtl">
                      <span className="text-right flex-1">أمراض عامة؟ (ضغط / سكر / غدة)</span>
                      <Checkbox
                        checked={medicalChecklist.generalDiseases}
                        onCheckedChange={(checked) =>
                          setMedicalChecklist((prev) => ({ ...prev, generalDiseases: Boolean(checked) }))
                        }
                        className="border-2 border-gray-700"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 border-b pb-1" dir="rtl">
                      <span className="text-right flex-1">حمل أو رضاعة؟</span>
                      <Checkbox
                        checked={medicalChecklist.pregnancyOrLactation}
                        onCheckedChange={(checked) =>
                          setMedicalChecklist((prev) => ({ ...prev, pregnancyOrLactation: Boolean(checked) }))
                        }
                        className="border-2 border-gray-700"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 border-b pb-1" dir="rtl">
                      <span className="text-right flex-1">هل تستخدم مضادات حساسية أو مكملات غذائية/كورتيزون/أدوية ضغط؟</span>
                      <Checkbox
                        checked={medicalChecklist.usesAllergySupplementsSteroidsOrPressureMeds}
                        onCheckedChange={(checked) =>
                          setMedicalChecklist((prev) => ({ ...prev, usesAllergySupplementsSteroidsOrPressureMeds: Boolean(checked) }))
                        }
                        className="border-2 border-gray-700"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2" dir="rtl">
                      <span className="text-right flex-1">هل تستخدم علاج لحب الشباب؟ (اسم العلاج)</span>
                      <Checkbox
                        checked={medicalChecklist.acneTreatment}
                        onCheckedChange={(checked) =>
                          setMedicalChecklist((prev) => ({ ...prev, acneTreatment: Boolean(checked) }))
                        }
                        className="border-2 border-gray-700"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            )}
            </TabsContent>

            {/* Autorefraction + Air Puff Tab */}
          <TabsContent value="auto-air" className="sheet-layout">
            {!hasPatient && (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  يرجى اختيار المريض أولاً لإدخال بيانات الأوتوريفراكشن.
                </CardContent>
              </Card>
            )}
            {hasPatient && (
            <div className="bg-white p-3 sm:p-4">
              {!isMobileViewport && (
                <div className="mb-2 text-[11px] text-muted-foreground text-right">اسحب الجدول يمين/يسار لعرض كل الأعمدة</div>
              )}
              {isMobileViewport && (
                <div className="space-y-3">
                  <Card className="border">
                    <CardHeader className="py-2">
                      <CardTitle className="text-sm text-center">OD</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-2 text-xs">
                      <Label htmlFor="od-ucva-m">UCVA</Label>
                      <Input id="od-ucva-m" value={examData.autorefraction.od.ucva} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, ucva: e.target.value } } }))} />
                      <Label htmlFor="od-bcva-m">BCVA</Label>
                      <Input id="od-bcva-m" value={examData.autorefraction.od.bcva} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, bcva: e.target.value } } }))} />
                      <Label htmlFor="od-s-m">S</Label>
                      <Input id="od-s-m" value={examData.autorefraction.od.s} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, s: e.target.value } } }))} />
                      <Label htmlFor="od-c-m">C</Label>
                      <Input id="od-c-m" value={examData.autorefraction.od.c} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, c: e.target.value } } }))} />
                      <Label htmlFor="od-axis-m">Axis</Label>
                      <Input id="od-axis-m" value={examData.autorefraction.od.axis} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, axis: e.target.value } } }))} />
                      <Label htmlFor="od-iop-m">IOP</Label>
                      <Input id="od-iop-m" value={examData.autorefraction.od.iop} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, iop: e.target.value } } }))} />
                    </CardContent>
                  </Card>
                  <Card className="border">
                    <CardHeader className="py-2">
                      <CardTitle className="text-sm text-center">OS</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-2 text-xs">
                      <Label htmlFor="os-ucva-m">UCVA</Label>
                      <Input id="os-ucva-m" value={examData.autorefraction.os.ucva} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, ucva: e.target.value } } }))} />
                      <Label htmlFor="os-bcva-m">BCVA</Label>
                      <Input id="os-bcva-m" value={examData.autorefraction.os.bcva} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, bcva: e.target.value } } }))} />
                      <Label htmlFor="os-s-m">S</Label>
                      <Input id="os-s-m" value={examData.autorefraction.os.s} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, s: e.target.value } } }))} />
                      <Label htmlFor="os-c-m">C</Label>
                      <Input id="os-c-m" value={examData.autorefraction.os.c} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, c: e.target.value } } }))} />
                      <Label htmlFor="os-axis-m">Axis</Label>
                      <Input id="os-axis-m" value={examData.autorefraction.os.axis} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, axis: e.target.value } } }))} />
                      <Label htmlFor="os-iop-m">IOP</Label>
                      <Input id="os-iop-m" value={examData.autorefraction.os.iop} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, iop: e.target.value } } }))} />
                    </CardContent>
                  </Card>
                </div>
              )}
              {!isMobileViewport && (
              <div className="sheet-layout">
                  <div className="overflow-x-auto">
                  <div className="border min-w-[680px] sm:min-w-0">
                    <table className="w-full text-center lasik-table exam-table" dir="ltr" style={{ direction: "ltr", unicodeBidi: "bidi-override" }}>
                      <thead>
                        <tr className="border-b bg-gray-100">
                          <th className="border-r p-1 text-center">Eye</th>
                          <th className="border-r p-1 text-center">UCVA</th>
                          <th className="border-r p-1 text-center">BCVA</th>
                          <th className="border-r p-1 text-center">S</th>
                          <th className="border-r p-1 text-center">C</th>
                          <th className="border-r p-1 text-center">Axis</th>
                          <th className="p-1 text-center">IOP</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="border-r p-1 font-bold text-center">OD</td>
                          <td className="border-r p-1">
                            <Input
                              name="od-ucva"
                              id="od-ucva"
                              placeholder=""
                              className="text-xs"
                              value={examData.autorefraction.od.ucva}
                              onChange={(e) =>
                                setExamData((prev) => ({
                                  ...prev,
                                  autorefraction: {
                                    ...prev.autorefraction,
                                    od: { ...prev.autorefraction.od, ucva: e.target.value },
                                  },
                                }))
                              }
                            />
                          </td>
                          <td className="border-r p-1">
                            <Input
                              name="od-bcva"
                              id="od-bcva"
                              placeholder=""
                              className="text-xs"
                              value={examData.autorefraction.od.bcva}
                              onChange={(e) =>
                                setExamData((prev) => ({
                                  ...prev,
                                  autorefraction: {
                                    ...prev.autorefraction,
                                    od: { ...prev.autorefraction.od, bcva: e.target.value },
                                  },
                                }))
                              }
                            />
                          </td>
                          <td className="border-r p-1">
                            <Input
                              name="od-sphere"
                              id="od-sphere"
                              placeholder=""
                              className="text-xs"
                              value={examData.autorefraction.od.s}
                              onChange={(e) =>
                                setExamData((prev) => ({
                                  ...prev,
                                  autorefraction: {
                                    ...prev.autorefraction,
                                    od: { ...prev.autorefraction.od, s: e.target.value },
                                  },
                                }))
                              }
                            />
                          </td>
                          <td className="border-r p-1">
                            <Input
                              name="od-cylinder"
                              id="od-cylinder"
                              placeholder=""
                              className="text-xs"
                              value={examData.autorefraction.od.c}
                              onChange={(e) =>
                                setExamData((prev) => ({
                                  ...prev,
                                  autorefraction: {
                                    ...prev.autorefraction,
                                    od: { ...prev.autorefraction.od, c: e.target.value },
                                  },
                                }))
                              }
                            />
                          </td>
                          <td className="border-r p-1">
                            <Input
                              name="od-axis"
                              id="od-axis"
                              placeholder=""
                              className="text-xs"
                              value={examData.autorefraction.od.axis}
                              onChange={(e) =>
                                setExamData((prev) => ({
                                  ...prev,
                                  autorefraction: {
                                    ...prev.autorefraction,
                                    od: { ...prev.autorefraction.od, axis: e.target.value },
                                  },
                                }))
                              }
                            />
                          </td>
                          <td className="p-1">
                            <Input
                              name="od-iop"
                              id="od-iop"
                              placeholder=""
                              className="text-xs"
                              value={examData.autorefraction.od.iop}
                              onChange={(e) =>
                                setExamData((prev) => ({
                                  ...prev,
                                  autorefraction: {
                                    ...prev.autorefraction,
                                    od: { ...prev.autorefraction.od, iop: e.target.value },
                                  },
                                }))
                              }
                            />
                          </td>
                        </tr>
                        <tr>
                          <td className="border-r p-1 font-bold text-center">OS</td>
                          <td className="border-r p-1">
                            <Input
                              name="os-ucva"
                              id="os-ucva"
                              placeholder=""
                              className="text-xs"
                              value={examData.autorefraction.os.ucva}
                              onChange={(e) =>
                                setExamData((prev) => ({
                                  ...prev,
                                  autorefraction: {
                                    ...prev.autorefraction,
                                    os: { ...prev.autorefraction.os, ucva: e.target.value },
                                  },
                                }))
                              }
                            />
                          </td>
                          <td className="border-r p-1">
                            <Input
                              name="os-bcva"
                              id="os-bcva"
                              placeholder=""
                              className="text-xs"
                              value={examData.autorefraction.os.bcva}
                              onChange={(e) =>
                                setExamData((prev) => ({
                                  ...prev,
                                  autorefraction: {
                                    ...prev.autorefraction,
                                    os: { ...prev.autorefraction.os, bcva: e.target.value },
                                  },
                                }))
                              }
                            />
                          </td>
                          <td className="border-r p-1">
                            <Input
                              name="os-sphere"
                              id="os-sphere"
                              placeholder=""
                              className="text-xs"
                              value={examData.autorefraction.os.s}
                              onChange={(e) =>
                                setExamData((prev) => ({
                                  ...prev,
                                  autorefraction: {
                                    ...prev.autorefraction,
                                    os: { ...prev.autorefraction.os, s: e.target.value },
                                  },
                                }))
                              }
                            />
                          </td>
                          <td className="border-r p-1">
                            <Input
                              name="os-cylinder"
                              id="os-cylinder"
                              placeholder=""
                              className="text-xs"
                              value={examData.autorefraction.os.c}
                              onChange={(e) =>
                                setExamData((prev) => ({
                                  ...prev,
                                  autorefraction: {
                                    ...prev.autorefraction,
                                    os: { ...prev.autorefraction.os, c: e.target.value },
                                  },
                                }))
                              }
                            />
                          </td>
                          <td className="border-r p-1">
                            <Input
                              name="os-axis"
                              id="os-axis"
                              placeholder=""
                              className="text-xs"
                              value={examData.autorefraction.os.axis}
                              onChange={(e) =>
                                setExamData((prev) => ({
                                  ...prev,
                                  autorefraction: {
                                    ...prev.autorefraction,
                                    os: { ...prev.autorefraction.os, axis: e.target.value },
                                  },
                                }))
                              }
                            />
                          </td>
                          <td className="p-1">
                            <Input
                              name="os-iop"
                              id="os-iop"
                              placeholder=""
                              className="text-xs"
                              value={examData.autorefraction.os.iop}
                              onChange={(e) =>
                                setExamData((prev) => ({
                                  ...prev,
                                  autorefraction: {
                                    ...prev.autorefraction,
                                    os: { ...prev.autorefraction.os, iop: e.target.value },
                                  },
                                }))
                              }
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              )}
              <div className="mt-4">
                <div className="space-y-1 pr-6 flex flex-col items-end w-full">
                  <Label htmlFor="nurse-signature" className="font-bold text-right">توقيع التمريض</Label>
                  <Input
                    id="nurse-signature"
                    name="nurse-signature"
                    value={nurseSignature}
                    onChange={(e) => setNurseSignature(e.target.value)}
                    className="text-right w-full max-w-sm ms-auto"
                  />
                </div>
              </div>
            </div>
            )}
          </TabsContent>

            {/* Pentacam Tab */}
          <TabsContent value="pentacam" className="sheet-layout">
            {!hasPatient && (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  يرجى اختيار المريض أولاً لإدخال بيانات البنتاكام.
                </CardContent>
              </Card>
            )}
            {hasPatient && (
            <div className="space-y-4">
            {isMobileViewport && (
              <div className="space-y-3">
                <Card className="border">
                  <CardHeader className="py-2">
                    <CardTitle className="text-sm text-center">OD</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-2 text-xs">
                    <Label htmlFor="od-k1-m">K1</Label>
                    <Input id="od-k1-m" value={examData.pentacam.od.k1} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, k1: e.target.value } } }))} />
                    <Label htmlFor="od-k2-m">K2</Label>
                    <Input id="od-k2-m" value={examData.pentacam.od.k2} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, k2: e.target.value } } }))} />
                    <Label htmlFor="od-ax1-m">AX1</Label>
                    <Input id="od-ax1-m" value={examData.pentacam.od.ax1} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, ax1: e.target.value } } }))} />
                    <Label htmlFor="od-ax2-m">AX2</Label>
                    <Input id="od-ax2-m" value={examData.pentacam.od.ax2} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, ax2: e.target.value } } }))} />
                    <Label htmlFor="od-thinnest-m">Thinnest Point</Label>
                    <Input id="od-thinnest-m" value={examData.pentacam.od.thinnest} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, thinnest: e.target.value } } }))} />
                    <Label htmlFor="od-apex-m">Corneal Apex</Label>
                    <Input id="od-apex-m" value={examData.pentacam.od.apex} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, apex: e.target.value } } }))} />
                    <Label htmlFor="od-residual-m">Residual Stroma</Label>
                    <Input id="od-residual-m" value={examData.pentacam.od.residual} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, residual: e.target.value } } }))} />
                    <Label htmlFor="od-ttt-m">Planned TTT</Label>
                    <Input id="od-ttt-m" value={examData.pentacam.od.ttt} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, ttt: e.target.value } } }))} />
                    <Label htmlFor="od-ablation-m">Ablation</Label>
                    <Input id="od-ablation-m" value={examData.pentacam.od.ablation} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, ablation: e.target.value } } }))} />
                  </CardContent>
                </Card>

                <Card className="border">
                  <CardHeader className="py-2">
                    <CardTitle className="text-sm text-center">OS</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-2 text-xs">
                    <Label htmlFor="os-k1-m">K1</Label>
                    <Input id="os-k1-m" value={examData.pentacam.os.k1} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, k1: e.target.value } } }))} />
                    <Label htmlFor="os-k2-m">K2</Label>
                    <Input id="os-k2-m" value={examData.pentacam.os.k2} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, k2: e.target.value } } }))} />
                    <Label htmlFor="os-ax1-m">AX1</Label>
                    <Input id="os-ax1-m" value={examData.pentacam.os.ax1} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, ax1: e.target.value } } }))} />
                    <Label htmlFor="os-ax2-m">AX2</Label>
                    <Input id="os-ax2-m" value={examData.pentacam.os.ax2} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, ax2: e.target.value } } }))} />
                    <Label htmlFor="os-thinnest-m">Thinnest Point</Label>
                    <Input id="os-thinnest-m" value={examData.pentacam.os.thinnest} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, thinnest: e.target.value } } }))} />
                    <Label htmlFor="os-apex-m">Corneal Apex</Label>
                    <Input id="os-apex-m" value={examData.pentacam.os.apex} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, apex: e.target.value } } }))} />
                    <Label htmlFor="os-residual-m">Residual Stroma</Label>
                    <Input id="os-residual-m" value={examData.pentacam.os.residual} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, residual: e.target.value } } }))} />
                    <Label htmlFor="os-ttt-m">Planned TTT</Label>
                    <Input id="os-ttt-m" value={examData.pentacam.os.ttt} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, ttt: e.target.value } } }))} />
                    <Label htmlFor="os-ablation-m">Ablation</Label>
                    <Input id="os-ablation-m" value={examData.pentacam.os.ablation} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, ablation: e.target.value } } }))} />
                  </CardContent>
                </Card>
              </div>
            )}
            {!isMobileViewport && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border">
                  <div className="bg-gray-100 p-2 text-center font-bold text-sm border-b">
                    RT فحص القرنية
                  </div>
                  <table className="w-full text-center lasik-table pentacam-table" dir="ltr" style={{ direction: "ltr", unicodeBidi: "bidi-override" }}>
                    <tbody>
                      <tr className="border-b">
                        <td className="border-r p-1 font-bold text-center">K1</td>
                        <td className="border-r p-1">
                          <Input
                            name="od-k1"
                            id="od-k1"
                            placeholder=""
                            className="text-sm"
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
                        <td className="border-r p-1 font-bold text-center" rowSpan={2}>AX</td>
                        <td className="p-1">
                          <Input
                            name="od-ax"
                            id="od-ax"
                            placeholder=""
                            className="text-sm"
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
                        <td className="border-r p-1 font-bold text-center">K2</td>
                        <td className="border-r p-1">
                          <Input
                            name="od-k2"
                            id="od-k2"
                            placeholder=""
                            className="text-sm"
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
                        <td className="p-1">
                          <Input
                            name="od-ax-2"
                            id="od-ax-2"
                            placeholder=""
                            className="text-sm"
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
                        <td className="border-r p-1 font-bold text-center">Thinnest Point</td>
                        <td colSpan={3} className="p-1">
                          <Input
                            name="od-thinnest"
                            id="od-thinnest"
                            placeholder=""
                            className="text-sm"
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
                        <td className="border-r p-1 font-bold text-center">Corneal Apex</td>
                        <td colSpan={3} className="p-1">
                          <Input
                            name="od-apex"
                            id="od-apex"
                            placeholder=""
                            className="text-sm"
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
                        <td className="border-r p-1 font-bold text-center">Residual Stroma</td>
                        <td colSpan={3} className="p-1">
                          <Input
                            name="od-residual"
                            id="od-residual"
                            placeholder=""
                            className="text-sm"
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
                        <td className="border-r p-1 font-bold text-center">Planned TTT</td>
                        <td colSpan={3} className="p-1">
                          <Input
                            name="od-ttt"
                            id="od-ttt"
                            placeholder=""
                            className="text-sm"
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
                        <td className="border-r p-1 font-bold text-center">Ablation</td>
                        <td colSpan={3} className="p-1">
                          <Input
                            name="od-ablation"
                            id="od-ablation"
                            placeholder=""
                            className="text-sm"
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
                  <div className="bg-gray-100 p-2 text-center font-bold text-sm border-b">
                    LT فحص القرنية
                  </div>
                  <table className="w-full text-center lasik-table pentacam-table" dir="ltr" style={{ direction: "ltr", unicodeBidi: "bidi-override" }}>
                    <tbody>
                      <tr className="border-b">
                        <td className="border-r p-1 font-bold text-center">K1</td>
                        <td className="border-r p-1">
                          <Input
                            name="os-k1"
                            id="os-k1"
                            placeholder=""
                            className="text-sm"
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
                        <td className="border-r p-1 font-bold text-center" rowSpan={2}>AX</td>
                        <td className="p-1">
                          <Input
                            name="os-ax"
                            id="os-ax"
                            placeholder=""
                            className="text-sm"
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
                        <td className="border-r p-1 font-bold text-center">K2</td>
                        <td className="border-r p-1">
                          <Input
                            name="os-k2"
                            id="os-k2"
                            placeholder=""
                            className="text-sm"
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
                        <td className="p-1">
                          <Input
                            name="os-ax-2"
                            id="os-ax-2"
                            placeholder=""
                            className="text-sm"
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
                        <td className="border-r p-1 font-bold text-center">Thinnest Point</td>
                        <td colSpan={3} className="p-1">
                          <Input
                            name="os-thinnest"
                            id="os-thinnest"
                            placeholder=""
                            className="text-sm"
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
                        <td className="border-r p-1 font-bold text-center">Corneal Apex</td>
                        <td colSpan={3} className="p-1">
                          <Input
                            name="os-apex"
                            id="os-apex"
                            placeholder=""
                            className="text-sm"
                            dir="ltr"
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
                        <td className="border-r p-1 font-bold text-center">Residual Stroma</td>
                        <td colSpan={3} className="p-1">
                          <Input
                            name="os-residual"
                            id="os-residual"
                            placeholder=""
                            className="text-sm"
                            dir="ltr"
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
                        <td className="border-r p-1 font-bold text-center">Planned TTT</td>
                        <td colSpan={3} className="p-1">
                          <Input
                            name="os-ttt"
                            id="os-ttt"
                            placeholder=""
                            className="text-sm"
                            dir="ltr"
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
                        <td className="border-r p-1 font-bold text-center">Ablation</td>
                        <td colSpan={3} className="p-1">
                          <Input
                            name="os-ablation"
                            id="os-ablation"
                            placeholder=""
                            className="text-sm"
                            dir="ltr"
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
            )}
            <div className="mt-2">
              <div className="space-y-1 pr-6 flex flex-col items-end w-full">
                <Label htmlFor="technician-signature" className="font-bold text-right">توقيع الفني</Label>
                <Input
                  id="technician-signature"
                  name="technician-signature"
                  value={technicianSignature}
                  onChange={(e) => setTechnicianSignature(e.target.value)}
                  className="text-right w-full max-w-sm ms-auto"
                />
              </div>
            </div>
            </div>
            )}
          </TabsContent>
          </Tabs>

          {/* Submit Button */}
          <div className="mt-8 flex gap-4">
            <Button
              type="submit"
              disabled={loading}
              className="bg-primary hover:bg-primary/90"
            >
              <Save className="h-4 w-4 mr-2" />
              {loading ? " ..." : " "}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation("/patients")}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
