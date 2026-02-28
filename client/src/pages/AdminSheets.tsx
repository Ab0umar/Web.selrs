import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PatientPicker from "@/components/PatientPicker";
import { FileText } from "lucide-react";

type PickedPatient = {
  id: number;
  fullName: string;
};

const SHEET_LINKS = [
  { key: "consultant", title: "Consultant Sheet", path: (id: number) => `/sheets/consultant/${id}` },
  { key: "followup", title: "Consultant Follow-up", path: (id: number) => `/sheets/consultant/${id}?tab=followup` },
  { key: "specialist", title: "Specialist Sheet", path: (id: number) => `/sheets/specialist/${id}` },
  { key: "pentacam", title: "Pentacam Sheet", path: (id: number) => `/sheets/pentacam/${id}` },
  { key: "lasik", title: "LASIK Sheet", path: (id: number) => `/sheets/lasik/${id}` },
  { key: "operation", title: "Lasik/Operation Sheet", path: (id: number) => `/sheets/operation/${id}` },
  { key: "external", title: "External Operation Sheet", path: (id: number) => `/sheets/external/${id}` },
] as const;

function withOriginalFlag(path: string) {
  return path.includes("?") ? `${path}&original=1` : `${path}?original=1`;
}

export default function AdminSheets() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedPatient, setSelectedPatient] = useState<PickedPatient | null>(null);

  if (!isAuthenticated) {
    setLocation("/");
    return null;
  }

  if (user?.role !== "admin") {
    return null;
  }

  const patientId = selectedPatient?.id ?? null;
  const subtitle = useMemo(() => {
    if (!selectedPatient) return "Select A Patient, Then Open Any Sheet To Edit.";
    return `Selected: ${selectedPatient.fullName}`;
  }, [selectedPatient]);

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            All Sheets
          </CardTitle>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </CardHeader>
        <CardContent>
          <div className="mb-3">
            <Button variant="outline" onClick={() => setLocation("/dashboard?tab=admin")} className="mr-2">
              Admin Home
            </Button>
            <Button variant="outline" onClick={() => setLocation("/admin/sheet-designer")}>
              Open Sheet Designer
            </Button>
          </div>
          <PatientPicker
            initialPatientId={patientId ?? undefined}
            onSelect={(patient) => {
              setSelectedPatient({
                id: patient.id,
                fullName: patient.fullName,
              });
            }}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SHEET_LINKS.map((sheet) => (
          <Card key={sheet.key}>
            <CardHeader>
              <CardTitle className="text-base">{sheet.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  disabled={!patientId}
                  onClick={() => {
                    if (!patientId) return;
                    setLocation(sheet.path(patientId));
                  }}
                >
                  Open And Edit
                </Button>
                <Button
                  className="flex-1"
                  variant="outline"
                  disabled={!patientId}
                  onClick={() => {
                    if (!patientId) return;
                    setLocation(withOriginalFlag(sheet.path(patientId)));
                  }}
                >
                  Open Original
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
