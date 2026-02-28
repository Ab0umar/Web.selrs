import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, CheckCircle, AlertCircle, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import PatientPicker from "@/components/PatientPicker";
import { trpc } from "@/lib/trpc";
import { formatDateLabel, getTrpcErrorMessage } from "@/lib/utils";

export default function Surgeries() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const surgeriesQuery = trpc.medical.getSurgeriesByPatient.useQuery(
    { patientId: selectedPatientId ?? 0 },
    { enabled: Boolean(selectedPatientId), refetchOnWindowFocus: false }
  );
  const createSurgeryMutation = trpc.medical.createSurgery.useMutation({
    onSuccess: () => {
      toast.success("تم جدولة العملية بنجاح");
      surgeriesQuery.refetch();
    },
  });
  const createFollowupMutation = trpc.medical.createPostOpFollowup.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ المتابعة");
    },
  });
  const deleteSurgeryMutation = trpc.medical.deleteSurgery.useMutation({
    onSuccess: () => {
      toast.success("تم حذف العملية");
      surgeriesQuery.refetch();
    },
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedSurgery, setSelectedSurgery] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    patientName: "",
    patientCode: "",
    surgeryType: "LASIK",
    surgeryDate: "",
    notes: "",
  });

  const [postOpFollowup, setPostOpFollowup] = useState({
    day1Vision: "",
    day1Pressure: "",
    day1Notes: "",
    week1Vision: "",
    week1Pressure: "",
    week1Notes: "",
    month1Vision: "",
    month1Pressure: "",
    month1Notes: "",
  });

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  if (!isAuthenticated) return null;

  const canManageSurgeries = ["doctor", "admin"].includes(user?.role || "");

  const handleSelectPatient = (patient: {
    id: number;
    fullName: string;
    patientCode?: string | null;
  }) => {
    setSelectedPatientId(patient.id);
    setFormData((prev) => ({
      ...prev,
      patientName: patient.fullName ?? "",
      patientCode: patient.patientCode ?? "",
    }));
  };

  const handleCreateSurgery = async () => {
    if (!formData.patientName || !formData.surgeryDate) {
      toast.error("يرجى ملء الحقول المطلوبة");
      return;
    }

    if (!selectedPatientId) {
      toast.error("يرجى اختيار المريض أولاً");
      return;
    }

    try {
      await createSurgeryMutation.mutateAsync({
        patientId: selectedPatientId,
        surgeryDate: formData.surgeryDate,
        surgeryType: formData.surgeryType,
        surgeryNotes: formData.notes,
      });
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "حدث خطأ أثناء جدولة العملية"));
      return;
    }
    setFormData({
      patientName: "",
      patientCode: "",
      surgeryType: "LASIK",
      surgeryDate: "",
      notes: "",
    });
    setIsDialogOpen(false);
  };

  const handleDeleteSurgery = async (id: number) => {
    if (!window.confirm("هل أنت متأكد من حذف العملية؟")) return;
    try {
      await deleteSurgeryMutation.mutateAsync({ surgeryId: id });
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "حدث خطأ أثناء حذف العملية"));
    }
  };

  const handlePrintFollowup = (surgery: (typeof surgeries)[0]) => {
    setSelectedSurgery(surgery);
    window.setTimeout(() => {
      window.print();
    }, 100);
  };

  const handleSaveFollowup = async () => {
    if (!selectedSurgery) return;
    const notes = JSON.stringify(postOpFollowup);
    try {
      await createFollowupMutation.mutateAsync({
        surgeryId: selectedSurgery.id,
        date: new Date().toISOString().split("T")[0],
        findings: notes,
      });
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "حدث خطأ أثناء حفظ المتابعة"));
      return;
    }
    window.setTimeout(() => {
      window.print();
    }, 100);
  };

  const surgeries = useMemo(() => {
    return (surgeriesQuery.data ?? []).map((surgery: any) => ({
      id: surgery.id,
      patientName: formData.patientName,
      patientCode: formData.patientCode,
      surgeryDate: new Date(surgery.surgeryDate).toISOString().split("T")[0],
      surgeryType: (() => {
        try {
          const parsed = surgery.notes ? JSON.parse(surgery.notes) : {};
          return parsed.surgeryType ?? surgery.surgeryType ?? "";
        } catch {
          return surgery.surgeryType ?? "";
        }
      })(),
      doctor: user?.name || "",
      status: "مجدولة",
      result: "",
      notes: surgery.notes ?? "",
    }));
  }, [surgeriesQuery.data, formData.patientName, formData.patientCode, user?.name]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "مجدولة":
        return "bg-yellow-500";
      case "مكتملة":
        return "bg-green-500";
      case "ملغاة":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "مجدولة":
        return <AlertCircle className="h-4 w-4" />;
      case "مكتملة":
        return <CheckCircle className="h-4 w-4" />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground shadow-lg print:hidden">
        <div className="container mx-auto px-4 py-4">
          <div />
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 print:p-0">
        {/* Create Surgery Button */}
        {canManageSurgeries && (
          <div className="mb-8 print:hidden">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90">
                  <Plus className="h-4 w-4 mr-2" />
                  جدولة عملية جديدة
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>جدولة عملية جراحية جديدة</DialogTitle>
                  <DialogDescription>
                    أدخل بيانات العملية الجراحية
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <PatientPicker onSelect={handleSelectPatient} />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="patient-name">اسم المريض</Label>
                      <Input
                        id="patient-name"
                        placeholder="أدخل اسم المريض"
                        value={formData.patientName}
                        onChange={(e) =>
                          setFormData({ ...formData, patientName: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="patient-code">كود المريض</Label>
                      <Input
                        id="patient-code"
                        placeholder="P001"
                        value={formData.patientCode}
                        readOnly
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="surgery-type">نوع العملية</Label>
                      <select
                        id="surgery-type"
                        className="w-full px-3 py-2 border rounded-md bg-background"
                        value={formData.surgeryType}
                        onChange={(e) =>
                          setFormData({ ...formData, surgeryType: e.target.value })
                        }
                      >
                        <option>LASIK</option>
                        <option>PRK</option>
                        <option>Femtolasik</option>
                        <option>Wavefront</option>
                        <option>زراعة عدسات IOL</option>
                        <option>زراعة عدسات ICL</option>
                        <option>عملية حول</option>
                        <option>عملية المياه الزرقاء</option>
                        <option>ليزر Yag</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="surgery-date">تاريخ العملية</Label>
                      <div className="space-y-1">
                        <Input
                          id="surgery-date"
                          type="date"
                          value={formData.surgeryDate}
                          onChange={(e) =>
                            setFormData({ ...formData, surgeryDate: e.target.value })
                          }
                        />
                        <span className="text-[10px] text-muted-foreground">
                          {formatDateLabel(formData.surgeryDate)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="notes">ملاحظات قبل العملية</Label>
                    <Textarea
                      id="notes"
                      placeholder="أي ملاحظات أو تحضيرات خاصة"
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData({ ...formData, notes: e.target.value })
                      }
                      className="h-20"
                    />
                  </div>

                  <Button
                    onClick={handleCreateSurgery}
                    className="w-full bg-primary hover:bg-primary/90"
                  >
                    جدولة العملية
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Surgeries List */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 print:hidden">
            <Card>
              <CardHeader>
                <CardTitle>العمليات المجدولة والمكتملة</CardTitle>
                <CardDescription>
                  عدد العمليات: {surgeries.length}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {!selectedPatientId ? (
                    <p className="text-center text-muted-foreground py-8">
                      اختر مريضاً لعرض العمليات
                    </p>
                  ) : surgeriesQuery.isLoading ? (
                    <p className="text-center text-muted-foreground py-8">
                      جاري تحميل العمليات...
                    </p>
                  ) : surgeries.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      لا توجد عمليات
                    </p>
                  ) : (
                    surgeries.map((surgery) => (
                      <div
                        key={surgery.id}
                        className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold">{surgery.patientName}</h3>
                              <Badge className={getStatusColor(surgery.status)}>
                                {getStatusIcon(surgery.status)}
                                <span className="ml-1">{surgery.status}</span>
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {surgery.patientCode}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">
                              {surgery.surgeryDate}
                            </p>
                            <p className="text-xs font-medium text-primary">
                              {surgery.doctor}
                            </p>
                          </div>
                        </div>

                        <div className="mb-3 text-sm">
                          <p className="mb-2">
                            <span className="font-semibold">نوع العملية:</span>{" "}
                            {surgery.surgeryType}
                          </p>
                          {surgery.result && (
                            <p>
                              <span className="font-semibold">النتيجة:</span>{" "}
                              {surgery.result}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedSurgery(surgery)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            عرض
                          </Button>
                          {surgery.status === "مكتملة" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => handlePrintFollowup(surgery)}
                            >
                              متابعة ما بعد العملية
                            </Button>
                          )}
                          {canManageSurgeries && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteSurgery(surgery.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              حذف
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Surgery Details & Post-Op Followup */}
          <div className="space-y-4">
            {selectedSurgery ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>تفاصيل العملية</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground">
                        المريض
                      </p>
                      <p className="text-lg font-bold">
                        {selectedSurgery.patientName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {selectedSurgery.patientCode}
                      </p>
                    </div>

                    <div className="border-t pt-4">
                      <p className="text-sm font-semibold text-muted-foreground mb-2">
                        نوع العملية
                      </p>
                      <p className="text-sm">{selectedSurgery.surgeryType}</p>
                    </div>

                    <div className="border-t pt-4">
                      <p className="text-sm font-semibold text-muted-foreground mb-2">
                        التاريخ
                      </p>
                      <p className="text-sm">{selectedSurgery.surgeryDate}</p>
                    </div>

                    <div className="border-t pt-4">
                      <p className="text-sm font-semibold text-muted-foreground mb-2">
                        الطبيب
                      </p>
                      <p className="text-sm">{selectedSurgery.doctor}</p>
                    </div>
                  </CardContent>
                </Card>

                {selectedSurgery.status === "مكتملة" && (
                  <Card>
                    <CardHeader>
                      <CardTitle>متابعة ما بعد العملية</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                      <div>
                        <p className="font-semibold mb-2">اليوم الأول</p>
                        <div className="space-y-2">
                          <div>
                            <Label className="text-xs">حدة الإبصار</Label>
                            <Input
                              placeholder="6/6"
                              value={postOpFollowup.day1Vision}
                              onChange={(e) =>
                                setPostOpFollowup({
                                  ...postOpFollowup,
                                  day1Vision: e.target.value,
                                })
                              }
                              className="h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">ضغط العين</Label>
                            <Input
                              placeholder="14 mmHg"
                              value={postOpFollowup.day1Pressure}
                              onChange={(e) =>
                                setPostOpFollowup({
                                  ...postOpFollowup,
                                  day1Pressure: e.target.value,
                                })
                              }
                              className="h-8"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <p className="font-semibold mb-2">الأسبوع الأول</p>
                        <div className="space-y-2">
                          <div>
                            <Label className="text-xs">حدة الإبصار</Label>
                            <Input
                              placeholder="6/5"
                              value={postOpFollowup.week1Vision}
                              onChange={(e) =>
                                setPostOpFollowup({
                                  ...postOpFollowup,
                                  week1Vision: e.target.value,
                                })
                              }
                              className="h-8"
                            />
                          </div>
                        </div>
                      </div>

                      <Button
                        className="w-full bg-primary hover:bg-primary/90 h-8"
                        onClick={handleSaveFollowup}
                      >
                        حفظ المتابعة
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">
                    اختر عملية لعرض التفاصيل
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
