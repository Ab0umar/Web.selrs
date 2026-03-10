import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type TeamRole =
  | "admin"
  | "manager"
  | "accountant"
  | "doctor"
  | "nurse"
  | "technician"
  | "reception";
type TeamPermissionsMap = Record<TeamRole, string[]>;

const DEFAULT_TEAM_PERMISSIONS: TeamPermissionsMap = {
  admin: [],
  manager: [],
  accountant: [],
  doctor: [],
  nurse: [],
  technician: [],
  reception: [],
};

const ROLE_LABELS: Record<TeamRole, string> = {
  admin: "Admin",
  manager: "Manager",
  accountant: "Accountant",
  doctor: "Doctor",
  nurse: "Nurse",
  technician: "Technician",
  reception: "Reception",
};

const PAGE_PERMISSIONS = [
  { id: "/dashboard", label: "Dashboard" },
  { id: "/patient-data/edit", label: "Edit Patient Data (Dashboard / Examination)" },
  { id: "/patients", label: "Patients" },
  { id: "/patients/:id", label: "Patient Details" },
  { id: "/examination", label: "Examinations" },
  { id: "/appointments", label: "Appointments / Operation List" },
  { id: "/appointments/accounts", label: "Appointments - Accounts" },
  { id: "/medical-reports", label: "Medical Reports" },
  { id: "/surgeries", label: "Surgeries" },
  { id: "/sheets/consultant/:id", label: "Consultant Sheet" },
  { id: "/sheets/specialist/:id", label: "Specialist Sheet" },
  { id: "/sheets/pentacam/:id", label: "Pentacam Sheet" },
  { id: "/sheets/lasik/:id", label: "Lasik Sheet" },
  { id: "/sheets/operation/:id", label: "Lasik/Operation Sheet" },
  { id: "/sheets/external/:id", label: "External Sheet" },
  { id: "/medications", label: "Medications & Tests" },
  { id: "/prescription", label: "Prescription" },
  { id: "/refraction/:id", label: "Refraction Page" },
  { id: "/tests", label: "Tests Management" },
  { id: "/request-tests", label: "Request Tests" },
  { id: "/admin/users", label: "Admin Users" },
  { id: "/admin/permissions", label: "Admin Permissions" },
  { id: "/admin/doctors", label: "Admin Doctors" },
  { id: "/admin/settings", label: "Admin Settings" },
  { id: "/admin/sheets", label: "Admin Sheets" },
  { id: "/admin/sheet-designer", label: "Admin Sheet Designer" },
  { id: "/admin/migrations", label: "Admin Migrations" },
  { id: "/admin/status", label: "Admin Status" },
  { id: "/admin/api-tools", label: "Admin API Tools" },
  { id: "/ops/mssql-add", label: "MSSQL Adding (Create Patient Sync)" },
] as const;

const ROLE_ORDER: TeamRole[] = [
  "admin",
  "manager",
  "accountant",
  "doctor",
  "nurse",
  "technician",
  "reception",
];

export default function AdminPermissions() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const [permissions, setPermissions] = useState<TeamPermissionsMap>(DEFAULT_TEAM_PERMISSIONS);
  const permissionsQuery = trpc.medical.getTeamPermissions.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const saveMutation = trpc.medical.setTeamPermissions.useMutation({
    onSuccess: () => {
      toast.success("Role permissions updated");
      utils.medical.getTeamPermissions.invalidate();
    },
    onError: () => {
      toast.error("Failed to update role permissions");
    },
  });

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    if (!permissionsQuery.data) return;
    setPermissions({
      admin: permissionsQuery.data.admin ?? [],
      manager: permissionsQuery.data.manager ?? [],
      accountant: permissionsQuery.data.accountant ?? [],
      doctor: permissionsQuery.data.doctor ?? [],
      nurse: permissionsQuery.data.nurse ?? [],
      technician: permissionsQuery.data.technician ?? [],
      reception: permissionsQuery.data.reception ?? [],
    });
  }, [permissionsQuery.data]);

  if (!isAuthenticated || user?.role !== "admin") return null;

  const togglePermission = (role: TeamRole, pageId: string, checked: boolean) => {
    setPermissions((prev) => {
      const current = prev[role] ?? [];
      if (checked) {
        if (current.includes(pageId)) return prev;
        return { ...prev, [role]: [...current, pageId] };
      }
      return { ...prev, [role]: current.filter((id) => id !== pageId) };
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-[1400px]">
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Edit role permissions and save changes.
          </div>
          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="p-2 text-left whitespace-nowrap">Page</th>
                  {ROLE_ORDER.map((role) => (
                    <th key={role} className="p-2 text-center whitespace-nowrap">
                      {ROLE_LABELS[role]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PAGE_PERMISSIONS.map((perm) => (
                  <tr key={perm.id} className="border-b last:border-b-0">
                    <td className="p-2 font-medium whitespace-nowrap">{perm.label}</td>
                    {ROLE_ORDER.map((role) => (
                      <td key={`${perm.id}-${role}`} className="p-2 text-center">
                        <Checkbox
                          checked={permissions[role].includes(perm.id)}
                          onCheckedChange={(checked) =>
                            togglePermission(role, perm.id, Boolean(checked))
                          }
                          aria-label={`${ROLE_LABELS[role]} ${perm.label}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <Button
              onClick={() => void saveMutation.mutateAsync(permissions)}
              disabled={saveMutation.isPending || permissionsQuery.isLoading}
            >
              {saveMutation.isPending ? "Saving..." : "Save Permissions"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
