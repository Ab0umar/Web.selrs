import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Search } from "lucide-react";

type PatientOption = {
  id: number;
  fullName: string;
  patientCode?: string | null;
  phone?: string | null;
  age?: number | null;
  dateOfBirth?: string | Date | null;
  address?: string | null;
};

type PatientPickerProps = {
  label?: string;
  placeholder?: string;
  initialPatientId?: number;
  onSelect: (patient: PatientOption) => void;
  readOnly?: boolean;
  sheetType?: "consultant" | "specialist" | "lasik" | "external";
};

export default function PatientPicker({
  label = "اختر المريض",
  placeholder = "ابحث بالاسم أو الكود...",
  initialPatientId,
  onSelect,
  readOnly = false,
  sheetType,
}: PatientPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PatientOption | null>(null);
  const hydratedPatientIdRef = useRef<number | null>(null);

  const patientQuery = trpc.medical.getPatient.useQuery(
    { patientId: initialPatientId ?? 0 },
    { enabled: Boolean(initialPatientId) }
  );

  const normalizedQuery = query.replace(/\s+/g, "");

  const searchQuery = trpc.medical.searchPatients.useQuery(
    { searchTerm: normalizedQuery, sheetType },
    {
      enabled: normalizedQuery.trim().length >= 1,
      refetchOnWindowFocus: false,
    }
  );

  useEffect(() => {
    if (!patientQuery.data) return;
    const patient = patientQuery.data as unknown as PatientOption;
    if (hydratedPatientIdRef.current === patient.id) return;
    hydratedPatientIdRef.current = patient.id;
    setSelected(patient);
    setQuery(patient.fullName ?? "");
    onSelect(patient);
  }, [patientQuery.data, initialPatientId]);

  const results = (searchQuery.data ?? []) as PatientOption[];

  const formatPhone = (value?: string | null) => {
    if (!value) return "";
    const digits = value.replace(/\D+/g, "");
    if (digits.length === 11) {
      return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
    }
    return value;
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium hidden">{label}</label>
      <div className="relative w-full max-w-md ml-auto">
        <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            if (readOnly) return;
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (readOnly) return;
            setOpen(true);
          }}
          onBlur={() => {
            if (readOnly) return;
            setTimeout(() => setOpen(false), 150);
          }}
          placeholder={placeholder}
          className="pr-9 w-full text-right"
          dir="rtl"
          readOnly={readOnly}
        />
      </div>
      {!readOnly && open && normalizedQuery.trim().length >= 1 && (
        <div className="border rounded-lg bg-background shadow-sm max-h-56 overflow-y-auto">
          {searchQuery.isLoading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">جاري البحث...</div>
          )}
          {!searchQuery.isLoading && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">لا توجد نتائج</div>
          )}
          {results.map((patient) => (
            <button
              key={patient.id}
              type="button"
              className="w-full text-right px-3 py-2 hover:bg-muted/60 transition-colors"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setSelected(patient);
                setQuery(patient.fullName ?? "");
                setOpen(false);
                onSelect(patient);
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{patient.fullName}</span>
                <span className="text-xs text-muted-foreground" dir="ltr">
                  {patient.patientCode ?? "—"}
                </span>
              </div>
              {patient.phone && (
                <div className="text-xs text-muted-foreground" dir="ltr">
                  {formatPhone(patient.phone)}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div className="text-xs text-muted-foreground hidden">
          المريض المحدد: <span className="font-medium">{selected.fullName}</span>
        </div>
      )}
    </div>
  );
}


