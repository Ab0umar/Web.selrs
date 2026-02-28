import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Trash2 } from "lucide-react";

type DoctorEntry = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  locationType: "center" | "external";
  doctorType: "consultant" | "specialist";
};

const makeId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const nextDoctorCode = (existing: DoctorEntry[]) => {
  let maxNum = 0;
  for (const doctor of existing) {
    const code = String(doctor.code || "").trim().toUpperCase();
    const match = code.match(/(\d+)$/);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > maxNum) maxNum = n;
  }
  const next = String(maxNum + 1).padStart(3, "0");
  return `DR${next}`;
};

const doctorCodeSortValue = (code: string) => {
  const raw = String(code ?? "").trim().toUpperCase();
  const match = raw.match(/(\d+)$/);
  const num = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(num) ? num : Number.MAX_SAFE_INTEGER;
};

export default function AdminDoctors() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [doctors, setDoctors] = useState<DoctorEntry[]>([]);
  const [newDoctor, setNewDoctor] = useState<{
    code: string;
    name: string;
    locationType: "center" | "external";
    doctorType: "consultant" | "specialist";
  }>({
    code: "",
    name: "",
    locationType: "center",
    doctorType: "consultant",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const doctorsQuery = trpc.medical.getDoctorDirectory.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const updateDoctorsMutation = trpc.medical.updateDoctorDirectory.useMutation();

  useEffect(() => {
    if (!isAuthenticated) setLocation("/");
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    if (!doctorsQuery.data) return;
    const normalized: DoctorEntry[] = (doctorsQuery.data as DoctorEntry[]).map((doctor) => ({
      ...doctor,
      locationType: doctor.locationType === "external" ? "external" : "center",
      doctorType: doctor.doctorType === "specialist" ? "specialist" : "consultant",
    }));
    setDoctors(normalized);
  }, [doctorsQuery.data]);

  if (!isAuthenticated || user?.role !== "admin") return null;

  const sortedDoctors = useMemo(
    () =>
      [...doctors].sort((a, b) => {
        const an = doctorCodeSortValue(a.code);
        const bn = doctorCodeSortValue(b.code);
        if (an !== bn) return an - bn;
        return String(a.code ?? "").localeCompare(String(b.code ?? ""), "en", { numeric: true });
      }),
    [doctors]
  );
  const filteredDoctors = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return sortedDoctors;
    return sortedDoctors.filter((doctor) => {
      const code = String(doctor.code ?? "").toLowerCase();
      const name = String(doctor.name ?? "").toLowerCase();
      return code.includes(term) || name.includes(term);
    });
  }, [sortedDoctors, searchTerm]);

  const addDoctor = () => {
    const typedCode = newDoctor.code.trim();
    const name = newDoctor.name.trim();
    if (!name) {
      toast.error("Doctor name is required");
      return;
    }
    const code = typedCode || nextDoctorCode(doctors);
    const exists = doctors.some(
      (d) => d.code.trim().toLowerCase() === code.toLowerCase() || d.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (exists) {
      toast.error("Doctor already exists");
      return;
    }
    setDoctors((prev) => [
      ...prev,
      {
        id: makeId(),
        code,
        name,
        isActive: true,
        locationType: newDoctor.locationType,
        doctorType: newDoctor.doctorType,
      },
    ]);
    setNewDoctor({ code: "", name: "", locationType: "center", doctorType: "consultant" });
  };

  const parseCsvLine = (line: string) => {
    const out: string[] = [];
    let current = "";
    let quote: '"' | "'" | null = null;
    const sep: "," | ";" | "\t" = line.includes(";") ? ";" : line.includes("\t") ? "\t" : ",";
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if ((ch === '"' || ch === "'") && (!quote || quote === ch)) {
        quote = quote === ch ? null : (ch as '"' | "'");
        continue;
      }
      if (!quote && ch === sep) {
        out.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    out.push(current.trim());
    return out.map((v) => v.replace(/^\uFEFF/, "").trim());
  };

  const importDoctorsCsv = async (file: File) => {
    setIsImporting(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (lines.length === 0) {
        toast.error("CSV file is empty");
        return;
      }
      const next = [...doctors];
      let imported = 0;
      for (let i = 0; i < lines.length; i += 1) {
        const parts = parseCsvLine(lines[i]);
        if (parts.length < 2) continue;
        const code = String(parts[0] ?? "").trim();
        const name = String(parts[1] ?? "").trim();
        const typeRaw = String(parts[2] ?? "").trim().toLowerCase();
        const doctorType: "consultant" | "specialist" =
          typeRaw === "specialist" || typeRaw === "اخصائي" || typeRaw === "أخصائي" ? "specialist" : "consultant";
        if (!code || !name) continue;
        if (/^(code|doctor[_\s-]*code)$/i.test(code) && /^(name|doctor[_\s-]*name)$/i.test(name)) continue;
        const exists = next.some(
          (d) => d.code.trim().toLowerCase() === code.toLowerCase() || d.name.trim().toLowerCase() === name.toLowerCase()
        );
        if (exists) continue;
        next.push({ id: makeId(), code, name, isActive: true, locationType: "center", doctorType });
        imported += 1;
      }
      setDoctors(next);
      if (imported === 0) toast.error("No rows imported. CSV should have: code,name[,type]");
      else toast.success(`Imported ${imported} doctors`);
    } catch {
      toast.error("Failed to import CSV");
    } finally {
      setIsImporting(false);
    }
  };

  const saveDoctors = async () => {
    try {
      const normalized = doctors.map((doctor) => ({
        ...doctor,
        locationType: doctor.locationType === "external" ? "external" : "center",
        doctorType: doctor.doctorType === "specialist" ? "specialist" : "consultant",
      }));
      await updateDoctorsMutation.mutateAsync({ doctors: normalized });
      toast.success("Doctor directory saved");
      doctorsQuery.refetch();
    } catch {
      toast.error("Failed to save doctor directory");
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Doctor Directory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Add doctors as names/codes without creating system users.</p>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <Input
              placeholder="Doctor Code (optional, auto if empty)"
              value={newDoctor.code}
              onChange={(e) => setNewDoctor((prev) => ({ ...prev, code: e.target.value }))}
              dir="ltr"
            />
            <Input
              placeholder="Doctor Name"
              value={newDoctor.name}
              onChange={(e) => setNewDoctor((prev) => ({ ...prev, name: e.target.value }))}
            />
            <Select
              value={newDoctor.locationType}
              onValueChange={(value) => setNewDoctor((prev) => ({ ...prev, locationType: value as "center" | "external" }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="external">External</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={newDoctor.doctorType}
              onValueChange={(value) =>
                setNewDoctor((prev) => ({ ...prev, doctorType: value as "consultant" | "specialist" }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="consultant">Consultant</SelectItem>
                <SelectItem value="specialist">Specialist</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={addDoctor}>Add Doctor</Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={saveDoctors} disabled={updateDoctorsMutation.isPending}>
              Save Directory
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.currentTarget.value = "";
                if (!file) return;
                await importDoctorsCsv(file);
              }}
            />
            <Button type="button" variant="outline" disabled={isImporting} onClick={() => fileInputRef.current?.click()}>
              Import CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDoctors([]);
              }}
            >
              Clear All
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Doctors ({filteredDoctors.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            placeholder="Search doctor by code or name"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
          {filteredDoctors.map((doctor) => (
            <div key={doctor.id} className="grid grid-cols-1 md:grid-cols-[1fr_2fr_1fr_1fr_auto_auto] gap-2 items-center border rounded p-2">
              <Input
                value={doctor.code}
                onChange={(e) =>
                  setDoctors((prev) => prev.map((d) => (d.id === doctor.id ? { ...d, code: e.target.value } : d)))
                }
                dir="ltr"
              />
              <Input
                value={doctor.name}
                onChange={(e) =>
                  setDoctors((prev) => prev.map((d) => (d.id === doctor.id ? { ...d, name: e.target.value } : d)))
                }
              />
              <Select
                value={doctor.locationType}
                onValueChange={(value) =>
                  setDoctors((prev) =>
                    prev.map((d) => (d.id === doctor.id ? { ...d, locationType: value as "center" | "external" } : d))
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="external">External</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={doctor.doctorType}
                onValueChange={(value) =>
                  setDoctors((prev) =>
                    prev.map((d) =>
                      d.id === doctor.id ? { ...d, doctorType: value as "consultant" | "specialist" } : d
                    )
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="consultant">Consultant</SelectItem>
                  <SelectItem value="specialist">Specialist</SelectItem>
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={doctor.isActive}
                  onCheckedChange={(checked) =>
                    setDoctors((prev) => prev.map((d) => (d.id === doctor.id ? { ...d, isActive: Boolean(checked) } : d)))
                  }
                />
                Active
              </label>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDoctors((prev) => prev.filter((d) => d.id !== doctor.id))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
