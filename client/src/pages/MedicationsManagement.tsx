import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Edit2, Upload } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getTrpcErrorMessage } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function MedicationsManagement() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const testsFileRef = useRef<HTMLInputElement>(null);
  const diseasesFileRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"medications" | "tests" | "diseases">("medications");
  const [expandedMeds, setExpandedMeds] = useState<number[]>([]);
  const [expandedTests, setExpandedTests] = useState<number[]>([]);
  const [expandedDiseases, setExpandedDiseases] = useState<number[]>([]);
  const [expandedMedGroups, setExpandedMedGroups] = useState<string[]>([]);
  const [expandedTestGroups, setExpandedTestGroups] = useState<string[]>([]);
  const [expandedDiseaseGroups, setExpandedDiseaseGroups] = useState<string[]>([]);
  const userStateQuery = trpc.medical.getUserPageState.useQuery(
    { page: "medications" },
    { refetchOnWindowFocus: false }
  );
  const saveUserStateMutation = trpc.medical.saveUserPageState.useMutation();
  const userStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  type MedicationType = "tablet" | "drops" | "ointment" | "injection" | "suspension" | "other";
  const [newMedication, setNewMedication] = useState<{
    name: string;
    type: MedicationType;
    strength: string;
  }>({
    name: "",
    type: "drops",
    strength: "",
  });

  const medicationsQuery = trpc.medical.getAllMedications.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const testsQuery = trpc.medical.getAllTests.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const diseasesQuery = trpc.medical.getAllDiseases.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const createMedicationMutation = trpc.medical.createMedication.useMutation({
    onSuccess: () => {
      toast.success("تم إضافة الدواء بنجاح");
      medicationsQuery.refetch();
    },
    onError: (error: unknown) => {
      toast.error(getTrpcErrorMessage(error, "فشل في إضافة الدواء"));
    },
  });

  const updateMedicationMutation = trpc.medical.updateMedication.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث الدواء بنجاح");
      medicationsQuery.refetch();
    },
    onError: (error: unknown) => {
      toast.error(getTrpcErrorMessage(error, "فشل في تحديث الدواء"));
    },
  });

  const deleteMedicationMutation = trpc.medical.deleteMedication.useMutation({
    onSuccess: () => {
      toast.success("تم حذف الدواء بنجاح");
      medicationsQuery.refetch();
    },
    onError: (error: unknown) => {
      toast.error(getTrpcErrorMessage(error, "فشل في حذف الدواء"));
    },
  });

  const createTestMutation = trpc.medical.createTest.useMutation({
    onSuccess: () => {
      toast.success("تم إضافة الفحص بنجاح");
      testsQuery.refetch();
    },
    onError: (error: unknown) => {
      toast.error(getTrpcErrorMessage(error, "فشل في إضافة الفحص"));
    },
  });

  const updateTestMutation = trpc.medical.updateTest.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث الفحص بنجاح");
      testsQuery.refetch();
    },
    onError: (error: unknown) => {
      toast.error(getTrpcErrorMessage(error, "فشل في تحديث الفحص"));
    },
  });

  const deleteTestMutation = trpc.medical.deleteTest.useMutation({
    onSuccess: () => {
      toast.success("تم حذف الفحص بنجاح");
      testsQuery.refetch();
    },
    onError: (error: unknown) => {
      toast.error(getTrpcErrorMessage(error, "فشل في حذف الفحص"));
    },
  });

  const createDiseaseMutation = trpc.medical.createDisease.useMutation({
    onSuccess: () => {
      toast.success("تم إضافة المرض بنجاح");
      diseasesQuery.refetch();
    },
    onError: (error: unknown) => {
      toast.error(getTrpcErrorMessage(error, "فشل في إضافة المرض"));
    },
  });

  const updateDiseaseMutation = trpc.medical.updateDisease.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث المرض بنجاح");
      diseasesQuery.refetch();
    },
    onError: (error: unknown) => {
      toast.error(getTrpcErrorMessage(error, "فشل في تحديث المرض"));
    },
  });

  const deleteDiseaseMutation = trpc.medical.deleteDisease.useMutation({
    onSuccess: () => {
      toast.success("تم حذف المرض بنجاح");
      diseasesQuery.refetch();
    },
    onError: (error: unknown) => {
      toast.error(getTrpcErrorMessage(error, "فشل في حذف المرض"));
    },
  });

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    const raw = localStorage.getItem("user_state_medications");
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (data.activeTab) setActiveTab(data.activeTab);
      if (Array.isArray(data.expandedMeds)) setExpandedMeds(data.expandedMeds);
      if (Array.isArray(data.expandedTests)) setExpandedTests(data.expandedTests);
      if (Array.isArray(data.expandedDiseases)) setExpandedDiseases(data.expandedDiseases);
      if (Array.isArray(data.expandedMedGroups)) setExpandedMedGroups(data.expandedMedGroups);
      if (Array.isArray(data.expandedTestGroups)) setExpandedTestGroups(data.expandedTestGroups);
      if (Array.isArray(data.expandedDiseaseGroups)) setExpandedDiseaseGroups(data.expandedDiseaseGroups);
    } catch {
      // ignore bad cache
    }
  }, []);

  useEffect(() => {
    const data = (userStateQuery.data as any)?.data;
    if (!data) return;
    if (data.activeTab) setActiveTab(data.activeTab);
    if (Array.isArray(data.expandedMeds)) setExpandedMeds(data.expandedMeds);
    if (Array.isArray(data.expandedTests)) setExpandedTests(data.expandedTests);
    if (Array.isArray(data.expandedDiseases)) setExpandedDiseases(data.expandedDiseases);
    if (Array.isArray(data.expandedMedGroups)) setExpandedMedGroups(data.expandedMedGroups);
    if (Array.isArray(data.expandedTestGroups)) setExpandedTestGroups(data.expandedTestGroups);
    if (Array.isArray(data.expandedDiseaseGroups)) setExpandedDiseaseGroups(data.expandedDiseaseGroups);
  }, [userStateQuery.data]);

  useEffect(() => {
    const payload = {
      activeTab,
      expandedMeds,
      expandedTests,
      expandedDiseases,
      expandedMedGroups,
      expandedTestGroups,
      expandedDiseaseGroups,
    };
    localStorage.setItem("user_state_medications", JSON.stringify(payload));
    if (userStateTimerRef.current) clearTimeout(userStateTimerRef.current);
    userStateTimerRef.current = setTimeout(() => {
      saveUserStateMutation.mutate({ page: "medications", data: payload });
    }, 800);
    return () => {
      if (userStateTimerRef.current) clearTimeout(userStateTimerRef.current);
    };
  }, [activeTab, expandedMeds, expandedTests, expandedDiseases, expandedMedGroups, expandedTestGroups, expandedDiseaseGroups, saveUserStateMutation]);

  if (!isAuthenticated) return null;

  const medications = (medicationsQuery.data ?? []) as any[];
  const tests = (testsQuery.data ?? []) as any[];
  const diseases = (diseasesQuery.data ?? []) as any[];

  const [newTest, setNewTest] = useState({
    name: "",
    type: "examination" as "examination" | "lab" | "imaging" | "other",
  });
  const [editingTestId, setEditingTestId] = useState<number | null>(null);

  const [newDisease, setNewDisease] = useState({ name: "", branch: "", abbrev: "" });
  const [editingDiseaseId, setEditingDiseaseId] = useState<number | null>(null);

  const resetForm = () => {
    setNewMedication({
      name: "",
      type: "drops",
      strength: "",
    });
  };

  const handleAddMedication = async () => {
    if (!newMedication.name) {
      toast.error("يرجى إدخال اسم الدواء");
      return;
    }

    if (editingId) {
      await updateMedicationMutation.mutateAsync({
        medicationId: editingId,
        updates: {
          name: newMedication.name,
          type: newMedication.type,
          strength: newMedication.strength,
        },
      });
      setEditingId(null);
    } else {
      await createMedicationMutation.mutateAsync({ ...newMedication });
    }

    resetForm();
  };

  const handleEditMedication = (medication: any) => {
    setNewMedication({
      name: medication.name ?? "",
      type: medication.type ?? "drops",
      strength: medication.strength ?? "",
    });
    setEditingId(medication.id);
  };

  const handleDeleteMedication = async (id: number) => {
    if (!window.confirm("هل أنت متأكد من حذف الدواء؟")) return;
    await deleteMedicationMutation.mutateAsync({ medicationId: id });
  };

  const handleImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = e.target?.result as ArrayBuffer;
          const workbook = XLSX.read(data, { type: "array" });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);

          for (const row of jsonData as any[]) {
            const name = row["Name"] || row["name"] || row["اسم الدواء"] || "";
            if (!String(name).trim()) continue;
            const form = row["Form"] || row["form"] || row["النوع"] || "drops";
            const category = row["Category"] || row["category"] || row["التصنيف"] || "";
            await createMedicationMutation.mutateAsync({
              name: String(name).trim(),
              type: String(form || "drops") as MedicationType,
              strength: String(category || "").trim(),
            });
          }
          toast.success("تم استيراد الأدوية بنجاح");
          if (fileInputRef.current) fileInputRef.current.value = "";
        } catch {
          toast.error("خطأ في استيراد الملف");
        }
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
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = e.target?.result as ArrayBuffer;
          const workbook = XLSX.read(data, { type: "array" });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          for (const row of jsonData as any[]) {
            const name = row["Name"] || row["name"] || row["اسم الفحص"] || "";
            if (!String(name).trim()) continue;
            const form = row["Form"] || row["form"] || row["النوع"] || "examination";
            await createTestMutation.mutateAsync({
              name: String(name).trim(),
              type: String(form || "examination") as any,
            });
          }
          toast.success("تم استيراد الفحوصات بنجاح");
          if (testsFileRef.current) testsFileRef.current.value = "";
        } catch {
          toast.error("خطأ في استيراد الملف");
        }
      };
      reader.readAsArrayBuffer(file);
    } catch {
      toast.error("خطأ في استيراد الملف");
    }
  };

  const toggleExpanded = (list: number[], id: number, setList: (next: number[]) => void) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };
  const toggleGroup = (list: string[], key: string, setList: (next: string[]) => void) => {
    setList(list.includes(key) ? list.filter((x) => x !== key) : [...list, key]);
  };

  const handleImportDiseases = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = e.target?.result as ArrayBuffer;
          const workbook = XLSX.read(data, { type: "array" });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          let imported = 0;
          let failed = 0;
          let lastError: unknown = null;
          for (const row of jsonData as any[]) {
            const name =
              row["Name"] ||
              row["name"] ||
              row["اسم المرض"] ||
              row["Disease"] ||
              row["disease"] ||
              "";
            if (!String(name).trim()) continue;
            const branch =
              row["Branch"] ||
              row["branch"] ||
              row["الفرع"] ||
              row["branch_en"] ||
              "";
            const abbrev =
              row["Abbrev"] ||
              row["abbrev"] ||
              row["اختصار"] ||
              row["اختصارات"] ||
              "";
            try {
              await createDiseaseMutation.mutateAsync({
                name: String(name).trim(),
                branch: String(branch || "").trim() || undefined,
                abbrev: String(abbrev || "").trim() || undefined,
              });
              imported += 1;
            } catch (err) {
              failed += 1;
              lastError = err;
            }
          }
          if (imported > 0) {
            toast.success(`تم استيراد ${imported} مرض`);
          }
          if (failed > 0) {
            const message = getTrpcErrorMessage(lastError, "فشل في استيراد بعض الأمراض");
            toast.error(`${message} (فشل: ${failed})`);
          }
          if (diseasesFileRef.current) diseasesFileRef.current.value = "";
        } catch {
          toast.error("خطأ في استيراد الملف");
        }
      };
      reader.readAsArrayBuffer(file);
    } catch {
      toast.error("خطأ في استيراد الملف");
    }
  };

  const handleSaveTest = async () => {
    if (!newTest.name.trim()) {
      toast.error("يرجى إدخال اسم الفحص");
      return;
    }
    if (editingTestId) {
      await updateTestMutation.mutateAsync({
        testId: editingTestId,
        updates: {
          name: newTest.name,
          type: newTest.type,
        },
      });
      setEditingTestId(null);
    } else {
      await createTestMutation.mutateAsync({ ...newTest });
    }
    setNewTest({ name: "", type: "examination" });
  };

  const handleEditTest = (test: any) => {
    setNewTest({
      name: test.name ?? "",
      type: test.type ?? "examination",
    });
    setEditingTestId(test.id);
  };

  const handleDeleteTest = async (id: number) => {
    if (!window.confirm("هل أنت متأكد من حذف الفحص؟")) return;
    await deleteTestMutation.mutateAsync({ testId: id });
  };

  const handleSaveDisease = async () => {
    if (!newDisease.name.trim()) {
      toast.error("يرجى إدخال اسم المرض");
      return;
    }
    if (editingDiseaseId) {
      await updateDiseaseMutation.mutateAsync({
        diseaseId: editingDiseaseId,
        name: newDisease.name.trim(),
        branch: newDisease.branch.trim() || undefined,
        abbrev: newDisease.abbrev.trim() || undefined,
      });
      setEditingDiseaseId(null);
    } else {
      await createDiseaseMutation.mutateAsync({
        name: newDisease.name.trim(),
        branch: newDisease.branch.trim() || undefined,
        abbrev: newDisease.abbrev.trim() || undefined,
      });
    }
    setNewDisease({ name: "", branch: "", abbrev: "" });
  };

  const handleEditDisease = (disease: any) => {
    setNewDisease({ name: disease.name ?? "", branch: disease.branch ?? "", abbrev: disease.abbrev ?? "" });
    setEditingDiseaseId(disease.id);
  };

  const handleDeleteDisease = async (id: number) => {
    if (!window.confirm("هل أنت متأكد من حذف المرض؟")) return;
    await deleteDiseaseMutation.mutateAsync({ diseaseId: id });
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <PageHeader backTo="/dashboard" />

      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="medications">الأدوية</TabsTrigger>
            <TabsTrigger value="tests">الفحوصات</TabsTrigger>
            <TabsTrigger value="diseases">الأمراض</TabsTrigger>
          </TabsList>

          <TabsContent value="medications">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>قائمة الأدوية</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {Object.entries(
                      medications.reduce((acc: Record<string, any[]>, med) => {
                        const key = med.type || "other";
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(med);
                        return acc;
                      }, {})
                    ).map(([type, meds]) => (
                      <div key={type} className="border rounded-lg p-3">
                        <div
                          className="font-bold mb-2 cursor-pointer flex items-center justify-between"
                          onClick={() => toggleGroup(expandedMedGroups, type, setExpandedMedGroups)}
                        >
                          <span>{type}</span>
                          <span className="text-xs text-muted-foreground">
                            {expandedMedGroups.includes(type) ? "" : ""}
                          </span>
                        </div>
                        {expandedMedGroups.includes(type) && (
                          <div className="space-y-2">
                            {meds.map((med: any) => (
                              <div key={med.id} className="border rounded-lg p-3">
                                <div
                                  className="flex items-center justify-between cursor-pointer"
                                  onClick={() => toggleExpanded(expandedMeds, med.id, setExpandedMeds)}
                                >
                                  <div className="font-bold">{med.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {expandedMeds.includes(med.id) ? "" : ""}
                                  </div>
                                </div>
                                {expandedMeds.includes(med.id) && (
                                  <div className="mt-2 text-sm text-muted-foreground">
                                    {med.strength ? `Category: ${med.strength}` : ""}
                                  </div>
                                )}
                                <div className="flex gap-2 mt-3">
                                  <Button size="icon" variant="outline" onClick={() => handleEditMedication(med)}>
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="destructive" onClick={() => handleDeleteMedication(med.id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {medications.length === 0 && (
                      <p className="text-center text-muted-foreground">لا توجد أدوية بعد</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>{editingId ? " " : " "}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    value={newMedication.name}
                    onChange={(e) => setNewMedication({ ...newMedication, name: e.target.value })}
                    placeholder="اسم الدواء"
                  />
                  <Select
                    value={newMedication.type}
                    onValueChange={(value) => setNewMedication({ ...newMedication, type: value as MedicationType })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر النوع" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="drops">قطرة</SelectItem>
                      <SelectItem value="ointment">مرهم</SelectItem>
                      <SelectItem value="tablet">أقراص</SelectItem>
                      <SelectItem value="other">أخرى</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={newMedication.strength}
                    onChange={(e) => setNewMedication({ ...newMedication, strength: e.target.value })}
                    placeholder="التركيز"
                  />
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={handleAddMedication} disabled={createMedicationMutation.isPending}>
                      <Plus className="h-4 w-4 ml-2" />
                      {editingId ? "" : ""}
                    </Button>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleImportExcel} className="hidden" />
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="h-4 w-4 ml-2" />
                      استيراد
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="tests">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>قائمة الفحوصات</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {Object.entries(
                      tests.reduce((acc: Record<string, any[]>, test) => {
                        const key = test.type || "other";
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(test);
                        return acc;
                      }, {})
                    ).map(([type, items]) => (
                      <div key={type} className="border rounded-lg p-3">
                        <div
                          className="font-bold mb-2 cursor-pointer flex items-center justify-between"
                          onClick={() => toggleGroup(expandedTestGroups, type, setExpandedTestGroups)}
                        >
                          <span>{type}</span>
                          <span className="text-xs text-muted-foreground">
                            {expandedTestGroups.includes(type) ? "" : ""}
                          </span>
                        </div>
                        {expandedTestGroups.includes(type) && (
                          <div className="space-y-2">
                            {items.map((test: any) => (
                              <div key={test.id} className="border rounded-lg p-3">
                                <div
                                  className="flex items-center justify-between cursor-pointer"
                                  onClick={() => toggleExpanded(expandedTests, test.id, setExpandedTests)}
                                >
                                  <div className="font-bold">{test.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {expandedTests.includes(test.id) ? "" : ""}
                                  </div>
                                </div>
                                <div className="flex gap-2 mt-3">
                                  <Button size="icon" variant="outline" onClick={() => handleEditTest(test)}>
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="destructive" onClick={() => handleDeleteTest(test.id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {tests.length === 0 && (
                      <p className="text-center text-muted-foreground">لا توجد فحوصات بعد</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>{editingTestId ? " " : " "}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    value={newTest.name}
                    onChange={(e) => setNewTest({ ...newTest, name: e.target.value })}
                    placeholder="اسم الفحص"
                  />
                  <Select
                    value={newTest.type}
                    onValueChange={(value) => setNewTest({ ...newTest, type: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="النوع" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="examination">فحص</SelectItem>
                      <SelectItem value="lab">تحاليل</SelectItem>
                      <SelectItem value="imaging">أشعة</SelectItem>
                      <SelectItem value="other">أخرى</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={handleSaveTest} disabled={createTestMutation.isPending}>
                      <Plus className="h-4 w-4 ml-2" />
                      {editingTestId ? "" : ""}
                    </Button>
                    <input ref={testsFileRef} type="file" accept=".xlsx,.xls" onChange={handleImportTests} className="hidden" />
                    <Button variant="outline" onClick={() => testsFileRef.current?.click()}>
                      <Upload className="h-4 w-4 ml-2" />
                      استيراد
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="diseases">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>قائمة الأمراض</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {Object.entries(
                      diseases.reduce((acc: Record<string, any[]>, disease) => {
                        const key = disease.branch || "other";
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(disease);
                        return acc;
                      }, {})
                    ).map(([branch, items]) => (
                      <div key={branch} className="border rounded-lg p-3">
                        <div
                          className="font-bold mb-2 cursor-pointer flex items-center justify-between"
                          onClick={() => toggleGroup(expandedDiseaseGroups, branch, setExpandedDiseaseGroups)}
                        >
                          <span>{branch}</span>
                          <span className="text-xs text-muted-foreground">
                            {expandedDiseaseGroups.includes(branch) ? "" : ""}
                          </span>
                        </div>
                        {expandedDiseaseGroups.includes(branch) && (
                          <div className="space-y-2">
                            {items.map((disease: any) => (
                              <div key={disease.id} className="border rounded-lg p-3">
                                <div
                                  className="flex items-center justify-between cursor-pointer"
                                  onClick={() => toggleExpanded(expandedDiseases, disease.id, setExpandedDiseases)}
                                >
                                  <div className="font-bold">
                                    {disease.abbrev ? `${disease.abbrev} - ${disease.name}` : disease.name}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {expandedDiseases.includes(disease.id) ? "" : ""}
                                  </div>
                                </div>
                                <div className="flex gap-2 mt-3">
                                  <Button size="icon" variant="outline" onClick={() => handleEditDisease(disease)}>
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="destructive" onClick={() => handleDeleteDisease(disease.id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {diseases.length === 0 && (
                      <p className="text-center text-muted-foreground">لا توجد أمراض بعد</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>{editingDiseaseId ? " " : " "}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    value={newDisease.name}
                    onChange={(e) => setNewDisease({ ...newDisease, name: e.target.value })}
                    placeholder="Name"
                  />
                  <Input
                    value={newDisease.branch}
                    onChange={(e) => setNewDisease({ ...newDisease, branch: e.target.value })}
                    placeholder="branch"
                  />
                  <Input
                    value={newDisease.abbrev}
                    onChange={(e) => setNewDisease({ ...newDisease, abbrev: e.target.value })}
                    placeholder="Abbrev"
                  />
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={handleSaveDisease} disabled={createDiseaseMutation.isPending}>
                      <Plus className="h-4 w-4 ml-2" />
                      {editingDiseaseId ? "" : ""}
                    </Button>
                    <input ref={diseasesFileRef} type="file" accept=".xlsx,.xls" onChange={handleImportDiseases} className="hidden" />
                    <Button variant="outline" onClick={() => diseasesFileRef.current?.click()}>
                      <Upload className="h-4 w-4 ml-2" />
                      استيراد
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
