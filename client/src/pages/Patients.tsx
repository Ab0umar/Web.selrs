import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, Edit, FileText, Printer, Upload, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { getTrpcErrorMessage } from "@/lib/utils";
import { matchesServiceCodeOrNameTerm, normalizeServiceCodeForSearch } from "@/lib/patientFiltering";
import * as XLSX from "xlsx";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";

type DoctorDirectoryEntry = {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
};
type PatientCursor = {
  codeNum: number;
  patientCode: string;
  id: number;
};
type ImportPreviewRow = {
  rowNumber: number;
  patientCode: string;
  fullName: string;
  serviceType: string;
  locationType: string;
  status: string;
  errors: string[];
};

const normalizeServiceCode = (value: unknown) => {
  return normalizeServiceCodeForSearch(value);
};
const normalizeSheetType = (value: unknown) => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "pentacam") return "pentacam_center";
  if (raw === "surgery_center") return "surgery";
  if (raw === "surgery_external") return "surgery_external";
  if (raw === "pentacam_center" || raw === "radiology_center") return "pentacam_center";
  if (raw === "pentacam_external" || raw === "radiology_external") return "pentacam_external";
  return raw;
};
  const toLegacyServiceType = (value: string): "consultant" | "specialist" | "lasik" | "external" | "surgery" => {
  const normalized = normalizeSheetType(value);
  if (normalized === "pentacam_center") return "consultant";
  if (normalized === "pentacam_external") return "external";
  if (normalized === "surgery_external") return "external";
  if (normalized === "consultant" || normalized === "specialist" || normalized === "lasik" || normalized === "external" || normalized === "surgery") {
    return normalized;
  }
  return "consultant";
};

export default function Patients() {
  const { user, isAuthenticated } = useAuth();
  const canEditPatients = user?.role === "admin" || user?.role === "manager" || user?.role === "reception";
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [cursor, setCursor] = useState<PatientCursor | null>(null);
  const [cursorHistory, setCursorHistory] = useState<Array<PatientCursor | null>>([]);
  const [pageSize, setPageSize] = useState(50);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const userStateQuery = trpc.medical.getUserPageState.useQuery(
    { page: "patients" },
    { refetchOnWindowFocus: false }
  );
  const saveUserStateMutation = trpc.medical.saveUserPageState.useMutation();
  const doctorDirectoryQuery = trpc.medical.getDoctorDirectory.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const serviceDirectoryQuery = trpc.medical.getServiceDirectory.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const userStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeTab, setActiveTab] = useState("consultant");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());
  const [bulkSheetType, setBulkSheetType] = useState<
    | "consultant"
    | "specialist"
    | "lasik"
    | "external"
    | "surgery"
    | "surgery_external"
    | "pentacam_center"
    | "pentacam_external"
  >("consultant");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importDateFormat, setImportDateFormat] = useState<"" | "DMY" | "MDY">("");
  const [allPatients, setAllPatients] = useState<any[]>([]);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingPatientId, setEditingPatientId] = useState<number | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [selectedSheetType, setSelectedSheetType] = useState<
    | "consultant"
    | "specialist"
    | "lasik"
    | "external"
    | "surgery"
    | "surgery_external"
    | "pentacam_center"
    | "pentacam_external"
    | ""
  >("");
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importBatchId, setImportBatchId] = useState("");
  const [importSummary, setImportSummary] = useState<{ total: number; valid: number; invalid: number } | null>(null);
  const [importPreviewRows, setImportPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [patientDraft, setPatientDraft] = useState({
    patientCode: "",
    fullName: "",
    dateOfBirth: "",
    age: "",
    address: "",
    phone: "",
    occupation: "",
  });
  const [formData, setFormData] = useState({
    fullName: "",
    patientCode: "",
    phone: "",
    age: "",
    nationalId: "",
    serviceType: "",
  });

  const normalizeTypedDateInput = (value: string) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    if (/^\d{6}$/.test(raw)) {
      const dd = raw.slice(0, 2);
      const mm = raw.slice(2, 4);
      const yy = raw.slice(4, 6);
      return `${dd}/${mm}/20${yy}`;
    }
    if (/^\d{8}$/.test(raw)) {
      const dd = raw.slice(0, 2);
      const mm = raw.slice(2, 4);
      const yyyy = raw.slice(4, 8);
      return `${dd}/${mm}/${yyyy}`;
    }
    let match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
    if (match) {
      const dd = String(Number(match[1])).padStart(2, "0");
      const mm = String(Number(match[2])).padStart(2, "0");
      const yy = match[3];
      const yyyy = yy.length === 2 ? `20${yy}` : yy;
      return `${dd}/${mm}/${yyyy}`;
    }
    match = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (match) {
      const yyyy = match[1];
      const mm = String(Number(match[2])).padStart(2, "0");
      const dd = String(Number(match[3])).padStart(2, "0");
      return `${dd}/${mm}/${yyyy}`;
    }
    return raw;
  };
  const toIsoDate = (value: string) => {
    const raw = normalizeTypedDateInput(value);
    if (!raw) return "";
    const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchTerm(searchTerm.trim()), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);
  const hasActiveDateFilters = Boolean(toIsoDate(dateFrom) || toIsoDate(dateTo));
  const useClientFilterWindow = Boolean(debouncedSearchTerm || hasActiveDateFilters);
  const patientsQuery = trpc.medical.getAllPatients.useQuery(
    {
      branch: undefined,
      // Apply backend search for core fields; keep local filtering for service-name matching.
      searchTerm: debouncedSearchTerm || undefined,
      dateFrom: toIsoDate(dateFrom) || undefined,
      dateTo: toIsoDate(dateTo) || undefined,
      // Service tab filtering is done locally using service code -> directory mapping.
      serviceType: undefined,
      limit: useClientFilterWindow ? 500 : pageSize,
      cursor: useClientFilterWindow ? undefined : cursor ?? undefined,
    },
    {
      enabled:
        isAuthenticated,
      refetchOnWindowFocus: false,
      retry: 1,
    }
  );

  useEffect(() => {
    setCursor(null);
    setCursorHistory([]);
  }, [debouncedSearchTerm, activeTab, dateFrom, dateTo, pageSize]);

  const createPatientMutation = trpc.medical.createPatient.useMutation({
    onSuccess: () => {
      setCursor(null);
      setCursorHistory([]);
      patientsQuery.refetch();
    },
    onError: (error: unknown) => {
      toast.error(getTrpcErrorMessage(error, "حدث خطأ أثناء إضافة المريض"));
    },
  });
  const updatePatientMutation = trpc.medical.updatePatient.useMutation({
    onSuccess: () => {
      setCursor(null);
      setCursorHistory([]);
      patientsQuery.refetch();
    },
    onError: (error: unknown) => {
      toast.error(getTrpcErrorMessage(error, "حدث خطأ أثناء تحديث المريض"));
    },
  });
  const deletePatientMutation = trpc.medical.deletePatient.useMutation({
    onSuccess: () => {
      setCursor(null);
      setCursorHistory([]);
      patientsQuery.refetch();
    },
    onError: (error: unknown) => {
      toast.error(getTrpcErrorMessage(error, "حدث خطأ أثناء حذف المريض"));
    },
  });
  const saveSheetMutation = trpc.medical.saveSheetEntry.useMutation({
    onSuccess: () => {
    toast.success("تم نقل البيانات إلى فحوصات الليزك المختارة");
    },
    onError: (error: unknown) => {
      toast.error(getTrpcErrorMessage(error, "حدث خطأ أثناء نقل البيانات"));
    },
  });
  const savePatientStateMutation = trpc.medical.savePatientPageState.useMutation();
  const bulkAssignSheetMutation = trpc.medical.bulkAssignSheetTypeToPatients.useMutation();
  const stageImportMutation = trpc.medical.stagePatientsImport.useMutation();
  const applyImportMutation = trpc.medical.applyPatientsImport.useMutation();

  const downloadInvalidImportCsv = () => {
    const invalidRows = importPreviewRows.filter((r) => r.status !== "valid");
    if (!invalidRows.length) {
      toast.info("No invalid rows to export");
      return;
    }
    const escapeCsv = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["rowNumber", "patientCode", "fullName", "status", "errors"].join(","),
      ...invalidRows.map((r) =>
        [
          String(r.rowNumber),
          escapeCsv(r.patientCode),
          escapeCsv(r.fullName),
          escapeCsv(r.status),
          escapeCsv((r.errors ?? []).join(" | ")),
        ].join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `patients_import_errors_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyStagedImport = async () => {
    if (!importBatchId) return;
    try {
      const applied = await applyImportMutation.mutateAsync({ batchId: importBatchId });
      if (applied.inserted > 0 || applied.updated > 0) {
        toast.success(`Import applied. Inserted ${applied.inserted}, updated ${applied.updated}.`);
      }
      if (applied.failed > 0) {
        toast.error(`Apply failed for ${applied.failed} row(s).`);
      }
      setImportPreviewOpen(false);
      await patientsQuery.refetch();
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to apply import batch"));
    }
  };

  const handleImportPatients = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!importDateFormat) {
      toast.error("Choose import date format first (DD/MM/YYYY or MM/DD/YYYY)");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary", cellDates: true });
        const normalizeString = (value: any) => String(value ?? "").trim();
        const extractServiceTypeFromSheetName = (sheetName: string) => {
          const normalizedSheetName = normalizeString(sheetName).toUpperCase();
          // Accept common prefixes like "A_...", "B-...", "C ...", or exact "A/B/C/D".
          const match = normalizedSheetName.match(/^([ABCD])(?:[\s_\-|].*|$)/);
          if (!match) return "";
          return match[1];
        };
        const extractDoctorFromSheetName = (sheetName: string) => {
          const raw = normalizeString(sheetName);
          if (!raw) return "";
          const tokens = raw.split(/[\s_\-|]+/).map((t) => t.trim()).filter(Boolean);
          if (tokens.length === 0) return "";
          const maybeServiceLetter = tokens[0].toUpperCase();
          if (["A", "B", "C", "D"].includes(maybeServiceLetter)) {
            return tokens.slice(1).join(" ").trim();
          }
          return raw;
        };
        const rowsWithSheetName = workbook.SheetNames.flatMap((name) => {
          const worksheet = workbook.Sheets[name];
          if (!worksheet) return [] as Array<Record<string, unknown> & { __sheetName: string }>;
          const rows = XLSX.utils.sheet_to_json(worksheet) as Array<Record<string, unknown>>;
          return rows.map((row) => ({ ...row, __sheetName: name }));
        });

        const preferredSlashOrder: "DMY" | "MDY" = importDateFormat;

        const normalizeCode = (value: any) => {
          const raw = normalizeString(value);
          if (!raw) return "";
          if (/^\d+$/.test(raw)) {
            return raw.padStart(4, "0");
          }
          return raw;
        };
        const normalizeDate = (value: any) => {
          if (!value) return "";
          if (value instanceof Date) {
            const yyyy = value.getFullYear();
            const mm = String(value.getMonth() + 1).padStart(2, "0");
            const dd = String(value.getDate()).padStart(2, "0");
            return `${yyyy}-${mm}-${dd}`;
          }
          const raw = String(value).trim();
          if (!raw) return "";
          // Excel numeric date
          if (/^\d+(\.\d+)?$/.test(raw)) {
            const excelEpoch = new Date(Date.UTC(1899, 11, 30));
            const days = Number(raw);
            if (Number.isFinite(days)) {
              const date = new Date(excelEpoch.getTime() + days * 86400000);
              const yyyy = date.getUTCFullYear();
              const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
              const dd = String(date.getUTCDate()).padStart(2, "0");
              return `${yyyy}-${mm}-${dd}`;
            }
          }
          // dd/mm/yyyy or mm/dd/yyyy (sheet may be mixed)
          const match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
          if (match) {
            const p1 = Number(match[1]);
            const p2 = Number(match[2]);
            let dd = 0;
            let mm = 0;
            if (p1 > 12 && p2 >= 1 && p2 <= 12) {
              dd = p1;
              mm = p2;
            } else if (p2 > 12 && p1 >= 1 && p1 <= 12) {
              mm = p1;
              dd = p2;
            } else if (preferredSlashOrder === "MDY") {
              mm = p1;
              dd = p2;
            } else {
              dd = p1;
              mm = p2;
            }
            if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return "";
            const yyyy = match[3];
            return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
          }
          // yyyy-mm-dd
          const iso = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
          if (iso) {
            const yyyy = iso[1];
            const mm = iso[2].padStart(2, "0");
            const dd = iso[3].padStart(2, "0");
            return `${yyyy}-${mm}-${dd}`;
          }
          return "";
        };
        const parseServiceType = (raw: string) => {
          const v = raw.trim().toLowerCase();
          if (!v) return undefined as any;
          if (v === "a" || v === "استشاري" || v === "consultant" || v === "1") return "consultant";
          if (v === "b" || v === "اخصائي" || v === "أخصائي" || v === "specialist") return "specialist";
          if (v === "c" || v === "فحوصات الليزك" || v === "lasik") return "lasik";
          if (v === "d" || v === "خارجي" || v === "external" || v === "2") return "external";
          return undefined as any;
        };
        const readRowValue = (row: any, keys: string[]) => {
          for (const key of keys) {
            if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
              return row[key];
            }
          }
          return "";
        };

        const importedPatients = rowsWithSheetName.map((row: any) => {
          const patientCode =
            row.patientCode ||
            row.id ||
            row.ID ||
            row["Patient ID"] ||
            row["رقم المريض"] ||
            row["كود المريض"] ||
            "";
          const fullName =
            row.fullName ||
            row.name ||
            row["اسم المريض"] ||
            "";
          const phone =
            row.phone ||
            row["تليفون منزل"] ||
            row["تليفون"] ||
            row["موبايل"] ||
            row["الموبايل"] ||
            row["هاتف"] ||
            "";
          const ageRaw = row.age ?? row["السن"];
          const ageNum = (() => {
            if (ageRaw === null || ageRaw === undefined || ageRaw === "") return undefined;
            const cleaned = String(ageRaw).replace(/[^\d]/g, "");
            if (!cleaned) return undefined;
            const n = Number(cleaned);
            return Number.isFinite(n) ? n : undefined;
          })();
          const dateOfBirth = normalizeDate(row.dateOfBirth ?? row["تاريخ الميلاد"]);
          const rawGender = normalizeString(row.gender ?? row["النوع"]);
          const gender =
            rawGender === "ذكر" || rawGender.toLowerCase() === "male"
              ? "male"
              : rawGender === "أنثى" || rawGender === "انثى" || rawGender.toLowerCase() === "female"
              ? "female"
              : "";
          const nationalId = row.nationalId ?? "";
          const address = row.address ?? row["العنوان"];
          const serviceRaw = normalizeString(
            readRowValue(row, [
              "serviceCode",
              "service_code",
              "serviceType",
              "service_type",
              "Service Code",
              "Service Type",
              "كود الخدمة",
              "نوع الخدمة",
            ])
          );
          // Backward compatibility with old files that used رقم الهوية as temporary service marker.
          const legacyServiceRaw = normalizeString(row["رقم الهوية"] || "");
          const serviceFromSheetName = extractServiceTypeFromSheetName(String(row.__sheetName ?? ""));
          const resolvedServiceRaw = serviceRaw || legacyServiceRaw || serviceFromSheetName;
          const doctorFromRow = normalizeString(
            readRowValue(row, [
              "doctorCode",
              "doctor_code",
              "doctor",
              "doctorName",
              "DoctorCode",
              "Doctor Code",
              "doctor code",
              "docCode",
              "drCode",
              "treatingDoctor",
              "physicianCode",
              "physician",
              "كود الطبيب",
              "كود الدكتور",
              "الطبيب",
              "اسم الطبيب",
            ])
          );
          const doctorFromSheetName = extractDoctorFromSheetName(String(row.__sheetName ?? ""));
          const doctorToken = doctorFromRow || doctorFromSheetName;
          // Use opening file date only; do not map follow-up/visit dates into this field.
          const lastVisit = normalizeDate(row["تاريخ فتح الملف"] ?? row["تاريخ الملف"]);
          const resolvedServiceType = parseServiceType(resolvedServiceRaw);
          const locationType = resolvedServiceType === "external" ? "external" : "center";
          return {
            patientCode: normalizeCode(patientCode),
            fullName: normalizeString(fullName),
            phone: normalizeString(phone),
            age: ageNum,
            dateOfBirth,
            gender: normalizeString(gender),
            nationalId: normalizeString(nationalId),
            address: normalizeString(address),
            serviceType: resolvedServiceType,
            locationType,
            doctorToken,
            lastVisit,
          };
        });

        const runImport = async () => {
          const stageRows = importedPatients.map((p, idx) => ({
            rowNumber: idx + 2,
            patientCode: p.patientCode || "",
            fullName: p.fullName || "",
            dateOfBirth: p.dateOfBirth || "",
            gender: (p.gender === "male" || p.gender === "female" ? p.gender : "") as "" | "male" | "female",
            phone: p.phone || "",
            address: p.address || "",
            branch: "examinations" as const,
            serviceType: (p.serviceType as any) || "consultant",
            locationType: (p.locationType as any) || "center",
            doctorCode: String((p as any).doctorToken ?? ""),
            doctorName: String((p as any).doctorToken ?? ""),
          }));
          const stage = await stageImportMutation.mutateAsync({ rows: stageRows });
          const preview = await utils.medical.getPatientImportPreview.fetch({ batchId: stage.batchId, limit: 200 });
          setImportBatchId(stage.batchId);
          setImportSummary({ total: stage.total, valid: stage.valid, invalid: stage.invalid });
          setImportPreviewRows((preview as ImportPreviewRow[]) ?? []);
          setImportPreviewOpen(true);
          if (stage.invalid > 0) {
            toast.error(`Import validation has ${stage.invalid} invalid row(s). Review before apply.`);
          } else {
            toast.success(`Validation passed for ${stage.valid} row(s). Click Apply to import.`);
          }
        };
        runImport().catch((error) =>
          toast.error(getTrpcErrorMessage(error, "خطأ في استيراد الملف"))
        );
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (error) {
        toast.error(getTrpcErrorMessage(error, "خطأ في استيراد الملف"));
      }
    };
    reader.readAsBinaryString(file);
  };

  const rawPatientsData = patientsQuery.data as any;
  const patientsPayload = (
    Array.isArray(rawPatientsData)
      ? { rows: rawPatientsData, hasMore: false, nextCursor: null }
      : rawPatientsData ?? { rows: [], hasMore: false, nextCursor: null }
  ) as {
    rows: any[];
    hasMore: boolean;
    nextCursor: PatientCursor | null;
  };
  const patientsFromDb = (Array.isArray(patientsPayload.rows) ? patientsPayload.rows : []) as any[];
  const localWindowMode = useClientFilterWindow;
  const hasMore = localWindowMode ? false : Boolean(patientsPayload.hasMore);
  const nextCursor = localWindowMode ? null : patientsPayload.nextCursor ?? null;
  const currentPage = localWindowMode ? 1 : cursorHistory.length + 1;
  const serviceCodeToLabel = useMemo(() => {
    const list = Array.isArray(serviceDirectoryQuery.data) ? serviceDirectoryQuery.data : [];
    const map = new Map<string, string>();
    for (const item of list) {
      const code = String(item?.code ?? "").trim();
      const name = String(item?.name ?? "").trim();
      if (!code) continue;
      map.set(normalizeServiceCode(code), name || code);
    }
    return map;
  }, [serviceDirectoryQuery.data]);
  const serviceCodeToType = useMemo(() => {
    const list = Array.isArray(serviceDirectoryQuery.data) ? serviceDirectoryQuery.data : [];
    const map = new Map<string, string>();
    for (const item of list) {
      const code = String(item?.code ?? "").trim();
      const type = String((item as any)?.defaultSheet ?? item?.serviceType ?? "").trim().toLowerCase();
      if (!code || !type) continue;
      map.set(normalizeServiceCode(code), type);
    }
    return map;
  }, [serviceDirectoryQuery.data]);
  const getPatientRowKey = (patient: any) =>
    String(
      (patient as any).__rowKey ??
        `${patient.id}-${normalizeServiceCode((patient as any).__serviceCodeSingle || (patient as any).serviceCode || "base")}`
    );
  const resolveServiceTypes = (patient: any) => {
    const singleCode = normalizeServiceCode((patient as any).__serviceCodeSingle);
    if (singleCode) {
      const rowMappedType = normalizeSheetType((patient as any).__serviceTypeSingle);
      if (rowMappedType) return new Set<string>([rowMappedType]);
      const mapped = normalizeSheetType(serviceCodeToType.get(singleCode));
      if (mapped) {
        const set = new Set<string>([mapped]);
        if (mapped === "pentacam_center" || mapped === "pentacam_external") set.add("pentacam");
        if (mapped === "surgery_external") set.add("surgery");
        return set;
      }
      const singleType = normalizeSheetType((patient as any).__serviceTypeSingle ?? patient?.serviceType ?? "consultant");
      return new Set<string>([singleType || "consultant"]);
    }
    const codes = [
      ...((Array.isArray(patient?.serviceCodes) ? patient.serviceCodes : []) as unknown[]),
      patient?.serviceCode,
    ]
      .map((v) => normalizeServiceCode(v))
      .filter(Boolean);
    const types = new Set<string>();
    for (const code of codes) {
      const mapped = normalizeSheetType(serviceCodeToType.get(code));
      if (mapped) {
        types.add(mapped);
        if (mapped === "pentacam_center" || mapped === "pentacam_external") types.add("pentacam");
        if (mapped === "surgery_external") types.add("surgery");
      }
    }
    if (types.size === 0) {
      const fallback = normalizeSheetType(patient?.serviceType ?? "consultant");
      if (fallback) {
        types.add(fallback);
        if (fallback === "pentacam_center" || fallback === "pentacam_external") types.add("pentacam");
        if (fallback === "surgery_external") types.add("surgery");
      }
    }
    return types;
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    const data = (userStateQuery.data as any)?.data;
    if (!data) return;
    if (data.searchTerm !== undefined) setSearchTerm(data.searchTerm ?? "");
    if (data.activeTab !== undefined) {
      const nextTab = String(data.activeTab ?? "consultant");
      const allowedTabs = new Set([
        "consultant",
        "specialist",
        "pentacam",
        "pentacam_center",
        "pentacam_external",
        "lasik",
        "external",
        "surgery",
        "surgery_external",
      ]);
      setActiveTab(allowedTabs.has(nextTab) ? nextTab : "consultant");
    }
  }, [userStateQuery.data]);

  useEffect(() => {
    if (userStateTimerRef.current) clearTimeout(userStateTimerRef.current);
    userStateTimerRef.current = setTimeout(() => {
      const payload = { searchTerm, activeTab, mode: "print-only" };
      saveUserStateMutation.mutate({ page: "patients", data: payload });
    }, 600);
    return () => {
      if (userStateTimerRef.current) clearTimeout(userStateTimerRef.current);
    };
  }, [searchTerm, activeTab, saveUserStateMutation]);

  if (!isAuthenticated) return null;

  const getCurrentPatients = () => {
    const combined = [...patientsFromDb, ...allPatients];
    const term = debouncedSearchTerm.trim().toLowerCase();
    const splitByService = true;
    const parseUserDateInput = (rawInput: string): Date | null => {
      const raw = normalizeTypedDateInput(rawInput);
      if (!raw) return null;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
        const [dd, mm, yyyy] = raw.split("/");
        const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
        return Number.isNaN(d.valueOf()) ? null : d;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const d = new Date(`${raw}T00:00:00`);
        return Number.isNaN(d.valueOf()) ? null : d;
      }
      return null;
    };
    const parseDate = (value: any): Date | null => {
      if (!value) return null;
      if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
      const raw = String(value).trim();
      if (!raw) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const d = new Date(`${raw}T00:00:00`);
        return Number.isNaN(d.valueOf()) ? null : d;
      }
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
        const [dd, mm, yyyy] = raw.split("/");
        const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
        return Number.isNaN(d.valueOf()) ? null : d;
      }
      const d = new Date(raw);
      return Number.isNaN(d.valueOf()) ? null : d;
    };
    const fromDate = parseUserDateInput(dateFrom);
    const toDate = (() => {
      const d = parseUserDateInput(dateTo);
      if (!d) return null;
      d.setHours(23, 59, 59, 999);
      return d;
    })();

    let filtered = combined.filter((p) => {
      const fullName = String(p.fullName ?? "").toLowerCase();
      const code = String(p.patientCode ?? "").toLowerCase();
      const phone = String(p.phone ?? "").toLowerCase();
      const nationalId = String(p.nationalId ?? "").toLowerCase();
      const treatingDoctor = String((p as any).treatingDoctor ?? "").toLowerCase();
      const rawServiceCodes = [
        ...((Array.isArray((p as any).serviceCodes) ? (p as any).serviceCodes : []) as unknown[]),
        (p as any).serviceCode,
      ]
        .map((v) => String(v ?? "").trim())
        .filter(Boolean);
      const serviceCode = rawServiceCodes.join(" ").toLowerCase();
      const mappedServiceName = rawServiceCodes
        .map((code) => String(serviceCodeToLabel.get(normalizeServiceCode(code)) ?? ""))
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const serviceTypeRaw = String((p as any).serviceType ?? "").toLowerCase();
      const serviceTypeLabel = (() => {
        if (serviceTypeRaw === "consultant") return "استشاري";
        if (serviceTypeRaw === "specialist") return "اخصائي";
        if (serviceTypeRaw === "pentacam" || serviceTypeRaw === "pentacam_center" || serviceTypeRaw === "pentacam_external") return "بنتاكام";
        if (serviceTypeRaw === "lasik") return "فحوصات الليزك";
        if (serviceTypeRaw === "external") return "خارجي";
        if (serviceTypeRaw === "surgery") return "عمليات";
        return "";
      })();
      const matchesTerm =
        !term ||
        fullName.includes(term) ||
        code.includes(term) ||
        phone.includes(term) ||
        nationalId.includes(term) ||
        treatingDoctor.includes(term) ||
        serviceCode.includes(term) ||
        mappedServiceName.includes(term) ||
        serviceTypeRaw.includes(term) ||
        serviceTypeLabel.includes(term);

      const patientDate = parseDate((p as any).lastVisit);
      const matchesFrom = !fromDate || (patientDate && patientDate >= fromDate);
      const matchesTo = !toDate || (patientDate && patientDate <= toDate);

      return matchesTerm && matchesFrom && matchesTo;
    });
    const toNumber = (value: any) => {
      const raw = String(value ?? "").trim();
      const num = Number(raw.replace(/[^\d]/g, ""));
      return Number.isFinite(num) ? num : Number.MAX_SAFE_INTEGER;
    };
    const sorted = filtered.sort((a, b) => {
      const aNum = toNumber(a.patientCode);
      const bNum = toNumber(b.patientCode);
      if (aNum !== bNum) return aNum - bNum;
      const aCode = String(a.patientCode ?? "");
      const bCode = String(b.patientCode ?? "");
      return aCode.localeCompare(bCode, "ar");
    });
    if (!splitByService) return sorted;
    return sorted.flatMap((patient) => {
      const codes = Array.from(
        new Set(
          [
            ...((Array.isArray((patient as any)?.serviceCodes) ? (patient as any).serviceCodes : []) as unknown[]),
            (patient as any)?.serviceCode,
          ]
            .map((v) => normalizeServiceCode(v))
            .filter(Boolean)
        )
      );
      if (codes.length === 0) {
        return [{ ...patient, __rowKey: `${patient.id}-no-service` }];
      }
      const rowCodes = (() => {
        if (!term) return codes;
        const matched = codes.filter((srvCode) => {
          return matchesServiceCodeOrNameTerm(
            term,
            String(srvCode ?? ""),
            String(serviceCodeToLabel.get(srvCode) ?? "")
          );
        });
        return matched.length > 0 ? matched : codes;
      })();
      return rowCodes.map((srvCode, idx) => ({
        ...patient,
        __serviceCodeSingle: srvCode,
        __serviceNameSingle: String(serviceCodeToLabel.get(srvCode) ?? "").trim(),
        __serviceTypeSingle: normalizeSheetType(
          (patient as any)?.serviceSheetTypeByCode?.[srvCode] ?? serviceCodeToType.get(srvCode) ?? ""
        ),
        __rowKey: `${patient.id}-${srvCode}-${idx}`,
      }));
    });
  };

  const formatDisplayDate = (value: any) => {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.valueOf())) return "";
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const getSheetUrl = (serviceType: string, patientId: number) => {
    const sheetMap: Record<string, string> = {
      consultant: `/sheets/consultant/${patientId}`,
      specialist: `/sheets/specialist/${patientId}`,
      pentacam: `/sheets/pentacam/${patientId}`,
      pentacam_center: `/sheets/pentacam/${patientId}`,
      pentacam_external: `/sheets/external/${patientId}`,
      lasik: `/sheets/lasik/${patientId}`,
      external: `/sheets/external/${patientId}`,
      surgery: `/sheets/operation/${patientId}`,
      surgery_center: `/sheets/operation/${patientId}`,
      surgery_external: `/sheets/external/${patientId}`,
      refraction: `/refraction/${patientId}`,
    };
    return sheetMap[serviceType];
  };

  const handleOpenSheet = (serviceType: string, patientId: number) => {
    const url = getSheetUrl(serviceType, patientId);
    if (!url) return;
    setLocation(url);
  };

  const handlePrintSheet = (serviceType: string, patientId: number) => {
    const url = getSheetUrl(serviceType, patientId);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const getRefractionUrl = (patientId: number) => `/refraction/${patientId}`;

  const handleOpenRefraction = (patientId: number) => {
    setLocation(getRefractionUrl(patientId));
  };

  const handlePrintRefraction = (patientId: number) => {
    window.open(`${getRefractionUrl(patientId)}?autoprint=1`, "_blank", "noopener,noreferrer");
  };

  const getFollowupUrl = (serviceType: string, patientId: number) => {
    const normalized = normalizeSheetType(serviceType);
    if (normalized === "consultant") return `/sheets/consultant/${patientId}/followup`;
    if (normalized === "lasik") return `/sheets/lasik/${patientId}/followup`;
    return getSheetUrl(serviceType, patientId);
  };

  const handleOpenFollowup = (serviceType: string, patientId: number) => {
    const url = getFollowupUrl(serviceType, patientId);
    if (!url) return;
    setLocation(url);
  };

  const currentPatients = getCurrentPatients();
  const tabFilteredPatients = currentPatients.filter((patient) => {
    const serviceTypes = resolveServiceTypes(patient);
    return serviceTypes.has(activeTab);
  });
  const filteredPatients = (debouncedSearchTerm || showFilters) ? tabFilteredPatients : [];
  const filteredRowKeys = filteredPatients.map((p) => getPatientRowKey(p));
  const isAllSelected =
    filteredRowKeys.length > 0 && filteredRowKeys.every((key) => selectedRowKeys.has(key));

  const tabsConfig = [
    { value: "consultant", label: "استشاري" },
    { value: "specialist", label: "اخصائي" },
    { value: "pentacam", label: "بنتاكام" },
    { value: "pentacam_center", label: "بنتاكام مركز" },
    { value: "pentacam_external", label: "بنتاكام خارجي" },
    { value: "lasik", label: "فحوصات الليزك" },
    { value: "external", label: "خارجي" },
    { value: "surgery", label: "عمليات" },
    { value: "surgery_external", label: "عمليات خارجي" },
  ];


  const resetForm = () => {
    setFormData({
      fullName: "",
      patientCode: "",
      phone: "",
      age: "",
      nationalId: "",
      serviceType: "",
    });
  };

  const formatDate = (value?: string | Date | null) => {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.valueOf())) return "";
    return date.toISOString().split("T")[0];
  };

  const handleTransferToSheet = async (
    sheetType:
      | "consultant"
      | "specialist"
      | "lasik"
      | "external"
      | "surgery"
      | "surgery_external"
      | "pentacam_center"
      | "pentacam_external"
  ) => {
    if (!selectedPatient?.id) {
      toast.error("يرجى اختيار مريض أولاً");
      return;
    }
    await updatePatientMutation.mutateAsync({
      patientId: selectedPatient.id,
      updates: {
        serviceType: sheetType,
      },
    });
    const existingState = await utils.medical.getPatientPageState
      .fetch({ patientId: selectedPatient.id, page: "examination" })
      .catch(() => null);
    const existingData =
      existingState && typeof (existingState as any).data === "object" && (existingState as any).data
        ? ((existingState as any).data as Record<string, any>)
        : {};
    await savePatientStateMutation.mutateAsync({
      patientId: selectedPatient.id,
      page: "examination",
      data: {
        ...existingData,
        syncLockManual: true,
        manualEditedAt: new Date().toISOString(),
        serviceCode: "",
        serviceCodes: [],
      },
    });

    const payload = {
      formData: {
        patientName: selectedPatient.fullName ?? "",
        dateOfBirth: formatDate(selectedPatient.dateOfBirth),
        age: selectedPatient.age != null ? String(selectedPatient.age) : "",
        address: selectedPatient.address ?? "",
        phone: selectedPatient.phone ?? "",
        occupation: selectedPatient.occupation ?? "",
      },
    };
    if (
      sheetType !== "surgery" &&
      sheetType !== "surgery_external" &&
      sheetType !== "pentacam_center" &&
      sheetType !== "pentacam_external"
    ) {
      await saveSheetMutation.mutateAsync({
        patientId: selectedPatient.id,
        sheetType,
        content: JSON.stringify(payload),
      });
    }
    const url = getSheetUrl(sheetType, selectedPatient.id);
    if (url) setLocation(url);
  };

  const openEditDialog = (patient: any) => {
    setEditingPatientId(patient.id);
    setFormData({
      fullName: patient.fullName ?? "",
      patientCode: patient.patientCode ?? "",
      phone: patient.phone ?? "",
      age: patient.age ? String(patient.age) : "",
      nationalId: patient.nationalId ?? "",
      serviceType: patient.serviceType ?? "",
    });
    setIsEditOpen(true);
  };


  const handleUpdatePatient = () => {
    if (!editingPatientId) return;
    if (!formData.fullName.trim()) {
      toast.error("الاسم الكامل مطلوب");
      return;
    }
    if (!formData.phone.trim()) {
      toast.error("رقم الهاتف مطلوب");
      return;
    }

    updatePatientMutation
      .mutateAsync({
        patientId: editingPatientId,
        updates: {
          patientCode: formData.patientCode.trim(),
          fullName: formData.fullName.trim(),
          phone: formData.phone.trim(),
          age: formData.age ? Number(formData.age) : undefined,
          nationalId: formData.nationalId.trim(),
          serviceType: formData.serviceType || undefined,
        },
      })
      .then(() => {
        toast.success("تم تحديث بيانات المريض");
        setIsEditOpen(false);
        setEditingPatientId(null);
        resetForm();
      })
      .catch(() => {
        toast.error("حدث خطأ أثناء تحديث المريض");
      });
  };

  const handleDeletePatient = (patientId: number) => {
    if (!window.confirm("هل أنت متأكد من حذف المريض؟")) return;
    deletePatientMutation
      .mutateAsync({ patientId })
      .then(() => toast.success("تم حذف المريض"))
      .catch(() => toast.error("حدث خطأ أثناء حذف المريض"));
  };

  const handleSelectPatientForForm = (patient: any) => {
    setSelectedPatient(patient);
    setPatientDraft({
      patientCode: patient.patientCode ?? "",
      fullName: patient.fullName ?? "",
      dateOfBirth: formatDate(patient.dateOfBirth),
      age: patient.age != null ? String(patient.age) : "",
      address: patient.address ?? "",
      phone: patient.phone ?? "",
      occupation: patient.occupation ?? "",
    });
  };

  const handleSavePatientFromForm = async () => {
    if (!patientDraft.fullName.trim()) {
      toast.error("الاسم الكامل مطلوب");
      return;
    }
    if (!patientDraft.phone.trim()) {
      toast.error("رقم الهاتف مطلوب");
      return;
    }

    if (selectedPatient?.id) {
      await updatePatientMutation.mutateAsync({
        patientId: selectedPatient.id,
        updates: {
          patientCode: patientDraft.patientCode.trim(),
          fullName: patientDraft.fullName.trim(),
          phone: patientDraft.phone.trim(),
          age: patientDraft.age ? Number(patientDraft.age) : undefined,
          dateOfBirth: patientDraft.dateOfBirth || undefined,
          address: patientDraft.address.trim(),
          occupation: patientDraft.occupation.trim(),
        },
      });
      toast.success("تم تحديث بيانات المريض");
      patientsQuery.refetch();
      return;
    }

    await createPatientMutation.mutateAsync({
      patientCode: patientDraft.patientCode.trim() || undefined,
      fullName: patientDraft.fullName.trim(),
      phone: patientDraft.phone.trim(),
      age: patientDraft.age ? Number(patientDraft.age) : undefined,
      dateOfBirth: patientDraft.dateOfBirth || undefined,
      address: patientDraft.address.trim(),
      occupation: patientDraft.occupation.trim(),
      branch: "examinations",
      serviceType: toLegacyServiceType(selectedSheetType || "consultant"),
    });
    setActiveTab(normalizeSheetType(selectedSheetType || "consultant") || "consultant");
    toast.success("تم إضافة المريض");
    setPatientDraft({
      patientCode: "",
      fullName: "",
      dateOfBirth: "",
      age: "",
      address: "",
      phone: "",
      occupation: "",
    });
    setSelectedPatient(null);
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl" style={{ direction: "rtl", textAlign: "center" }}>
      {/* Header */}
      <PageHeader backTo="/dashboard" />
      <Dialog open={importPreviewOpen} onOpenChange={setImportPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Import Preview</DialogTitle>
            <DialogDescription>
              {importSummary
                ? `Total: ${importSummary.total}, Valid: ${importSummary.valid}, Invalid: ${importSummary.invalid}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[420px] overflow-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="p-2 text-right">Row</th>
                  <th className="p-2 text-right">Code</th>
                  <th className="p-2 text-right">Name</th>
                  <th className="p-2 text-right">Status</th>
                  <th className="p-2 text-right">Errors</th>
                </tr>
              </thead>
              <tbody>
                {importPreviewRows.map((r) => (
                  <tr key={`${r.rowNumber}-${r.patientCode}`} className="border-t">
                    <td className="p-2">{r.rowNumber}</td>
                    <td className="p-2">{r.patientCode}</td>
                    <td className="p-2">{r.fullName}</td>
                    <td className="p-2">{r.status}</td>
                    <td className="p-2 text-xs text-destructive">{(r.errors ?? []).join(" | ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={downloadInvalidImportCsv}>
              Download Error CSV
            </Button>
            <Button type="button" onClick={applyStagedImport} disabled={applyImportMutation.isPending}>
              {applyImportMutation.isPending ? "Applying..." : "Apply Valid Rows"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Search and Add */}
        <div className="mb-6 flex flex-wrap items-center justify-end gap-2 md:gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowFilters((prev) => !prev)}
          >
            {showFilters ? "إخفاء الفلاتر" : "عرض الفلاتر"}
          </Button>
          <div className="relative w-full sm:w-[340px] md:w-[520px]">
            <Search className="absolute right-3 top-3 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="ابحث عن المريض..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10 text-right"
              dir="rtl"
            />
          </div>
          <div className="flex w-full sm:w-auto flex-wrap items-center justify-end gap-2">
            <span className="text-sm text-muted-foreground">From (Open Date)</span>
            <Input
              type="text"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              onBlur={(e) => setDateFrom(normalizeTypedDateInput(e.target.value))}
              className="w-[140px] sm:w-[150px]"
              placeholder="DD/MM/YYYY"
              dir="ltr"
            />
            <span className="text-sm text-muted-foreground">To (Open Date)</span>
            <Input
              type="text"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              onBlur={(e) => setDateTo(normalizeTypedDateInput(e.target.value))}
              className="w-[140px] sm:w-[150px]"
              placeholder="DD/MM/YYYY"
              dir="ltr"
            />
          </div>
          {user?.role === "admin" && (
            <>
              <input
                type="file"
                ref={fileInputRef}
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleImportPatients}
              />
              <Select value={importDateFormat} onValueChange={(v) => setImportDateFormat(v as "" | "DMY" | "MDY")}>
                <SelectTrigger className="w-full sm:w-[210px]">
                  <SelectValue placeholder="Excel Date Format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DMY">DD/MM/YYYY</SelectItem>
                  <SelectItem value="MDY">MM/DD/YYYY</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="w-full sm:w-auto gap-2 whitespace-normal text-xs sm:text-sm"
              >
                <Upload className="h-4 w-4" />
                استيراد من Excel
              </Button>
            </>
          )}
        </div>

        <div className="flex gap-4">
          {/* Patients List */}
          <div className="flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={(checked) => {
                    if (!checked) {
                      setSelectedRowKeys((prev) => {
                        const next = new Set(prev);
                        filteredRowKeys.forEach((key) => next.delete(key));
                        return next;
                      });
                      return;
                    }
                    setSelectedRowKeys((prev) => {
                      const next = new Set(prev);
                      filteredRowKeys.forEach((key) => next.add(key));
                      return next;
                    });
                  }}
                />
                <span>تحديد الكل</span>
              </label>
                  <Select value={bulkSheetType} onValueChange={(v) => setBulkSheetType(v as any)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="اختر الشيت" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="consultant">استشاري</SelectItem>
                  <SelectItem value="specialist">اخصائي</SelectItem>
                  <SelectItem value="pentacam_center">بنتاكام مركز</SelectItem>
                  <SelectItem value="pentacam_external">بنتاكام خارجي</SelectItem>
                  <SelectItem value="lasik">فحوصات الليزك</SelectItem>
                  <SelectItem value="external">خارجي</SelectItem>
                  <SelectItem value="surgery">عمليات</SelectItem>
                  <SelectItem value="surgery_external">عمليات خارجي</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={async () => {
                  const selectedRows = filteredPatients.filter((p) =>
                    selectedRowKeys.has(getPatientRowKey(p))
                  );
                  if (selectedRows.length === 0) {
                    toast.error("Select at least one patient first");
                    return;
                  }
                  const rowsWithoutService = selectedRows.filter((row) => {
                    const code = normalizeServiceCode((row as any).__serviceCodeSingle || (row as any).serviceCode);
                    return !code;
                  });
                  const idsWithoutService = Array.from(
                    new Set(rowsWithoutService.map((row) => Number(row.id)).filter((id) => Number.isFinite(id)))
                  );
                  try {
                    for (const row of selectedRows) {
                      const id = Number(row.id);
                      if (!id) continue;
                      const rowServiceCode = normalizeServiceCode(
                        (row as any).__serviceCodeSingle || (row as any).serviceCode
                      );
                      const existingState = await utils.medical.getPatientPageState
                        .fetch({ patientId: id, page: "examination" })
                        .catch(() => null);
                      const existingData =
                        existingState && typeof (existingState as any).data === "object" && (existingState as any).data
                          ? ((existingState as any).data as Record<string, any>)
                          : {};
                      const serviceSheetTypeByCode =
                        existingData && typeof (existingData as any).serviceSheetTypeByCode === "object"
                          ? { ...(existingData as any).serviceSheetTypeByCode }
                          : {};
                      if (rowServiceCode) {
                        serviceSheetTypeByCode[rowServiceCode] = bulkSheetType;
                      }
                      await savePatientStateMutation.mutateAsync({
                        patientId: id,
                        page: "examination",
                        data: {
                          ...existingData,
                          syncLockManual: true,
                          manualEditedAt: new Date().toISOString(),
                          ...(rowServiceCode ? { serviceSheetTypeByCode } : {}),
                        },
                      });
                    }
                    if (idsWithoutService.length > 0) {
                      await bulkAssignSheetMutation.mutateAsync({
                        patientIds: idsWithoutService,
                        sheetType: toLegacyServiceType(bulkSheetType),
                      });
                    }
                    toast.success("Sheet type updated");
                    await patientsQuery.refetch();
                  } catch (error: any) {
                    const code = String(error?.data?.code ?? "");
                    if (code === "FORBIDDEN" || code === "UNAUTHORIZED") {
                      // Fallback for reception accounts that can update patient rows directly.
                      for (const id of idsWithoutService) {
                        await updatePatientMutation.mutateAsync({
                          patientId: id,
                          updates: { serviceType: toLegacyServiceType(bulkSheetType) },
                        });
                        const existingState = await utils.medical.getPatientPageState
                          .fetch({ patientId: id, page: "examination" })
                          .catch(() => null);
                        const existingData =
                          existingState && typeof (existingState as any).data === "object" && (existingState as any).data
                            ? ((existingState as any).data as Record<string, any>)
                            : {};
                        await savePatientStateMutation.mutateAsync({
                          patientId: id,
                          page: "examination",
                          data: {
                            ...existingData,
                            syncLockManual: true,
                            manualEditedAt: new Date().toISOString(),
                            serviceCode: "",
                            serviceCodes: [],
                          },
                        });
                      }
                      toast.success("Sheet type updated");
                      await patientsQuery.refetch();
                    } else {
                      throw error;
                    }
                  }
                }}
              >
                نقل للشيت
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  filteredPatients
                    .filter((p) => selectedRowKeys.has(getPatientRowKey(p)))
                    .forEach((row) => handlePrintSheet(activeTab, Number(row.id)));
                }}
              >
                طباعة
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const rows = filteredPatients.filter((p) =>
                    selectedRowKeys.has(getPatientRowKey(p))
                  );
                  if (rows.length === 0) {
                    toast.error("اختر مرضى للتصدير أولاً");
                    return;
                  }

                  const byDoctor = new Map<string, any[]>();
                  for (const patient of rows) {
                    const doctorName = String((patient as any).treatingDoctor ?? "").trim() || "بدون طبيب";
                    if (!byDoctor.has(doctorName)) byDoctor.set(doctorName, []);
                    byDoctor.get(doctorName)!.push(patient);
                  }

                  const safeName = (value: string) =>
                    value
                      .replace(/[<>:"/\\|?*]+/g, "_")
                      .replace(/\s+/g, "_")
                      .replace(/_+/g, "_")
                      .replace(/^_+|_+$/g, "") || "Doctor";

                  const workbook = XLSX.utils.book_new();
                  const usedSheetNames = new Set<string>();
                  const makeUniqueSheetName = (base: string) => {
                    const trimmed = base.slice(0, 31) || "Doctor";
                    if (!usedSheetNames.has(trimmed)) {
                      usedSheetNames.add(trimmed);
                      return trimmed;
                    }
                    let i = 2;
                    while (true) {
                      const suffix = `_${i}`;
                      const candidate = `${trimmed.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
                      if (!usedSheetNames.has(candidate)) {
                        usedSheetNames.add(candidate);
                        return candidate;
                      }
                      i += 1;
                    }
                  };

                  for (const [doctorName, doctorRows] of byDoctor.entries()) {
                    const exportRows = doctorRows.map((p: any) => ({
                      patientCode: p.patientCode,
                      fullName: p.fullName,
                      phone: p.phone,
                      age: p.age,
                      gender: p.gender,
                      nationalId: p.nationalId,
                      address: p.address,
                      lastVisit: p.lastVisit,
                      serviceType: p.serviceType,
                      locationType: p.locationType,
                      doctor: (p as any).treatingDoctor ?? "",
                    }));
                    const ws = XLSX.utils.json_to_sheet(exportRows);
                    const sheetName = makeUniqueSheetName(safeName(doctorName));
                    XLSX.utils.book_append_sheet(workbook, ws, sheetName);
                  }

                  XLSX.writeFile(workbook, "patients_by_doctor.xlsx");
                  toast.success(`تم تصدير ملف واحد بعدد ${byDoctor.size} شيت (طبيب)`);
                }}
              >
                تصدير
              </Button>
              {user?.role === "admin" && (
                <Button
                  variant="destructive"
                  onClick={async () => {
                    if (!window.confirm("هل أنت متأكد من حذف المرضى المحددين؟")) return;
                    const ids = Array.from(
                      new Set(
                        filteredPatients
                          .filter((p) => selectedRowKeys.has(getPatientRowKey(p)))
                          .map((p) => Number(p.id))
                          .filter((id) => Number.isFinite(id))
                      )
                    );
                    for (const id of ids) {
                      await deletePatientMutation.mutateAsync({ patientId: id });
                    }
                    setSelectedRowKeys(new Set());
                  }}
                >
                  حذف
                </Button>
              )}
            </div>
            {showFilters && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {tabsConfig.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setActiveTab(tab.value)}
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm border ${
                      activeTab === tab.value ? "border-primary text-primary bg-primary/5" : "border-muted"
                    }`}
                  >
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            )}
            <PatientsTable
              patients={filteredPatients}
              serviceType={activeTab}
              serviceCodeToLabel={serviceCodeToLabel}
              serviceCodeToType={serviceCodeToType}
              onOpenRefraction={handleOpenRefraction}
              onPrintRefraction={handlePrintRefraction}
              onOpenFollowup={handleOpenFollowup}
              onOpenSheet={handleOpenSheet}
              onPrintSheet={handlePrintSheet}
              onDeletePatient={handleDeletePatient}
              onEditPatient={openEditDialog}
              user={user}
              selectedRowKeys={selectedRowKeys}
              onToggleSelect={(rowKey, checked) => {
                setSelectedRowKeys((prev) => {
                  const next = new Set(prev);
                  if (checked) next.add(rowKey);
                  else next.delete(rowKey);
                  return next;
                });
              }}
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-muted-foreground">
                Page {currentPage}
              </div>
              <div className="flex items-center gap-2">
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25 / page</SelectItem>
                    <SelectItem value="50">50 / page</SelectItem>
                    <SelectItem value="100">100 / page</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (cursorHistory.length === 0) return;
                    const prev = [...cursorHistory];
                    const previousCursor = prev.pop() ?? null;
                    setCursorHistory(prev);
                    setCursor(previousCursor);
                  }}
                  disabled={cursorHistory.length === 0}
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!nextCursor) return;
                    setCursorHistory((prev) => [...prev, cursor]);
                    setCursor(nextCursor);
                  }}
                  disabled={!hasMore || !nextCursor}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

const formatDisplayDate = (value: any) => {
  if (!value) return "";
  const raw = String(value).trim();
  // If already dd/mm/yyyy, return as-is
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  // If ISO yyyy-mm-dd, convert
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [yyyy, mm, dd] = raw.split("-");
    return `${dd}/${mm}/${yyyy}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

function PatientsTable({
  patients,
  serviceType,
  serviceCodeToLabel,
  serviceCodeToType,
  onOpenRefraction,
  onPrintRefraction,
  onOpenFollowup,
  onOpenSheet,
  onPrintSheet,
  onDeletePatient,
  onEditPatient,
  user,
  selectedRowKeys,
  onToggleSelect,
}: {
  patients: any[];
  serviceType: string;
  serviceCodeToLabel: Map<string, string>;
  serviceCodeToType: Map<string, string>;
  onOpenRefraction: (patientId: number) => void;
  onPrintRefraction: (patientId: number) => void;
  onOpenFollowup: (serviceType: string, patientId: number) => void;
  onOpenSheet: (serviceType: string, patientId: number) => void;
  onPrintSheet: (serviceType: string, patientId: number) => void;
  onDeletePatient: (patientId: number) => void;
  onEditPatient: (patient: any) => void;
  user: any;
  selectedRowKeys: Set<string>;
  onToggleSelect: (rowKey: string, checked: boolean) => void;
}) {
  const canEditPatients = user?.role === "admin" || user?.role === "manager" || user?.role === "reception";
  const getPatientRowKey = (patient: any) =>
    String(
      (patient as any).__rowKey ??
        `${patient.id}-${normalizeServiceCode((patient as any).__serviceCodeSingle || (patient as any).serviceCode || "base")}`
    );
  if (patients.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          لا توجد بيانات مرضى في هذا القسم
        </CardContent>
      </Card>
    );
  }

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
    mq.addListener(apply);
    return () => mq.removeListener(apply);
  }, []);

  const getServiceLabel = (value: string) => {
    const key = normalizeSheetType(value);
    if (key === "consultant") return "استشاري";
    if (key === "specialist") return "اخصائي";
    if (key === "pentacam" || key === "pentacam_center" || key === "pentacam_external") return "بنتاكام";
    if (key === "lasik") return "فحوصات الليزك";
    if (key === "external") return "خارجي";
    if (key === "surgery") return "عمليات";
    return value || "-";
  };
  const getSheetTypeLabel = (value: string) => {
    const raw = String(value ?? "").trim().toLowerCase();
    if (raw === "surgery_external") return "عمليات خارجي";
    const key = normalizeSheetType(value);
    if (key === "consultant") return "استشاري";
    if (key === "specialist") return "اخصائي";
    if (key === "pentacam_center") return "بنتاكام مركز";
    if (key === "pentacam_external") return "بنتاكام خارجي";
    if (key === "lasik") return "فحوصات الليزك";
    if (key === "external") return "خارجي";
    if (key === "surgery") return "عمليات";
    return value || "-";
  };
  const getServiceDisplay = (patient: any) => {
    const singleName = String((patient as any)?.__serviceNameSingle ?? "").trim();
    if (singleName) return singleName;
    const singleCode = normalizeServiceCode((patient as any)?.__serviceCodeSingle);
    if (singleCode) {
      const mapped = String(serviceCodeToLabel.get(singleCode) ?? "").trim();
      if (mapped) return mapped;
    }
    const codes = [
      ...((Array.isArray(patient?.serviceCodes) ? patient.serviceCodes : []) as unknown[]),
      patient?.serviceCode,
    ]
      .map((v) => normalizeServiceCode(v))
      .filter(Boolean);
    if (codes.length > 0) {
      const names = Array.from(
        new Set(
          codes
            .map((code) => String(serviceCodeToLabel.get(code) ?? "").trim())
            .filter(Boolean)
        )
      );
      if (names.length > 0) return names.join(" / ");
    }
    return getServiceLabel(String(patient?.serviceType ?? ""));
  };
  const getRowSheetType = (patient: any) => {
    const singleCode = normalizeServiceCode((patient as any)?.__serviceCodeSingle);
    if (singleCode) {
      const mapped = normalizeSheetType((patient as any)?.serviceSheetTypeByCode?.[singleCode]);
      if (mapped) return mapped;
      const defaultType = normalizeSheetType(serviceCodeToType.get(singleCode));
      if (defaultType) return defaultType;
    }
    const singleType = normalizeSheetType((patient as any)?.__serviceTypeSingle);
    if (singleType) return singleType;
    const fallback = normalizeSheetType(patient?.serviceType ?? serviceType);
    return fallback || serviceType;
  };
  const getRowSheetSource = (patient: any): "manual" | "default" | "fallback" => {
    const singleCode = normalizeServiceCode((patient as any)?.__serviceCodeSingle);
    if (singleCode) {
      const manual = normalizeSheetType((patient as any)?.serviceSheetTypeByCode?.[singleCode]);
      if (manual) return "manual";
      const byDefault = normalizeSheetType(serviceCodeToType.get(singleCode));
      if (byDefault) return "default";
    }
    return "fallback";
  };
  const getSheetSourceLabel = (source: "manual" | "default" | "fallback") => {
    if (source === "manual") return "يدوي";
    if (source === "default") return "افتراضي";
    return "عام";
  };

  if (isMobile) {
    return (
      <div className="mt-1 space-y-2">
        {patients.map((patient) => {
          const serviceLabel = getServiceDisplay(patient);
          const displayCode = patient.patientCode
            ? /^\d+$/.test(String(patient.patientCode))
              ? String(patient.patientCode).padStart(4, "0")
              : String(patient.patientCode)
            : "";
          return (
            <Card key={String((patient as any).__rowKey ?? patient.id)}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedRowKeys.has(getPatientRowKey(patient))}
                      onCheckedChange={(checked) => onToggleSelect(getPatientRowKey(patient), Boolean(checked))}
                    />
                    <span className="text-xs text-muted-foreground">تحديد</span>
                  </label>
                  <span
                    className="px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-700"
                  >
                    {serviceLabel}
                  </span>
                </div>

                <div className="text-sm font-semibold break-words">{patient.fullName}</div>

                <div className="grid grid-cols-2 gap-1 text-xs">
                  <div className="text-muted-foreground">الكود</div>
                  <div dir="ltr" className="text-right">{displayCode || "-"}</div>
                  <div className="text-muted-foreground">الدكتور</div>
                  <div className="text-right">{String((patient as any).treatingDoctor ?? "").trim() || "-"}</div>
                  <div className="text-muted-foreground">الخدمة</div>
                  <div className="text-right">{serviceLabel}</div>
                  <div className="text-muted-foreground">نوع الشيت</div>
                  <div className="text-right">
                    <span>{getSheetTypeLabel(getRowSheetType(patient))}</span>
                    <span className="mr-2 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {getSheetSourceLabel(getRowSheetSource(patient))}
                    </span>
                  </div>
                  <div className="text-muted-foreground">تاريخ فتح الملف</div>
                  <div dir="ltr" className="text-right">{patient.lastVisit ? formatDisplayDate(patient.lastVisit) : ""}</div>
                </div>

                <div className="flex items-center justify-end gap-1 pt-1">
                  {canEditPatients && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenFollowup(getRowSheetType(patient), patient.id);
                      }}
                    >
                      متابعة
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenRefraction(patient.id);
                    }}
                  >
                    مقاس
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(event) => {
                      event.stopPropagation();
                      onPrintRefraction(patient.id);
                    }}
                  >
                    طباعة مقاس
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenSheet(getRowSheetType(patient), patient.id);
                    }}
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                  {canEditPatients && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation();
                        onEditPatient(patient);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(event) => {
                      event.stopPropagation();
                      onPrintSheet(getRowSheetType(patient), patient.id);
                    }}
                  >
                    <Printer className="h-4 w-4" />
                  </Button>
                  {user?.role === "admin" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeletePatient(patient.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  return (
        <Card className="mt-1">
          <CardContent className="pt-6">
            <div className="w-full overflow-x-auto patients-table-wrap">
                <table className="patients-table min-w-[840px] w-max table-auto text-center text-xs md:text-sm" dir="rtl">
                <colgroup>
                  <col className="w-[44px]" />
                  <col className="w-[72px]" />
                  <col className="w-[190px]" />
                  <col className="w-[130px]" />
                  <col className="w-[105px]" />
                  <col className="w-[120px]" />
                  <col className="w-[118px]" />
                  <col className="w-[250px]" />
                </colgroup>
                <thead>
                  <tr className="border-b">
                  <th className="text-center py-0 px-0.5 whitespace-nowrap">تحديد</th>
                  <th className="text-center py-0 px-0.5 whitespace-nowrap">الكود</th>
                  <th className="text-center py-0 px-0.5 whitespace-nowrap">الاسم</th>
                  <th className="text-center py-0 px-0.5 whitespace-nowrap">الدكتور</th>
                  <th className="text-center py-0 px-0.5 whitespace-nowrap">الخدمة</th>
                  <th className="text-center py-0 px-0.5 whitespace-nowrap">نوع الشيت</th>
                  <th className="text-center py-0 px-0.5 whitespace-nowrap">تاريخ فتح الملف</th>
                  <th className="text-center py-0 px-0.5 whitespace-nowrap">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((patient) => (
                <tr
                  key={String((patient as any).__rowKey ?? patient.id)}
                  className="border-b hover:bg-muted/50"
                >
                  <td className="py-0 px-0.5 text-center" dir="ltr">
                    <Checkbox
                      checked={selectedRowKeys.has(getPatientRowKey(patient))}
                      onCheckedChange={(checked) => onToggleSelect(getPatientRowKey(patient), Boolean(checked))}
                    />
                  </td>
                  <td className="py-0 px-0.5 text-center" dir="ltr">
                    {patient.patientCode
                      ? (/^\d+$/.test(String(patient.patientCode))
                        ? String(patient.patientCode).padStart(4, "0")
                        : patient.patientCode)
                      : ""}
                  </td>
                  <td className="py-0 px-0.5 text-center break-words">{patient.fullName}</td>
                  <td className="py-0 px-0.5 text-center break-words">
                    {String((patient as any).treatingDoctor ?? "").trim() || "-"}
                  </td>
                  <td className="py-0 px-0.5 text-center">
                    {getServiceDisplay(patient)}
                  </td>
                  <td className="py-0 px-0.5 text-center">
                    <span>{getSheetTypeLabel(getRowSheetType(patient))}</span>
                    <span className="mr-2 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {getSheetSourceLabel(getRowSheetSource(patient))}
                    </span>
                  </td>
                  <td className="py-0 px-0.5 text-center" dir="ltr">
                    {patient.lastVisit ? formatDisplayDate(patient.lastVisit) : ""}
                  </td>
                  <td className="py-0 px-0.5">
                    <div className="flex flex-wrap items-center justify-center gap-0.5">
                      {canEditPatients && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenFollowup(getRowSheetType(patient), patient.id);
                          }}
                        >
                          متابعة
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenRefraction(patient.id);
                        }}
                      >
                        مقاس
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          onPrintRefraction(patient.id);
                        }}
                      >
                        طباعة مقاس
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenSheet(getRowSheetType(patient), patient.id);
                        }}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      {canEditPatients && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(event) => {
                            event.stopPropagation();
                            onEditPatient(patient);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          onPrintSheet(getRowSheetType(patient), patient.id);
                        }}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                      {user?.role === "admin" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeletePatient(patient.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}



