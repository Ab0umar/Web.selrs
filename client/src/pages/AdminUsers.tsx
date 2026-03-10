import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Edit2, Shield } from "lucide-react";
import { toast } from "sonner";
import { getTrpcErrorMessage } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import AdminDoctors from "./AdminDoctors";
import AdminPermissions from "./AdminPermissions";
import AdminPatients from "./AdminPatients";
import AdminServices from "./AdminServices";

type UserRole = "admin" | "doctor" | "nurse" | "technician" | "reception" | "manager" | "accountant";
type UserBranch = "examinations" | "surgery" | "both";
type TeamPermissionsMap = Record<UserRole, string[]>;

interface User {
  id: number;
  username: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  branch: UserBranch;
  shift: 1 | 2;
  isActive: boolean;
  createdAt: Date;
}

type UserForm = {
  username: string;
  password: string;
  name: string;
  role: UserRole;
  branch: UserBranch;
  shift: 1 | 2;
  writeToMssql: boolean;
};

const PAGE_PERMISSIONS = [
  { id: "/dashboard", label: "Dashboard" },
  { id: "/patient-data/edit", label: "Edit Patient Data (Dashboard / Examination)" },
  { id: "/patients", label: "Patients" },
  { id: "/patients/:id", label: "Patient Details" },
  { id: "/examination", label: "Examination" },
  { id: "/appointments", label: "Appointments" },
  { id: "/appointments/accounts", label: "Appointments - Accounts" },
  { id: "/medical-reports", label: "Medical Reports" },
  { id: "/surgeries", label: "Surgeries" },
  { id: "/sheets/consultant/:id", label: "Consultant Sheet" },
  { id: "/sheets/specialist/:id", label: "Specialist Sheet" },
  { id: "/sheets/pentacam/:id", label: "Pentacam Sheet" },
  { id: "/sheets/lasik/:id", label: "Lasik Sheet" },
  { id: "/sheets/operation/:id", label: "Lasik/Operation Sheet" },
  { id: "/sheets/external/:id", label: "External Sheet" },
  { id: "/medications", label: "Medications" },
  { id: "/prescription", label: "Prescription" },
  { id: "/refraction/:id", label: "Refraction Page" },
  { id: "/tests", label: "Tests Management" },
  { id: "/request-tests", label: "Request Tests" },
  { id: "/admin/users", label: "Admin Users" },
  { id: "/admin/migrations", label: "Admin Migrations" },
  { id: "/admin/api-tools", label: "Admin API Tools" },
  { id: "/admin/status", label: "Admin Status" },
  { id: "/admin/settings", label: "Admin Settings" },
  { id: "/admin/sheets", label: "All Sheets" },
  { id: "/admin/sheet-designer", label: "Sheet Designer" },
  { id: "/admin/doctors", label: "Doctors" },
  { id: "/admin/patients", label: "Admin Patients" },
  { id: "/ops/mssql-add", label: "Write To MSSQL" },
] as const;

const DEFAULT_ROLE: UserRole = "doctor";
const DEFAULT_BRANCH: UserBranch = "examinations";
const DEFAULT_SHIFT: 1 | 2 = 1;
const MSSQL_WRITE_PERMISSION = "/ops/mssql-add";

export default function AdminUsers() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const usersQuery = trpc.medical.getAllUsers.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const teamPermissionsQuery = trpc.medical.getTeamPermissions.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const createUserMutation = trpc.medical.createUser.useMutation({
    onSuccess: () => {
      toast.success("User added successfully.");
      utils.medical.getAllUsers.invalidate();
    },
  });

  const updateUserMutation = trpc.medical.updateUser.useMutation({
    onSuccess: () => {
      toast.success("User updated successfully.");
      utils.medical.getAllUsers.invalidate();
    },
  });

  const setUserPermissionsMutation = trpc.medical.setUserPermissions.useMutation({
    onSuccess: () => {
      toast.success("Permissions updated successfully.");
    },
  });

  const deleteUserMutation = trpc.medical.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("User deleted successfully.");
      utils.medical.getAllUsers.invalidate();
    },
  });

  const users = (usersQuery.data ?? []) as User[];

  const [newUser, setNewUser] = useState<UserForm>({
    username: "",
    password: "",
    name: "",
    role: DEFAULT_ROLE,
    branch: DEFAULT_BRANCH,
    shift: DEFAULT_SHIFT,
    writeToMssql: false,
  });

  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserForm>({
    username: "",
    password: "",
    name: "",
    role: DEFAULT_ROLE,
    branch: DEFAULT_BRANCH,
    shift: DEFAULT_SHIFT,
    writeToMssql: false,
  });
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [activeAdminTab, setActiveAdminTab] = useState("users");
  const userStateQuery = trpc.medical.getUserPageState.useQuery(
    { page: "admin-users" },
    { refetchOnWindowFocus: false }
  );
  const saveUserStateMutation = trpc.medical.saveUserPageState.useMutation();
  const userStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSaving = createUserMutation.isPending || updateUserMutation.isPending || setUserPermissionsMutation.isPending;

  const permissionsQuery = trpc.medical.getUserPermissions.useQuery(
    { userId: editUserId ?? 0 },
    {
      enabled: Boolean(editUserId) && isEditOpen,
      refetchOnWindowFocus: false,
    }
  );

  const roleDefaults = useMemo<TeamPermissionsMap>(() => {
    const data = teamPermissionsQuery.data;
    return {
      admin: data?.admin ?? [],
      manager: data?.manager ?? [],
      accountant: data?.accountant ?? [],
      doctor: data?.doctor ?? [],
      nurse: data?.nurse ?? [],
      technician: data?.technician ?? [],
      reception: data?.reception ?? [],
    };
  }, [teamPermissionsQuery.data]);

  const getRoleDefaults = (role: UserRole) => roleDefaults[role] ?? [];

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    const data = (userStateQuery.data as any)?.data;
    if (!data) return;
    if (data.searchTerm !== undefined) setSearchTerm(data.searchTerm ?? "");
    if (data.statusFilter !== undefined) setStatusFilter(data.statusFilter ?? "all");
  }, [userStateQuery.data]);

  useEffect(() => {
    if (usersQuery.isLoading) return;
    if (users.length === 0) return;
    if (searchTerm.trim().length > 0) return;
    if (statusFilter === "inactive" && users.some((u) => u.isActive)) {
      setStatusFilter("all");
    }
  }, [usersQuery.isLoading, users, searchTerm, statusFilter]);

  useEffect(() => {
    if (userStateTimerRef.current) clearTimeout(userStateTimerRef.current);
    userStateTimerRef.current = setTimeout(() => {
      const payload = { searchTerm, statusFilter };
      saveUserStateMutation.mutate({ page: "admin-users", data: payload });
    }, 600);
    return () => {
      if (userStateTimerRef.current) clearTimeout(userStateTimerRef.current);
    };
  }, [searchTerm, statusFilter, saveUserStateMutation]);

  if (!isAuthenticated) return null;

  if (user?.role !== "admin") {
    return (
      <div className="container mx-auto px-4 py-8 text-right" dir="rtl">
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-700">Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">You do not have permission to access this page. Admin role is required.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSaveUser = async () => {
    const username = newUser.username.trim();
    const password = newUser.password;
    const name = newUser.name.trim();

    if (!username || !password || !name) {
      toast.error("Please fill all required fields.");
      return;
    }
    if (username.length < 3) {
      toast.error("Username must be at least 3 characters.");
      return;
    }

    try {
      await createUserMutation.mutateAsync({
        username,
        password,
        name,
        role: newUser.role,
        branch: newUser.branch,
        shift: newUser.shift,
        writeToMssql: newUser.writeToMssql,
      });

      setNewUser({
        username: "",
        password: "",
        name: "",
        role: DEFAULT_ROLE,
        branch: DEFAULT_BRANCH,
        shift: DEFAULT_SHIFT,
        writeToMssql: false,
      });
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to save user."));
    }
  };

  const handleEdit = (u: User) => {
    setEditUserId(u.id);
    setEditUser({
      username: u.username,
      password: "",
      name: u.name ?? "",
      role: u.role,
      branch: u.branch,
      shift: u.shift ?? DEFAULT_SHIFT,
      writeToMssql: false,
    });
    setEditPermissions(getRoleDefaults(u.role));
    setIsEditOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this user?")) return;
    try {
      await deleteUserMutation.mutateAsync({ userId: id });
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to delete user."));
    }
  };

  const handleToggleActive = async (u: User) => {
    try {
      await updateUserMutation.mutateAsync({
        userId: u.id,
        updates: { isActive: !u.isActive },
      });
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to update user status."));
    }
  };

  useEffect(() => {
    if (!isEditOpen || !permissionsQuery.data) return;
    if (permissionsQuery.data.length > 0) {
      setEditPermissions(permissionsQuery.data);
      setEditUser((prev) => ({
        ...prev,
        writeToMssql: permissionsQuery.data.includes(MSSQL_WRITE_PERMISSION),
      }));
      return;
    }
    const defaults = getRoleDefaults(editUser.role);
    setEditPermissions(defaults);
    setEditUser((prev) => ({
      ...prev,
      writeToMssql: defaults.includes(MSSQL_WRITE_PERMISSION),
    }));
  }, [permissionsQuery.data, isEditOpen, editUserId]);

  const togglePermission = (pageId: string) => {
    setEditPermissions((prev) =>
      prev.includes(pageId)
        ? prev.filter((id) => id !== pageId)
        : [...prev, pageId]
    );
  };

  const handleSaveEdit = async () => {
    if (!editUserId) return;
    const username = editUser.username.trim();
    const name = editUser.name.trim();
    if (!username || !name) {
      toast.error("Please fill all required fields.");
      return;
    }
    if (username.length < 3) {
      toast.error("Username must be at least 3 characters.");
      return;
    }

    try {
      const updates: Record<string, unknown> = {
        username,
        name,
        role: editUser.role,
        branch: editUser.branch,
        shift: editUser.shift,
      };

      if (editUser.password) {
        updates.password = editUser.password;
      }

      await updateUserMutation.mutateAsync({
        userId: editUserId,
        updates,
      });

      const finalPermissions = editUser.writeToMssql
        ? Array.from(new Set([...editPermissions, MSSQL_WRITE_PERMISSION]))
        : editPermissions.filter((id) => id !== MSSQL_WRITE_PERMISSION);

      await setUserPermissionsMutation.mutateAsync({
        userId: editUserId,
        pageIds: finalPermissions,
      });

      setIsEditOpen(false);
      setEditUserId(null);
      setEditUser({
        username: "",
        password: "",
        name: "",
        role: DEFAULT_ROLE,
        branch: DEFAULT_BRANCH,
        shift: DEFAULT_SHIFT,
        writeToMssql: false,
      });
      setEditPermissions([]);
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to save changes."));
    }
  };

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return users.filter((u) => {
      const matchesTerm =
        !term ||
        [u.name, u.username]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLowerCase().includes(term));

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? u.isActive : !u.isActive);

      return matchesTerm && matchesStatus;
    });
  }, [users, searchTerm, statusFilter]);

  return (
    <div className="container mx-auto px-4 py-8 text-right" dir="rtl">
      <Tabs
        value={activeAdminTab}
        onValueChange={(value) => {
          if (value === "admin-home") {
            setLocation("/dashboard?tab=admin");
            return;
          }
          setActiveAdminTab(value);
        }}
        className="w-full"
      >
        <div className="mb-6">
          <TabsList className="grid w-full grid-cols-6" dir="rtl">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="doctors">Doctors</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="patients">Patients</TabsTrigger>
            <TabsTrigger value="admin-home">Admin Page</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="users">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="h-8 w-8 text-blue-600" />
          <div />
        </div>
      </div>

      {/* Add/Edit User Form */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Add New User</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-2">Username</label>
              <Input
                placeholder="username"
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <Input
                type="password"
                placeholder="Enter password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Name</label>
              <Input
                placeholder="Enter full name"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Role</label>
              <Select
                value={newUser.role}
                onValueChange={(value) =>
                  setNewUser({ ...newUser, role: value as UserRole })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="doctor">Doctor</SelectItem>
                  <SelectItem value="nurse">Nurse</SelectItem>
                  <SelectItem value="technician">Technician</SelectItem>
                  <SelectItem value="reception">Reception</SelectItem>
                  <SelectItem value="accountant">Accountant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Branch</label>
              <Select
                value={newUser.branch}
                onValueChange={(value) =>
                  setNewUser({ ...newUser, branch: value as UserBranch })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="examinations">Examinations</SelectItem>
                  <SelectItem value="surgery">Surgery</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Shift</label>
              <Select
                value={String(newUser.shift)}
                onValueChange={(value) =>
                  setNewUser({ ...newUser, shift: Number(value) === 2 ? 2 : 1 })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Morning (1)</SelectItem>
                  <SelectItem value="2">Night (2)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-8">
              <Checkbox
                checked={newUser.writeToMssql}
                onCheckedChange={(checked) => setNewUser({ ...newUser, writeToMssql: Boolean(checked) })}
              />
              <label className="text-sm font-medium">Write to MSSQL</label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSaveUser} className="bg-blue-600 hover:bg-blue-700" disabled={isSaving}>
              <Plus className="h-4 w-4 ml-2" />
              Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Default permissions for role <strong>{newUser.role}</strong>: {getRoleDefaults(newUser.role).length}
          </p>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Users List ({filteredUsers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-lg border bg-background p-3">
            <div className="flex items-center justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFiltersOpen((v) => !v)}
              >
                {filtersOpen ? "Hide Filters" : "Show Filters"}
              </Button>
            </div>

            {filtersOpen && (
              <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
                <div className="w-full md:flex-1">
                  <Input
                    placeholder="Search by name or username..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 border-muted bg-background text-right"
                    dir="rtl"
                  />
                </div>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "active" | "inactive")}>
                  <SelectTrigger className="h-10 w-full border-muted bg-background md:w-[180px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="overflow-x-auto" dir="rtl">
            <Table className="text-right">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">Name</TableHead>
                  <TableHead className="text-right">Username</TableHead>
                  <TableHead className="text-right">Shift</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersQuery.isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-right text-muted-foreground">
                      Loading users...
                    </TableCell>
                  </TableRow>
                )}
                {!usersQuery.isLoading && filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-right text-muted-foreground">
                      No matching results
                    </TableCell>
                  </TableRow>
                )}
                {filteredUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="text-right">{u.name ?? ""}</TableCell>
                    <TableCell className="text-right">{u.username}</TableCell>
                    <TableCell className="text-right">{u.shift === 2 ? "Night (2)" : "Morning (1)"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleActive(u)}
                        className={u.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}
                      >
                        {u.isActive ? " " : " "}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(u)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(u.id)}
                          className="text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-3xl text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle>Edit User & Permissions</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-2">Username</label>
              <Input
                placeholder="username"
                value={editUser.username}
                onChange={(e) => setEditUser({ ...editUser, username: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <Input
                type="password"
                placeholder="Leave empty to keep unchanged"
                value={editUser.password}
                onChange={(e) => setEditUser({ ...editUser, password: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-2">Name</label>
              <Input
                placeholder="Enter full name"
                value={editUser.name}
                onChange={(e) => setEditUser({ ...editUser, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Role</label>
              <Select
                value={editUser.role}
                onValueChange={(value) => {
                  const nextRole = value as UserRole;
                  setEditUser({ ...editUser, role: nextRole });
                  setEditPermissions(getRoleDefaults(nextRole));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="doctor">Doctor</SelectItem>
                  <SelectItem value="nurse">Nurse</SelectItem>
                  <SelectItem value="technician">Technician</SelectItem>
                  <SelectItem value="reception">Reception</SelectItem>
                  <SelectItem value="accountant">Accountant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Branch</label>
              <Select
                value={editUser.branch}
                onValueChange={(value) =>
                  setEditUser({ ...editUser, branch: value as UserBranch })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="examinations">Examinations</SelectItem>
                  <SelectItem value="surgery">Surgery</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Shift</label>
              <Select
                value={String(editUser.shift)}
                onValueChange={(value) =>
                  setEditUser({ ...editUser, shift: Number(value) === 2 ? 2 : 1 })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Morning (1)</SelectItem>
                  <SelectItem value="2">Night (2)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-8">
              <Checkbox
                checked={editUser.writeToMssql}
                onCheckedChange={(checked) =>
                  setEditUser({ ...editUser, writeToMssql: Boolean(checked) })
                }
              />
              <label className="text-sm font-medium">Write to MSSQL</label>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Permissions</label>
              <span className="text-xs text-muted-foreground">
                {permissionsQuery.isLoading ? " ..." : `${editPermissions.length} `}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 border rounded-lg p-3 max-h-56 overflow-y-auto">
              {PAGE_PERMISSIONS.map((page) => (
                <label
                  key={page.id}
                  className="flex items-center gap-2 rounded border border-border px-2 py-1 text-[13px] leading-tight cursor-pointer"
                >
                  <Checkbox
                    checked={editPermissions.includes(page.id)}
                    onCheckedChange={() => togglePermission(page.id)}
                  />
                  <span>{page.label}</span>
                </label>
              ))}
            </div>
            {permissionsQuery.isError && (
              <p className="text-xs text-red-600 mt-2">Failed to load permissions.</p>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSaveEdit} className="bg-blue-600 hover:bg-blue-700" disabled={isSaving}>
              Save
            </Button>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
        </TabsContent>

        <TabsContent value="doctors">
          <AdminDoctors />
        </TabsContent>

        <TabsContent value="services">
          <AdminServices />
        </TabsContent>

        <TabsContent value="permissions">
          <AdminPermissions />
        </TabsContent>

        <TabsContent value="patients">
          <AdminPatients />
        </TabsContent>
      </Tabs>
    </div>
  );
}






