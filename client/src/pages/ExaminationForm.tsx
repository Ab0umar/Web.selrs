import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { getTrpcErrorMessage } from "@/lib/utils";
import PatientPicker from "@/components/PatientPicker";
import { trpc } from "@/lib/trpc";
import { formatDateLabel } from "@/lib/utils";
import PageHeader from "@/components/PageHeader";
import PentacamFilesPanel from "@/components/PentacamFilesPanel";

interface DoctorOption {
  id: string;
  username?: string;
  name: string;
  code: string;
  isActive?: boolean;
  locationType?: "center" | "external";
  doctorType?: "consultant" | "specialist";
}

export default function ExaminationForm() {
  const EXAM_AUTO_SAVE_ENABLED = false;
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
  const serviceDirectoryQuery = trpc.medical.getServiceDirectory.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const permissionsQuery = trpc.medical.getMyPermissions.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const doctorsQuery = trpc.medical.getDoctorDirectory.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const savePatientStateMutation = trpc.medical.savePatientPageState.useMutation();
  const patientStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [examData, setExamData] = useState({
    autorefraction: {
      od: { s: "", c: "", axis: "", s1: "", c1: "", a1: "", s2: "", c2: "", a2: "", s3: "", c3: "", a3: "", afterS: "", afterC: "", afterA: "", ucva: "", bcva: "", iop: "", airPuff1: "", airPuff2: "", airPuff3: "" },
      os: { s: "", c: "", axis: "", s1: "", c1: "", a1: "", s2: "", c2: "", a2: "", s3: "", c3: "", a3: "", afterS: "", afterC: "", afterA: "", ucva: "", bcva: "", iop: "", airPuff1: "", airPuff2: "", airPuff3: "" },
    },
    pentacam: {
      od: { k1: "", k2: "", ax1: "", ax2: "", thinnest: "", apex: "", residual: "", ttt: "", ablation: "" },
      os: { k1: "", k2: "", ax1: "", ax2: "", thinnest: "", apex: "", residual: "", ttt: "", ablation: "" },
    },
  });
  const [refractionTableData, setRefractionTableData] = useState({
    od: { s: "", c: "", a: "", pd: "" },
    os: { s: "", c: "", a: "", pd: "" },
  });
  const saveExamMutation = trpc.medical.saveExaminationForm.useMutation();
  const linkPatientServiceToMssqlMutation = trpc.medical.linkPatientServiceToMssql.useMutation();
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
  const myPermissions = (permissionsQuery.data ?? []) as string[];
  const receptionHasPatientEditPermission =
    normalizedRole === "reception" &&
    (myPermissions.includes("/patients/:id") ||
      myPermissions.includes("/patients") ||
      myPermissions.includes("/examination"));
  const canEditPatientData = normalizedRole === "admin" || receptionHasPatientEditPermission;
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [serviceCode, setServiceCode] = useState("");
  const [serviceQty, setServiceQty] = useState("2");
  const currentUserDisplayName = String((user as any)?.name ?? (user as any)?.username ?? "").trim();
  const mobileExamInputClass =
    "h-8 text-xs text-center border-input";

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
  const selectedDoctorEntry = useMemo(() => {
    const normalized = String(doctorName ?? "").trim().toLowerCase();
    if (!normalized) return null;
    return (
      availableDoctors.find((doctor) => {
        const name = String(doctor.name ?? "").trim().toLowerCase();
        const code = String(doctor.code ?? "").trim().toLowerCase();
        const username = String(doctor.username ?? "").trim().toLowerCase();
        return normalized === name || normalized === code || (username && normalized === username);
      }) ?? null
    );
  }, [availableDoctors, doctorName]);
  const serviceOptions = useMemo(() => {
    const list = Array.isArray(serviceDirectoryQuery.data) ? (serviceDirectoryQuery.data as any[]) : [];
    const normalizedSheet = String(sheetSelection || "").trim().toLowerCase();
    const doctorType = String((selectedDoctorEntry as any)?.doctorType ?? "").trim().toLowerCase();
    const targetType = normalizedSheet || doctorType;

    const normalized = list
      .filter((item) => item && item.isActive !== false)
      .map((item) => ({
        code: String(item.code ?? "").trim(),
        name: String(item.name ?? "").trim(),
        serviceType: String(item.serviceType ?? "").trim().toLowerCase(),
      }))
      .filter((item) => item.code && item.name);

    if (!targetType) return normalized;
    return normalized.filter((item) => item.serviceType === targetType);
  }, [serviceDirectoryQuery.data, sheetSelection, selectedDoctorEntry]);
  const selectedServiceOption = useMemo(
    () => serviceOptions.find((item) => item.code === serviceCode) ?? null,
    [serviceOptions, serviceCode]
  );
  const isPentacamService = useMemo(() => {
    const code = String(selectedServiceOption?.code ?? serviceCode ?? "").trim().toLowerCase();
    const name = String(selectedServiceOption?.name ?? "").trim().toLowerCase();
    if (!code && !name) return false;
    return (
      code === "1501" ||
      code.includes("pentacam") ||
      name.includes("pentacam") ||
      name.includes("بنتاكام")
    );
  }, [selectedServiceOption, serviceCode]);

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
        od: { s: "", c: "", axis: "", s1: "", c1: "", a1: "", s2: "", c2: "", a2: "", s3: "", c3: "", a3: "", afterS: "", afterC: "", afterA: "", ucva: "", bcva: "", iop: "", airPuff1: "", airPuff2: "", airPuff3: "" },
        os: { s: "", c: "", axis: "", s1: "", c1: "", a1: "", s2: "", c2: "", a2: "", s3: "", c3: "", a3: "", afterS: "", afterC: "", afterA: "", ucva: "", bcva: "", iop: "", airPuff1: "", airPuff2: "", airPuff3: "" },
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
      if (data.serviceCode !== undefined) setServiceCode(String(data.serviceCode ?? ""));
      if (data.serviceQty !== undefined) setServiceQty(String(data.serviceQty ?? "2"));
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
    if (data.serviceCode !== undefined) setServiceCode(String(data.serviceCode ?? ""));
    if (data.serviceQty !== undefined) setServiceQty(String(data.serviceQty ?? "2"));
    if (data.medicalChecklist) {
      setMedicalChecklist((prev) => ({ ...prev, ...data.medicalChecklist }));
    }
    if (typeof data.isFollowup === "boolean") {
      setIsFollowup(data.isFollowup);
    }
  }, [patientStateQuery.data]);

  useEffect(() => {
    if (!EXAM_AUTO_SAVE_ENABLED) return;
    if (!patientInfo.id) return;
    if (patientStateTimerRef.current) clearTimeout(patientStateTimerRef.current);
    const payload = {
      sheetSelection,
      visitDate,
      doctorName,
      serviceCode,
      serviceQty,
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
  }, [EXAM_AUTO_SAVE_ENABLED, patientInfo.id, sheetSelection, visitDate, doctorName, serviceCode, serviceQty, medicalChecklist, isFollowup, savePatientStateMutation]);

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
        setRefractionTableData((prev) => ({
          od: {
            s: parsed.examData.autorefraction?.od?.s ?? prev.od.s,
            c: parsed.examData.autorefraction?.od?.c ?? prev.od.c,
            a: parsed.examData.autorefraction?.od?.axis ?? prev.od.a,
            pd: parsed.examData.autorefraction?.od?.pd ?? prev.od.pd,
          },
          os: {
            s: parsed.examData.autorefraction?.os?.s ?? prev.os.s,
            c: parsed.examData.autorefraction?.os?.c ?? prev.os.c,
            a: parsed.examData.autorefraction?.os?.axis ?? prev.os.a,
            pd: parsed.examData.autorefraction?.os?.pd ?? prev.os.pd,
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
    if (!EXAM_AUTO_SAVE_ENABLED) return;
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
      refractionTableData,
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
                    s: pickValue(refractionTableData.od.s, existing.examData?.autorefraction?.od?.s),
                    c: pickValue(refractionTableData.od.c, existing.examData?.autorefraction?.od?.c),
                    axis: pickValue(refractionTableData.od.a, existing.examData?.autorefraction?.od?.axis),
                    pd: pickValue(refractionTableData.od.pd, (existing.examData?.autorefraction?.od as any)?.pd),
                    s1: pickValue((examData.autorefraction.od as any).s1, (existing.examData?.autorefraction?.od as any)?.s1),
                    c1: pickValue((examData.autorefraction.od as any).c1, (existing.examData?.autorefraction?.od as any)?.c1),
                    a1: pickValue((examData.autorefraction.od as any).a1, (existing.examData?.autorefraction?.od as any)?.a1),
                    s2: pickValue((examData.autorefraction.od as any).s2, (existing.examData?.autorefraction?.od as any)?.s2),
                    c2: pickValue((examData.autorefraction.od as any).c2, (existing.examData?.autorefraction?.od as any)?.c2),
                    a2: pickValue((examData.autorefraction.od as any).a2, (existing.examData?.autorefraction?.od as any)?.a2),
                    s3: pickValue((examData.autorefraction.od as any).s3, (existing.examData?.autorefraction?.od as any)?.s3),
                    c3: pickValue((examData.autorefraction.od as any).c3, (existing.examData?.autorefraction?.od as any)?.c3),
                    a3: pickValue((examData.autorefraction.od as any).a3, (existing.examData?.autorefraction?.od as any)?.a3),
                    afterS: pickValue((examData.autorefraction.od as any).afterS, (existing.examData?.autorefraction?.od as any)?.afterS),
                    afterC: pickValue((examData.autorefraction.od as any).afterC, (existing.examData?.autorefraction?.od as any)?.afterC),
                    afterA: pickValue((examData.autorefraction.od as any).afterA, (existing.examData?.autorefraction?.od as any)?.afterA),
                    ucva: pickValue(examData.autorefraction.od.ucva, existing.examData?.autorefraction?.od?.ucva),
                    bcva: pickValue(examData.autorefraction.od.bcva, existing.examData?.autorefraction?.od?.bcva),
                    iop: pickValue(examData.autorefraction.od.iop, existing.examData?.autorefraction?.od?.iop),
                    airPuff1: pickValue((examData.autorefraction.od as any).airPuff1, (existing.examData?.autorefraction?.od as any)?.airPuff1),
                    airPuff2: pickValue((examData.autorefraction.od as any).airPuff2, (existing.examData?.autorefraction?.od as any)?.airPuff2),
                    airPuff3: pickValue((examData.autorefraction.od as any).airPuff3, (existing.examData?.autorefraction?.od as any)?.airPuff3),
                  },
                  os: {
                    ...(existing.examData?.autorefraction?.os ?? {}),
                    s: pickValue(refractionTableData.os.s, existing.examData?.autorefraction?.os?.s),
                    c: pickValue(refractionTableData.os.c, existing.examData?.autorefraction?.os?.c),
                    axis: pickValue(refractionTableData.os.a, existing.examData?.autorefraction?.os?.axis),
                    pd: pickValue(refractionTableData.os.pd, (existing.examData?.autorefraction?.os as any)?.pd),
                    s1: pickValue((examData.autorefraction.os as any).s1, (existing.examData?.autorefraction?.os as any)?.s1),
                    c1: pickValue((examData.autorefraction.os as any).c1, (existing.examData?.autorefraction?.os as any)?.c1),
                    a1: pickValue((examData.autorefraction.os as any).a1, (existing.examData?.autorefraction?.os as any)?.a1),
                    s2: pickValue((examData.autorefraction.os as any).s2, (existing.examData?.autorefraction?.os as any)?.s2),
                    c2: pickValue((examData.autorefraction.os as any).c2, (existing.examData?.autorefraction?.os as any)?.c2),
                    a2: pickValue((examData.autorefraction.os as any).a2, (existing.examData?.autorefraction?.os as any)?.a2),
                    s3: pickValue((examData.autorefraction.os as any).s3, (existing.examData?.autorefraction?.os as any)?.s3),
                    c3: pickValue((examData.autorefraction.os as any).c3, (existing.examData?.autorefraction?.os as any)?.c3),
                    a3: pickValue((examData.autorefraction.os as any).a3, (existing.examData?.autorefraction?.os as any)?.a3),
                    afterS: pickValue((examData.autorefraction.os as any).afterS, (existing.examData?.autorefraction?.os as any)?.afterS),
                    afterC: pickValue((examData.autorefraction.os as any).afterC, (existing.examData?.autorefraction?.os as any)?.afterC),
                    afterA: pickValue((examData.autorefraction.os as any).afterA, (existing.examData?.autorefraction?.os as any)?.afterA),
                    ucva: pickValue(examData.autorefraction.os.ucva, existing.examData?.autorefraction?.os?.ucva),
                    bcva: pickValue(examData.autorefraction.os.bcva, existing.examData?.autorefraction?.os?.bcva),
                    iop: pickValue(examData.autorefraction.os.iop, existing.examData?.autorefraction?.os?.iop),
                    airPuff1: pickValue((examData.autorefraction.os as any).airPuff1, (existing.examData?.autorefraction?.os as any)?.airPuff1),
                    airPuff2: pickValue((examData.autorefraction.os as any).airPuff2, (existing.examData?.autorefraction?.os as any)?.airPuff2),
                    airPuff3: pickValue((examData.autorefraction.os as any).airPuff3, (existing.examData?.autorefraction?.os as any)?.airPuff3),
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
              formData: {
                ...(existing.formData ?? {}),
                ucvaOD: pickValue(examData.autorefraction.od.ucva, existing.formData?.ucvaOD),
                ucvaOS: pickValue(examData.autorefraction.os.ucva, existing.formData?.ucvaOS),
                bcvaOD: pickValue(examData.autorefraction.od.bcva, existing.formData?.bcvaOD),
                bcvaOS: pickValue(examData.autorefraction.os.bcva, existing.formData?.bcvaOS),
                iopOD: pickValue(examData.autorefraction.od.iop, existing.formData?.iopOD),
                iopOS: pickValue(examData.autorefraction.os.iop, existing.formData?.iopOS),
                pdOD: pickValue(refractionTableData.od.pd, existing.formData?.pdOD),
                pdOS: pickValue(refractionTableData.os.pd, existing.formData?.pdOS),
                refractionOD: {
                  ...(existing.formData?.refractionOD ?? {}),
                  s: pickValue(refractionTableData.od.s, existing.formData?.refractionOD?.s),
                  c: pickValue(refractionTableData.od.c, existing.formData?.refractionOD?.c),
                  a: pickValue(refractionTableData.od.a, existing.formData?.refractionOD?.a),
                },
                refractionOS: {
                  ...(existing.formData?.refractionOS ?? {}),
                  s: pickValue(refractionTableData.os.s, existing.formData?.refractionOS?.s),
                  c: pickValue(refractionTableData.os.c, existing.formData?.refractionOS?.c),
                  a: pickValue(refractionTableData.os.a, existing.formData?.refractionOS?.a),
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
    EXAM_AUTO_SAVE_ENABLED,
    examData,
    refractionTableData,
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

  const syncSelectedSheets = async (
    patientId: number,
    sheetTypes: Array<"consultant" | "specialist" | "lasik" | "external">
  ) => {
    const pickValue = (next: string | undefined, prev?: string) =>
      next && String(next).trim() ? next : prev;

    await Promise.all(
      sheetTypes.map(async (sheetType) => {
        const existingRaw = await utils.medical.getSheetEntry.fetch({ patientId, sheetType });
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
                s: pickValue(refractionTableData.od.s, existing.examData?.autorefraction?.od?.s),
                c: pickValue(refractionTableData.od.c, existing.examData?.autorefraction?.od?.c),
                axis: pickValue(refractionTableData.od.a, existing.examData?.autorefraction?.od?.axis),
                pd: pickValue(refractionTableData.od.pd, (existing.examData?.autorefraction?.od as any)?.pd),
                s1: pickValue((examData.autorefraction.od as any).s1, (existing.examData?.autorefraction?.od as any)?.s1),
                c1: pickValue((examData.autorefraction.od as any).c1, (existing.examData?.autorefraction?.od as any)?.c1),
                a1: pickValue((examData.autorefraction.od as any).a1, (existing.examData?.autorefraction?.od as any)?.a1),
                s2: pickValue((examData.autorefraction.od as any).s2, (existing.examData?.autorefraction?.od as any)?.s2),
                c2: pickValue((examData.autorefraction.od as any).c2, (existing.examData?.autorefraction?.od as any)?.c2),
                a2: pickValue((examData.autorefraction.od as any).a2, (existing.examData?.autorefraction?.od as any)?.a2),
                s3: pickValue((examData.autorefraction.od as any).s3, (existing.examData?.autorefraction?.od as any)?.s3),
                c3: pickValue((examData.autorefraction.od as any).c3, (existing.examData?.autorefraction?.od as any)?.c3),
                a3: pickValue((examData.autorefraction.od as any).a3, (existing.examData?.autorefraction?.od as any)?.a3),
                ucva: pickValue(examData.autorefraction.od.ucva, existing.examData?.autorefraction?.od?.ucva),
                bcva: pickValue(examData.autorefraction.od.bcva, existing.examData?.autorefraction?.od?.bcva),
                iop: pickValue(examData.autorefraction.od.iop, existing.examData?.autorefraction?.od?.iop),
                afterS: pickValue((examData.autorefraction.od as any).afterS, (existing.examData?.autorefraction?.od as any)?.afterS),
                afterC: pickValue((examData.autorefraction.od as any).afterC, (existing.examData?.autorefraction?.od as any)?.afterC),
                afterA: pickValue((examData.autorefraction.od as any).afterA, (existing.examData?.autorefraction?.od as any)?.afterA),
                airPuff1: pickValue((examData.autorefraction.od as any).airPuff1, (existing.examData?.autorefraction?.od as any)?.airPuff1),
                airPuff2: pickValue((examData.autorefraction.od as any).airPuff2, (existing.examData?.autorefraction?.od as any)?.airPuff2),
                airPuff3: pickValue((examData.autorefraction.od as any).airPuff3, (existing.examData?.autorefraction?.od as any)?.airPuff3),
              },
              os: {
                ...(existing.examData?.autorefraction?.os ?? {}),
                s: pickValue(refractionTableData.os.s, existing.examData?.autorefraction?.os?.s),
                c: pickValue(refractionTableData.os.c, existing.examData?.autorefraction?.os?.c),
                axis: pickValue(refractionTableData.os.a, existing.examData?.autorefraction?.os?.axis),
                pd: pickValue(refractionTableData.os.pd, (existing.examData?.autorefraction?.os as any)?.pd),
                s1: pickValue((examData.autorefraction.os as any).s1, (existing.examData?.autorefraction?.os as any)?.s1),
                c1: pickValue((examData.autorefraction.os as any).c1, (existing.examData?.autorefraction?.os as any)?.c1),
                a1: pickValue((examData.autorefraction.os as any).a1, (existing.examData?.autorefraction?.os as any)?.a1),
                s2: pickValue((examData.autorefraction.os as any).s2, (existing.examData?.autorefraction?.os as any)?.s2),
                c2: pickValue((examData.autorefraction.os as any).c2, (existing.examData?.autorefraction?.os as any)?.c2),
                a2: pickValue((examData.autorefraction.os as any).a2, (existing.examData?.autorefraction?.os as any)?.a2),
                s3: pickValue((examData.autorefraction.os as any).s3, (existing.examData?.autorefraction?.os as any)?.s3),
                c3: pickValue((examData.autorefraction.os as any).c3, (existing.examData?.autorefraction?.os as any)?.c3),
                a3: pickValue((examData.autorefraction.os as any).a3, (existing.examData?.autorefraction?.os as any)?.a3),
                ucva: pickValue(examData.autorefraction.os.ucva, existing.examData?.autorefraction?.os?.ucva),
                bcva: pickValue(examData.autorefraction.os.bcva, existing.examData?.autorefraction?.os?.bcva),
                iop: pickValue(examData.autorefraction.os.iop, existing.examData?.autorefraction?.os?.iop),
                afterS: pickValue((examData.autorefraction.os as any).afterS, (existing.examData?.autorefraction?.os as any)?.afterS),
                afterC: pickValue((examData.autorefraction.os as any).afterC, (existing.examData?.autorefraction?.os as any)?.afterC),
                afterA: pickValue((examData.autorefraction.os as any).afterA, (existing.examData?.autorefraction?.os as any)?.afterA),
                airPuff1: pickValue((examData.autorefraction.os as any).airPuff1, (existing.examData?.autorefraction?.os as any)?.airPuff1),
                airPuff2: pickValue((examData.autorefraction.os as any).airPuff2, (existing.examData?.autorefraction?.os as any)?.airPuff2),
                airPuff3: pickValue((examData.autorefraction.os as any).airPuff3, (existing.examData?.autorefraction?.os as any)?.airPuff3),
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
          formData: {
            ...(existing.formData ?? {}),
            ucvaOD: pickValue(examData.autorefraction.od.ucva, existing.formData?.ucvaOD),
            ucvaOS: pickValue(examData.autorefraction.os.ucva, existing.formData?.ucvaOS),
            bcvaOD: pickValue(examData.autorefraction.od.bcva, existing.formData?.bcvaOD),
            bcvaOS: pickValue(examData.autorefraction.os.bcva, existing.formData?.bcvaOS),
            iopOD: pickValue(examData.autorefraction.od.iop, existing.formData?.iopOD),
            iopOS: pickValue(examData.autorefraction.os.iop, existing.formData?.iopOS),
            pdOD: pickValue(refractionTableData.od.pd, existing.formData?.pdOD),
            pdOS: pickValue(refractionTableData.os.pd, existing.formData?.pdOS),
            refractionOD: {
              ...(existing.formData?.refractionOD ?? {}),
              s: pickValue(refractionTableData.od.s, existing.formData?.refractionOD?.s),
              c: pickValue(refractionTableData.od.c, existing.formData?.refractionOD?.c),
              a: pickValue(refractionTableData.od.a, existing.formData?.refractionOD?.a),
            },
            refractionOS: {
              ...(existing.formData?.refractionOS ?? {}),
              s: pickValue(refractionTableData.os.s, existing.formData?.refractionOS?.s),
              c: pickValue(refractionTableData.os.c, existing.formData?.refractionOS?.c),
              a: pickValue(refractionTableData.os.a, existing.formData?.refractionOS?.a),
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
          patientId,
          sheetType,
          content: JSON.stringify(updated),
        });
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasAutoInput = Object.values(examData.autorefraction.od).some((v) => String(v || "").trim()) ||
      Object.values(examData.autorefraction.os).some((v) => String(v || "").trim()) ||
      Object.values(refractionTableData.od).some((v) => String(v || "").trim()) ||
      Object.values(refractionTableData.os).some((v) => String(v || "").trim());
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
    if (hasPentacamInput && !technicianSignature.trim() && !nurseSignature.trim()) {
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

      await savePatientStateMutation.mutateAsync({
        patientId: effectivePatientId,
        page: "examination",
        data: {
          sheetSelection,
          visitDate,
          doctorName,
          serviceCode,
          serviceQty,
          medicalChecklist,
          isFollowup,
        },
      });

      if (serviceCode.trim()) {
        const singleServiceCode = String(serviceCode)
          .split(/[,\s]+/)
          .map((v) => v.trim())
          .filter(Boolean)[0] ?? "";
        if (!singleServiceCode) {
          throw new Error("Invalid service code");
        }
        const parsedQty = Number.parseInt(serviceQty, 10);
        const quantity = isPentacamService
          ? (Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 2)
          : 1;
        await linkPatientServiceToMssqlMutation.mutateAsync({
          patientId: effectivePatientId,
          serviceCode: singleServiceCode,
          quantity,
          doctorCode: String((selectedDoctorEntry as any)?.code ?? "").trim() || undefined,
          doctorName: String((selectedDoctorEntry as any)?.name ?? doctorName ?? "").trim() || undefined,
        });
      }

      await saveExamMutation.mutateAsync({
        patientId: effectivePatientId,
        visitDate: payload["visit-date"] || new Date().toISOString().split("T")[0],
        visitType: payload["visit-type"] || "فحص عام",
        data: payload,
      });
      const preferredType = (isFollowup
        ? "consultant"
        : (sheetSelection || currentSheetType || "consultant")) as
        | "consultant"
        | "specialist"
        | "lasik"
        | "external";
      const allSheetTypes: Array<"consultant" | "specialist" | "lasik" | "external"> = [
        preferredType,
        "consultant",
        "specialist",
        "lasik",
        "external",
      ].filter((v, i, arr) => arr.indexOf(v) === i) as Array<
        "consultant" | "specialist" | "lasik" | "external"
      >;
      await syncSelectedSheets(effectivePatientId, allSheetTypes);
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
    <div className="min-h-screen bg-background examination-page">
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                      <div className="flex items-center gap-2 min-w-0">
                        <Label htmlFor="srv-code" className="font-bold">الخدمة</Label>
                        <Select
                          value={serviceCode || "__none"}
                          onValueChange={(value) => setServiceCode(value === "__none" ? "" : value)}
                        >
                          <SelectTrigger id="srv-code" className="text-xs border-0 w-full sm:w-56 min-w-0">
                            <SelectValue placeholder="اختر الخدمة" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">—</SelectItem>
                            {serviceOptions.map((opt) => (
                              <SelectItem key={opt.code} value={opt.code}>
                                {opt.code} - {opt.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {isPentacamService ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <Label htmlFor="srv-qty" className="font-bold">الكمية</Label>
                          <Select
                            value={serviceQty || "2"}
                            onValueChange={(value) => setServiceQty(value)}
                          >
                            <SelectTrigger id="srv-qty" className="text-xs border-0 w-full sm:w-32 min-w-0">
                              <SelectValue placeholder="الكمية" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1</SelectItem>
                              <SelectItem value="2">2</SelectItem>
                              <SelectItem value="3">3</SelectItem>
                              <SelectItem value="4">4</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
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
          <TabsContent value="auto-air" className="sheet-layout exam-compact-inputs">
            <div className="mb-4 flex justify-end">
              <PatientPicker onSelect={handleSelectPatient} />
            </div>
            {!hasPatient && (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  يرجى اختيار المريض أولاً لإدخال بيانات الأوتوريفراكشن.
                </CardContent>
              </Card>
            )}
            {hasPatient && (
              <div className="bg-white p-3 sm:p-4">
                {isMobileViewport && (
                  <div className="max-w-md mx-auto space-y-3" dir="ltr">
                    <Card className="border">
                      <CardHeader className="py-2">
                        <CardTitle className="text-sm text-center">Right (OD)</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                          <Label className="text-xs">UCVA</Label>
                          <Input
                            value={examData.autorefraction.od.ucva}
                            onChange={(e) =>
                              setExamData((prev) => ({
                                ...prev,
                                autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, ucva: e.target.value } },
                              }))
                            }
                            className={mobileExamInputClass}
                          />
                        </div>
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                          <Label className="text-xs">BCVA</Label>
                          <Input
                            value={examData.autorefraction.od.bcva}
                            onChange={(e) =>
                              setExamData((prev) => ({
                                ...prev,
                                autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, bcva: e.target.value } },
                              }))
                            }
                            className={mobileExamInputClass}
                          />
                        </div>
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                          <Label className="text-xs">Autoref</Label>
                          <div className="grid grid-cols-3 gap-1">
                            <Input value={(examData.autorefraction.od as any).s1 || examData.autorefraction.od.s} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, s: e.target.value, s1: e.target.value } } }))} className={mobileExamInputClass} />
                            <Input value={(examData.autorefraction.od as any).c1 || examData.autorefraction.od.c} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, c: e.target.value, c1: e.target.value } } }))} className={mobileExamInputClass} />
                            <Input value={(examData.autorefraction.od as any).a1 || examData.autorefraction.od.axis} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, axis: e.target.value, a1: e.target.value } } }))} className={mobileExamInputClass} />
                          </div>
                        </div>
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                          <Label className="text-xs">After</Label>
                          <div className="grid grid-cols-3 gap-1">
                            <Input value={(examData.autorefraction.od as any).afterS || ""} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, afterS: e.target.value } } }))} className={mobileExamInputClass} />
                            <Input value={(examData.autorefraction.od as any).afterC || ""} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, afterC: e.target.value } } }))} className={mobileExamInputClass} />
                            <Input value={(examData.autorefraction.od as any).afterA || ""} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, afterA: e.target.value } } }))} className={mobileExamInputClass} />
                          </div>
                        </div>
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                          <Label className="text-xs">AirPuff</Label>
                          <Input value={examData.autorefraction.od.airPuff1} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, airPuff1: e.target.value } } }))} className={mobileExamInputClass} />
                        </div>
                        <div className="pt-1 border-t">
                          <div className="text-xs font-semibold mb-1">Refraction</div>
                          <div className="grid grid-cols-[40px_1fr] gap-1 items-center">
                            <Label className="text-xs">S</Label>
                            <Input value={refractionTableData.od.s} onChange={(e) => setRefractionTableData((prev) => ({ ...prev, od: { ...prev.od, s: e.target.value } }))} className={mobileExamInputClass} />
                            <Label className="text-xs">C</Label>
                            <Input value={refractionTableData.od.c} onChange={(e) => setRefractionTableData((prev) => ({ ...prev, od: { ...prev.od, c: e.target.value } }))} className={mobileExamInputClass} />
                            <Label className="text-xs">A</Label>
                            <Input value={refractionTableData.od.a} onChange={(e) => setRefractionTableData((prev) => ({ ...prev, od: { ...prev.od, a: e.target.value } }))} className={mobileExamInputClass} />
                            <Label className="text-xs">P.D</Label>
                            <Input value={refractionTableData.od.pd} onChange={(e) => setRefractionTableData((prev) => ({ ...prev, od: { ...prev.od, pd: e.target.value } }))} className={mobileExamInputClass} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border">
                      <CardHeader className="py-2">
                        <CardTitle className="text-sm text-center">Left (OS)</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                          <Label className="text-xs">UCVA</Label>
                          <Input
                            value={examData.autorefraction.os.ucva}
                            onChange={(e) =>
                              setExamData((prev) => ({
                                ...prev,
                                autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, ucva: e.target.value } },
                              }))
                            }
                            className={mobileExamInputClass}
                          />
                        </div>
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                          <Label className="text-xs">BCVA</Label>
                          <Input
                            value={examData.autorefraction.os.bcva}
                            onChange={(e) =>
                              setExamData((prev) => ({
                                ...prev,
                                autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, bcva: e.target.value } },
                              }))
                            }
                            className={mobileExamInputClass}
                          />
                        </div>
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                          <Label className="text-xs">Autoref</Label>
                          <div className="grid grid-cols-3 gap-1">
                            <Input value={(examData.autorefraction.os as any).s1 || examData.autorefraction.os.s} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, s: e.target.value, s1: e.target.value } } }))} className={mobileExamInputClass} />
                            <Input value={(examData.autorefraction.os as any).c1 || examData.autorefraction.os.c} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, c: e.target.value, c1: e.target.value } } }))} className={mobileExamInputClass} />
                            <Input value={(examData.autorefraction.os as any).a1 || examData.autorefraction.os.axis} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, axis: e.target.value, a1: e.target.value } } }))} className={mobileExamInputClass} />
                          </div>
                        </div>
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                          <Label className="text-xs">After</Label>
                          <div className="grid grid-cols-3 gap-1">
                            <Input value={(examData.autorefraction.os as any).afterS || ""} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, afterS: e.target.value } } }))} className={mobileExamInputClass} />
                            <Input value={(examData.autorefraction.os as any).afterC || ""} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, afterC: e.target.value } } }))} className={mobileExamInputClass} />
                            <Input value={(examData.autorefraction.os as any).afterA || ""} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, afterA: e.target.value } } }))} className={mobileExamInputClass} />
                          </div>
                        </div>
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                          <Label className="text-xs">AirPuff</Label>
                          <Input value={examData.autorefraction.os.airPuff1} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, airPuff1: e.target.value } } }))} className={mobileExamInputClass} />
                        </div>
                        <div className="pt-1 border-t">
                          <div className="text-xs font-semibold mb-1">Refraction</div>
                          <div className="grid grid-cols-[40px_1fr] gap-1 items-center">
                            <Label className="text-xs">S</Label>
                            <Input value={refractionTableData.os.s} onChange={(e) => setRefractionTableData((prev) => ({ ...prev, os: { ...prev.os, s: e.target.value } }))} className={mobileExamInputClass} />
                            <Label className="text-xs">C</Label>
                            <Input value={refractionTableData.os.c} onChange={(e) => setRefractionTableData((prev) => ({ ...prev, os: { ...prev.os, c: e.target.value } }))} className={mobileExamInputClass} />
                            <Label className="text-xs">A</Label>
                            <Input value={refractionTableData.os.a} onChange={(e) => setRefractionTableData((prev) => ({ ...prev, os: { ...prev.os, a: e.target.value } }))} className={mobileExamInputClass} />
                            <Label className="text-xs">P.D</Label>
                            <Input value={refractionTableData.os.pd} onChange={(e) => setRefractionTableData((prev) => ({ ...prev, os: { ...prev.os, pd: e.target.value } }))} className={mobileExamInputClass} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
                {!isMobileViewport && (
                <div className="max-w-3xl mx-auto mt-2 space-y-2 overflow-x-auto" dir="ltr">
                  <div className="min-w-[560px] space-y-2">
                  <div className="grid grid-cols-[120px_1fr_1fr] items-center gap-3 text-sm font-bold">
                    <div></div>
                    <div className="text-left pl-1">Right (OD)</div>
                    <div className="text-left pl-1">Left (OS)</div>
                  </div>

                  <div className="grid grid-cols-[120px_1fr_1fr] items-center gap-3">
                    <div className="text-sm font-semibold">UCVA</div>
                    <Input value={examData.autorefraction.od.ucva} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, ucva: e.target.value } } }))} className="h-7 w-24 text-[11px] text-center border-input" />
                    <Input value={examData.autorefraction.os.ucva} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, ucva: e.target.value } } }))} className="h-7 w-24 text-[11px] text-center border-input" />
                  </div>

                  <div className="grid grid-cols-[120px_1fr_1fr] items-center gap-3">
                    <div className="text-sm font-semibold">BCVA</div>
                    <Input value={examData.autorefraction.od.bcva} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, bcva: e.target.value } } }))} className="h-7 w-24 text-[11px] text-center border-input" />
                    <Input value={examData.autorefraction.os.bcva} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, bcva: e.target.value } } }))} className="h-7 w-24 text-[11px] text-center border-input" />
                  </div>

                  <div className="grid grid-cols-[120px_1fr_1fr] items-center gap-3">
                    <div className="text-sm font-semibold">Autoref</div>
                    <div className="flex items-center gap-2 text-[10px] font-semibold">
                      <span className="w-16 text-center">S</span>
                      <span className="w-16 text-center">C</span>
                      <span className="w-16 text-center">A</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-semibold">
                      <span className="w-16 text-center">S</span>
                      <span className="w-16 text-center">C</span>
                      <span className="w-16 text-center">A</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-[120px_1fr_1fr] items-center gap-3">
                    <div></div>
                    <div className="flex items-center gap-2">
                      <Input value={(examData.autorefraction.od as any).s1 || examData.autorefraction.od.s} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, s: e.target.value, s1: e.target.value } } }))} className="h-7 w-16 text-[11px] text-center border-input" />
                      <Input value={(examData.autorefraction.od as any).c1 || examData.autorefraction.od.c} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, c: e.target.value, c1: e.target.value } } }))} className="h-7 w-16 text-[11px] text-center border-input" />
                      <Input value={(examData.autorefraction.od as any).a1 || examData.autorefraction.od.axis} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, axis: e.target.value, a1: e.target.value } } }))} className="h-7 w-16 text-[11px] text-center border-input" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Input value={(examData.autorefraction.os as any).s1 || examData.autorefraction.os.s} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, s: e.target.value, s1: e.target.value } } }))} className="h-7 w-16 text-[11px] text-center border-input" />
                      <Input value={(examData.autorefraction.os as any).c1 || examData.autorefraction.os.c} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, c: e.target.value, c1: e.target.value } } }))} className="h-7 w-16 text-[11px] text-center border-input" />
                      <Input value={(examData.autorefraction.os as any).a1 || examData.autorefraction.os.axis} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, axis: e.target.value, a1: e.target.value } } }))} className="h-7 w-16 text-[11px] text-center border-input" />
                    </div>
                  </div>

                  <div className="grid grid-cols-[120px_1fr_1fr] items-center gap-3">
                    <div className="text-sm font-semibold">After</div>
                    <div className="flex items-center gap-2">
                      <Input value={(examData.autorefraction.od as any).afterS || ""} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, afterS: e.target.value } } }))} className="h-7 w-16 text-[11px] text-center border-input" />
                      <Input value={(examData.autorefraction.od as any).afterC || ""} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, afterC: e.target.value } } }))} className="h-7 w-16 text-[11px] text-center border-input" />
                      <Input value={(examData.autorefraction.od as any).afterA || ""} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, afterA: e.target.value } } }))} className="h-7 w-16 text-[11px] text-center border-input" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Input value={(examData.autorefraction.os as any).afterS || ""} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, afterS: e.target.value } } }))} className="h-7 w-16 text-[11px] text-center border-input" />
                      <Input value={(examData.autorefraction.os as any).afterC || ""} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, afterC: e.target.value } } }))} className="h-7 w-16 text-[11px] text-center border-input" />
                      <Input value={(examData.autorefraction.os as any).afterA || ""} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, afterA: e.target.value } } }))} className="h-7 w-16 text-[11px] text-center border-input" />
                    </div>
                  </div>

                  <div className="grid grid-cols-[120px_1fr_1fr] items-center gap-3">
                    <div className="text-sm font-semibold">AirPuff</div>
                    <div className="flex items-center gap-2">
                      <Input value={examData.autorefraction.od.airPuff1} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, od: { ...prev.autorefraction.od, airPuff1: e.target.value } } }))} className="h-7 w-16 text-[11px] text-center border-input" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Input value={examData.autorefraction.os.airPuff1} onChange={(e) => setExamData((prev) => ({ ...prev, autorefraction: { ...prev.autorefraction, os: { ...prev.autorefraction.os, airPuff1: e.target.value } } }))} className="h-7 w-16 text-[11px] text-center border-input" />
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-center text-white font-bold py-1" style={{ background: "#2ea3f2", borderRadius: "8px 8px 0 0" }}>
                        RIGHT
                      </div>
                      <table className="w-full border-collapse text-center text-sm bg-white">
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
                          <tr style={{ height: 48 }}>
                            <td style={{ border: "2px solid #2ea3f2", fontWeight: 700 }}>DIST</td>
                            <td style={{ border: "2px solid #2ea3f2", padding: 4 }}>
                              <Input
                                value={refractionTableData.od.s}
                                onChange={(e) => setRefractionTableData((prev) => ({ ...prev, od: { ...prev.od, s: e.target.value } }))}
                                className="h-7 w-full text-[11px] text-center border-input"
                              />
                            </td>
                            <td style={{ border: "2px solid #2ea3f2", padding: 4 }}>
                              <Input
                                value={refractionTableData.od.c}
                                onChange={(e) => setRefractionTableData((prev) => ({ ...prev, od: { ...prev.od, c: e.target.value } }))}
                                className="h-7 w-full text-[11px] text-center border-input"
                              />
                            </td>
                            <td style={{ border: "2px solid #2ea3f2", padding: 4 }}>
                              <Input
                                value={refractionTableData.od.a}
                                onChange={(e) => setRefractionTableData((prev) => ({ ...prev, od: { ...prev.od, a: e.target.value } }))}
                                className="h-7 w-full text-[11px] text-center border-input"
                              />
                            </td>
                            <td style={{ border: "2px solid #2ea3f2", padding: 4 }}>
                              <Input
                                value={refractionTableData.od.pd}
                                onChange={(e) => setRefractionTableData((prev) => ({ ...prev, od: { ...prev.od, pd: e.target.value } }))}
                                className="h-7 w-full text-[11px] text-center border-input"
                              />
                            </td>
                          </tr>
                          <tr style={{ height: 48 }}>
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
                      <table className="w-full border-collapse text-center text-sm bg-white">
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
                          <tr style={{ height: 48 }}>
                            <td style={{ border: "2px solid #2ea3f2", fontWeight: 700 }}>DIST</td>
                            <td style={{ border: "2px solid #2ea3f2", padding: 4 }}>
                              <Input
                                value={refractionTableData.os.s}
                                onChange={(e) => setRefractionTableData((prev) => ({ ...prev, os: { ...prev.os, s: e.target.value } }))}
                                className="h-7 w-full text-[11px] text-center border-input"
                              />
                            </td>
                            <td style={{ border: "2px solid #2ea3f2", padding: 4 }}>
                              <Input
                                value={refractionTableData.os.c}
                                onChange={(e) => setRefractionTableData((prev) => ({ ...prev, os: { ...prev.os, c: e.target.value } }))}
                                className="h-7 w-full text-[11px] text-center border-input"
                              />
                            </td>
                            <td style={{ border: "2px solid #2ea3f2", padding: 4 }}>
                              <Input
                                value={refractionTableData.os.a}
                                onChange={(e) => setRefractionTableData((prev) => ({ ...prev, os: { ...prev.os, a: e.target.value } }))}
                                className="h-7 w-full text-[11px] text-center border-input"
                              />
                            </td>
                            <td style={{ border: "2px solid #2ea3f2", padding: 4 }}>
                              <Input
                                value={refractionTableData.os.pd}
                                onChange={(e) => setRefractionTableData((prev) => ({ ...prev, os: { ...prev.os, pd: e.target.value } }))}
                                className="h-7 w-full text-[11px] text-center border-input"
                              />
                            </td>
                          </tr>
                          <tr style={{ height: 48 }}>
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
          <TabsContent value="pentacam" className="sheet-layout exam-compact-inputs">
            <div className="mb-4 flex justify-end">
              <PatientPicker onSelect={handleSelectPatient} />
            </div>
            {!hasPatient && (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  Please select a patient first to enter Pentacam data.
                </CardContent>
              </Card>
            )}
            {hasPatient && (
              <div className="bg-white p-3 sm:p-4">
                {isMobileViewport && (
                  <div className="max-w-md mx-auto space-y-3" dir="ltr">
                    <Card className="border">
                      <CardHeader className="py-2">
                        <CardTitle className="text-sm text-center">Right (OD)</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                          <Label className="text-xs">K1/K2</Label>
                          <div className="grid grid-cols-2 gap-1">
                            <Input value={examData.pentacam.od.k1} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, k1: e.target.value } } }))} className={mobileExamInputClass} />
                            <Input value={examData.pentacam.od.k2} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, k2: e.target.value } } }))} className={mobileExamInputClass} />
                          </div>
                        </div>
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                          <Label className="text-xs">AX1/AX2</Label>
                          <div className="grid grid-cols-2 gap-1">
                            <Input value={examData.pentacam.od.ax1} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, ax1: e.target.value } } }))} className={mobileExamInputClass} />
                            <Input value={examData.pentacam.od.ax2} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, ax2: e.target.value } } }))} className={mobileExamInputClass} />
                          </div>
                        </div>
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2"><Label className="text-xs">Thinnest Point</Label><Input value={examData.pentacam.od.thinnest} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, thinnest: e.target.value } } }))} className={mobileExamInputClass} /></div>
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2"><Label className="text-xs">Corneal Apex</Label><Input value={examData.pentacam.od.apex} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, apex: e.target.value } } }))} className={mobileExamInputClass} /></div>
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2"><Label className="text-xs">Residual Stroma</Label><Input value={examData.pentacam.od.residual} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, residual: e.target.value } } }))} className={mobileExamInputClass} /></div>
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2"><Label className="text-xs">Planned TTT</Label><Input value={examData.pentacam.od.ttt} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, ttt: e.target.value } } }))} className={mobileExamInputClass} /></div>
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2"><Label className="text-xs">Ablation</Label><Input value={examData.pentacam.od.ablation} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, ablation: e.target.value } } }))} className={mobileExamInputClass} /></div>
                      </CardContent>
                    </Card>

                    <Card className="border">
                      <CardHeader className="py-2">
                        <CardTitle className="text-sm text-center">Left (OS)</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                          <Label className="text-xs">K1/K2</Label>
                          <div className="grid grid-cols-2 gap-1">
                            <Input value={examData.pentacam.os.k1} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, k1: e.target.value } } }))} className={mobileExamInputClass} />
                            <Input value={examData.pentacam.os.k2} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, k2: e.target.value } } }))} className={mobileExamInputClass} />
                          </div>
                        </div>
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                          <Label className="text-xs">AX1/AX2</Label>
                          <div className="grid grid-cols-2 gap-1">
                            <Input value={examData.pentacam.os.ax1} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, ax1: e.target.value } } }))} className={mobileExamInputClass} />
                            <Input value={examData.pentacam.os.ax2} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, ax2: e.target.value } } }))} className={mobileExamInputClass} />
                          </div>
                        </div>
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2"><Label className="text-xs">Thinnest Point</Label><Input value={examData.pentacam.os.thinnest} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, thinnest: e.target.value } } }))} className={mobileExamInputClass} /></div>
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2"><Label className="text-xs">Corneal Apex</Label><Input value={examData.pentacam.os.apex} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, apex: e.target.value } } }))} className={mobileExamInputClass} /></div>
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2"><Label className="text-xs">Residual Stroma</Label><Input value={examData.pentacam.os.residual} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, residual: e.target.value } } }))} className={mobileExamInputClass} /></div>
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2"><Label className="text-xs">Planned TTT</Label><Input value={examData.pentacam.os.ttt} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, ttt: e.target.value } } }))} className={mobileExamInputClass} /></div>
                        <div className="grid grid-cols-[90px_1fr] items-center gap-2"><Label className="text-xs">Ablation</Label><Input value={examData.pentacam.os.ablation} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, ablation: e.target.value } } }))} className={mobileExamInputClass} /></div>
                      </CardContent>
                    </Card>
                  </div>
                )}
                {!isMobileViewport && (
                <div className="max-w-3xl mx-auto mt-2 space-y-2 overflow-x-auto" dir="ltr">
                  <div className="min-w-[560px] space-y-2">
                    <div className="grid grid-cols-[120px_1fr_1fr] items-center gap-3 text-sm font-bold mb-1">
                      <div></div>
                      <div className="text-left pl-1">Right (OD)</div>
                      <div className="text-left pl-1">Left (OS)</div>
                    </div>

                    <div className="grid grid-cols-[120px_1fr_1fr] items-center gap-3">
                      <div className="text-sm font-semibold">K1/K2</div>
                      <div className="flex items-center gap-2">
                        <Input value={examData.pentacam.od.k1} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, k1: e.target.value } } }))} className="h-7 w-16 text-[11px] text-center border-input" />
                        <Input value={examData.pentacam.od.k2} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, k2: e.target.value } } }))} className="h-7 w-16 text-[11px] text-center border-input" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Input value={examData.pentacam.os.k1} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, k1: e.target.value } } }))} className="h-7 w-16 text-[11px] text-center border-input" />
                        <Input value={examData.pentacam.os.k2} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, k2: e.target.value } } }))} className="h-7 w-16 text-[11px] text-center border-input" />
                      </div>
                    </div>

                    <div className="grid grid-cols-[120px_1fr_1fr] items-center gap-3">
                      <div className="text-sm font-semibold">AX1/AX2</div>
                      <div className="flex items-center gap-2">
                        <Input value={examData.pentacam.od.ax1} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, ax1: e.target.value } } }))} className="h-7 w-16 text-[11px] text-center border-input" />
                        <Input value={examData.pentacam.od.ax2} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, ax2: e.target.value } } }))} className="h-7 w-16 text-[11px] text-center border-input" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Input value={examData.pentacam.os.ax1} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, ax1: e.target.value } } }))} className="h-7 w-16 text-[11px] text-center border-input" />
                        <Input value={examData.pentacam.os.ax2} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, ax2: e.target.value } } }))} className="h-7 w-16 text-[11px] text-center border-input" />
                      </div>
                    </div>

                    <div className="grid grid-cols-[120px_1fr_1fr] items-center gap-3">
                      <div className="text-sm font-semibold">Thinnest Point</div>
                      <Input value={examData.pentacam.od.thinnest} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, thinnest: e.target.value } } }))} className="h-7 w-40 text-[11px] text-center border-input" />
                      <Input value={examData.pentacam.os.thinnest} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, thinnest: e.target.value } } }))} className="h-7 w-40 text-[11px] text-center border-input" />
                    </div>

                    <div className="grid grid-cols-[120px_1fr_1fr] items-center gap-3">
                      <div className="text-sm font-semibold">Corneal Apex</div>
                      <Input value={examData.pentacam.od.apex} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, apex: e.target.value } } }))} className="h-7 w-40 text-[11px] text-center border-input" />
                      <Input value={examData.pentacam.os.apex} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, apex: e.target.value } } }))} className="h-7 w-40 text-[11px] text-center border-input" />
                    </div>

                    <div className="grid grid-cols-[120px_1fr_1fr] items-center gap-3">
                      <div className="text-sm font-semibold">Residual Stroma</div>
                      <Input value={examData.pentacam.od.residual} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, residual: e.target.value } } }))} className="h-7 w-40 text-[11px] text-center border-input" />
                      <Input value={examData.pentacam.os.residual} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, residual: e.target.value } } }))} className="h-7 w-40 text-[11px] text-center border-input" />
                    </div>

                    <div className="grid grid-cols-[120px_1fr_1fr] items-center gap-3">
                      <div className="text-sm font-semibold">Planned TTT</div>
                      <Input value={examData.pentacam.od.ttt} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, ttt: e.target.value } } }))} className="h-7 w-40 text-[11px] text-center border-input" />
                      <Input value={examData.pentacam.os.ttt} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, ttt: e.target.value } } }))} className="h-7 w-40 text-[11px] text-center border-input" />
                    </div>

                    <div className="grid grid-cols-[120px_1fr_1fr] items-center gap-3">
                      <div className="text-sm font-semibold">Ablation</div>
                      <Input value={examData.pentacam.od.ablation} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, od: { ...prev.pentacam.od, ablation: e.target.value } } }))} className="h-7 w-40 text-[11px] text-center border-input" />
                      <Input value={examData.pentacam.os.ablation} onChange={(e) => setExamData((prev) => ({ ...prev, pentacam: { ...prev.pentacam, os: { ...prev.pentacam.os, ablation: e.target.value } } }))} className="h-7 w-40 text-[11px] text-center border-input" />
                    </div>
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
                <div className="mt-4">
                  <PentacamFilesPanel patientId={patientInfo.id} compact />
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


