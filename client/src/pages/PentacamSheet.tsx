import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import PageHeader from "@/components/PageHeader";
import PatientPicker from "@/components/PatientPicker";
import PentacamFilesPanel from "@/components/PentacamFilesPanel";
import LocalPentacamExportsPanel from "@/components/LocalPentacamExportsPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";

export default function PentacamSheet() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/sheets/pentacam/:id");
  const [patientId, setPatientId] = useState<number>(Number(params?.id ?? 0) || 0);
  const { user } = useAuth();
  const isAdmin = String((user as any)?.role ?? "").toLowerCase() === "admin";

  useEffect(() => {
    const fromRoute = Number(params?.id ?? 0);
    if (Number.isFinite(fromRoute) && fromRoute > 0) {
      setPatientId(fromRoute);
    }
  }, [params?.id]);

  const patientQuery = trpc.medical.getPatient.useQuery(
    { patientId },
    { enabled: patientId > 0, refetchOnWindowFocus: false }
  );
  const patient = patientQuery.data as any;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader backTo="/dashboard" />
      <main className="container mx-auto px-4 py-8 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>بنتاكام</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <PatientPicker
              initialPatientId={patientId > 0 ? patientId : undefined}
              onSelect={(p) => {
                setPatientId(p.id);
                setLocation(`/sheets/pentacam/${p.id}`);
              }}
            />
            {patientId > 0 && (
              <div className="text-sm text-muted-foreground">
                {String(patient?.patientCode ?? "")} {String(patient?.fullName ?? "")}
              </div>
            )}
          </CardContent>
        </Card>
        <PentacamFilesPanel patientId={patientId} />
        {isAdmin ? <LocalPentacamExportsPanel patientId={patientId} /> : null}
      </main>
    </div>
  );
}

