import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Printer, Plus, Save, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getTrpcErrorMessage } from "@/lib/utils";
import PageHeader from "@/components/PageHeader";

interface ListData {
  id: number;
  patientId?: number;
  number: string;
  name: string;
  phone: string;
  doctor: string;
  operation: string;
  center: boolean;
  payment: boolean;
  code: string;
  amount: number;
  paidAmount: number;
  doctorAmount: number | null;
  discountType: "amount" | "percent";
  discountValue: number;
}

interface DoctorOption {
  id: number;
  username: string;
  name: string;
  code: string;
}
const TAB_SAADANY = "saadany";
const TAB_SAWAF = "sawaf";
const TAB_OTHERS = "others";
const TAB_CONFIG = [
  { key: TAB_SAADANY, label: "د/سعدني", doctor: "د. سعدني" },
  { key: TAB_SAWAF, label: "د/صواف", doctor: "د. صواف" },
  { key: TAB_OTHERS, label: "آخرون", doctor: "" },
] as const;
const normalizeTabKey = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  if (raw === TAB_SAADANY || raw === TAB_SAWAF || raw === TAB_OTHERS) return raw;
  return TAB_SAADANY;
};

const OPERATION_LABELS: Record<string, string> = {
  PRK: "PRK",
  Lasik: "Lasik",
  "Lasik Moria": "Moria",
  "Lasik Metal": "Metal",
  Femto: "Femto",
  Cataract: "Cataract",
  Other: "Others",
};
const OPERATION_BASE_AMOUNTS: Record<string, number> = {
  PRK: 4500,
  Lasik: 5000,
  "Lasik Moria": 5000,
  "Lasik Metal": 5000,
  Femto: 35000,
  Cataract: 7000,
  Other: 0,
};
const FEMTO_CENTER_SHARE_DEFAULT = 1000;
type AppointmentsPricingConfig = {
  amount: {
    prk: {
      saadanyConsultantSaadany: number;
      saadanyConsultant: number;
      saadanySpecialist: number;
      fallback: number;
    };
    lasik: {
      saadanyConsultantSaadany: number;
      saadanyConsultant: number;
      sawaf: number;
      fallback: number;
    };
  };
  doctorAccount: {
    prk: {
      saadany: number;
      consultant: number;
      specialist: number;
      sawaf: number;
      others: number;
    };
    lasik: {
      saadany: number;
      consultant: number;
      sawafMoria: number;
      sawafMetal: number;
      sawafFallback: number;
      othersMoria: number;
      othersMetal: number;
      othersFallback: number;
    };
  };
};
export const DEFAULT_APPOINTMENTS_PRICING: AppointmentsPricingConfig = {
  amount: {
    prk: {
      saadanyConsultantSaadany: 10000,
      saadanyConsultant: 7500,
      saadanySpecialist: 5500,
      fallback: OPERATION_BASE_AMOUNTS.PRK,
    },
    lasik: {
      saadanyConsultantSaadany: 18000,
      saadanyConsultant: 13500,
      sawaf: 10000,
      fallback: OPERATION_BASE_AMOUNTS.Lasik,
    },
  },
  doctorAccount: {
    prk: {
      saadany: 6250,
      consultant: 2000,
      specialist: 1200,
      sawaf: 1850,
      others: 1900,
    },
    lasik: {
      saadany: 9250,
      consultant: 3500,
      sawafMoria: 6050,
      sawafMetal: 3250,
      sawafFallback: 6050,
      othersMoria: 6150,
      othersMetal: 3500,
      othersFallback: 6150,
    },
  },
};
type OpKey = "prk" | "lasik" | "lasik_moria" | "lasik_metal" | "femto" | "other";
type LevelKey = "consultant" | "specialist" | "unknown";
const normalizeText = (value: unknown) => String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const includesAny = (text: string, words: string[]) => words.some((word) => text.includes(word));
const detectOperationKey = (operation: unknown): OpKey => {
  const text = normalizeText(operation);
  if (includesAny(text, ["prk"])) return "prk";
  if (includesAny(text, ["femto", "فيمتو"])) return "femto";
  if (includesAny(text, ["metal", "ميتال"])) return "lasik_metal";
  if (includesAny(text, ["moria", "موريا"])) return "lasik_moria";
  if (includesAny(text, ["lasik", "ليزك"])) return "lasik";
  return "other";
};
const detectLevel = (value: unknown): LevelKey => {
  const text = normalizeText(value);
  if (includesAny(text, ["consultant", "استشاري"])) return "consultant";
  if (includesAny(text, ["specialist", "اخصائي", "أخصائي"])) return "specialist";
  return "unknown";
};
const detectDoctorGroup = (tabKey: string, doctorName: unknown): "saadany" | "sawaf" | "others" => {
  const text = normalizeText(doctorName);
  if (includesAny(text, ["د/السعدني", "saadany"])) return "saadany";
  if (includesAny(text, ["د/الصواف", "sawaf"])) return "sawaf";
  if (tabKey === TAB_SAADANY) return "saadany";
  if (tabKey === TAB_SAWAF) return "sawaf";
  return "others";
};
const getPricingDefaults = (
  tabKey: string,
  row: { operation?: string; doctor?: string },
  config: AppointmentsPricingConfig = DEFAULT_APPOINTMENTS_PRICING
) => {
  const op = detectOperationKey(row.operation);
  const level = detectLevel(row.operation);
  const group = detectDoctorGroup(tabKey, row.doctor);
  const doctorText = normalizeText(row.doctor);
  const isSaadanyDoctor = includesAny(doctorText, ["السعدني", "saadany"]);

  let amount = 0;
  if (op === "prk") {
    if (group === "saadany") {
      if (isSaadanyDoctor) amount = Number(config.amount.prk.saadanyConsultantSaadany ?? 0);
      else if (level === "specialist") amount = Number(config.amount.prk.saadanySpecialist ?? 0);
      else amount = Number(config.amount.prk.saadanyConsultant ?? 0);
    } else {
      amount = Number(config.amount.prk.fallback ?? OPERATION_BASE_AMOUNTS.PRK);
    }
  } else if (op === "lasik" || op === "lasik_moria" || op === "lasik_metal") {
    if (group === "saadany") {
      amount = isSaadanyDoctor
        ? Number(config.amount.lasik.saadanyConsultantSaadany ?? 0)
        : Number(config.amount.lasik.saadanyConsultant ?? 0);
    } else if (group === "sawaf") {
      amount = Number(config.amount.lasik.sawaf ?? 0);
    } else {
      amount = Number(config.amount.lasik.fallback ?? OPERATION_BASE_AMOUNTS.Lasik);
    }
  } else if (op === "femto") {
    amount = OPERATION_BASE_AMOUNTS.Femto;
  } else {
    amount = OPERATION_BASE_AMOUNTS.Other;
  }

  let doctorAmount = 0;
  if (op === "femto") {
    doctorAmount = FEMTO_CENTER_SHARE_DEFAULT;
  } else if (group === "saadany") {
    if (op === "prk") {
      if (isSaadanyDoctor) doctorAmount = Number(config.doctorAccount.prk.saadany ?? 0);
      else if (level === "specialist") doctorAmount = Number(config.doctorAccount.prk.specialist ?? 0);
      else doctorAmount = Number(config.doctorAccount.prk.consultant ?? 0);
    } else if (op === "lasik" || op === "lasik_moria" || op === "lasik_metal") {
      doctorAmount = isSaadanyDoctor
        ? Number(config.doctorAccount.lasik.saadany ?? 0)
        : Number(config.doctorAccount.lasik.consultant ?? 0);
    }
  } else if (group === "sawaf") {
    if (op === "prk") doctorAmount = Number(config.doctorAccount.prk.sawaf ?? 0);
    else if (op === "lasik_moria" || op === "lasik") doctorAmount = Number(config.doctorAccount.lasik.sawafMoria ?? 0);
    else if (op === "lasik_metal") doctorAmount = Number(config.doctorAccount.lasik.sawafMetal ?? 0);
    else doctorAmount = Number(config.doctorAccount.lasik.sawafFallback ?? 0);
  } else {
    if (op === "prk") doctorAmount = Number(config.doctorAccount.prk.others ?? 0);
    else if (op === "lasik_moria" || op === "lasik") doctorAmount = Number(config.doctorAccount.lasik.othersMoria ?? 0);
    else if (op === "lasik_metal") doctorAmount = Number(config.doctorAccount.lasik.othersMetal ?? 0);
    else doctorAmount = Number(config.doctorAccount.lasik.othersFallback ?? 0);
  }

  return { amount, doctorAmount };
};

const operationTypeLabel = (value: unknown) => {
  const key = String(value ?? "").trim();
  if (!key) return "أخرى";
  return OPERATION_LABELS[key] ?? key;
};

const normalizeDoctorName = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const lowered = raw.toLowerCase();
  if (lowered === "dr. saadany" || lowered === "saadany") return "د/سعدني";
  if (lowered === "dr. sawaf" || lowered === "sawaf") return "د/صواف";
  return raw;
};

const tabLabelByKey = (value: unknown) => {
  const key = normalizeTabKey(value);
  return TAB_CONFIG.find((tab) => tab.key === key)?.label ?? key;
};

export default function Appointments() {
  const { isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();
  const permissionsQuery = trpc.medical.getMyPermissions.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const myPermissions = (permissionsQuery.data ?? []) as string[];
  const canManageList = user?.role === "reception" || user?.role === "admin";
  const canOpenAccounts = canManageList || myPermissions.includes("/appointments/accounts");

  const [activeTab, setActiveTab] = useState(TAB_SAADANY);
  const [listDate, setListDate] = useState(new Date().toISOString().split("T")[0]);
  const [operationType, setOperationType] = useState("");
  const [operationTypeOther, setOperationTypeOther] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [listTime, setListTime] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "accounts">("list");
  const [lists, setLists] = useState<Record<string, ListData[]>>({
    [TAB_SAADANY]: [],
    [TAB_SAWAF]: [],
    [TAB_OTHERS]: [],
  });

  const [newRow, setNewRow] = useState({
    number: "",
    name: "",
    phone: "",
    doctor: "",
    operation: "",
    center: false,
    payment: false,
    code: "",
    amount: 0,
    paidAmount: 0,
    doctorAmount: null,
    discountType: "amount" as const,
    discountValue: 0,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [savedSummariesByTab, setSavedSummariesByTab] = useState<Record<string, { key: string; date: string; names: string[]; listId?: number; items: any[] }[]>>({});

  const toDateInputValue = (value?: string | Date | null) => {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.valueOf())) return "";
    return date.toISOString().split("T")[0];
  };
  const safeListDate = toDateInputValue(listDate) || new Date().toISOString().split("T")[0];
  const listQuery = trpc.medical.getOperationList.useQuery(
    { doctorTab: activeTab, listDate: safeListDate },
    { refetchOnWindowFocus: false, enabled: Boolean(safeListDate) }
  );
  const [selectedListId, setSelectedListId] = useState<number>(0);
  const listByIdQuery = trpc.medical.getOperationListById.useQuery(
    { listId: selectedListId },
    { enabled: selectedListId > 0, refetchOnWindowFocus: false }
  );
  const historyQuery = trpc.medical.getOperationListsHistory.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const userStateQuery = trpc.medical.getUserPageState.useQuery(
    { page: "appointments" },
    { refetchOnWindowFocus: false }
  );
  const pricingSettingQuery = trpc.medical.getSystemSetting.useQuery(
    { key: "appointments_pricing_v1" },
    { refetchOnWindowFocus: false }
  );
  const saveUserStateMutation = trpc.medical.saveUserPageState.useMutation();
  const searchQuery = trpc.medical.searchPatients.useQuery(
    { searchTerm: debouncedSearch },
    { enabled: debouncedSearch.length >= 2, refetchOnWindowFocus: false }
  );
  const pricingConfig = useMemo(() => {
    const value = (pricingSettingQuery.data as any)?.value;
    if (!value || typeof value !== "object") return DEFAULT_APPOINTMENTS_PRICING;
    return value as AppointmentsPricingConfig;
  }, [pricingSettingQuery.data]);

  const saveListMutation = trpc.medical.saveOperationList.useMutation({
    onSuccess: () => {
      listQuery.refetch();
    },
    onError: (error: unknown) => {
      toast.error(getTrpcErrorMessage(error, "فشل حفظ القائمة"));
    },
  });

  const deleteListMutation = trpc.medical.deleteOperationList.useMutation({
    onSuccess: () => {
      toast.success("تم حذف القائمة الحالية");
      listQuery.refetch();
    },
    onError: (error: unknown) => {
      toast.error(getTrpcErrorMessage(error, "فشل حذف القائمة الحالية"));
    },
  });
  const deleteListByIdMutation = trpc.medical.deleteOperationListById.useMutation({
    onSuccess: () => {
      toast.success("تم حذف القائمة من السجل");
      historyQuery.refetch();
    },
    onError: (error: unknown) => {
      toast.error(getTrpcErrorMessage(error, "فشل حذف القائمة من السجل"));
    },
  });
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const lastSavedRef = useRef<string>("");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const formatDayDate = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return "";
    const day = date.toLocaleDateString("ar-EG", { weekday: "short" });
    const datePart = date.toLocaleDateString("ar-EG");
    return `${day} ${datePart}`;
  };

  const arabicWeekdays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const arabicWeekdaysByIndex = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

  const getWeekdayIndex = (value?: string | null) => {
    if (!value) return new Date().getDay();
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return new Date().getDay();
    return date.getDay();
  };

  const formatDayDateLong = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return "";
    const weekday = arabicWeekdaysByIndex[date.getDay()] ?? "";
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    return `${weekday} ${day}/${month}/${year}`;
  };

  const shiftDateToWeekday = (value: string, targetDayIndex: number) => {
    const base = new Date(value);
    if (Number.isNaN(base.valueOf())) return value;
    const delta = targetDayIndex - base.getDay();
    base.setDate(base.getDate() + delta);
    return toDateInputValue(base) || value;
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    if (!canOpenAccounts && viewMode === "accounts") {
      setViewMode("list");
    }
  }, [canOpenAccounts, viewMode]);

  useEffect(() => {
    const raw = localStorage.getItem("user_state_appointments");
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (data.activeTab) setActiveTab(normalizeTabKey(data.activeTab));
      if (data.listDate) setListDate(data.listDate);
      if (data.operationType !== undefined) setOperationType(data.operationType ?? "");
      if (data.operationTypeOther !== undefined) setOperationTypeOther(data.operationTypeOther ?? "");
      if (data.doctorName !== undefined) setDoctorName(normalizeDoctorName(data.doctorName ?? ""));
      if (data.listTime !== undefined) setListTime(data.listTime ?? "");
      if (data.viewMode === "accounts" || data.viewMode === "list") setViewMode(data.viewMode);
      if (data.historySearch !== undefined) setHistorySearch(data.historySearch ?? "");
      if (data.autoSaveEnabled !== undefined) setAutoSaveEnabled(Boolean(data.autoSaveEnabled));
    } catch {
      // ignore bad cache
    }
  }, []);

  useEffect(() => {
    const data = (userStateQuery.data as any)?.data;
    if (!data) return;
    if (data.activeTab) setActiveTab(normalizeTabKey(data.activeTab));
    if (data.listDate) setListDate(data.listDate);
    if (data.operationType !== undefined) setOperationType(data.operationType ?? "");
    if (data.operationTypeOther !== undefined) setOperationTypeOther(data.operationTypeOther ?? "");
    if (data.doctorName !== undefined) setDoctorName(normalizeDoctorName(data.doctorName ?? ""));
    if (data.listTime !== undefined) setListTime(data.listTime ?? "");
    if (data.viewMode === "accounts" || data.viewMode === "list") setViewMode(data.viewMode);
    if (data.historySearch !== undefined) setHistorySearch(data.historySearch ?? "");
    if (data.autoSaveEnabled !== undefined) setAutoSaveEnabled(Boolean(data.autoSaveEnabled));
  }, [userStateQuery.data]);

  useEffect(() => {
    const raw = localStorage.getItem("appointments_saved_summaries");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as typeof savedSummariesByTab;
      setSavedSummariesByTab(parsed ?? {});
    } catch {
      // ignore bad cache
    }
  }, []);

  useEffect(() => {
    if (!historyQuery.data) return;
    const grouped: typeof savedSummariesByTab = {};
    (historyQuery.data ?? []).forEach((item: any) => {
      const names = (item.items ?? []).map((row: any) => row?.name).filter(Boolean);
      const key = `${item.id}-${item.listDate}`;
      const tabKey = normalizeTabKey(item.doctorTab);
      grouped[tabKey] = grouped[tabKey] ?? [];
      grouped[tabKey].push({
        key,
        date: toDateInputValue(item.listDate) || String(item.listDate),
        names,
        listId: item.id,
        items: item.items ?? [],
      });
    });
    setSavedSummariesByTab((prev) => {
      const merged: typeof savedSummariesByTab = { ...prev };
      Object.entries(grouped).forEach(([tab, items]) => {
        const existing = merged[tab] ?? [];
        const byKey = new Map(existing.map((it) => [it.key, it]));
        items.forEach((it) => {
          if (!byKey.has(it.key)) {
            byKey.set(it.key, it);
          }
        });
        merged[tab] = Array.from(byKey.values());
      });
      localStorage.setItem("appointments_saved_summaries", JSON.stringify(merged));
      return merged;
    });
  }, [historyQuery.data]);

  useEffect(() => {
    if (!listDate) {
      setListDate(new Date().toISOString().split("T")[0]);
    }
  }, [listDate]);

  useEffect(() => {
    if (activeTab === TAB_SAADANY) {
      setDoctorName("د. سعدني");
      return;
    }
    if (activeTab === TAB_SAWAF) {
      setDoctorName("د. صواف");
    }
  }, [activeTab]);

  const operationOptions = useMemo(() => {
    if (activeTab === TAB_SAWAF || activeTab === TAB_OTHERS) {
      return ["PRK", "Lasik", "Lasik Moria", "Lasik Metal", "Femto"];
    }
    return ["PRK", "Lasik", "Lasik Moria", "Lasik Metal", "Femto", "Cataract", "Other"];
  }, [activeTab]);

  useEffect(() => {
    if (operationType && !operationOptions.includes(operationType)) {
      setOperationType("");
      setOperationTypeOther("");
    }
  }, [operationType, operationOptions]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 300);
    return () => clearTimeout(handle);
  }, [searchTerm]);

  useEffect(() => {
    const data = listQuery.data as any;
    if (!data || !data.items) return;
    setLists((prev) => {
      const existing = prev[activeTab] ?? [];
      const keyFor = (row: { code?: string; phone?: string; name?: string; id?: number }) =>
        `${String(row.code ?? "").trim()}|${String(row.phone ?? "").trim()}|${String(row.name ?? "").trim()}|${Number(row.id ?? 0)}`;
      const existingMap = new Map(existing.map((row) => [keyFor(row), row]));
      const items = (data.items ?? []).map((item: any, index: number) => {
        const next = {
          id: item.id ?? index + 1,
          number: item.number ?? "",
          name: item.name ?? "",
          phone: item.phone ?? "",
          doctor: normalizeDoctorName(item.doctor ?? ""),
          operation: item.operation ?? "",
          center: Boolean(item.center),
          payment: Boolean(item.payment),
          code: item.code ?? "",
        };
        const current = existingMap.get(keyFor(next));
        const defaults = getPricingDefaults(activeTab, next, pricingConfig);
        return {
          ...next,
          amount: Number(current?.amount ?? 0) > 0 ? Number(current?.amount ?? 0) : defaults.amount,
          paidAmount: Number(current?.paidAmount ?? 0),
          doctorAmount: current?.doctorAmount ?? defaults.doctorAmount,
          discountType: current?.discountType ?? "amount",
          discountValue: Number(current?.discountValue ?? 0),
        };
      });
      return { ...prev, [activeTab]: items };
    });
    if (data.operationType !== undefined && data.operationType !== null) {
      setOperationType(String(data.operationType));
      if (data.operationType !== "Other") {
        setOperationTypeOther("");
      }
    }
    if (data.doctorName !== undefined && data.doctorName !== null) {
      setDoctorName(normalizeDoctorName(String(data.doctorName)));
    }
    if (data.listTime !== undefined && data.listTime !== null) {
      setListTime(String(data.listTime));
    }
  }, [listQuery.data, activeTab, pricingConfig]);

  if (!isAuthenticated) return null;

  const currentList = lists[activeTab] || [];
  const computeAccounting = (row: ListData) => {
    const defaults = getPricingDefaults(
      activeTab,
      { operation: row.operation || operationType || "Other", doctor: row.doctor || doctorName },
      pricingConfig
    );
    const amountFromRow = Number(row.amount ?? 0);
    const gross = amountFromRow > 0 ? amountFromRow : defaults.amount;
    const rawDiscount = Number(row.discountValue ?? 0);
    const normalizedDiscount = Number.isFinite(rawDiscount) ? Math.max(rawDiscount, 0) : 0;
    const discount =
      row.discountType === "percent"
        ? Math.min(gross, (gross * Math.min(normalizedDiscount, 100)) / 100)
        : Math.min(gross, normalizedDiscount);
    const net = Math.max(gross - discount, 0);
    const paid = net;
    const baseDoctorAmount = defaults.doctorAmount;
    const centerAmount =
      row.doctorAmount === null || row.doctorAmount === undefined
        ? baseDoctorAmount
        : Math.max(0, Number(row.doctorAmount ?? 0));
    const remainingAmount = paid - centerAmount;
    return { centerAmount, paid, remainingAmount };
  };
  const accountingTotals = currentList.reduce(
    (acc, row) => {
      const values = computeAccounting(row);
      return {
        centerAmount: acc.centerAmount + values.centerAmount,
        paid: acc.paid + values.paid,
        remainingAmount: acc.remainingAmount + values.remainingAmount,
      };
    },
    { centerAmount: 0, paid: 0, remainingAmount: 0 }
  );

  const handlePrint = () => {
    window.print();
  };

  const handleAddPatientRow = (patient: any) => {
    if (!canManageList) return;
    if (!patient?.fullName || !patient?.phone) {
      toast.error("بيانات المريض غير مكتملة (الاسم والهاتف مطلوبان)");
      return;
    }
    const exists = currentList.some(
      (row) => row.patientId === patient.id || row.code === patient.patientCode || row.phone === patient.phone
    );
    if (exists) {
      toast.error("هذه الحالة موجودة بالفعل في القائمة");
      return;
    }
    const row: ListData = {
      id: currentList.length + 1,
      patientId: patient.id,
      number: "",
      name: patient.fullName ?? "",
      phone: patient.phone ?? "",
      doctor: doctorName,
      operation: operationType === "" ? operationTypeOther : operationType,
      center: false,
      payment: false,
      code: patient.patientCode ?? "",
      amount: 0,
      paidAmount: 0,
      doctorAmount: null,
      discountType: "amount",
      discountValue: 0,
    };
    const defaults = getPricingDefaults(activeTab, row, pricingConfig);
    row.amount = defaults.amount;
    row.doctorAmount = defaults.doctorAmount;
    setLists({
      ...lists,
      [activeTab]: [...currentList, row],
    });
    setSearchTerm("");
  };

  const handleDeleteRow = (id: number) => {
    if (!canManageList) return;
    setLists({
      ...lists,
      [activeTab]: currentList.filter((apt) => apt.id !== id),
    });
    toast.success("تم حذف الصف من القائمة");
  };

  const handleUpdateRow = (id: number, field: string, value: any) => {
    if (!canManageList) return;
    setLists({
      ...lists,
      [activeTab]: currentList.map((apt) => {
        if (apt.id !== id) return apt;
        const updated = { ...apt, [field]: value } as ListData;
        if (field === "amount" || field === "discountType" || field === "discountValue") {
          const amountFromRow = Number(updated.amount ?? 0);
          const rawDiscount = Number(updated.discountValue ?? 0);
          const normalizedDiscount = Number.isFinite(rawDiscount) ? Math.max(rawDiscount, 0) : 0;
          const discount =
            updated.discountType === "percent"
              ? Math.min(amountFromRow, (amountFromRow * Math.min(normalizedDiscount, 100)) / 100)
              : Math.min(amountFromRow, normalizedDiscount);
          updated.paidAmount = Math.max(amountFromRow - discount, 0);
        }
        return updated;
      }),
    });
  };

  const handleSaveList = async () => {
    if (!canManageList) {
      toast.error("عرض فقط لهذا الدور");
      return;
    }
    if (currentList.length === 0) {
      toast.error("القائمة فارغة. أضف حالة واحدة على الأقل قبل الحفظ");
      return;
    }
    const receiptNumbers = currentList
      .map((row) => String(row.number ?? "").trim())
      .filter((value) => value.length > 0);
    const duplicateReceipt = receiptNumbers.find((value, idx) => receiptNumbers.indexOf(value) !== idx);
    if (duplicateReceipt) {
      toast.error(`رقم الإيصال مكرر: ${duplicateReceipt}`);
      return;
    }
    const patientCodes = currentList
      .map((row) => String(row.code ?? "").trim())
      .filter((value) => value.length > 0);
    const duplicateCode = patientCodes.find((value, idx) => patientCodes.indexOf(value) !== idx);
    if (duplicateCode) {
      toast.error(`كود المريض مكرر: ${duplicateCode}`);
      return;
    }
    await saveListMutation.mutateAsync({
      doctorTab: activeTab,
      listDate,
      operationType: operationType || null,
      doctorName: doctorName || null,
      listTime: listTime || null,
      items: currentList.map((row) => ({
        number: row.number,
        name: row.name,
        phone: row.phone,
        doctor: row.doctor,
        operation: row.operation,
        center: row.center,
        payment: row.payment,
        code: row.code,
        discountType: row.discountType,
        discountValue: row.discountValue,
        })),
    });
    const tabLabel = TAB_CONFIG.find((tab) => tab.key === activeTab)?.label ?? activeTab;
    toast.success(`تم حفظ قائمة ${tabLabel} بنجاح`);
    const names = currentList.map((row) => row.name).filter(Boolean);
    const key = `${listDate}-${names.join("|")}`;
    setSavedSummariesByTab((prev) => {
      const next = prev[activeTab] ?? [];
      if (next.some((item) => item.key === key)) {
        return prev;
      }
      const updated = {
        ...prev,
        [activeTab]: [...next, { key, date: listDate, names, items: currentList }],
      };
      localStorage.setItem("appointments_saved_summaries", JSON.stringify(updated));
      return updated;
    });
    historyQuery.refetch();
  };

  const handleEditSavedSummary = (summary: { date: string; items: any[]; listId?: number }) => {
    if (summary.listId) {
      handleLoadListById(summary.listId);
      return;
    }
    setListDate(summary.date);
    setLists({
      ...lists,
      [activeTab]: summary.items.map((row: any, idx: number) => {
        const mapped = {
          id: row.id ?? idx + 1,
          patientId: row.patientId ?? null,
          number: row.number ?? "",
          name: row.name ?? "",
          phone: row.phone ?? "",
          doctor: normalizeDoctorName(row.doctor ?? doctorName),
          operation: row.operation ?? "",
          center: Boolean(row.center),
          payment: Boolean(row.payment),
          code: row.code ?? "",
          amount: Number(row.amount ?? 0),
          paidAmount: Number(row.paidAmount ?? 0),
          doctorAmount: row.doctorAmount === null || row.doctorAmount === undefined ? null : Number(row.doctorAmount),
          discountType: (row.discountType === "percent" ? "percent" : "amount") as "amount" | "percent",
          discountValue: Number(row.discountValue ?? 0),
        };
        const defaults = getPricingDefaults(activeTab, mapped, pricingConfig);
        return {
          ...mapped,
          amount: mapped.amount > 0 ? mapped.amount : defaults.amount,
          doctorAmount: mapped.doctorAmount ?? defaults.doctorAmount,
        };
      }),
    });
  };

  const handleDeleteSavedSummary = (key: string, listId?: number) => {
    if (listId) {
      deleteListByIdMutation.mutate({ listId });
    }
    setSavedSummariesByTab((prev) => {
      const updated = {
        ...prev,
        [activeTab]: (prev[activeTab] ?? []).filter((item) => item.key !== key),
      };
      localStorage.setItem("appointments_saved_summaries", JSON.stringify(updated));
      return updated;
    });
  };

  useEffect(() => {
    if (!canManageList) return;
    if (!autoSaveEnabled) return;
    if (currentList.length === 0) return;
    const payload = {
      doctorTab: activeTab,
      listDate,
      operationType: operationType || null,
      doctorName: doctorName || null,
      listTime: listTime || null,
      items: currentList.map((row) => ({
        number: row.number,
        name: row.name,
        phone: row.phone,
        doctor: row.doctor,
        operation: row.operation,
        center: row.center,
        payment: row.payment,
        code: row.code,
        discountType: row.discountType,
        discountValue: row.discountValue,
      })),
    };
    const snapshot = JSON.stringify(payload);
    if (snapshot === lastSavedRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        await saveListMutation.mutateAsync(payload);
        lastSavedRef.current = snapshot;
        historyQuery.refetch();
      } catch {
        // errors handled by mutation handler
      }
    }, 1200);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [autoSaveEnabled, activeTab, listDate, operationType, doctorName, listTime, currentList, saveListMutation, historyQuery]);

  useEffect(() => {
    const payload = {
      activeTab,
      listDate,
      operationType,
      operationTypeOther,
      doctorName,
      listTime,
      viewMode,
      historySearch,
      autoSaveEnabled,
    };
    localStorage.setItem("user_state_appointments", JSON.stringify(payload));
    if (userStateTimerRef.current) clearTimeout(userStateTimerRef.current);
    userStateTimerRef.current = setTimeout(() => {
      saveUserStateMutation.mutate({ page: "appointments", data: payload });
    }, 800);
    return () => {
      if (userStateTimerRef.current) clearTimeout(userStateTimerRef.current);
    };
  }, [
    activeTab,
    listDate,
    operationType,
    operationTypeOther,
    doctorName,
    listTime,
    viewMode,
    historySearch,
    autoSaveEnabled,
    saveUserStateMutation,
  ]);

  const handleNewList = async () => {
    if (!canManageList) {
      toast.error("عرض فقط لهذا الدور");
      return;
    }
    await deleteListMutation.mutateAsync({ doctorTab: activeTab, listDate });
    setLists({ ...lists, [activeTab]: [] });
    setNewRow({
      number: "",
      name: "",
      phone: "",
      doctor: "",
      operation: "",
      center: false,
      payment: false,
      code: "",
      amount: 0,
      paidAmount: 0,
      doctorAmount: null,
      discountType: "amount",
      discountValue: 0,
    });
  };

  const handleLoadListById = (listId: number) => {
    setSelectedListId(listId);
  };

  useEffect(() => {
    const data = listByIdQuery.data as any;
    if (!data || !data.id) return;
    setActiveTab(normalizeTabKey(data.doctorTab ?? activeTab));
    setListDate(toDateInputValue(data.listDate));
    setDoctorName(normalizeDoctorName(data.doctorName ?? ""));
    setOperationType(data.operationType ?? "");
    setListTime(data.listTime ?? "");
    const items = (data.items ?? []).map((item: any, index: number) => ({
      id: item.id ?? index + 1,
      number: item.number ?? "",
      name: item.name ?? "",
      phone: item.phone ?? "",
      doctor: normalizeDoctorName(item.doctor ?? ""),
      operation: item.operation ?? "",
      center: Boolean(item.center),
      payment: Boolean(item.payment),
      code: item.code ?? "",
      amount: 0,
      paidAmount: 0,
      doctorAmount: null,
      discountType: "amount" as const,
      discountValue: 0,
    })).map((row: ListData) => {
      const defaults = getPricingDefaults(normalizeTabKey(data.doctorTab ?? activeTab), row, pricingConfig);
      return {
        ...row,
        amount: defaults.amount,
        doctorAmount: defaults.doctorAmount,
      };
    });
    setLists((prev) => ({ ...prev, [normalizeTabKey(data.doctorTab ?? activeTab)]: items }));
  }, [listByIdQuery.data, activeTab, pricingConfig]);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <PageHeader backTo="/dashboard" />

      <main className="container mx-auto px-4 py-8 print:p-0">
        <div className="print:hidden">
          <div className="flex items-center justify-end gap-2 mb-2">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={!canManageList}
              placeholder="ابحث باسم المريض أو كود المريض أو رقم الهاتف"
              className="w-full max-w-md ml-auto text-right"
              dir="rtl"
            />
          </div>
          {debouncedSearch.length >= 2 && (
            <div className="border rounded-md p-2 bg-white max-w-md shadow-sm ml-auto">
              {searchQuery.isLoading && (
                <div className="text-sm text-muted-foreground">جاري تحميل نتائج البحث...</div>
              )}
              {!searchQuery.isLoading && (searchQuery.data ?? []).length === 0 && (
                <div className="text-sm text-muted-foreground">لا توجد نتائج مطابقة.</div>
              )}
              {!searchQuery.isLoading && (searchQuery.data ?? []).length > 0 && (
                <div className="flex flex-col gap-1">
                  {(searchQuery.data ?? []).map((patient: any) => (
                    <button
                      key={patient.id}
                      type="button"
                      onClick={() => handleAddPatientRow(patient)}
                      disabled={!canManageList}
                      className="text-right hover:bg-muted/40 rounded px-2 py-1"
                    >
                      <div className="text-sm font-medium">{patient.fullName}</div>
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {patient.patientCode ?? "-"}  {patient.phone ?? "-"}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 mb-6 print:hidden border-b-2 border-gray-300">
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-6 py-3 font-bold text-lg transition-all ${
                activeTab === tab.key ? "border-b-4 border-primary text-primary" : "text-gray-600 hover:text-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mb-4 print:hidden border-b border-gray-200">
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`px-4 py-2 font-semibold transition-all ${
              viewMode === "list" ? "border-b-2 border-primary text-primary" : "text-gray-600 hover:text-primary"
            }`}
          >
            القائمة
          </button>
          <button
            type="button"
            onClick={() => canOpenAccounts && setViewMode("accounts")}
            disabled={!canOpenAccounts}
            className={`px-4 py-2 font-semibold transition-all ${
              viewMode === "accounts" ? "border-b-2 border-primary text-primary" : "text-gray-600 hover:text-primary"
            }`}
          >
            حسابات
          </button>
        </div>

        <div className="bg-white p-8 print:p-0">
            <div className="mb-4 border-b-2 pb-3" style={{ textAlign: "center" }}>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm print:hidden">
              <label className="flex items-center gap-2">
                <span>تاريخ القائمة:</span>
                <select
                  value={getWeekdayIndex(toDateInputValue(listDate) || new Date().toISOString().split("T")[0])}
                  onChange={(e) => {
                    const targetIndex = Number(e.target.value);
                    const base = toDateInputValue(listDate) || new Date().toISOString().split("T")[0];
                    setListDate(shiftDateToWeekday(base, targetIndex));
                  }}
                  disabled={!canManageList}
                  className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                >
                  {arabicWeekdays.map((day, index) => (
                    <option key={day} value={index}>{day}</option>
                  ))}
                </select>
                <Input
                  type="date"
                  value={toDateInputValue(listDate)}
                  onChange={(e) => {
                    const value = e.target.value;
                    setListDate(value || new Date().toISOString().split("T")[0]);
                  }}
                  disabled={!canManageList}
                  className="text-sm h-7 w-40 text-center"
                />
              </label>
              <label className="flex items-center gap-2">
                <span>الطبيب المعالج:</span>
                <Input
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  className="text-sm h-7 w-40 text-center"
                  readOnly={!canManageList || activeTab !== TAB_OTHERS}
                />
              </label>
              <div className="flex items-center gap-2">
                <span>نوع العملية:</span>
                <select
                  value={operationType}
                  onChange={(e) => setOperationType(e.target.value)}
                  disabled={!canManageList}
                  className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                >
                  <option value="">-- اختر النوع --</option>
                  {operationOptions.map((opt) => (
                    <option key={opt} value={opt}>{operationTypeLabel(opt)}</option>
                  ))}
                </select>
                {operationType === "Other" && (
                  <Input
                    value={operationTypeOther}
                    onChange={(e) => setOperationTypeOther(e.target.value)}
                    disabled={!canManageList}
                    className="text-sm h-7 w-36 text-center"
                    placeholder="أخرى"
                  />
                )}
              </div>
              <label className="flex items-center gap-2">
                <span>الساعة:</span>
                <Input
                  value={listTime}
                  onChange={(e) => setListTime(e.target.value)}
                  disabled={!canManageList}
                  className="text-sm h-7 w-32 text-center"
                />
              </label>
            </div>
            <div className="hidden print:flex items-center justify-center gap-6 text-[14px]">
              <div>{formatDayDateLong(toDateInputValue(listDate) || new Date().toISOString().split("T")[0])}</div>
              <div>الطبيب المعالج: {doctorName || "-"}</div>
              <div>الساعة: {listTime || "-"}</div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 print:hidden">
              <Button variant="outline" size="sm" onClick={handleSaveList} disabled={!canManageList}>
                <Save className="h-4 w-4 mr-2" />
                حفظ القائمة
              </Button>
              <Button
                variant={autoSaveEnabled ? "default" : "outline"}
                size="sm"
                onClick={() => setAutoSaveEnabled((prev) => !prev)}
                disabled={!canManageList}
                className={autoSaveEnabled ? "bg-green-600 hover:bg-green-700 text-white" : ""}
              >
                الحفظ التلقائي: {autoSaveEnabled ? "مفعل" : "متوقف"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleNewList} disabled={!canManageList}>
                <RotateCcw className="h-4 w-4 mr-2" />
                قائمة جديدة
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                طباعة
              </Button>
            </div>
          </div>

          {viewMode === "list" && (
          <div className="overflow-x-auto mb-6" dir="rtl">
            <table className="w-full table-fixed border-collapse border border-gray-500 text-xs text-center print:text-[10px]" dir="rtl">
              <thead>
                <tr className="bg-gray-200">
                  <th className="border border-gray-500 p-1 font-bold w-6 text-center">#</th>
                  <th className="border border-gray-500 p-1 font-bold w-16 text-center">رقم الإيصال</th>
                  <th className="border border-gray-500 p-1 font-bold w-36 text-center">اسم المريض</th>
                  <th className="border border-gray-500 p-1 font-bold w-24 text-center">الهاتف</th>
                  <th className="border border-gray-500 p-2 font-bold w-20 text-center">الطبيب</th>
                  <th className="border border-gray-500 p-1 font-bold w-12 text-center">العملية</th>
                  <th className="border border-gray-500 p-1 font-bold w-6 text-center">مركز</th>
                  <th className="border border-gray-500 p-1 font-bold w-8 text-center">دفع</th>
                  <th className="border border-gray-500 p-1 font-bold w-12 text-center">الكود</th>
                  <th className="border border-gray-500 p-1 font-bold w-12 print:hidden text-center">حذف</th>
                </tr>
              </thead>
              <tbody>
                {currentList.map((apt, index) => (
                  <tr key={apt.id} className="border border-gray-500">
                    <td className="border border-gray-500 p-1 text-center font-bold w-6">
                      {index + 1}
                    </td>
                    <td className="border border-gray-500 p-1 w-16">
                      <div className="flex justify-start">
                        <Input
                          dir="ltr"
                          value={apt.number}
                          onChange={(e) => handleUpdateRow(apt.id, "number", e.target.value)}
                          readOnly={!canManageList}
                          className="text-[11px] h-6 text-center w-full"
                        />
                      </div>
                    </td>
                    <td className="border border-gray-500 p-1 w-36">
                      <div className="flex justify-start">
                        <Input
                          dir="rtl"
                          value={apt.name}
                          onChange={(e) => handleUpdateRow(apt.id, "name", e.target.value)}
                          readOnly={!canManageList}
                          className="text-[11px] h-6 text-center w-full !max-w-none"
                        />
                      </div>
                    </td>
                    <td className="border border-gray-500 p-1 w-24">
                      <div className="flex justify-start">
                        <Input
                          dir="rtl"
                          value={apt.phone}
                          onChange={(e) => handleUpdateRow(apt.id, "phone", e.target.value)}
                          readOnly={!canManageList}
                          className="text-[11px] h-6 text-center w-full"
                        />
                      </div>
                    </td>
                    <td className="border border-gray-500 p-1 w-20">
                      <div className="flex justify-start">
                        <Input
                          dir="rtl"
                          value={apt.doctor}
                          onChange={(e) => handleUpdateRow(apt.id, "doctor", e.target.value)}
                          readOnly={!canManageList}
                          className="text-[11px] h-6 text-center w-full"
                        />
                      </div>
                    </td>
                    <td className="border border-gray-500 p-1 w-12">
                      <div className="flex justify-start">
                        <Input
                          dir="rtl"
                          value={apt.operation}
                          onChange={(e) => handleUpdateRow(apt.id, "operation", e.target.value)}
                          readOnly={!canManageList}
                          className="text-[11px] h-6 text-center w-full"
                        />
                      </div>
                    </td>
                    <td className="border border-gray-500 p-1 w-6">
                      <input type="checkbox" checked={apt.center} onChange={(e) => handleUpdateRow(apt.id, "center", e.target.checked)} disabled={!canManageList} />
                    </td>
                    <td className="border border-gray-500 p-1 w-8">
                      <input type="checkbox" checked={apt.payment} onChange={(e) => handleUpdateRow(apt.id, "payment", e.target.checked)} disabled={!canManageList} />
                    </td>
                    <td className="border border-gray-500 p-1 w-12">
                      <div className="flex justify-start">
                        <Input
                          dir="rtl"
                          value={apt.code}
                          onChange={(e) => handleUpdateRow(apt.id, "code", e.target.value)}
                          readOnly={!canManageList}
                          className="text-[11px] h-6 text-center w-full"
                        />
                      </div>
                    </td>
                    <td className="border border-gray-500 p-1 w-12 print:hidden">
                      <Button variant="destructive" size="sm" onClick={() => handleDeleteRow(apt.id)} disabled={!canManageList}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {currentList.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-4 text-gray-500">لا توجد حالات في القائمة الحالية.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}

          {viewMode === "accounts" && (
            <div className="overflow-x-auto mb-6" dir="rtl">
              <table className="w-full border-collapse border border-gray-500 text-xs text-center">
                <thead>
                  <tr className="bg-gray-200">
                    <th className="border border-gray-500 p-2 font-bold">اسم المريض</th>
                    <th className="border border-gray-500 p-2 font-bold">نوع العملية</th>
                    <th className="border border-gray-500 p-2 font-bold">المبلغ</th>
                    <th className="border border-gray-500 p-2 font-bold">نوع الخصم</th>
                    <th className="border border-gray-500 p-2 font-bold">الخصم</th>
                    <th className="border border-gray-500 p-2 font-bold">المدفوع</th>
                    <th className="border border-gray-500 p-2 font-bold">حساب المركز (من الدكتور)</th>
                    <th className="border border-gray-500 p-2 font-bold">المتبقي (حساب الدكتور)</th>
                  </tr>
                </thead>
                <tbody>
                  {currentList.map((apt) => {
                    const values = computeAccounting(apt);
                    return (
                      <tr key={`acc-${apt.id}`}>
                        <td className="border border-gray-500 p-2">{apt.name || "-"}</td>
                        <td className="border border-gray-500 p-2">{operationTypeLabel(apt.operation || operationType || "Other")}</td>
                        <td className="border border-gray-500 p-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={String(apt.amount ?? 0)}
                            onChange={(e) => {
                              const raw = Number(e.target.value);
                              handleUpdateRow(apt.id, "amount", Number.isFinite(raw) ? raw : 0);
                            }}
                            readOnly={!canManageList}
                            className="h-7 text-center"
                          />
                        </td>
                        <td className="border border-gray-500 p-2">
                          <select
                            value={apt.discountType}
                            onChange={(e) => handleUpdateRow(apt.id, "discountType", e.target.value === "percent" ? "percent" : "amount")}
                            disabled={!canManageList}
                            className="border border-gray-300 rounded px-2 py-1 text-xs bg-white"
                          >
                            <option value="amount">قيمة</option>
                            <option value="percent">نسبة %</option>
                          </select>
                        </td>
                        <td className="border border-gray-500 p-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={String(apt.discountValue ?? 0)}
                            onChange={(e) => {
                              const raw = Number(e.target.value);
                              handleUpdateRow(apt.id, "discountValue", Number.isFinite(raw) ? raw : 0);
                            }}
                            readOnly={!canManageList}
                            className="h-7 text-center"
                          />
                        </td>
                        <td className="border border-gray-500 p-2">{values.paid.toFixed(2)}</td>
                        <td className="border border-gray-500 p-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={String(apt.doctorAmount ?? values.centerAmount)}
                            onChange={(e) => {
                              const rawText = e.target.value.trim();
                              if (rawText === "") {
                                handleUpdateRow(apt.id, "doctorAmount", null);
                                return;
                              }
                              const raw = Number(rawText);
                              handleUpdateRow(apt.id, "doctorAmount", Number.isFinite(raw) ? raw : null);
                            }}
                            readOnly={!canManageList}
                            className="h-7 text-center"
                          />
                        </td>
                        <td className="border border-gray-500 p-2">{values.remainingAmount.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                  {currentList.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-4 text-gray-500">لا توجد حالات في القائمة الحالية.</td>
                    </tr>
                  )}
                </tbody>
                {currentList.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-100 font-bold">
                      <td className="border border-gray-500 p-2" colSpan={5}>الإجمالي</td>
                      <td className="border border-gray-500 p-2">{accountingTotals.paid.toFixed(2)}</td>
                      <td className="border border-gray-500 p-2">{accountingTotals.centerAmount.toFixed(2)}</td>
                      <td className="border border-gray-500 p-2">{accountingTotals.remainingAmount.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {(savedSummariesByTab[activeTab] ?? []).length > 0 && (
            <div className="mt-4 border-t pt-3 print:hidden" dir="rtl">
              <div className="text-sm font-bold mb-2">القوائم المحفوظة</div>
              <div className="flex flex-col gap-2 text-sm">
                {(savedSummariesByTab[activeTab] ?? []).map((item) => (
                  <div key={item.key} className="border border-gray-200 rounded p-2 flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{item.date}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.names.length > 0 ? item.names.join(" ") : "-"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEditSavedSummary(item)}>
                        تعديل
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDeleteSavedSummary(item.key, item.listId)} disabled={!canManageList}>
                        حذف
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === TAB_SAADANY && (
          <div className="mt-6 border-t pt-4 print:hidden">
            <h3 className="text-sm font-bold mb-3">السجل السابق لقوائم العمليات</h3>
            <div className="mb-3 flex justify-end">
              <Input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="ابحث داخل السجل باسم المريض"
                className="w-full max-w-sm ml-auto text-right"
                dir="rtl"
              />
            </div>
            {historyQuery.isLoading && (
              <div className="text-sm text-muted-foreground">جاري تحميل السجل...</div>
            )}
            {!historyQuery.isLoading && (historyQuery.data ?? []).length === 0 && (
              <div className="text-sm text-muted-foreground">لا يوجد سجل محفوظ حالياً.</div>
            )}
            {!historyQuery.isLoading && (historyQuery.data ?? []).length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {(() => {
                  const needle = historySearch.trim().toLowerCase();
                  const normalized = (value: unknown) => String(value ?? "").toLowerCase();
                  const itemsWithMatches = (historyQuery.data ?? []).map((item: any) => {
                    const names = (item.items ?? []).map((it: any) => String(it.name ?? ""));
                    const matches = needle
                      ? names.filter((name: string) => normalized(name).includes(needle))
                      : names;
                    return {
                      item,
                      matches,
                      hasMatch: needle ? matches.length > 0 : true,
                    };
                  });
                  if (needle && itemsWithMatches.every(({ item }) => (item.items ?? []).length === 0)) {
                    return (
                      <div className="text-sm text-muted-foreground">لا توجد نتائج مطابقة في السجل.</div>
                    );
                  }
                  return [
                    { key: "PRK / ليزك", match: ["PRK", "Lasik"] },
                    { key: "مياه بيضاء", match: ["Cataract"] },
                    { key: "أخرى", match: [null, "", "Other"] },
                  ].map((group) => (
                    <div key={group.key} className="border rounded-md p-2">
                      <div className="font-bold text-sm mb-2">{group.key}</div>
                      <div className="flex flex-col gap-1">
                        {itemsWithMatches
                          .filter(({ item, hasMatch }) => hasMatch && group.match.includes(item.operationType ?? "Other"))
                          .map(({ item, matches }) => (
                          <div key={`${item.id}`} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted/40">
                            <button
                              type="button"
                              className="text-right flex-1"
                              onClick={() => handleLoadListById(item.id)}
                            >
                              <div className="text-sm font-medium">
                                {item.doctorName ?? tabLabelByKey(item.doctorTab)}
                              </div>
                              <div className="text-xs text-muted-foreground" dir="ltr">
                                {formatDayDate(item.listDate)}  {operationTypeLabel(item.operationType ?? "Other")}  {matches[0] ?? item.items?.[0]?.name ?? " "}
                              </div>
                            </button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleLoadListById(item.id)}
                            >
                              تحميل
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => deleteListByIdMutation.mutate({ listId: item.id })}
                              disabled={!canManageList}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        {itemsWithMatches
                          .filter(({ item, hasMatch }) => hasMatch && group.match.includes(item.operationType ?? "Other")).length === 0 && (
                          <div className="text-xs text-muted-foreground">لا توجد نتائج في هذا القسم</div>
                        )}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
          )}

        </div>
      </main>
    </div>
  );
}




