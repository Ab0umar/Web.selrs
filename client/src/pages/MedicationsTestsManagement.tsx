import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Plus, Trash2, Edit2, Upload, Star } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getTrpcErrorMessage } from "@/lib/utils";

export default function MedicationsTestsManagement() {
  const { isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();

  const medsFileRef = useRef<HTMLInputElement>(null);
  const testsFileRef = useRef<HTMLInputElement>(null);
  const [editingMedId, setEditingMedId] = useState<number | null>(null);
  type MedicationType = "tablet" | "drops" | "ointment" | "injection" | "suspension" | "other";
  type TestType = "examination" | "lab" | "imaging" | "other";
  const [newMedication, setNewMedication] = useState<{
    name: string;
    type: MedicationType;
    strength: string;
  }>({
    name: "",
    type: "drops",
    strength: "",
  });

  const [editingTestId, setEditingTestId] = useState<number | null>(null);
  const [newTest, setNewTest] = useState<{
    name: string;
    type: TestType;
    category: string;
  }>({
    name: "",
    type: "examination",
    category: "",
  });

  const medsQuery = trpc.medical.getAllMedications.useQuery(undefined, { refetchOnWindowFocus: false });
  const testsQuery = trpc.medical.getAllTests.useQuery(undefined, { refetchOnWindowFocus: false });
  const favoritesQuery = trpc.medical.getMyTestFavorites.useQuery(undefined, {
    refetchOnWindowFocus: false,
    retry: false,
    enabled: ["doctor", "manager", "admin"].includes(user?.role || ""),
  });
  const favoritesErrorShownRef = useRef(false);

  const createMedicationMutation = trpc.medical.createMedication.useMutation({
    onSuccess: () => {
      toast.success("تم إضافة الدواء بنجاح");
      medsQuery.refetch();
    },
    onError: (error: unknown) => toast.error(getTrpcErrorMessage(error, "فشل في إضافة الدواء")),
  });
  const updateMedicationMutation = trpc.medical.updateMedication.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث الدواء بنجاح");
      medsQuery.refetch();
    },
    onError: (error: unknown) => toast.error(getTrpcErrorMessage(error, "فشل في تحديث الدواء")),
  });
  const deleteMedicationMutation = trpc.medical.deleteMedication.useMutation({
    onSuccess: () => {
      toast.success("تم حذف الدواء بنجاح");
      medsQuery.refetch();
    },
    onError: (error: unknown) => toast.error(getTrpcErrorMessage(error, "فشل في حذف الدواء")),
  });

  const createTestMutation = trpc.medical.createTest.useMutation({
    onSuccess: () => {
      toast.success("تم إضافة الفحص بنجاح");
      testsQuery.refetch();
    },
    onError: (error: unknown) => toast.error(getTrpcErrorMessage(error, "فشل في إضافة الفحص")),
  });
  const updateTestMutation = trpc.medical.updateTest.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث الفحص بنجاح");
      testsQuery.refetch();
    },
    onError: (error: unknown) => toast.error(getTrpcErrorMessage(error, "فشل في تحديث الفحص")),
  });
  const deleteTestMutation = trpc.medical.deleteTest.useMutation({
    onSuccess: () => {
      toast.success("تم حذف الفحص بنجاح");
      testsQuery.refetch();
    },
    onError: (error: unknown) => toast.error(getTrpcErrorMessage(error, "فشل في حذف الفحص")),
  });
  const toggleFavoriteMutation = trpc.medical.toggleTestFavorite.useMutation({
    onSuccess: () => {
      favoritesQuery.refetch();
    },
    onError: () => {
      toast.error("Failed to update favorite.");
    },
  });

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    if (!favoritesQuery.error) return;
    if (favoritesErrorShownRef.current) return;
    favoritesErrorShownRef.current = true;
    toast.error("Favorites are available for doctor/manager/admin only.");
  }, [favoritesQuery.error]);

  if (!isAuthenticated) return null;

  const medications = (medsQuery.data ?? []) as any[];
  const tests = (testsQuery.data ?? []) as any[];
  const canFavorite = ["doctor", "manager", "admin"].includes(user?.role || "");
  const favoriteIds = new Set((favoritesQuery.data ?? []).map((f: any) => f.testId));
  const favoriteTests = tests.filter((t) => favoriteIds.has(t.id));

  const resetMedForm = () => {
    setNewMedication({
      name: "",
      type: "drops",
      strength: "",
    });
  };

  const resetTestForm = () => {
    setNewTest({
      name: "",
      type: "examination",
      category: "",
    });
  };

  const handleSaveMedication = async () => {
    if (!newMedication.name) {
      toast.error("يرجى إدخال اسم الدواء");
      return;
    }

    if (editingMedId) {
      await updateMedicationMutation.mutateAsync({ medicationId: editingMedId, updates: { ...newMedication } });
      setEditingMedId(null);
    } else {
      await createMedicationMutation.mutateAsync({ ...newMedication });
    }
    resetMedForm();
  };

  const handleEditMedication = (med: any) => {
    setNewMedication({
      name: med.name ?? "",
      type: med.type ?? "drops",
      strength: med.strength ?? "",
    });
    setEditingMedId(med.id);
  };

  const handleDeleteMedication = async (id: number) => {
    if (!window.confirm("هل أنت متأكد من حذف الدواء؟")) return;
    await deleteMedicationMutation.mutateAsync({ medicationId: id });
  };

  const handleImportMedications = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = e.target?.result as ArrayBuffer;
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        for (const row of jsonData as any[]) {
          await createMedicationMutation.mutateAsync({
            name: row["اسم الدواء"] || row["name"] || "",
            type: row["النوع"] || row["type"] || "drops",
            strength: row["التركيز"] || row["strength"] || "",
          });
        }
        toast.success("تم استيراد الأدوية بنجاح");
        if (medsFileRef.current) medsFileRef.current.value = "";
      };
      reader.readAsArrayBuffer(file);
    } catch {
      toast.error("خطأ في استيراد الملف");
    }
  };

  const handleImportTests = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const normalizeTestType = (raw: any): TestType => {
        const value = String(raw ?? "").trim().toLowerCase();
        if (["lab", "تحاليل", "تحليل"].includes(value)) return "lab";
        if (["imaging", "اشعة", "أشعة", "radiology", "xray"].includes(value)) return "imaging";
        if (["exam", "examination", "فحص", "فحوصات"].includes(value)) return "examination";
        return "examination";
      };
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = e.target?.result as ArrayBuffer;
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        const firstNonEmpty = rawRows.find((row) => row && row.some((cell) => String(cell ?? "").trim() !== ""));
        if (!firstNonEmpty) {
          toast.error("ملف فارغ: لا توجد بيانات.");
          if (testsFileRef.current) testsFileRef.current.value = "";
          return;
        }
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        let created = 0;
        let skipped = 0;
        for (const row of jsonData as any[]) {
          const name = row["اسم الفحص"] || row["name"] || "";
          if (!String(name).trim()) {
            skipped += 1;
            continue;
          }
          const category =
            row["تصنيف"] ||
            row["الفئة"] ||
            row["category"] ||
            row["Category"] ||
            "";
          await createTestMutation.mutateAsync({
            name: String(name).trim(),
            type: normalizeTestType(row["النوع"] || row["type"]),
            category: String(category ?? "").trim(),
          });
          created += 1;
        }
        toast.success(`تم استيراد ${created} فحص (تخطي ${skipped})`);
        if (testsFileRef.current) testsFileRef.current.value = "";
      };
      reader.readAsArrayBuffer(file);
    } catch {
      toast.error("خطأ في استيراد الملف");
    }
  };

  const handleSaveTest = async () => {
    if (!newTest.name) {
      toast.error("يرجى إدخال اسم الفحص");
      return;
    }
    if (editingTestId) {
      await updateTestMutation.mutateAsync({ testId: editingTestId, updates: { ...newTest } });
      setEditingTestId(null);
    } else {
      await createTestMutation.mutateAsync({ ...newTest });
    }
    resetTestForm();
  };

  const handleEditTest = (test: any) => {
    setNewTest({
      name: test.name ?? "",
      type: test.type ?? "examination",
      category: test.category ?? "",
    });
    setEditingTestId(test.id);
  };

  const handleDeleteTest = async (id: number) => {
    if (!window.confirm("هل أنت متأكد من حذف الفحص؟")) return;
    await deleteTestMutation.mutateAsync({ testId: id });
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="bg-primary text-primary-foreground shadow-lg sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/dashboard")}
            className="text-primary-foreground hover:bg-primary/80"
          >
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle>{editingMedId ? " " : " "}</CardTitle>
            <Input value={newMedication.name} onChange={(e) => setNewMedication({ ...newMedication, name: e.target.value })} placeholder="اسم الدواء" className="text-right w-full" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Select value={newMedication.type} onValueChange={(value) => setNewMedication({ ...newMedication, type: value as MedicationType })}>
                <SelectTrigger><SelectValue placeholder="اختر النوع" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="drops">قطرة</SelectItem>
                  <SelectItem value="ointment">مرهم</SelectItem>
                  <SelectItem value="tablet">أقراص</SelectItem>
                  <SelectItem value="other">أخرى</SelectItem>
                </SelectContent>
              </Select>
              <Input value={newMedication.strength} onChange={(e) => setNewMedication({ ...newMedication, strength: e.target.value })} placeholder="التركيز" />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveMedication} className="flex-1"><Plus className="h-4 w-4 ml-2" />حفظ</Button>
              <input ref={medsFileRef} type="file" accept=".xlsx,.xls" onChange={handleImportMedications} className="hidden" />
              <Button variant="outline" onClick={() => medsFileRef.current?.click()}><Upload className="h-4 w-4 ml-2" /></Button>
            </div>
            <div className="space-y-2">
              {medications.map((med) => (
                <div key={med.id} className="border rounded-lg p-3 flex items-center justify-between" dir="ltr">
                  <div className="text-left" dir="ltr">
                    <div className="font-bold">{med.name}</div>
                    <div className="text-sm text-muted-foreground">{med.type || "—"}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="icon" variant="outline" onClick={() => handleEditMedication(med)}><Edit2 className="h-4 w-4" /></Button>
                    <Button size="icon" variant="destructive" onClick={() => handleDeleteMedication(med.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-2">
            <CardTitle>{editingTestId ? " " : " "}</CardTitle>
            <Input value={newTest.name} onChange={(e) => setNewTest({ ...newTest, name: e.target.value })} placeholder="اسم الفحص" className="text-right w-full" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="text-sm font-semibold">المفضلات</div>
              {!canFavorite ? (
                <p className="text-xs text-muted-foreground">Favorites available for doctor/manager/admin.</p>
              ) : favoriteTests.length === 0 ? (
                <p className="text-xs text-muted-foreground">لا توجد مفضلات</p>
              ) : (
                favoriteTests.map((test) => (
                  <div key={test.id} className="border rounded-lg p-2 flex items-center justify-between" dir="ltr">
                    <div className="text-left" dir="ltr">
                      <div className="font-bold text-sm">{test.name}</div>
                      <div className="text-xs text-muted-foreground">{test.type || "—"}</div>
                    </div>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        if (!canFavorite) {
                          toast.error("Favorites available for doctor/manager/admin.");
                          return;
                        }
                        toggleFavoriteMutation.mutate({ testId: test.id });
                      }}
                    >
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-500" />
                    </Button>
                  </div>
                ))
              )}
            </div>
            <Select value={newTest.type} onValueChange={(value) => setNewTest({ ...newTest, type: value as TestType })}>
              <SelectTrigger><SelectValue placeholder="اختر النوع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="examination">فحص</SelectItem>
                <SelectItem value="lab">تحاليل</SelectItem>
                <SelectItem value="imaging">أشعات</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={newTest.category}
              onChange={(e) => setNewTest({ ...newTest, category: e.target.value })}
              placeholder="تصنيف الفحص"
              className="text-right"
            />
            <div className="flex gap-2">
              <Button onClick={handleSaveTest} className="flex-1"><Plus className="h-4 w-4 ml-2" />حفظ</Button>
              <input ref={testsFileRef} type="file" accept=".xlsx,.xls" onChange={handleImportTests} className="hidden" />
              <Button variant="outline" onClick={() => testsFileRef.current?.click()}><Upload className="h-4 w-4 ml-2" /></Button>
            </div>
            <div className="space-y-2">
              {tests.map((test) => (
                <div key={test.id} className="border rounded-lg p-3 flex items-center justify-between" dir="ltr">
                  <div className="text-left" dir="ltr">
                    <div className="font-bold">{test.name}</div>
                    <div className="text-sm text-muted-foreground">{test.category || "—"}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        if (!canFavorite) {
                          toast.error("Favorites available for doctor/manager/admin.");
                          return;
                        }
                        toggleFavoriteMutation.mutate({ testId: test.id });
                      }}
                    >
                      <Star
                        className={`h-4 w-4 ${favoriteIds.has(test.id) ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground"}`}
                      />
                    </Button>
                    <Button size="icon" variant="outline" onClick={() => handleEditTest(test)}><Edit2 className="h-4 w-4" /></Button>
                    <Button size="icon" variant="destructive" onClick={() => handleDeleteTest(test.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
