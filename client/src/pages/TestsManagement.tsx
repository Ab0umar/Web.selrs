import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Plus, Trash2, Edit2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getTrpcErrorMessage } from "@/lib/utils";

export default function TestsManagement() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  type TestType = "examination" | "lab" | "imaging" | "other";
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newTest, setNewTest] = useState<{
    name: string;
    type: TestType;
    category: string;
    normalRange: string;
    unit: string;
    description: string;
  }>({
    name: "",
    type: "examination",
    category: "",
    normalRange: "",
    unit: "",
    description: "",
  });

  const testsQuery = trpc.medical.getAllTests.useQuery(undefined, {
    refetchOnWindowFocus: false,
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

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  if (!isAuthenticated) return null;

  const tests = (testsQuery.data ?? []) as any[];

  const resetForm = () => {
    setNewTest({
      name: "",
      type: "examination",
      category: "",
      normalRange: "",
      unit: "",
      description: "",
    });
  };

  const handleAddTest = async () => {
    if (!newTest.name) {
      toast.error("يرجى إدخال اسم الفحص");
      return;
    }

    if (editingId) {
      await updateTestMutation.mutateAsync({
        testId: editingId,
        updates: { ...newTest },
      });
      setEditingId(null);
    } else {
      await createTestMutation.mutateAsync({ ...newTest });
    }

    resetForm();
  };

  const handleEditTest = (test: any) => {
    setNewTest({
      name: test.name ?? "",
      type: test.type ?? "examination",
      category: test.category ?? "",
      normalRange: test.normalRange ?? "",
      unit: test.unit ?? "",
      description: test.description ?? "",
    });
    setEditingId(test.id);
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

      <main className="container mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{editingId ? " " : " "}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              value={newTest.name}
              onChange={(e) => setNewTest({ ...newTest, name: e.target.value })}
              placeholder="اسم الفحص"
            />
            <Select
              value={newTest.type}
              onValueChange={(value) => setNewTest({ ...newTest, type: value as TestType })}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر النوع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="examination">فحص</SelectItem>
                <SelectItem value="lab">تحاليل</SelectItem>
                <SelectItem value="imaging">أشعات</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={newTest.category}
              onChange={(e) => setNewTest({ ...newTest, category: e.target.value })}
              placeholder="الفئة"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                value={newTest.normalRange}
                onChange={(e) => setNewTest({ ...newTest, normalRange: e.target.value })}
                placeholder="المدى الطبيعي"
              />
              <Input
                value={newTest.unit}
                onChange={(e) => setNewTest({ ...newTest, unit: e.target.value })}
                placeholder="الوحدة"
              />
            </div>
            <Textarea
              value={newTest.description}
              onChange={(e) => setNewTest({ ...newTest, description: e.target.value })}
              placeholder="وصف الفحص"
              className="min-h-24"
            />
            <Button className="w-full" onClick={handleAddTest}>
              <Plus className="h-4 w-4 ml-2" />
              {editingId ? "" : ""}
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>قائمة الفحوصات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {tests.map((test) => (
                <div key={test.id} className="border rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <div className="font-bold">{test.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {test.category || ""} {test.type ? ` ${test.type}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="icon" variant="outline" onClick={() => handleEditTest(test)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="destructive" onClick={() => handleDeleteTest(test.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {tests.length === 0 && (
                <p className="text-center text-muted-foreground">لا توجد فحوصات بعد</p>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
