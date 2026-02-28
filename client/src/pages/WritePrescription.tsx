import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Printer, Save, Pencil, Upload } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { formatDateLabel, getTrpcErrorMessage } from "@/lib/utils";
import PatientPicker from "@/components/PatientPicker";
import { trpc } from "@/lib/trpc";
import { READY_PRESCRIPTION_TEMPLATES } from "@/data/readyPrescriptionTemplates";
import * as XLSX from "xlsx";

interface PrescriptionItem {
  id: string;
  medicationId: number;
  medicationName: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export default function WritePrescription() {
  const { isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();
  const isReception = user?.role === "reception";

  const [patientId, setPatientId] = useState<number | null>(null);
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [prescriptionDate, setPrescriptionDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const toDateInputValue = (value: unknown) => {
    const date = new Date(String(value ?? ""));
    if (Number.isNaN(date.valueOf())) return "";
    return date.toISOString().split("T")[0];
  };

  const [prescriptionItems, setPrescriptionItems] = useState<PrescriptionItem[]>([]);
  const [generalNotes, setGeneralNotes] = useState("");
  const [medicationSearch, setMedicationSearch] = useState("");
  const preOpInstructions = [
    "عدم استخدام العدسات اللاصقة لمدة لا تقل عن أسبوع ويمكن أن تزيد.",
    "عدم وضع أي مساحيق بالعين أو الوجه يوم العملية وبعدها حسب ما يحدده الطبيب.",
    "الاستحمام قبل العملية ويوم العملية والتأكد من أن الملابس ليس بها أي عطر سابق.",
    "غسل الوجه جيداً يوم العملية.",
    "استخدام القطرات كما هو موضح بالروشتة قبل العملية.",
  ];
  const postOpInstructions = [
    "عدم لمس العين بالأيدي أو الحك أو نزول البحر أو حمام السباحة.",
    "عدم دخول الماء داخل العين لمدة أسبوع بعد العملية مباشرة.",
    "استخدام النظارة الشمسية وقت التعرض لأشعة الشمس فقط.",
    "الابتعاد عن أماكن التراب والغبار.",
    "الالتزام بأخذ العلاج كما وصفه الطبيب.",
    "الالتزام بمواعيد المتابعة بعد العملية.",
  ];
  const patientStateQuery = trpc.medical.getPatientPageState.useQuery(
    { patientId: patientId ?? 0, page: "prescription" },
    { enabled: Boolean(patientId) && !isReception, refetchOnWindowFocus: false }
  );
  const savePatientStateMutation = trpc.medical.savePatientPageState.useMutation();
  const templateOverridesQuery = trpc.medical.getReadyTemplateOverrides.useQuery(
    { scope: "prescription" },
    { refetchOnWindowFocus: false }
  );
  const upsertTemplateOverrideMutation = trpc.medical.upsertReadyTemplateOverride.useMutation({
    onSuccess: async () => {
      await templateOverridesQuery.refetch();
    },
  });
  const importReadyTemplateOverridesMutation = trpc.medical.importReadyTemplateOverrides.useMutation({
    onSuccess: async () => {
      await templateOverridesQuery.refetch();
    },
  });
  const patientStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const medicationsQuery = trpc.medical.getAllMedications.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const createPrescriptionMutation = trpc.medical.createPrescriptionWithItems.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ الروشتة بنجاح");
    },
    onError: (error: unknown) => {
      toast.error(getTrpcErrorMessage(error, "فشل في حفظ الروشتة."));
    },
  });

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    if (isReception) return;
    const data = (patientStateQuery.data as any)?.data;
    if (!data) return;
    if (data.prescriptionDate) setPrescriptionDate(data.prescriptionDate);
    if (data.generalNotes !== undefined) setGeneralNotes(data.generalNotes ?? "");
    if (data.medicationSearch !== undefined) setMedicationSearch(data.medicationSearch ?? "");
    if (Array.isArray(data.prescriptionItems)) setPrescriptionItems(data.prescriptionItems);
  }, [patientStateQuery.data, isReception]);

  useEffect(() => {
    if (!patientId || isReception) return;
    if (patientStateTimerRef.current) clearTimeout(patientStateTimerRef.current);
    const payload = {
      prescriptionDate,
      generalNotes,
      medicationSearch,
      prescriptionItems,
    };
    patientStateTimerRef.current = setTimeout(() => {
      savePatientStateMutation.mutate({ patientId, page: "prescription", data: payload });
    }, 800);
    return () => {
      if (patientStateTimerRef.current) clearTimeout(patientStateTimerRef.current);
    };
  }, [patientId, isReception, prescriptionDate, generalNotes, medicationSearch, prescriptionItems, savePatientStateMutation]);

  if (!isAuthenticated) return null;

  const templateOverrides = (templateOverridesQuery.data ?? {}) as Record<
    string,
    {
      name?: string;
      prescriptionItems?: Array<{
        medicationName: string;
        dosage: string;
        frequency: string;
        duration: string;
        instructions: string;
      }>;
    }
  >;
  const readyTemplates = [
    ...READY_PRESCRIPTION_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      items: t.items,
    })),
    ...Object.keys(templateOverrides)
      .filter((id) => !READY_PRESCRIPTION_TEMPLATES.some((t) => t.id === id))
      .map((id) => ({
        id,
        name: templateOverrides[id]?.name?.trim() || id,
        items: templateOverrides[id]?.prescriptionItems ?? [],
      })),
  ];

  const handleSelectPatient = (patient: { id: number; fullName: string; age?: number | null }) => {
    setPatientId(patient.id);
    setPatientName(patient.fullName ?? "");
    setPatientAge(patient.age != null ? String(patient.age) : "");
  };

  const historyQuery = trpc.medical.getPrescriptionsWithItemsByPatient.useQuery(
    { patientId: patientId ?? 0 },
    { enabled: Boolean(patientId), refetchOnWindowFocus: false }
  );
  useEffect(() => {
    if (!isReception) return;
    const history = (historyQuery.data ?? []) as any[];
    if (!history.length) {
      setPrescriptionItems([]);
      return;
    }
    const latest = history[0];
    const items = (latest.items ?? []).map((item: any) => ({
      id: String(item.id ?? Date.now()),
      medicationId: item.medicationId ?? 0,
      medicationName: item.medicationName ?? "",
      dosage: item.dosage ?? "",
      frequency: item.frequency ?? "",
      duration: item.duration ?? "",
      instructions: item.instructions ?? "",
    }));
    setPrescriptionItems(items);
    if (latest.prescriptionDate) {
      const dateValue = toDateInputValue(latest.prescriptionDate);
      if (dateValue) setPrescriptionDate(dateValue);
    }
  }, [historyQuery.data, isReception]);

  const handleRemoveItem = (id: string) => {
    if (isReception) return;
    setPrescriptionItems(prescriptionItems.filter((item) => item.id !== id));
    toast.success("تم حذف الدواء من الروشتة");
  };

  const handleSave = async () => {
    if (isReception) {
      toast.error("الاستقبال يمكنه الطباعة فقط.");
      return;
    }
    if (!patientId) {
      toast.error("يرجى اختيار المريض أولاً.");
      return;
    }
    const itemsToSave = prescriptionItems.filter(
      (item) =>
        (typeof item.medicationId === "number" && item.medicationId > 0) ||
        Boolean(item.medicationName && item.medicationName.trim())
    );
    if (itemsToSave.length === 0) {
      toast.error("يرجى إضافة دواء واحد على الأقل.");
      return;
    }
    console.log("Saving prescription items:", itemsToSave);
    await createPrescriptionMutation.mutateAsync({
      patientId,
      date: prescriptionDate,
      notes: generalNotes,
      items: itemsToSave.map((item) => ({
        medicationId: item.medicationId,
        medicationName: item.medicationName,
        dosage: item.dosage,
        frequency: item.frequency,
        duration: item.duration,
        instructions: item.instructions,
      })),
    });
    if (patientId) {
      await historyQuery.refetch();
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredItems = prescriptionItems.filter((item) => {
    const term = medicationSearch.trim().toLowerCase();
    if (!term) return true;
    return [
      item.medicationName,
      item.dosage,
      item.frequency,
      item.duration,
      item.instructions,
    ]
      .join(" ")
      .toLowerCase()
      .includes(term);
  });

  const availableMedications = useMemo(() => {
    const meds = (medicationsQuery.data ?? []) as any[];
    const term = medicationSearch.trim().toLowerCase();
    if (!term) return meds;
    return meds.filter((med) =>
      `${med.name} ${med.type} ${med.strength} ${med.manufacturer} ${med.activeIngredient}`
        .toLowerCase()
        .includes(term)
    );
  }, [medicationsQuery.data, medicationSearch]);

  const handleToggleMedication = (med: any) => {
    if (isReception) return;
    const exists = prescriptionItems.find((item) => item.medicationId === med.id);
    if (exists) {
      handleRemoveItem(exists.id);
      return;
    }
    setPrescriptionItems([
      ...prescriptionItems,
      {
        id: Date.now().toString(),
        medicationId: med.id,
        medicationName: med.name ?? "",
        dosage: "",
        frequency: "",
        duration: "",
        instructions: "",
      },
    ]);
  };

  const formatItemDetails = (item: PrescriptionItem) => {
    if (item.instructions?.trim()) return item.instructions.trim();
    const parts = [item.dosage, item.frequency, item.duration]
      .map((p) => String(p ?? "").trim())
      .filter(Boolean);
    return parts.join(" ");
  };

  const normalizeTemplateId = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-_]/g, "")
      .slice(0, 64);

  const handleImportReadyPrescriptions = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      if (!workbook.SheetNames.length) {
        toast.error("Excel file has no sheets.");
        return;
      }
      const rows = workbook.SheetNames.flatMap((sheetName, sheetIndex) => {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return [] as Array<Record<string, unknown>>;
        return XLSX.utils
          .sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })
          .map((row) => ({ ...row, __sheetName: sheetName, __sheetIndex: sheetIndex }));
      });

      const grouped = new Map<
        string,
        {
          templateId: string;
          name?: string;
          prescriptionItems: Array<{
            medicationName: string;
            dosage: string;
            frequency: string;
            duration: string;
            instructions: string;
          }>;
        }
      >();

      const templateIdUsage = new Map<string, number>();

      for (const row of rows) {
        const templateIdRaw = String(
          row.templateId ?? row.template_id ?? row.TemplateId ?? row["كود القالب"] ?? ""
        );
        const templateNameRaw = String(
          row.templateName ?? row.template_name ?? row.TemplateName ?? row["اسم القالب"] ?? ""
        );
        const templateKeyRaw = String(
          row.templateKey ?? row.template_key ?? row.TemplateKey ?? row["templateKey"] ?? ""
        );
        const sheetNameRaw = String((row as any).__sheetName ?? "");
        const sheetIndexRaw = Number((row as any).__sheetIndex ?? -1);
        const medicationName = String(
          row.medicationName ?? row.medication_name ?? row.MedicationName ?? row["اسم الدواء"] ?? ""
        ).trim();
        const dosage = String(row.dosage ?? row["الجرعة"] ?? "").trim();
        const frequency = String(row.frequency ?? row["التكرار"] ?? "").trim();
        const duration = String(row.duration ?? row["المدة"] ?? "").trim();
        const instructions = String(row.instructions ?? row["التعليمات"] ?? "").trim();

        const normalizedBaseId =
          normalizeTemplateId(templateKeyRaw) ||
          normalizeTemplateId(
            templateIdRaw && sheetIndexRaw >= 0
              ? `${templateIdRaw}__s${sheetIndexRaw}`
              : ""
          ) ||
          normalizeTemplateId(templateIdRaw) ||
          normalizeTemplateId(
            templateNameRaw && sheetIndexRaw >= 0
              ? `${templateNameRaw}__s${sheetIndexRaw}`
              : ""
          ) ||
          normalizeTemplateId(templateNameRaw) ||
          normalizeTemplateId(sheetNameRaw) ||
          "";
        let normalizedId = normalizedBaseId;
        if (normalizedId) {
          const currentCount = templateIdUsage.get(normalizedId) ?? 0;
          if (!grouped.has(normalizedId) && currentCount > 0) {
            normalizedId = `${normalizedId}-${currentCount + 1}`;
          }
          templateIdUsage.set(normalizedBaseId, currentCount + 1);
        }
        if (!normalizedId || !medicationName) continue;

        if (!grouped.has(normalizedId)) {
          grouped.set(normalizedId, {
            templateId: normalizedId,
            name: templateNameRaw.trim() || undefined,
            prescriptionItems: [],
          });
        }
        grouped.get(normalizedId)!.prescriptionItems.push({
          medicationName,
          dosage,
          frequency,
          duration,
          instructions,
        });
      }

      const templates = Array.from(grouped.values()).filter((t) => t.prescriptionItems.length > 0);
      if (templates.length === 0) {
        toast.error("No valid templates found in file.");
        return;
      }

      await importReadyTemplateOverridesMutation.mutateAsync({
        scope: "prescription",
        templates,
      });
      toast.success(`Imported ${templates.length} templates`);
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to import templates."));
    }
  };

  const handleApplyReadyPrescription = (templateId: string) => {
    const template = readyTemplates.find((t) => t.id === templateId);
    if (!template) return;
    const sourceItems = templateOverrides[templateId]?.prescriptionItems ?? template.items;
    setPrescriptionItems(
      sourceItems.map((item, idx) => ({
        id: `ready-${templateId}-${idx}-${Date.now()}`,
        medicationId: 0,
        medicationName: item.medicationName,
        dosage: item.dosage ?? "",
        frequency: item.frequency ?? "",
        duration: item.duration ?? "",
        instructions: item.instructions ?? "",
      }))
    );
  };

  const handleSaveTemplateContent = async (templateId: string) => {
    const items = prescriptionItems
      .map((item) => ({
        medicationName: String(item.medicationName ?? "").trim(),
        dosage: String(item.dosage ?? "").trim(),
        frequency: String(item.frequency ?? "").trim(),
        duration: String(item.duration ?? "").trim(),
        instructions: String(item.instructions ?? "").trim(),
      }))
      .filter((item) => item.medicationName);

    try {
      await upsertTemplateOverrideMutation.mutateAsync({
        scope: "prescription",
        templateId,
        prescriptionItems: items,
      });
      toast.success("Template content saved");
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to save template content."));
    }
  };

  const getTemplateDisplayName = (templateId: string, fallbackName: string) => {
    const overrideName = templateOverrides[templateId]?.name;
    return overrideName && overrideName.trim() ? overrideName : fallbackName;
  };

  const handleRenameTemplate = async (templateId: string, fallbackName: string) => {
    const currentName = getTemplateDisplayName(templateId, fallbackName);
    const nextName = window.prompt("Rename template", currentName);
    if (nextName === null) return;

    const clean = nextName.trim();
    try {
      await upsertTemplateOverrideMutation.mutateAsync({
        scope: "prescription",
        templateId,
        name: !clean || clean === fallbackName ? "" : clean,
      });
      toast.success("Template name updated");
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to rename template."));
    }
  };


  const handleDeleteTemplateOverride = async (templateId: string) => {
    try {
      await upsertTemplateOverrideMutation.mutateAsync({
        scope: "prescription",
        templateId,
        name: "",
        prescriptionItems: [],
      });
      toast.success("Template override deleted");
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to delete template override."));
    }
  };
  return (
    <div className="prescription-root min-h-screen bg-background" dir="rtl" style={{ direction: "rtl" }}>
      <PageHeader backTo="/patients" />

      <main className="container mx-auto px-4 py-8 print:p-0">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {!isReception && (
          <Card className="lg:col-span-1 print:hidden">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm">الأدوية المتاحة</CardTitle>
                <Input
                  value={medicationSearch}
                  onChange={(e) => setMedicationSearch(e.target.value)}
                  placeholder="ابحث في الأدوية"
                  className="max-w-xs text-right"
                  dir="rtl"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-2 max-h-80 overflow-y-auto">
              <Button
                className="w-full"
                onClick={() => {
                  const name = window.prompt("اسم الدواء");
                  if (!name) return;
                  setPrescriptionItems((prev) => [
                    ...prev,
                    {
                      id: Date.now().toString(),
                      medicationId: 0,
                      medicationName: name,
                      dosage: "",
                      frequency: "",
                      duration: "",
                      instructions: "",
                    },
                  ]);
                }}
              >
                إضافة دواء
              </Button>
              {availableMedications.map((med) => {
                const checked = prescriptionItems.some((item) => item.medicationId === med.id);
                return (
                  <label key={med.id} className="flex items-center justify-between gap-2 rounded border p-2" dir="ltr">
                    <span className="text-sm text-left">{med.name}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggleMedication(med)}
                    />
                  </label>
                );
              })}
              {availableMedications.length === 0 && (
                <p className="text-center text-muted-foreground">لا توجد أدوية</p>
              )}
            </CardContent>
          </Card>
          )}

          <div className="prescription-print-content lg:col-span-2 space-y-6" data-print-prescription-content>
            <Card className="print:hidden">
              <CardContent className="space-y-4 pt-6">
                <PatientPicker onSelect={handleSelectPatient} />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input value={patientName} readOnly placeholder="اسم المريض" className="text-center" />
                  <Input value={patientAge} readOnly placeholder="السن" className="text-center" />
                  <div className="space-y-1">
                    <Input type="date" value={prescriptionDate} onChange={(e) => setPrescriptionDate(e.target.value)} disabled={isReception} />
                    <span className="text-[10px] text-muted-foreground">{formatDateLabel(prescriptionDate)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {!isReception && (
              <Card className="print:hidden">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>روشتات جاهزة</CardTitle>
                    <div className="flex items-center gap-2">
                      <input
                        ref={importInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        onChange={(e) => void handleImportReadyPrescriptions(e)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => importInputRef.current?.click()}
                      >
                        <Upload className="h-4 w-4 ml-1" />
                        Import Excel
                      </Button>
                    </div>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                  {readyTemplates.map((template) => (
                    <div key={template.id} className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        type="button"
                        className="justify-start flex-1"
                        onClick={() => handleApplyReadyPrescription(template.id)}
                      >
                        {getTemplateDisplayName(template.id, template.name)}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => handleSaveTemplateContent(template.id)}
                        title="Save template content"
                        aria-label="Save template content"
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => handleRenameTemplate(template.id, template.name)}
                        title="Rename"
                        aria-label="Rename template"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => handleDeleteTemplateOverride(template.id)}
                        title="Delete override"
                        aria-label="Delete template override"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card className="hidden print:block print:border-0 print:shadow-none">
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center justify-center gap-10 text-sm" dir="rtl">
                  <span className="inline-flex items-center gap-1" dir="rtl">
                    <span className="font-semibold">الاسم:</span>
                    <span>{patientName}</span>
                  </span>
                  {patientAge ? (
                    <span className="inline-flex items-center gap-1" dir="rtl">
                      <span className="font-semibold">السن:</span>
                      <span dir="ltr">{patientAge}</span>
                    </span>
                  ) : null}
                  {prescriptionDate ? (
                    <span className="inline-flex items-center gap-1" dir="rtl">
                      <span className="font-semibold">التاريخ:</span>
                      <span dir="ltr">{formatDateLabel(prescriptionDate)}</span>
                    </span>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card className="print:[direction:ltr] print:border-0 print:shadow-none">
              <CardHeader className="hidden print:hidden" />
              <CardContent className="prescription-print-rx space-y-3 pt-3">
                <div className="text-base font-semibold">R/</div>
                {isReception ? (
                  prescriptionItems.length === 0 ? (
                    <p className="text-center text-muted-foreground">لا توجد روشتة مسجلة لهذا المريض</p>
                  ) : (
                    prescriptionItems.map((item) => (
                      <div key={item.id} className="border rounded-lg p-3 print:border-0 print:rounded-none">
                        <div className="font-bold">{item.medicationName}</div>
                        {formatItemDetails(item) && (
                          <div className="text-sm text-muted-foreground">{formatItemDetails(item)}</div>
                        )}
                      </div>
                    ))
                  )
                ) : (
                  prescriptionItems.length === 0 ? (
                    <p className="text-center text-muted-foreground">لا توجد أدوية بعد</p>
                  ) : (
                    filteredItems.map((item) => (
                      <div key={item.id} className="border rounded-lg p-3 print:border-0 print:rounded-none">
                        <div className="flex items-start justify-between gap-3" dir="ltr">
                          <div className="flex-1 space-y-2">
                            <Input
                              value={item.medicationName}
                              onChange={(e) =>
                                setPrescriptionItems((prev) =>
                                  prev.map((p) =>
                                    p.id === item.id
                                      ? { ...p, medicationName: e.target.value }
                                      : p
                                  )
                                )
                              }
                              placeholder="Medication name"
                              className="print:hidden text-left"
                              dir="ltr"
                            />
                            <div className="hidden print:block font-bold text-left">{item.medicationName}</div>
                            <Textarea
                              value={item.instructions}
                              onChange={(e) =>
                                setPrescriptionItems((prev) =>
                                  prev.map((p) =>
                                    p.id === item.id
                                      ? { ...p, instructions: e.target.value }
                                      : p
                                  )
                                )
                              }
                              placeholder="الجرعة / التكرار / المدة / تعليمات"
                              className="min-h-12 text-center w-full print:hidden"
                            />
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 print:hidden">
                              <Input
                                value={item.dosage}
                                onChange={(e) =>
                                  setPrescriptionItems((prev) =>
                                    prev.map((p) =>
                                      p.id === item.id ? { ...p, dosage: e.target.value } : p
                                    )
                                  )
                                }
                                placeholder="الجرعة"
                                className="text-center"
                              />
                              <Input
                                value={item.frequency}
                                onChange={(e) =>
                                  setPrescriptionItems((prev) =>
                                    prev.map((p) =>
                                      p.id === item.id ? { ...p, frequency: e.target.value } : p
                                    )
                                  )
                                }
                                placeholder="التكرار"
                                className="text-center"
                              />
                              <Input
                                value={item.duration}
                                onChange={(e) =>
                                  setPrescriptionItems((prev) =>
                                    prev.map((p) =>
                                      p.id === item.id ? { ...p, duration: e.target.value } : p
                                    )
                                  )
                                }
                                placeholder="المدة"
                                className="text-center"
                              />
                            </div>
                            <div className="hidden print:block text-sm text-muted-foreground">
                              {formatItemDetails(item)}
                            </div>
                          </div>
                          <Button size="icon" variant="destructive" onClick={() => handleRemoveItem(item.id)} className="print:hidden">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )
                )}
              </CardContent>
            </Card>
          </div>
        </div>
        <div className="hidden print:flex flex-col items-end pt-3 text-sm print:[direction:ltr]" dir="rtl">
          <span className="font-semibold">الطبيب المعالج</span>
          <span className="mt-1">{user?.name ?? ""}</span>
        </div>
        <section className="hidden print:block prescription-print-backside" dir="rtl">
          <div className="space-y-6 text-[14px] leading-7">
            <div>
              <h3 className="font-bold mb-2">قبل العملية</h3>
              <ul className="space-y-1 pr-5 list-disc">
                {preOpInstructions.map((line, idx) => (
                  <li key={`pre-${idx}`}>{line}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-2">بعد العملية</h3>
              <ul className="space-y-1 pr-5 list-disc">
                {postOpInstructions.map((line, idx) => (
                  <li key={`post-${idx}`}>{line}</li>
                ))}
              </ul>
            </div>
            <p className="text-center font-semibold pt-4">مع تمنياتنا لكم الشفاء العاجل</p>
          </div>
        </section>
        <div className="print:hidden mt-4">
          {patientId ? (
            <Card>
              <CardHeader>
                <CardTitle>الروشتات السابقة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {historyQuery.isLoading ? (
                  <p className="text-center text-muted-foreground">جاري التحميل...</p>
                ) : (historyQuery.data ?? []).filter((rx: any) => (rx.items ?? []).length > 0).length === 0 ? (
                  <p className="text-center text-muted-foreground">لا توجد روشتات سابقة</p>
                ) : (
                  (historyQuery.data ?? [])
                    .filter((rx: any) => (rx.items ?? []).length > 0)
                    .map((rx: any) => (
                    <div key={rx.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold">التاريخ</span>
                        <span>{rx.prescriptionDate ? formatDateLabel(rx.prescriptionDate) : ""}</span>
                      </div>
                      <div className="mt-2 space-y-2">
                        {(rx.items ?? []).length === 0 ? (
                          <p className="text-sm text-muted-foreground">لا توجد أدوية</p>
                        ) : (
                          (rx.items ?? []).map((item: any) => (
                            <div key={item.id} className="text-sm">
                              <span className="font-semibold">{item.medicationName || `#${item.medicationId ?? ""}`}</span>
                              {formatItemDetails({
                                id: String(item.id ?? ""),
                                medicationId: item.medicationId ?? 0,
                                medicationName: item.medicationName ?? "",
                                dosage: item.dosage ?? "",
                                frequency: item.frequency ?? "",
                                duration: item.duration ?? "",
                                instructions: item.instructions ?? "",
                              }) ? (
                                <div className="text-xs text-muted-foreground">
                                  {formatItemDetails({
                                    id: String(item.id ?? ""),
                                    medicationId: item.medicationId ?? 0,
                                    medicationName: item.medicationName ?? "",
                                    dosage: item.dosage ?? "",
                                    frequency: item.frequency ?? "",
                                    duration: item.duration ?? "",
                                    instructions: item.instructions ?? "",
                                  })}
                                </div>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                      {rx.notes ? (
                        <div className="mt-2 text-xs text-muted-foreground">{rx.notes}</div>
                      ) : null}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ) : (
            <p className="text-center text-muted-foreground">اختر مريضاً لعرض الروشتات السابقة</p>
          )}
        </div>
        <div className="print:hidden flex justify-end gap-2 mt-4">
          {!isReception && (
            <Button
              variant="outline"
              onClick={handleSave}
              type="button"
            >
              <Save className="h-4 w-4 ml-2" />
              حفظ
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handlePrint}
            type="button"
          >
            <Printer className="h-4 w-4 ml-2" />
            طباعة
          </Button>
        </div>
      </main>
      <style>{`
        .prescription-root input[type="date"]::-webkit-calendar-picker-indicator {
          width: 14px;
          height: 14px;
        }
        @media print {
          @page {
            size: A5;
            margin: 10mm;
          }
          .prescription-root {
            min-height: auto !important;
          }
          .prescription-root main,
          .prescription-root [data-print-prescription-content] {
            display: block !important;
            overflow: visible !important;
          }
          .prescription-root [data-print-prescription-content] .card-header {
            display: none !important;
          }
          .prescription-root [data-print-prescription-content] [data-slot="card-header"],
          .prescription-root [data-print-prescription-content] [data-slot="card-title"] {
            display: none !important;
          }
          .prescription-root [data-print-prescription-content] [data-slot="card"] {
            margin: 0 !important;
            padding-top: 0 !important;
            padding-bottom: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            break-inside: avoid-page;
            page-break-inside: avoid;
          }
          .prescription-root .prescription-print-rx {
            padding-top: 0 !important;
          }
          .prescription-root .prescription-print-rx > div,
          .prescription-root .prescription-print-rx > p {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .prescription-root .prescription-print-backside {
            page-break-before: always;
            break-before: page;
            padding-top: 6mm;
          }
        }
      `}</style>
    </div>
  );
}


