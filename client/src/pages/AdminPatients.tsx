import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getTrpcErrorMessage } from "@/lib/utils";
import {
  matchesDoctorFilter,
  matchesServiceCodeOrNameTerm,
  normalizeServiceCodeForSearch,
} from "@/lib/patientFiltering";

type ServiceType = "consultant" | "specialist" | "lasik" | "external" | "surgery";
type SheetTypeChoice =
  | ServiceType
  | "pentacam_center"
  | "pentacam_external"
  | "surgery_external";
type PatientStatus = "new" | "followup" | "archived";

type PatientRow = {
  id: number;
  patientCode?: string;
  fullName?: string;
  treatingDoctor?: string;
  serviceType?: ServiceType;
  serviceCode?: string;
  serviceCodes?: string[];
  serviceSheetTypeByCode?: Record<string, string>;
  locationType?: "center" | "external";
  status?: PatientStatus;
  syncLockManual?: boolean;
  manualEditedAt?: string;
  __serviceCodeSingle?: string;
  __serviceNameSingle?: string;
  __rowKey?: string;
};

type PatientDraft = {
  fullName: string;
  treatingDoctor: string;
  serviceType: SheetTypeChoice;
  status: PatientStatus;
};
type RowSaveState = {
  state: "saved" | "unsaved" | "saving" | "error";
  at?: string;
  message?: string;
};
type DoctorDirectoryEntry = {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
  locationType?: "center" | "external";
};
type BulkSnapshot = {
  patientId: number;
  serviceType?: string | null;
  locationType?: string | null;
  doctorName?: string;
};
type PatientCursor = {
  codeNum: number;
  patientCode: string;
  id: number;
};

export default function AdminPatients() {
  const utils = trpc.useUtils();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [cursor, setCursor] = useState<PatientCursor | null>(null);
  const [cursorHistory, setCursorHistory] = useState<Array<PatientCursor | null>>([]);
  const [pageSize, setPageSize] = useState(50);
  const [statsYear, setStatsYear] = useState(String(new Date().getFullYear()));
  const [statsMonth, setStatsMonth] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [doctorFilter, setDoctorFilter] = useState("all");
  const [bulkDoctorId, setBulkDoctorId] = useState("none");
  const [bulkSheetType, setBulkSheetType] = useState<"none" | SheetTypeChoice>("none");
  const [bulkManualLock, setBulkManualLock] = useState<"none" | "on" | "off">("none");
  const [lastBulkSnapshots, setLastBulkSnapshots] = useState<BulkSnapshot[]>([]);
  const [lastBulkLabel, setLastBulkLabel] = useState("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState<"all" | SheetTypeChoice>("all");
  const [locationFilter, setLocationFilter] = useState<"all" | "center" | "external">("all");
  const [drafts, setDrafts] = useState<Record<string, PatientDraft>>({});
  const [rowSaveState, setRowSaveState] = useState<Record<string, RowSaveState>>({});
  const [manualLockOverrides, setManualLockOverrides] = useState<Record<number, boolean>>({});
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
    return raw;
  };
  const getServiceTypeLabel = (value: string) => {
    const key = String(value ?? "").trim().toLowerCase();
    if (key === "consultant") return "Consultant";
    if (key === "specialist") return "Specialist";
    if (key === "pentacam" || key === "pentacam_center") return "Pentacam (Center)";
    if (key === "pentacam_external") return "Pentacam (External)";
    if (key === "lasik") return "Lasik";
    if (key === "external") return "External";
    if (key === "surgery" || key === "operation" || key === "surgery_center" || key === "operation_center") return "Surgery";
    if (key === "surgery_external") return "Surgery (External)";
    return value || "-";
  };
  const toIsoDate = (value: string) => {
    const raw = normalizeTypedDateInput(value);
    if (!raw) return "";
    const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) {
      const [dd, mm, yyyy] = raw.split("-");
      return `${yyyy}-${mm}-${dd}`;
    }
    return "";
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchTerm(searchTerm.trim()), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const getYearMonth = (value: unknown): { year: string; month: string } | null => {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.valueOf())) {
      return {
        year: String(value.getFullYear()),
        month: String(value.getMonth() + 1).padStart(2, "0"),
      };
    }
    const raw = String(value).trim();
    if (!raw) return null;
    // yyyy-mm-dd...
    let m = raw.match(/^(\d{4})-(\d{2})-/);
    if (m) return { year: m[1], month: m[2] };
    // dd/mm/yyyy
    m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return { year: m[3], month: m[2] };
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.valueOf())) {
      return {
        year: String(parsed.getFullYear()),
        month: String(parsed.getMonth() + 1).padStart(2, "0"),
      };
    }
    return null;
  };

  const patientsQuery = trpc.medical.getAllPatients.useQuery(
    {
      branch: undefined,
      // Keep text search local so service-name search (from service directory) works reliably.
      searchTerm: undefined,
      dateFrom: toIsoDate(dateFrom) || undefined,
      dateTo: toIsoDate(dateTo) || undefined,
      doctorName: undefined,
      serviceType: serviceTypeFilter === "all" || serviceTypeFilter === "surgery" || serviceTypeFilter === "surgery_external" ? undefined : toLegacyServiceType(serviceTypeFilter),
      locationType: locationFilter === "all" ? undefined : locationFilter,
      limit: doctorFilter === "all" ? (debouncedSearchTerm ? 500 : pageSize) : 500,
      cursor: doctorFilter === "all" ? cursor ?? undefined : undefined,
    },
    { refetchOnWindowFocus: false }
  );
  const doctorDirectoryQuery = trpc.medical.getDoctorDirectory.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const serviceDirectoryQuery = trpc.medical.getServiceDirectory.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const updatePatientMutation = trpc.medical.updatePatient.useMutation();
  const savePatientPageStateMutation = trpc.medical.savePatientPageState.useMutation();
  const deletePatientFromMssqlMutation = trpc.medical.deletePatientFromMssql.useMutation();
  const deleteAllPatientsMutation = trpc.medical.deleteAllPatients.useMutation();
  const bulkAssignDoctorMutation = trpc.medical.bulkAssignDoctorToPatients.useMutation();
  const bulkAssignSheetMutation = trpc.medical.bulkAssignSheetTypeToPatients.useMutation();
  const bulkRestoreMutation = trpc.medical.bulkRestorePatients.useMutation();
  const monthlyStatsQuery = trpc.medical.getPatientStats.useQuery(
    {
      year: Number(statsYear),
      month: Number(statsMonth),
      searchTerm: debouncedSearchTerm || undefined,
      doctorName: doctorFilter === "all" ? undefined : doctorFilter,
      serviceType: serviceTypeFilter === "all" || serviceTypeFilter === "surgery" || serviceTypeFilter === "surgery_external" ? undefined : toLegacyServiceType(serviceTypeFilter),
      locationType: locationFilter === "all" ? undefined : locationFilter,
      dateFrom: toIsoDate(dateFrom) || undefined,
      dateTo: toIsoDate(dateTo) || undefined,
    },
    { refetchOnWindowFocus: false }
  );
  const yearlyStatsQuery = trpc.medical.getPatientStats.useQuery(
    {
      year: Number(statsYear),
      searchTerm: debouncedSearchTerm || undefined,
      doctorName: doctorFilter === "all" ? undefined : doctorFilter,
      serviceType: serviceTypeFilter === "all" || serviceTypeFilter === "surgery" || serviceTypeFilter === "surgery_external" ? undefined : toLegacyServiceType(serviceTypeFilter),
      locationType: locationFilter === "all" ? undefined : locationFilter,
      dateFrom: toIsoDate(dateFrom) || undefined,
      dateTo: toIsoDate(dateTo) || undefined,
    },
    { refetchOnWindowFocus: false }
  );
  const mssqlSyncStatusQuery = trpc.medical.getMssqlSyncStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchInterval: 5000,
  });

  const patientsPayload = (patientsQuery.data ?? { rows: [], hasMore: false, nextCursor: null }) as {
    rows: PatientRow[];
    hasMore: boolean;
    nextCursor: PatientCursor | null;
  };
  const patients = (patientsPayload.rows ?? []) as PatientRow[];
  const hasMore = doctorFilter === "all" ? Boolean(patientsPayload.hasMore) : false;
  const nextCursor = doctorFilter === "all" ? patientsPayload.nextCursor ?? null : null;

  useEffect(() => {
    setCursor(null);
    setCursorHistory([]);
  }, [debouncedSearchTerm, serviceTypeFilter, locationFilter, doctorFilter, dateFrom, dateTo, pageSize]);

  const years = useMemo(() => {
    const set = new Set<string>();
    const currentYear = new Date().getFullYear();
    set.add(String(currentYear));
    for (const patient of patients) {
      const ym = getYearMonth((patient as any).lastVisit);
      if (ym) set.add(ym.year);
    }
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [patients]);

  const monthStats = monthlyStatsQuery.data ?? { total: 0, center: 0, external: 0, lasik: 0 };
  const yearStats = yearlyStatsQuery.data ?? { total: 0, center: 0, external: 0, lasik: 0 };

  const activeDoctors = useMemo(
    () =>
      ((doctorDirectoryQuery.data ?? []) as DoctorDirectoryEntry[])
        .filter((doctor) => doctor.isActive !== false)
        .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "ar")),
    [doctorDirectoryQuery.data]
  );
  const doctorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const doctor of activeDoctors) {
      const name = String(doctor.name ?? "").trim();
      if (name) set.add(name);
    }
    for (const patient of patients) {
      const name = String(patient.treatingDoctor ?? "").trim();
      if (name) set.add(name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ar"));
  }, [activeDoctors, patients]);
  const normalizeServiceCode = (value: unknown) => {
    return normalizeServiceCodeForSearch(value);
  };
  const isServiceType = (value: string): value is ServiceType =>
    value === "consultant" || value === "specialist" || value === "lasik" || value === "external" || value === "surgery";
  const isSheetTypeChoice = (value: string): value is SheetTypeChoice =>
    value === "consultant" ||
    value === "specialist" ||
    value === "lasik" ||
    value === "external" ||
    value === "surgery" ||
    value === "pentacam_center" ||
    value === "pentacam_external" ||
    value === "surgery_external";
  const normalizeSheetTypeChoice = (value: unknown): SheetTypeChoice | "" => {
    const raw = String(value ?? "").trim().toLowerCase();
    if (!raw) return "";
    if (raw === "pentacam" || raw === "radiology_center") return "pentacam_center";
    if (raw === "radiology_external") return "pentacam_external";
    if (raw === "surgery_center" || raw === "operation" || raw === "operation_center") return "surgery";
    if (raw === "operation_external") return "surgery_external";
    return isSheetTypeChoice(raw) ? raw : "";
  };
  const normalizeSheetTypeToService = (value: unknown): ServiceType | "" => {
    const mapped = normalizeSheetTypeChoice(value);
    if (!mapped) return "";
    if (mapped === "pentacam_center") return "specialist";
    if (mapped === "pentacam_external" || mapped === "surgery_external") return "external";
    return mapped;
  };
  function toLegacyServiceType(value: SheetTypeChoice): ServiceType {
    if (value === "pentacam_center") return "specialist";
    if (value === "pentacam_external" || value === "surgery_external") return "external";
    return value;
  }
  const getRowServiceCode = (patient: PatientRow) =>
    normalizeServiceCode(String((patient as any).__serviceCodeSingle ?? (patient as any).serviceCode ?? "").trim());
  const getRowSheetType = (patient: PatientRow): SheetTypeChoice => {
    const rowServiceCode = getRowServiceCode(patient);
    const mappedOverride = rowServiceCode ? normalizeSheetTypeChoice((patient as any)?.serviceSheetTypeByCode?.[rowServiceCode]) : "";
    if (mappedOverride) return mappedOverride;
    const mappedDefault = rowServiceCode ? normalizeSheetTypeChoice(serviceCodeToType.get(rowServiceCode)) : "";
    if (mappedDefault) return mappedDefault;
    const fallback = normalizeSheetTypeChoice(patient.serviceType ?? "consultant");
    return fallback || "consultant";
  };
  const serviceCodeToLabel = useMemo(() => {
    const list = Array.isArray(serviceDirectoryQuery.data) ? serviceDirectoryQuery.data : [];
    const map = new Map<string, string>();
    for (const item of list) {
      const code = String((item as any)?.code ?? "").trim();
      const name = String((item as any)?.name ?? "").trim();
      if (!code) continue;
      map.set(normalizeServiceCode(code), name || code);
    }
    return map;
  }, [serviceDirectoryQuery.data]);
  const serviceCodeToType = useMemo(() => {
    const list = Array.isArray(serviceDirectoryQuery.data) ? serviceDirectoryQuery.data : [];
    const map = new Map<string, string>();
    for (const item of list) {
      const code = String((item as any)?.code ?? "").trim();
      const type = normalizeSheetTypeChoice((item as any)?.defaultSheet ?? (item as any)?.serviceType ?? "");
      if (!code || !type) continue;
      map.set(normalizeServiceCode(code), type);
    }
    return map;
  }, [serviceDirectoryQuery.data]);

  const filteredPatients = useMemo(() => {
    // Keep a local search fallback so filtering still works even if server-side search misses edge cases.
    const localTerm = debouncedSearchTerm.trim().toLowerCase();
    const selectedSheetType = serviceTypeFilter === "all" ? "" : serviceTypeFilter;
    const selectedDoctor = doctorFilter === "all" ? "" : doctorFilter.trim().toLowerCase();
    const selectedDoctorEntry =
      doctorFilter === "all"
        ? null
        : activeDoctors.find((doctor) => String(doctor.name ?? "").trim() === doctorFilter) ?? null;
    const toSortableCode = (value: unknown) => {
      const raw = String(value ?? "").trim();
      const n = Number(raw.replace(/[^\d]/g, ""));
      return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
    };
    const locallyFiltered = patients.filter((p) => {
      const code = String(p.patientCode ?? "").toLowerCase();
      const name = String(p.fullName ?? "").toLowerCase();
      const doctor = String(p.treatingDoctor ?? "").toLowerCase();
      const rawServiceCodes = [
        ...((Array.isArray((p as any).serviceCodes) ? (p as any).serviceCodes : []) as unknown[]),
        (p as any).serviceCode,
      ]
        .map((v) => String(v ?? "").trim())
        .filter(Boolean);
      const serviceCode = rawServiceCodes.join(" ").toLowerCase();
      const mappedServiceName = rawServiceCodes
        .map((srvCode) => String(serviceCodeToLabel.get(normalizeServiceCode(srvCode)) ?? ""))
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const serviceTypeRaw = String(p.serviceType ?? "").toLowerCase();
      const serviceTypeLabel = getServiceTypeLabel(serviceTypeRaw).toLowerCase();
      const matchesTerm =
        !localTerm ||
        code.includes(localTerm) ||
        name.includes(localTerm) ||
        doctor.includes(localTerm) ||
        serviceCode.includes(localTerm) ||
        mappedServiceName.includes(localTerm) ||
        serviceTypeRaw.includes(localTerm) ||
        serviceTypeLabel.includes(localTerm);
      if (!matchesTerm) return false;
      return matchesDoctorFilter({
        doctorValue: doctor,
        selectedDoctor,
        selectedDoctorName: String(selectedDoctorEntry?.name ?? ""),
        selectedDoctorCode: String(selectedDoctorEntry?.code ?? ""),
      });
    });
    const sorted = locallyFiltered
      .sort((a, b) => {
        const aNum = toSortableCode(a.patientCode);
        const bNum = toSortableCode(b.patientCode);
        if (aNum !== bNum) return aNum - bNum;
        const aCode = String(a.patientCode ?? "");
        const bCode = String(b.patientCode ?? "");
        return aCode.localeCompare(bCode, "ar");
      });
    return sorted.flatMap((patient) => {
      const codes = Array.from(
        new Set(
          [
            ...((Array.isArray((patient as any).serviceCodes) ? (patient as any).serviceCodes : []) as unknown[]),
            (patient as any).serviceCode,
          ]
            .map((v) => normalizeServiceCode(v))
            .filter(Boolean)
        )
      );
      if (codes.length === 0) {
        if (selectedSheetType) {
          const fallback = normalizeSheetTypeChoice(patient.serviceType ?? "consultant");
          if (fallback !== selectedSheetType) return [];
        }
        return [{ ...patient, __rowKey: `${patient.id}-no-service` }];
      }
      const rowCodes = (() => {
        if (!localTerm) return codes;
        const matched = codes.filter((srvCode) => {
          return matchesServiceCodeOrNameTerm(
            localTerm,
            String(srvCode ?? ""),
            String(serviceCodeToLabel.get(srvCode) ?? "")
          );
        });
        return matched.length > 0 ? matched : codes;
      })();
      const filteredRowCodes =
        !selectedSheetType
          ? rowCodes
          : rowCodes.filter((srvCode) => {
              const mapped = normalizeSheetTypeChoice(
                (patient as any)?.serviceSheetTypeByCode?.[srvCode] ?? serviceCodeToType.get(srvCode) ?? patient.serviceType ?? ""
              );
              return mapped === selectedSheetType;
            });
      if (filteredRowCodes.length === 0) return [];
      return filteredRowCodes.map((srvCode, idx) => ({
        ...patient,
        __serviceCodeSingle: srvCode,
        __serviceNameSingle: String(serviceCodeToLabel.get(srvCode) ?? "").trim(),
        __serviceTypeSingle: String(serviceCodeToType.get(srvCode) ?? "").trim().toLowerCase(),
        __rowKey: `${patient.id}-${srvCode}-${idx}`,
      }));
    });
  }, [patients, debouncedSearchTerm, doctorFilter, activeDoctors, serviceCodeToLabel, serviceCodeToType, serviceTypeFilter]);

  const currentPage = doctorFilter === "all" ? cursorHistory.length + 1 : 1;
  const visiblePatients = filteredPatients;


  const getRowKey = (patient: PatientRow) => String((patient as any).__rowKey ?? patient.id);
  const getDraft = (patient: PatientRow): PatientDraft => {
    const rowKey = getRowKey(patient);
    const existing = drafts[rowKey];
    if (existing) return existing;
    return {
      fullName: String(patient.fullName ?? ""),
      treatingDoctor: String(patient.treatingDoctor ?? ""),
      serviceType: getRowSheetType(patient),
      status: (patient.status ?? "new") as PatientStatus,
    };
  };

  const setDraftField = (patient: PatientRow, field: keyof PatientDraft, value: string) => {
    const rowKey = getRowKey(patient);
    const base = getDraft(patient);
    setDrafts((prev) => ({
      ...prev,
      [rowKey]: {
        ...base,
        [field]: value,
      },
    }));
    setRowSaveState((prev) => ({
      ...prev,
      [rowKey]: { state: "unsaved", at: new Date().toISOString() },
    }));
  };

  const savePatientRow = async (patient: PatientRow, draft?: PatientDraft) => {
    const rowKey = getRowKey(patient);
    const next = draft ?? getDraft(patient);
    try {
      setRowSaveState((prev) => ({
        ...prev,
        [rowKey]: { state: "saving", at: new Date().toISOString() },
      }));
      const rowServiceCode = getRowServiceCode(patient);
      if (rowServiceCode) {
        await updatePatientMutation.mutateAsync({
          patientId: patient.id,
          updates: {
            fullName: next.fullName.trim(),
            status: next.status,
          },
        });
      } else {
        await updatePatientMutation.mutateAsync({
          patientId: patient.id,
          updates: {
            fullName: next.fullName.trim(),
            serviceType: toLegacyServiceType(next.serviceType),
            status: next.status,
          },
        });
      }

      const existingState = await utils.medical.getPatientPageState
        .fetch({ patientId: patient.id, page: "examination" })
        .catch(() => null);
      const existingData =
        existingState && typeof (existingState as any).data === "object" && (existingState as any).data
          ? ((existingState as any).data as Record<string, any>)
          : {};
      const nextDoctor = next.treatingDoctor.trim();

      await savePatientPageStateMutation.mutateAsync({
        patientId: patient.id,
        page: "examination",
        data: {
          ...existingData,
          syncLockManual: true,
          manualEditedAt: new Date().toISOString(),
          ...(rowServiceCode
            ? {
                serviceSheetTypeByCode: {
                  ...(existingData && typeof existingData.serviceSheetTypeByCode === "object"
                    ? existingData.serviceSheetTypeByCode
                    : {}),
                  [rowServiceCode]: next.serviceType,
                },
              }
            : {}),
          doctorName: nextDoctor,
          signatures: {
            ...(existingData.signatures ?? {}),
            doctor: nextDoctor,
          },
        },
      });

      setDrafts((prev) => {
        const nextDrafts = { ...prev };
        delete nextDrafts[rowKey];
        return nextDrafts;
      });
      setRowSaveState((prev) => ({
        ...prev,
        [rowKey]: { state: "saved", at: new Date().toISOString() },
      }));
      toast.success("Patient updated");
      await utils.medical.getAllPatients.invalidate();
    } catch (error) {
      setRowSaveState((prev) => ({
        ...prev,
        [rowKey]: {
          state: "error",
          at: new Date().toISOString(),
          message: getTrpcErrorMessage(error, "Failed to update patient"),
        },
      }));
      toast.error(getTrpcErrorMessage(error, "Failed to update patient"));
    }
  };

  const isManualLockEnabled = (patient: PatientRow) => {
    if (Object.prototype.hasOwnProperty.call(manualLockOverrides, patient.id)) {
      return Boolean(manualLockOverrides[patient.id]);
    }
    return Boolean(patient.syncLockManual) || String(patient.manualEditedAt ?? "").trim().length > 0;
  };

  const handleToggleManualLock = async (patient: PatientRow) => {
    const currentlyEnabled = isManualLockEnabled(patient);
    const nextEnabled = !currentlyEnabled;
    try {
      const existingState = await utils.medical.getPatientPageState
        .fetch({ patientId: patient.id, page: "examination" })
        .catch(() => null);
      const existingData =
        existingState && typeof (existingState as any).data === "object" && (existingState as any).data
          ? ((existingState as any).data as Record<string, any>)
          : {};
      await savePatientPageStateMutation.mutateAsync({
        patientId: patient.id,
        page: "examination",
        data: {
          ...existingData,
          syncLockManual: nextEnabled,
          manualEditedAt: nextEnabled ? new Date().toISOString() : "",
        },
      });
      setManualLockOverrides((prev) => ({ ...prev, [patient.id]: nextEnabled }));
      setRowSaveState((prev) => ({
        ...prev,
        [getRowKey(patient)]: { state: "saved", at: new Date().toISOString() },
      }));
      toast.success(nextEnabled ? "Manual lock enabled" : "Manual lock disabled");
      await utils.medical.getAllPatients.invalidate();
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to toggle manual lock"));
    }
  };

  const handleSaveAll = async () => {
    const changedRows = Object.keys(drafts);
    if (changedRows.length === 0) {
      toast.info("No pending changes");
      return;
    }
    for (const rowKey of changedRows) {
      const patient = visiblePatients.find((p) => getRowKey(p) === rowKey) ?? patients.find((p) => getRowKey(p) === rowKey);
      if (!patient) continue;
      const draft = drafts[rowKey];
      await savePatientRow(patient, draft);
    }
    toast.success("All changes saved");
  };

  const handleDeleteAll = async () => {
    const confirmText = window.prompt("Type DELETE to remove all patients");
    if (confirmText !== "DELETE") return;
    try {
      await deleteAllPatientsMutation.mutateAsync();
      setDrafts({});
      toast.success("All patients deleted");
      await utils.medical.getAllPatients.invalidate();
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to delete all patients"));
    }
  };

  const handleSetFilteredDoctor = async () => {
    if (filteredPatients.length === 0) {
      toast.info("No patients in current filter");
      return;
    }
    if (bulkDoctorId === "none") {
      toast.info("Choose doctor first");
      return;
    }
    const selectedDoctor = activeDoctors.find((doctor) => doctor.id === bulkDoctorId);
    if (!selectedDoctor) {
      toast.error("Selected doctor not found");
      return;
    }
    const nextDoctorName = String(selectedDoctor.name ?? "").trim();
    if (!nextDoctorName) {
      toast.error("Selected doctor name is empty");
      return;
    }
    const nextLocation = selectedDoctor.locationType === "external" ? "external" : "center";
    const ok = window.confirm(`Change doctor for ${filteredPatients.length} filtered patients to "${nextDoctorName}" (${nextLocation})?`);
    if (!ok) return;
    try {
      const result = await bulkAssignDoctorMutation.mutateAsync({
        patientIds: Array.from(new Set(filteredPatients.map((patient) => patient.id))),
        doctorName: nextDoctorName,
        doctorLocationType: nextLocation,
      });
      setLastBulkSnapshots(((result as any).snapshots ?? []) as BulkSnapshot[]);
      setLastBulkLabel(`Doctor -> ${nextDoctorName}`);
      toast.success(`Updated ${(result as any).updatedCount ?? filteredPatients.length} patients to ${nextDoctorName}`);
      await utils.medical.getAllPatients.invalidate();
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to update filtered patients doctor"));
    }
  };

  const handleSetFilteredSheetType = async () => {
    if (filteredPatients.length === 0) {
      toast.info("No patients in current filter");
      return;
    }
    if (bulkSheetType === "none") {
      toast.info("Choose sheet type first");
      return;
    }
    const ok = window.confirm(`Change sheet type for ${filteredPatients.length} filtered patients to "${bulkSheetType}"?`);
    if (!ok) return;
    try {
      const rowsWithServiceCode = filteredPatients.filter((patient) => Boolean(getRowServiceCode(patient)));
      const rowsWithoutServiceCode = filteredPatients.filter((patient) => !getRowServiceCode(patient));
      let updatedCount = 0;

      for (const patient of rowsWithServiceCode) {
        const rowServiceCode = getRowServiceCode(patient);
        if (!rowServiceCode) continue;
        const existingState = await utils.medical.getPatientPageState
          .fetch({ patientId: patient.id, page: "examination" })
          .catch(() => null);
        const existingData =
          existingState && typeof (existingState as any).data === "object" && (existingState as any).data
            ? ((existingState as any).data as Record<string, any>)
            : {};
        const existingMap =
          existingData && typeof existingData.serviceSheetTypeByCode === "object"
            ? (existingData.serviceSheetTypeByCode as Record<string, string>)
            : {};
        await savePatientPageStateMutation.mutateAsync({
          patientId: patient.id,
          page: "examination",
          data: {
            ...existingData,
            syncLockManual: true,
            manualEditedAt: new Date().toISOString(),
            serviceSheetTypeByCode: {
              ...existingMap,
              [rowServiceCode]: bulkSheetType,
            },
          },
        });
        updatedCount += 1;
      }

      let snapshots: BulkSnapshot[] = [];
      if (rowsWithoutServiceCode.length > 0) {
        const result = await bulkAssignSheetMutation.mutateAsync({
          patientIds: Array.from(new Set(rowsWithoutServiceCode.map((patient) => patient.id))),
          sheetType: toLegacyServiceType(bulkSheetType),
        });
        snapshots = ((result as any).snapshots ?? []) as BulkSnapshot[];
        updatedCount += Number((result as any).updatedCount ?? rowsWithoutServiceCode.length);
      }
      setLastBulkSnapshots(snapshots);
      setLastBulkLabel(`Sheet -> ${bulkSheetType}`);
      toast.success(`Updated ${updatedCount} patients to ${bulkSheetType}`);
      await utils.medical.getAllPatients.invalidate();
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to update filtered patients sheet type"));
    }
  };

  const handleDeleteFromMssql = async (patient: PatientRow) => {
    const patientCode = String(patient.patientCode ?? "").trim();
    if (!patientCode) {
      toast.error("Patient code is missing");
      return;
    }
    const ok = window.confirm(`Delete patient ${patientCode} from MSSQL only?`);
    if (!ok) return;
    try {
      const result = await deletePatientFromMssqlMutation.mutateAsync({
        patientId: patient.id,
        patientCode,
      });
      if ((result as any)?.deleted) toast.success(`Deleted ${patientCode} from MSSQL`);
      else toast.info(`No MSSQL row found for ${patientCode}`);
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to delete patient from MSSQL"));
    }
  };

  const handleSetFilteredManualLock = async () => {
    if (filteredPatients.length === 0) {
      toast.info("No patients in current filter");
      return;
    }
    if (bulkManualLock === "none") {
      toast.info("Choose manual lock mode first");
      return;
    }
    const nextEnabled = bulkManualLock === "on";
    const ok = window.confirm(
      `${nextEnabled ? "Enable" : "Disable"} manual lock for ${filteredPatients.length} filtered patients?`
    );
    if (!ok) return;
    try {
      const uniquePatients = Array.from(
        new Map(filteredPatients.map((patient) => [patient.id, patient])).values()
      );
      for (const patient of uniquePatients) {
        const existingState = await utils.medical.getPatientPageState
          .fetch({ patientId: patient.id, page: "examination" })
          .catch(() => null);
        const existingData =
          existingState && typeof (existingState as any).data === "object" && (existingState as any).data
            ? ((existingState as any).data as Record<string, any>)
            : {};
        await savePatientPageStateMutation.mutateAsync({
          patientId: patient.id,
          page: "examination",
          data: {
            ...existingData,
            syncLockManual: nextEnabled,
            manualEditedAt: nextEnabled ? new Date().toISOString() : "",
          },
        });
      }
      setManualLockOverrides((prev) => {
        const next = { ...prev };
        for (const patient of filteredPatients) {
          next[patient.id] = nextEnabled;
        }
        return next;
      });
      toast.success(
        `${nextEnabled ? "Enabled" : "Disabled"} manual lock for ${filteredPatients.length} patients`
      );
      await utils.medical.getAllPatients.invalidate();
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to update manual lock for filtered patients"));
    }
  };

  const handleUndoLastBulkAction = async () => {
    if (lastBulkSnapshots.length === 0) {
      toast.info("No bulk action to undo");
      return;
    }
    const ok = window.confirm(`Undo last bulk action (${lastBulkLabel}) for ${lastBulkSnapshots.length} patients?`);
    if (!ok) return;
    try {
      await bulkRestoreMutation.mutateAsync({
        snapshots: lastBulkSnapshots.map((item) => ({
          patientId: item.patientId,
          serviceType: item.serviceType ?? null,
          locationType: item.locationType ?? null,
          doctorName: item.doctorName ?? "",
        })),
      });
      setLastBulkSnapshots([]);
      setLastBulkLabel("");
      toast.success("Last bulk action undone");
      await utils.medical.getAllPatients.invalidate();
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to undo last bulk action"));
    }
  };

  return (
    <Card dir="rtl" className="text-right">
      <CardHeader>
        <CardTitle>Patients Management ({filteredPatients.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 border rounded-lg p-3">
          <div className="mb-3 text-sm text-muted-foreground">
            MSSQL Sync:{" "}
            {mssqlSyncStatusQuery.data
              ? `${(mssqlSyncStatusQuery.data as any).running ? "Running" : "Idle"} | Last: ${
                  mssqlSyncStatusQuery.data.lastSuccessAt
                    ? new Date(mssqlSyncStatusQuery.data.lastSuccessAt).toLocaleString()
                    : "Never"
                } | Next: ${
                  (mssqlSyncStatusQuery.data as any).nextRunAt
                    ? new Date((mssqlSyncStatusQuery.data as any).nextRunAt).toLocaleString()
                    : "-"
                }`
              : "Loading..."}
          </div>
          <div className="flex flex-wrap gap-2 items-center justify-end mb-3">
            <Select value={statsYear} onValueChange={setStatsYear}>
              <SelectTrigger className="min-w-[120px]">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statsMonth} onValueChange={setStatsMonth}>
              <SelectTrigger className="min-w-[120px]">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }).map((_, idx) => {
                  const value = String(idx + 1).padStart(2, "0");
                  return (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="rounded border p-3 text-right">
              <div className="font-semibold mb-1">Monthly Stats ({statsYear}-{statsMonth})</div>
              <div>Total: {monthStats.total}</div>
              <div>Center: {monthStats.center}</div>
              <div>External: {monthStats.external}</div>
              <div>Lasik: {monthStats.lasik}</div>
            </div>
            <div className="rounded border p-3 text-right">
              <div className="font-semibold mb-1">Yearly Stats ({statsYear})</div>
              <div>Total: {yearStats.total}</div>
              <div>Center: {yearStats.center}</div>
              <div>External: {yearStats.external}</div>
              <div>Lasik: {yearStats.lasik}</div>
            </div>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          <div className="relative w-full md:w-[520px] md:max-w-[520px]">
            <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by patient name, code, doctor, service..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-9 text-right"
              dir="rtl"
            />
          </div>
          <Select value={doctorFilter} onValueChange={setDoctorFilter}>
            <SelectTrigger className="min-w-[180px]">
              <SelectValue placeholder="Doctor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All doctors</SelectItem>
              {doctorOptions.map((doctor) => (
                <SelectItem key={doctor} value={doctor}>
                  {doctor}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {doctorFilter !== "all" && (
            <div className="text-sm text-muted-foreground">
              Doctor Records: {filteredPatients.length}
            </div>
          )}
          <Select value={serviceTypeFilter} onValueChange={(value) => setServiceTypeFilter(value as "all" | SheetTypeChoice)}>
            <SelectTrigger className="min-w-[170px]">
              <SelectValue placeholder="Sheet Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="consultant">Consultant</SelectItem>
              <SelectItem value="specialist">Specialist</SelectItem>
              <SelectItem value="pentacam_center">Pentacam (Center)</SelectItem>
              <SelectItem value="pentacam_external">Pentacam (External)</SelectItem>
              <SelectItem value="lasik">Lasik</SelectItem>
              <SelectItem value="external">External</SelectItem>
              <SelectItem value="surgery">Surgery</SelectItem>
              <SelectItem value="surgery_external">Surgery (External)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={locationFilter} onValueChange={(value) => setLocationFilter(value as "all" | "center" | "external")}>
            <SelectTrigger className="min-w-[150px]">
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              <SelectItem value="center">Center</SelectItem>
              <SelectItem value="external">External</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">From (File Open Date)</span>
            <Input
              type="text"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              onBlur={(e) => setDateFrom(normalizeTypedDateInput(e.target.value))}
              className="w-[140px]"
              placeholder="DD/MM/YYYY"
              dir="ltr"
            />
            <span className="text-sm text-muted-foreground">To (File Open Date)</span>
            <Input
              type="text"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              onBlur={(e) => setDateTo(normalizeTypedDateInput(e.target.value))}
              className="w-[140px]"
              placeholder="DD/MM/YYYY"
              dir="ltr"
            />
          </div>
          <Button variant="outline" onClick={handleSaveAll} disabled={updatePatientMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Save All
          </Button>
          <Select value={bulkDoctorId} onValueChange={setBulkDoctorId}>
            <SelectTrigger className="min-w-[260px]">
              <SelectValue placeholder="Bulk Change Doctor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select Doctor</SelectItem>
              {activeDoctors.map((doctor) => (
                <SelectItem key={doctor.id} value={doctor.id}>
                  {doctor.name} ({doctor.locationType === "external" ? "External" : "Center"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleSetFilteredDoctor} disabled={updatePatientMutation.isPending || savePatientPageStateMutation.isPending}>
            Change Doctor For Filtered
          </Button>
          <Select value={bulkSheetType} onValueChange={(value) => setBulkSheetType(value as "none" | SheetTypeChoice)}>
            <SelectTrigger className="min-w-[220px]">
              <SelectValue placeholder="Bulk Change Sheet" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select Sheet Type</SelectItem>
              <SelectItem value="consultant">Consultant</SelectItem>
              <SelectItem value="specialist">Specialist</SelectItem>
              <SelectItem value="pentacam_center">Pentacam (Center)</SelectItem>
              <SelectItem value="pentacam_external">Pentacam (External)</SelectItem>
              <SelectItem value="lasik">Lasik</SelectItem>
              <SelectItem value="external">External</SelectItem>
              <SelectItem value="surgery">Surgery</SelectItem>
              <SelectItem value="surgery_external">Surgery (External)</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleSetFilteredSheetType} disabled={updatePatientMutation.isPending}>
            Change Sheet For Filtered
          </Button>
          <Select value={bulkManualLock} onValueChange={(value) => setBulkManualLock(value as "none" | "on" | "off")}>
            <SelectTrigger className="min-w-[180px]">
              <SelectValue placeholder="Manual Lock" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Manual Lock</SelectItem>
              <SelectItem value="on">ON</SelectItem>
              <SelectItem value="off">OFF</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={handleSetFilteredManualLock}
            disabled={savePatientPageStateMutation.isPending}
          >
            Set Manual Lock
          </Button>
          <Button
            variant="outline"
            onClick={handleUndoLastBulkAction}
            disabled={bulkRestoreMutation.isPending || lastBulkSnapshots.length === 0}
          >
            Undo Last Bulk
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">Preview Filtered</Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[460px] sm:w-[620px]">
              <SheetHeader>
                <SheetTitle>Filtered Patients Preview ({filteredPatients.length})</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-2 overflow-y-auto max-h-[80vh]">
                {filteredPatients.slice(0, 200).map((patient) => (
                  <div key={String((patient as any).__rowKey ?? patient.id)} className="rounded border p-2 text-sm">
                    <div><strong>Code:</strong> {patient.patientCode ?? ""}</div>
                    <div><strong>Name:</strong> {patient.fullName ?? ""}</div>
                    <div><strong>Doctor:</strong> {patient.treatingDoctor ?? ""}</div>
                    <div><strong>Sheet:</strong> {getRowSheetType(patient)}</div>
                    <div><strong>Location:</strong> {patient.locationType ?? ""}</div>
                  </div>
                ))}
                {filteredPatients.length > 200 && (
                  <div className="text-xs text-muted-foreground">Showing first 200 records.</div>
                )}
              </div>
            </SheetContent>
          </Sheet>
          <Button variant="destructive" onClick={handleDeleteAll} disabled={deleteAllPatientsMutation.isPending}>
            <Trash2 className="h-4 w-4 mr-2" />
            Remove All
          </Button>
        </div>

        <div className="overflow-x-auto" dir="rtl">
          <Table className="text-right">
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">Code</TableHead>
                <TableHead className="text-right">Name</TableHead>
                <TableHead className="text-right">Doctor</TableHead>
                <TableHead className="text-right">Sheet Type</TableHead>
                <TableHead className="text-right">Service</TableHead>
                <TableHead className="text-right">Manual Lock</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patientsQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-right text-muted-foreground">
                    Loading patients...
                  </TableCell>
                </TableRow>
              )}
              {!patientsQuery.isLoading && visiblePatients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-right text-muted-foreground">
                    No patients found
                  </TableCell>
                </TableRow>
              )}
              {visiblePatients.map((patient) => {
                const draft = getDraft(patient);
                const serviceName = (() => {
                  const singleName = String((patient as any).__serviceNameSingle ?? "").trim();
                  if (singleName) return singleName;
                  const singleCode = normalizeServiceCode(String((patient as any).__serviceCodeSingle ?? "").trim());
                  if (singleCode) {
                    return serviceCodeToLabel.get(singleCode) ?? getServiceTypeLabel(draft.serviceType);
                  }
                  const codes = [
                    ...((Array.isArray((patient as any).serviceCodes) ? (patient as any).serviceCodes : []) as unknown[]),
                    (patient as any).serviceCode,
                  ]
                    .map((v) => normalizeServiceCode(v))
                    .filter(Boolean);
                  if (codes.length > 0) {
                    const names = Array.from(
                      new Set(
                        codes
                          .map((srvCode) => String(serviceCodeToLabel.get(srvCode) ?? "").trim())
                          .filter(Boolean)
                      )
                    );
                    if (names.length > 0) return names.join(" / ");
                  }
                  const normalizedCode = normalizeServiceCode(String((patient as any).serviceCode ?? "").trim());
                  if (normalizedCode) return serviceCodeToLabel.get(normalizedCode) ?? getServiceTypeLabel(draft.serviceType);
                  return getServiceTypeLabel(draft.serviceType);
                })();
                return (
                  <TableRow key={String((patient as any).__rowKey ?? patient.id)}>
                    <TableCell>{patient.patientCode ?? ""}</TableCell>
                    <TableCell>
                      <Input
                        value={draft.fullName}
                        onChange={(e) => setDraftField(patient, "fullName", e.target.value)}
                        className="min-w-[210px]"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={draft.treatingDoctor}
                        onChange={(e) => setDraftField(patient, "treatingDoctor", e.target.value)}
                        className="min-w-[180px]"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={draft.serviceType}
                        onValueChange={(value) => setDraftField(patient, "serviceType", value)}
                      >
                        <SelectTrigger className="min-w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="consultant">Consultant</SelectItem>
                          <SelectItem value="specialist">Specialist</SelectItem>
                          <SelectItem value="pentacam_center">Pentacam (Center)</SelectItem>
                          <SelectItem value="pentacam_external">Pentacam (External)</SelectItem>
                          <SelectItem value="lasik">Lasik</SelectItem>
                          <SelectItem value="external">External</SelectItem>
                          <SelectItem value="surgery">Surgery</SelectItem>
                          <SelectItem value="surgery_external">Surgery (External)</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>{serviceName}</TableCell>
                    <TableCell>
                      <Button
                        variant={isManualLockEnabled(patient) ? "default" : "outline"}
                        onClick={() => handleToggleManualLock(patient)}
                        disabled={savePatientPageStateMutation.isPending}
                      >
                        {isManualLockEnabled(patient) ? "ON" : "OFF"}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-end gap-1">
                        <Button variant="outline" onClick={() => savePatientRow(patient)} disabled={updatePatientMutation.isPending}>
                          Save
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => handleDeleteFromMssql(patient)}
                          disabled={deletePatientFromMssqlMutation.isPending}
                        >
                          Delete MSSQL
                        </Button>
                        {(() => {
                          const status = rowSaveState[String((patient as any).__rowKey ?? patient.id)];
                          if (!status) return null;
                          if (status.state === "unsaved") return <span className="text-xs text-amber-600">Unsaved</span>;
                          if (status.state === "saving") return <span className="text-xs text-blue-600">Saving...</span>;
                          if (status.state === "saved") return <span className="text-xs text-emerald-600">Saved</span>;
                          return <span className="text-xs text-red-600">Error</span>;
                        })()}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
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
      </CardContent>
    </Card>
  );
}


