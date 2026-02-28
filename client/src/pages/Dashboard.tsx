import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PatientPicker from "@/components/PatientPicker";
import {
  Users,
  Calendar,
  FileText,
  Eye,
  ClipboardList,
  Shield,
  Settings,
  User,
} from "lucide-react";
import { useLocation } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getTrpcErrorMessage } from "@/lib/utils";

export default function Dashboard() {
  const { user, logout, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const initialTab = (() => {
    if (typeof window === "undefined") return "main";
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "admin") return "admin";
    return "main";
  })();
  const permissionsQuery = trpc.medical.getMyPermissions.useQuery(undefined, {
    enabled: Boolean(user) && user?.role !== "admin",
    refetchOnWindowFocus: false,
  });
  const todayDateIso = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  })();
  const todayPatientsQuery = trpc.medical.getTodayPatientsBySheet.useQuery(
    { date: todayDateIso },
    {
      enabled: ["doctor", "nurse", "technician", "manager", "admin"].includes(user?.role ?? ""),
      refetchOnWindowFocus: false,
    }
  );

  const allowedPaths = useMemo(() => {
    return (permissionsQuery.data ?? []) as string[];
  }, [permissionsQuery.data]);

  const canAccess = (path: string) => {
    if (!user) return false;
    if (user.role === "admin") return true;
    if (!allowedPaths.length) return false;
    return allowedPaths.some((permission) => {
      if (!permission) return false;
      if (permission === path) return true;
      if (permission.includes("/:")) {
        const base = permission.split("/:")[0];
        return path.startsWith(`${base}/`);
      }
      return false;
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-right">
          <h1 className="text-3xl font-bold text-foreground mb-4">
            مركز عيون الشروق
          </h1>
          <Button onClick={() => setLocation("/")} className="bg-primary">
            العودة إلى الصفحة الرئيسية
          </Button>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  const getDashboardCards = () => {
    const cards = [];
    const adminCards = [];

    if ((user?.role === "admin" || canAccess("/patients")) && (user?.role === "admin" || user)) {
      cards.push({
        title: "المرضى",
        description: "إدارة بيانات المرضى",
        icon: Users,
        color: "bg-blue-500",
        action: () => setLocation("/patients"),
        path: "/patients",
      });
    }

    if (user?.role === "admin" || canAccess("/examination")) {
      cards.push({
        title: "الفحوصات",
        description: "إدخال بيانات الفحوصات",
        icon: Eye,
        color: "bg-cyan-500",
        action: () => setLocation("/examination"),
        path: "/examination",
      });
    }

    if (user?.role === "admin" || canAccess("/sheets/pentacam/:id")) {
      cards.push({
        title: "بنتاكام",
        description: "عرض صور وملفات البنتاكام",
        icon: Eye,
        color: "bg-indigo-500",
        action: () => setLocation("/sheets/pentacam"),
        path: "/sheets/pentacam",
      });
    }

    if (user?.role === "admin" || canAccess("/appointments")) {
      cards.push({
        title: "العمليات",
        description: "لست العمليات",
        icon: Calendar,
        color: "bg-amber-500",
        action: () => setLocation("/appointments"),
        path: "/appointments",
      });
    }

    if (user?.role === "admin" || canAccess("/medical-reports")) {
      cards.push({
        title: "التقارير",
        description: "كتابة وعرض التقارير الطبية",
        icon: FileText,
        color: "bg-purple-500",
        action: () => setLocation("/medical-reports"),
        path: "/medical-reports",
      });
    }

    if (user?.role === "admin" || canAccess("/prescription")) {
      cards.push({
        title: "كتابة الروشتة",
        description: "إنشاء وطباعة روشتات طبية",
        icon: FileText,
        color: "bg-orange-500",
        action: () => setLocation("/prescription"),
        path: "/prescription",
      });
    }

    if (user) {
      cards.push({
        title: "مقاس النظاره",
        description: "فتح وتعديل مقاس النظاره",
        icon: Eye,
        color: "bg-emerald-600",
        action: () => setLocation("/refraction"),
        path: "/refraction",
      });
    }

    if (user?.role === "admin" || canAccess("/request-tests")) {
      cards.push({
        title: "طلب الفحوصات",
        description: "إنشاء وطباعة طلبات فحوصات",
        icon: ClipboardList,
        color: "bg-cyan-600",
        action: () => setLocation("/request-tests"),
        path: "/request-tests",
      });
    }

    if (user?.role === "admin" || canAccess("/medications")) {
      cards.push({
        title: "الأدوية والفحوصات",
        description: "إدارة الأدوية والفحوصات والتحاليل",
        icon: ClipboardList,
        color: "bg-teal-500",
        action: () => setLocation("/medications"),
        path: "/medications",
      });
    }

    if (user?.role === "admin") {
      cards.push({
        title: "نسخة الشيتات",
        description: "عرض ومراجعة نسخ الشيتات",
        icon: FileText,
        color: "bg-blue-700",
        action: () => setLocation("/sheet-copies"),
        path: "/sheet-copies",
      });
    }
    if (["admin"].includes(user?.role || "")) {
      adminCards.push({
        title: "Sheets",
        description: "All Sheets + Sheet Designer",
        icon: FileText,
        color: "bg-blue-700",
        action: () => setLocation("/admin/sheets"),
        path: "/admin/sheets",
      });
    }

    if (["admin"].includes(user?.role || "")) {
      adminCards.push({
        title: "User Management",
        description: "Users + Doctors + Permissions",
        icon: Shield,
        color: "bg-indigo-600",
        action: () => setLocation("/admin/users"),
        path: "/admin/users",
      });
    }

    if (["admin"].includes(user?.role || "")) {
      adminCards.push({
        title: "إعدادات النظام",
        description: "الإعدادات + حالة النظام + APIs + الترحيلات",
        icon: Settings,
        color: "bg-slate-700",
        action: () => setLocation("/admin/settings"),
        path: "/admin/settings",
      });
    }

    return { cards, adminCards };
  };

  const { cards, adminCards } = getDashboardCards();
  const isReception = user?.role === "reception";
  const canSeeTodayPatients = ["doctor", "nurse", "technician", "manager", "admin"].includes(user?.role ?? "");
  const [todayPatientsExpanded, setTodayPatientsExpanded] = useState(user?.role !== "admin");
  const mainOrder = [
    "المرضى",
    "الفحوصات",
    "بنتاكام",
    "العمليات",
    "التقارير",
    "كتابة الروشتة",
    "مقاس النظاره",
    "طلب الفحوصات",
    "الأدوية والفحوصات",
    "نسخة الشيتات",
  ];
  const adminOrder = [
    "Sheets",
    "User Management",
    "إعدادات النظام",
  ];
  const orderMap = new Map(mainOrder.map((name, idx) => [name, idx]));
  const adminOrderMap = new Map(adminOrder.map((name, idx) => [name, idx]));
  const sortedCards = [...cards].sort((a, b) => {
    const aIdx = orderMap.get(a.title) ?? Number.MAX_SAFE_INTEGER;
    const bIdx = orderMap.get(b.title) ?? Number.MAX_SAFE_INTEGER;
    return aIdx - bIdx;
  });
  const sortedAdminCards = [...adminCards].sort((a, b) => {
    const aIdx = adminOrderMap.get(a.title) ?? Number.MAX_SAFE_INTEGER;
    const bIdx = adminOrderMap.get(b.title) ?? Number.MAX_SAFE_INTEGER;
    return aIdx - bIdx;
  });
  const mainCardsWithoutPatients = sortedCards.filter((card) => card.path !== "/examination");
  const displayMainCards = isReception ? mainCardsWithoutPatients : sortedCards;
  const todayGroups = ((todayPatientsQuery.data as any)?.groups ?? []) as Array<{
    serviceType: string;
    total: number;
    patients: Array<{ id: number; patientCode: string; fullName: string }>;
  }>;
  const todayTotal = Number((todayPatientsQuery.data as any)?.total ?? 0);
  const sheetLabel = (serviceType: string) => {
    const key = String(serviceType ?? "").toLowerCase();
    if (key === "consultant") return "استشاري";
    if (key === "specialist") return "اخصائي";
    if (key === "pentacam" || key === "pentacam_center" || key === "pentacam_external" || key === "radiology_center" || key === "radiology_external") return "بنتاكام";
    if (key === "lasik") return "فحوصات الليزك";
    if (key === "external") return "خارجي";
    if (key === "surgery") return "عمليات";
    return key || "غير محدد";
  };
  const sheetPathForPatient = (serviceType: string, patientId: number) => {
    const key = String(serviceType ?? "").toLowerCase();
    if (key === "consultant") return `/sheets/consultant/${patientId}`;
    if (key === "specialist") return `/sheets/specialist/${patientId}`;
    if (key === "pentacam" || key === "pentacam_center" || key === "radiology_center") return `/sheets/pentacam/${patientId}`;
    if (key === "pentacam_external" || key === "radiology_external") return `/sheets/external/${patientId}`;
    if (key === "lasik") return `/sheets/lasik/${patientId}`;
    if (key === "external") return `/sheets/external/${patientId}`;
    if (key === "surgery" || key === "surgery_center") return `/sheets/operation/${patientId}`;
    if (key === "surgery_external") return `/sheets/external/${patientId}`;
    return `/patients/${patientId}`;
  };

  const renderCard = (card: any, index: number, extraClassName = "") => {
    const Icon = card.icon;
    return (
      <Card
        key={`${card.path}-${index}`}
        className={`hover:shadow-lg transition-shadow cursor-pointer ${extraClassName}`}
        onClick={card.action}
      >
        <CardHeader>
          <div className="flex items-start justify-between" dir="auto">
            <div>
              <CardTitle className="text-xl text-start">{card.title}</CardTitle>
              <CardDescription className="text-start">{card.description}</CardDescription>
            </div>
            <div className={`${card.color} p-3 rounded-lg`}>
              <Icon className="h-6 w-6 text-white" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full"
            onClick={(e) => {
              e.stopPropagation();
              card.action();
            }}
          >
            فتح
          </Button>
        </CardContent>
      </Card>
    );
  };

  const renderTodayPatientsSection = () => (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {todayGroups.map((group) => (
          <Card key={group.serviceType}>
            <CardHeader>
              <CardTitle className="text-base">
                {sheetLabel(group.serviceType)} ({group.total})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {group.patients.length === 0 ? (
                <div className="text-sm text-muted-foreground">لا توجد حالات</div>
              ) : (
                <div className="space-y-2 max-h-[280px] overflow-auto">
                  {group.patients.map((p) => (
                    <div key={p.id} className="rounded border px-2 py-2 space-y-2">
                      <div className="text-xs text-muted-foreground">{p.patientCode}</div>
                      <div className="text-sm">{p.fullName}</div>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          title="Patient Details"
                          onClick={() => setLocation(`/patients/${p.id}`)}
                        >
                          <User className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          title="Autoref / Examination"
                          onClick={() => setLocation(`/examination/${p.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          title="Open Sheet"
                          onClick={() => setLocation(sheetPathForPatient(group.serviceType, p.id))}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        <div className={isReception ? "space-y-6" : ""} dir="rtl">
          {isReception && (
            <div className="w-full">
              <ReceptionPatientInfoPanel onOpenExamination={() => setLocation("/examination")} />
            </div>
          )}
          {canSeeTodayPatients && (
            <Card className="mb-4">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-xl">Today Patients</CardTitle>
                    <CardDescription>
                      تاريخ الزيارة: {todayDateIso} | الإجمالي: {todayTotal}
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTodayPatientsExpanded((prev) => !prev)}
                  >
                    {todayPatientsExpanded ? "إخفاء" : "عرض"}
                  </Button>
                </div>
              </CardHeader>
              {todayPatientsExpanded && <CardContent>{renderTodayPatientsSection()}</CardContent>}
            </Card>
          )}
          <div>
            <Tabs defaultValue={initialTab} className="w-full">
              <TabsList
                className="flex flex-col w-full items-stretch mb-8 h-auto gap-2"
              >
                {user?.role === "admin" && (
                  <TabsTrigger value="admin" className="w-full">الإدارة</TabsTrigger>
                )}
                <TabsTrigger value="main" className="w-full">الرئيسية</TabsTrigger>
              </TabsList>

              <TabsContent value="main">
                {user?.role !== "admin" &&
                  permissionsQuery.isSuccess &&
                  displayMainCards.length === 0 && (
                    <div className="text-center text-muted-foreground py-12">
                      لا توجد صلاحيات مفعلة لهذا المستخدم
                    </div>
                  )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" dir="rtl">
                  {displayMainCards.map((card, index) => renderCard(card, index))}
                </div>
              </TabsContent>

              {user?.role === "admin" && (
                <TabsContent value="admin">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" dir="rtl">
                    {sortedAdminCards.map((card, index) => {
                      const Icon = card.icon;
                      return (
                        <Card
                          key={index}
                          className="hover:shadow-lg transition-shadow cursor-pointer"
                          onClick={card.action}
                        >
                          <CardHeader>
                            <div className="flex items-start justify-between" dir="auto">
                              <div>
                                <CardTitle className="text-xl text-start">{card.title}</CardTitle>
                                <CardDescription className="text-start">{card.description}</CardDescription>
                              </div>
                              <div className={`${card.color} p-3 rounded-lg`}>
                                <Icon className="h-6 w-6 text-white" />
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <Button
                              variant="outline"
                              className="w-full"
                              onClick={(e) => {
                                e.stopPropagation();
                                card.action();
                              }}
                            >
                              فتح
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  );
}

function ReceptionPatientInfoPanel({ onOpenExamination }: { onOpenExamination: () => void }) {
  const formatPatientCode = (value: string) => {
    const raw = String(value ?? "").trim().toUpperCase();
    if (!raw) return "";
    if (/^\d+$/.test(raw)) return raw.padStart(4, "0");
    return raw.replace(/\s+/g, "");
  };
  const calculateAgeFromDob = (dob: string) => {
    const raw = String(dob ?? "").trim();
    if (!raw) return "";
    const date = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(date.valueOf())) return "";
    const now = new Date();
    let age = now.getFullYear() - date.getFullYear();
    const monthDiff = now.getMonth() - date.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
      age -= 1;
    }
    return age >= 0 ? String(age) : "";
  };
  const [patientInfo, setPatientInfo] = useState({ id: 0, name: "", code: "" });
  const [patientDetails, setPatientDetails] = useState({
    dateOfBirth: "",
    age: "",
    address: "",
    phone: "",
    job: "",
  });
  const [doctorName, setDoctorName] = useState("");
  const [serviceFlags, setServiceFlags] = useState({
    consultation: false,
    examination: false,
    imaging: false,
  });
  const [serviceNotes, setServiceNotes] = useState({
    consultation: "",
    examination: "",
    imaging: "",
  });
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().split("T")[0]);

  const patientQuery = trpc.medical.getPatient.useQuery(
    { patientId: patientInfo.id },
    { enabled: Boolean(patientInfo.id), refetchOnWindowFocus: false }
  );
  const patientStateQuery = trpc.medical.getPatientPageState.useQuery(
    { patientId: patientInfo.id, page: "examination" },
    { enabled: Boolean(patientInfo.id), refetchOnWindowFocus: false }
  );
  const createPatientMutation = trpc.medical.createPatient.useMutation();
  const updatePatientMutation = trpc.medical.updatePatient.useMutation();
  const savePatientStateMutation = trpc.medical.savePatientPageState.useMutation();
  const doctorsQuery = trpc.medical.getDoctorDirectory.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const availableDoctors = useMemo(
    () =>
      ((doctorsQuery.data ?? []) as Array<{ id: string; name: string; code: string; isActive?: boolean }>)
        .filter((doctor) => doctor.isActive !== false)
        .sort((a, b) => String(a.code ?? "").localeCompare(String(b.code ?? ""), "en", { numeric: true })),
    [doctorsQuery.data]
  );

  useEffect(() => {
    if (!patientQuery.data) return;
    const p = patientQuery.data as any;
    setPatientInfo({
      id: p.id ?? 0,
      name: p.fullName ?? "",
      code: p.patientCode ?? "",
    });
    setPatientDetails({
      dateOfBirth: p.dateOfBirth ? String(p.dateOfBirth).split("T")[0] : "",
      age: p.age != null ? String(p.age) : "",
      address: p.address ?? "",
      phone: p.phone ?? "",
      job: p.occupation ?? "",
    });
  }, [patientQuery.data]);

  useEffect(() => {
    const stateData = (patientStateQuery.data as any)?.data;
    if (!stateData) return;
    const doctorFromState =
      String(stateData.doctorName ?? "").trim() ||
      String(stateData.signatures?.doctor ?? "").trim();
    if (doctorFromState) setDoctorName(doctorFromState);
    const visitFromState = String(stateData.visitDate ?? "").trim();
    if (visitFromState) setVisitDate(visitFromState);
    const flags = stateData.serviceFlags;
    if (flags && typeof flags === "object") {
      setServiceFlags({
        consultation: Boolean((flags as any).consultation),
        examination: Boolean((flags as any).examination),
        imaging: Boolean((flags as any).imaging),
      });
    }
    const notes = stateData.serviceNotes;
    if (notes && typeof notes === "object") {
      setServiceNotes({
        consultation: String((notes as any).consultation ?? ""),
        examination: String((notes as any).examination ?? ""),
        imaging: String((notes as any).imaging ?? ""),
      });
    }
  }, [patientStateQuery.data]);

  useEffect(() => {
    setPatientDetails((prev) => ({
      ...prev,
      age: calculateAgeFromDob(prev.dateOfBirth),
    }));
  }, [patientDetails.dateOfBirth]);

  const handleSave = async () => {
    try {
      let targetPatientId = Number(patientInfo.id ?? 0);
      if (!targetPatientId) {
        const fullName = String(patientInfo.name ?? "").trim();
        const phone = String(patientDetails.phone ?? "").trim();
        if (!fullName) {
          toast.error("Enter patient name first");
          return;
        }
        if (!phone) {
          toast.error("Enter patient phone first");
          return;
        }
        const created = await createPatientMutation.mutateAsync({
          fullName,
          patientCode: formatPatientCode(patientInfo.code) || undefined,
          dateOfBirth: patientDetails.dateOfBirth || undefined,
          age: patientDetails.age ? Number(patientDetails.age) : undefined,
          phone,
          address: patientDetails.address || undefined,
          occupation: patientDetails.job || undefined,
          branch: "examinations",
          serviceType: "consultant",
          locationType: "center",
          lastVisit: visitDate || undefined,
        });
        targetPatientId = Number((created as any)?.patientId ?? 0);
        if (!targetPatientId) {
          toast.error("Failed to create patient");
          return;
        }
        setPatientInfo((prev) => ({
          ...prev,
          id: targetPatientId,
          code: String((created as any)?.patientCode ?? prev.code ?? ""),
        }));
      } else {
        await updatePatientMutation.mutateAsync({
          patientId: targetPatientId,
          updates: {
            patientCode: formatPatientCode(patientInfo.code) || undefined,
            fullName: patientInfo.name || undefined,
            dateOfBirth: patientDetails.dateOfBirth || null,
            age: patientDetails.age ? Number(patientDetails.age) : null,
            address: patientDetails.address || null,
            phone: patientDetails.phone || null,
            occupation: patientDetails.job || null,
          },
        });
      }
      await savePatientStateMutation.mutateAsync({
        patientId: targetPatientId,
        page: "examination",
        data: {
          doctorName,
          visitDate,
          serviceFlags,
          serviceNotes,
          signatures: { doctor: doctorName },
        },
      });
      toast.success("Patient saved");
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to save patient"));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">بيانات المريض</CardTitle>
        <CardDescription>حقول الفحص مع المدخلات</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4" dir="rtl">
        <PatientPicker
          onSelect={(patient) =>
            setPatientInfo({
              id: patient.id,
              name: patient.fullName ?? "",
              code: formatPatientCode(patient.patientCode ?? ""),
            })
          }
        />

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          <div className="grid grid-cols-[90px_1fr] items-center gap-1">
            <Label className="text-sm text-right">كود العميل</Label>
            <Input
              value={patientInfo.code}
              onChange={(e) => setPatientInfo((p) => ({ ...p, code: formatPatientCode(e.target.value) }))}
              onBlur={(e) => setPatientInfo((p) => ({ ...p, code: formatPatientCode(e.target.value) }))}
              dir="ltr"
              className="h-9"
            />
          </div>
          <div className="grid grid-cols-[90px_1fr] items-center gap-1">
            <Label className="text-sm text-right">الاسم</Label>
            <Input className="h-9 text-right" value={patientInfo.name} onChange={(e) => setPatientInfo((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-[90px_1fr] items-center gap-1">
            <Label className="text-sm text-right">الموبايل</Label>
            <Input className="h-9 text-right" value={patientDetails.phone} onChange={(e) => setPatientDetails((p) => ({ ...p, phone: e.target.value }))} />
          </div>

          <div className="grid grid-cols-[90px_1fr] items-center gap-1">
            <Label className="text-sm text-right">تاريخ الميلاد</Label>
            <Input className="h-9" type="date" value={patientDetails.dateOfBirth} onChange={(e) => setPatientDetails((p) => ({ ...p, dateOfBirth: e.target.value }))} />
          </div>
          <div className="grid grid-cols-[90px_1fr] items-center gap-1">
            <Label className="text-sm text-right">السن</Label>
            <Input className="h-9 text-right" value={patientDetails.age} readOnly />
          </div>
          <div className="grid grid-cols-[90px_1fr] items-center gap-1">
            <Label className="text-sm text-right">العنوان</Label>
            <Input className="h-9 text-right" value={patientDetails.address} onChange={(e) => setPatientDetails((p) => ({ ...p, address: e.target.value }))} />
          </div>

          <div className="grid grid-cols-[90px_1fr] items-center gap-1">
            <Label className="text-sm text-right">الوظيفة</Label>
            <Input className="h-9 text-right" value={patientDetails.job} onChange={(e) => setPatientDetails((p) => ({ ...p, job: e.target.value }))} />
          </div>
          <div className="xl:col-span-2 space-y-2">
            <div className="flex items-center justify-end gap-2">
              <Label className="text-sm text-right whitespace-nowrap">الطبيب</Label>
              <div className="w-full max-w-[420px]">
                <Select value={doctorName} onValueChange={setDoctorName}>
                  <SelectTrigger className="h-9 text-right">
                    <SelectValue placeholder={doctorsQuery.isLoading ? "Loading doctors..." : "اختر الطبيب"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDoctors.map((doctor) => (
                      <SelectItem key={doctor.id} value={doctor.name}>
                        {doctor.code} - {doctor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="w-full">
              <div className="flex items-center justify-end gap-3 flex-wrap">
                <label className="inline-flex items-center gap-1 text-sm whitespace-nowrap flex-row-reverse">
                  <Checkbox
                    checked={serviceFlags.consultation}
                    onCheckedChange={(checked) =>
                      setServiceFlags((prev) => ({ ...prev, consultation: Boolean(checked) }))
                    }
                  />
                  كشف
                  <Input
                    value={serviceNotes.consultation}
                    onChange={(e) =>
                      setServiceNotes((prev) => ({ ...prev, consultation: e.target.value }))
                    }
                    className="h-8 w-36 mr-1"
                    placeholder="تفاصيل كشف"
                  />
                </label>
                <label className="inline-flex items-center gap-1 text-sm whitespace-nowrap flex-row-reverse">
                  <Checkbox
                    checked={serviceFlags.examination}
                    onCheckedChange={(checked) =>
                      setServiceFlags((prev) => ({ ...prev, examination: Boolean(checked) }))
                    }
                  />
                  فحص
                  <Input
                    value={serviceNotes.examination}
                    onChange={(e) =>
                      setServiceNotes((prev) => ({ ...prev, examination: e.target.value }))
                    }
                    className="h-8 w-36 mr-1"
                    placeholder="تفاصيل فحص"
                  />
                </label>
                <label className="inline-flex items-center gap-1 text-sm whitespace-nowrap flex-row-reverse">
                  <Checkbox
                    checked={serviceFlags.imaging}
                    onCheckedChange={(checked) =>
                      setServiceFlags((prev) => ({ ...prev, imaging: Boolean(checked) }))
                    }
                  />
                  اشعه
                  <Input
                    value={serviceNotes.imaging}
                    onChange={(e) =>
                      setServiceNotes((prev) => ({ ...prev, imaging: e.target.value }))
                    }
                    className="h-8 w-36 mr-1"
                    placeholder="تفاصيل اشعه"
                  />
                </label>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-[90px_1fr] items-center gap-1">
            <Label className="text-sm text-right">تاريخ الكشف</Label>
            <Input className="h-9" type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={createPatientMutation.isPending || updatePatientMutation.isPending || savePatientStateMutation.isPending}>
            حفظ
          </Button>
          <Button variant="outline" onClick={onOpenExamination}>
            فتح شاشة الفحص
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}














