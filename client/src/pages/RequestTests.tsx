import { useAuth } from "@/hooks/useAuth";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Pencil, Printer, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { formatDateLabel, getTrpcErrorMessage } from "@/lib/utils";
import PatientPicker from "@/components/PatientPicker";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { READY_PRESCRIPTION_TEMPLATES } from "@/data/readyPrescriptionTemplates";
import * as XLSX from "xlsx";

interface TestItem {
  id: number;
  name: string;
  category: string;
  selected: boolean;
  notes: string;
}

export default function RequestTests() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const [patientId, setPatientId] = useState<number | null>(null);
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [requestDate, setRequestDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [selectedTests, setSelectedTests] = useState<TestItem[]>([]);
  const [generalNotes, setGeneralNotes] = useState("");
  const [availableSearch, setAvailableSearch] = useState("");
  const patientStateQuery = trpc.medical.getPatientPageState.useQuery(
    { patientId: patientId ?? 0, page: "request-tests" },
    { enabled: Boolean(patientId), refetchOnWindowFocus: false }
  );
  const savePatientStateMutation = trpc.medical.savePatientPageState.useMutation();
  const templateOverridesQuery = trpc.medical.getReadyTemplateOverrides.useQuery(
    { scope: "tests" },
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

  const testsQuery = trpc.medical.getAllTests.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const createRequestMutation = trpc.medical.createTestRequest.useMutation({
    onSuccess: () => {
      toast.success("Test request saved successfully.");
    },
    onError: (error: unknown) => {
      toast.error(getTrpcErrorMessage(error, "Failed to save test request."));
    },
  });

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    const data = (patientStateQuery.data as any)?.data;
    if (!data) return;
    if (data.requestDate) setRequestDate(data.requestDate);
    if (data.generalNotes !== undefined) setGeneralNotes(data.generalNotes ?? "");
    if (data.availableSearch !== undefined) setAvailableSearch(data.availableSearch ?? "");
    if (Array.isArray(data.selectedTests)) setSelectedTests(data.selectedTests);
  }, [patientStateQuery.data]);

  useEffect(() => {
    if (!patientId) return;
    if (patientStateTimerRef.current) clearTimeout(patientStateTimerRef.current);
    const payload = {
      requestDate,
      generalNotes,
      availableSearch,
      selectedTests,
    };
    patientStateTimerRef.current = setTimeout(() => {
      savePatientStateMutation.mutate({ patientId, page: "request-tests", data: payload });
    }, 800);
    return () => {
      if (patientStateTimerRef.current) clearTimeout(patientStateTimerRef.current);
    };
  }, [patientId, requestDate, generalNotes, availableSearch, selectedTests, savePatientStateMutation]);

  if (!isAuthenticated) return null;

  const templateOverrides = (templateOverridesQuery.data ?? {}) as Record<
    string,
    {
      name?: string;
      testItems?: Array<{ testId: number; notes: string }>;
    }
  >;

  const availableTests = (testsQuery.data ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    category: t.category || "Uncategorized",
  })) as Array<{ id: number; name: string; category: string }>;

  const groupedTests = useMemo(() => {
    const term = availableSearch.trim().toLowerCase();
    const filtered = term
      ? availableTests.filter((test) =>
          `${test.name} ${test.category}`.toLowerCase().includes(term)
        )
      : availableTests;
    return filtered.reduce((acc, test) => {
      if (!acc[test.category]) acc[test.category] = [];
      acc[test.category].push(test);
      return acc;
    }, {} as Record<string, Array<{ id: number; name: string; category: string }>>);
  }, [availableTests, availableSearch]);

  const blankTestTemplates = useMemo(() => {
    const base = READY_PRESCRIPTION_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
    }));
    const extra = Object.keys(templateOverrides)
      .filter((id) => !base.some((t) => t.id === id))
      .map((id) => ({
        id,
        name: templateOverrides[id]?.name?.trim() || id,
      }));
    return [...base, ...extra];
  }, [templateOverrides]);

  const handleSelectTest = (test: { id: number; name: string; category: string }) => {
    const isSelected = selectedTests.some((t) => t.id === test.id);
    if (isSelected) {
      setSelectedTests(selectedTests.filter((t) => t.id !== test.id));
    } else {
      setSelectedTests([...selectedTests, { ...test, selected: true, notes: "" }]);
    }
  };

  const handleUpdateTestNotes = (testId: number, notes: string) => {
    setSelectedTests(
      selectedTests.map((t) => (t.id === testId ? { ...t, notes } : t))
    );
  };

  const handleRemoveTest = (testId: number) => {
    setSelectedTests(selectedTests.filter((t) => t.id !== testId));
    toast.success("Test removed from request.");
  };
  const normalizeTemplateId = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-_]/g, "")
      .slice(0, 64);

  const handleImportTestTemplates = async (event: ChangeEvent<HTMLInputElement>) => {
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
          .sheet_to_json<Record<string, unknown>>(sheet, {
            defval: "",
          })
          .map((row) => ({ ...row, __sheetName: sheetName, __sheetIndex: sheetIndex }));
      });

      const byName = new Map(
        availableTests.map((test) => [String(test.name ?? "").trim().toLowerCase(), test.id])
      );
      const grouped = new Map<
        string,
        {
          templateId: string;
          name?: string;
          testItems: Array<{ testId: number; notes: string }>;
        }
      >();

      const templateIdUsage = new Map<string, number>();

      for (const row of rows) {
        const templateIdRaw = String(
          row.templateId ?? row.template_id ?? row.TemplateId ?? row["ßæÏ ÇáÞÇáÈ"] ?? ""
        );
        const templateNameRaw = String(
          row.templateName ?? row.template_name ?? row.TemplateName ?? row["ÇÓã ÇáÞÇáÈ"] ?? ""
        );
        const templateKeyRaw = String(
          row.templateKey ?? row.template_key ?? row.TemplateKey ?? row["templateKey"] ?? ""
        );
        const sheetNameRaw = String((row as any).__sheetName ?? "");
        const sheetIndexRaw = Number((row as any).__sheetIndex ?? -1);
        const testIdRaw = Number(
          row.testId ?? row.test_id ?? row.TestId ?? row["ßæÏ ÇáÝÍÕ"] ?? 0
        );
        const testNameRaw = String(
          row.testName ?? row.test_name ?? row.TestName ?? row["ÇÓã ÇáÝÍÕ"] ?? ""
        ).trim();
        const notes = String(row.notes ?? row["ãáÇÍÙÇÊ"] ?? "").trim();

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
        if (!normalizedId) continue;

        let testId = Number.isFinite(testIdRaw) && testIdRaw > 0 ? testIdRaw : 0;
        if (!testId && testNameRaw) {
          testId = byName.get(testNameRaw.toLowerCase()) ?? 0;
        }
        if (!testId) continue;

        if (!grouped.has(normalizedId)) {
          grouped.set(normalizedId, {
            templateId: normalizedId,
            name: templateNameRaw.trim() || undefined,
            testItems: [],
          });
        }
        grouped.get(normalizedId)!.testItems.push({ testId, notes });
      }

      const templates = Array.from(grouped.values()).filter((t) => t.testItems.length > 0);
      if (templates.length === 0) {
        toast.error("No valid test templates found in file.");
        return;
      }

      await importReadyTemplateOverridesMutation.mutateAsync({
        scope: "tests",
        templates,
      });
      toast.success(`Imported ${templates.length} test templates`);
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to import test templates."));
    }
  };

  const handleApplyBlankTemplate = (templateId: string) => {
    const saved = templateOverrides[templateId]?.testItems ?? [];
    if (!saved.length) {
      setSelectedTests([]);
      return;
    }

    const byId = new Map(availableTests.map((t) => [t.id, t]));
    const next: TestItem[] = saved
      .map((entry) => {
        const test = byId.get(entry.testId);
        if (!test) return null;
        return {
          ...test,
          selected: true,
          notes: entry.notes ?? "",
        };
      })
      .filter((item): item is TestItem => Boolean(item));

    setSelectedTests(next);
  };

  const handleSaveTemplateContent = async (templateId: string) => {
    const payload = selectedTests.map((t) => ({
      testId: t.id,
      notes: t.notes ?? "",
    }));
    try {
      await upsertTemplateOverrideMutation.mutateAsync({
        scope: "tests",
        templateId,
        testItems: payload,
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
        scope: "tests",
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
        scope: "tests",
        templateId,
        name: "",
        testItems: [],
      });
      toast.success("Template override deleted");
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to delete template override."));
    }
  };


  const handleSaveRequest = async () => {
    if (!patientId) {
      toast.error("Please select a patient first.");
      return;
    }
    if (selectedTests.length === 0) {
      toast.error("Please select tests.");
      return;
    }
    await createRequestMutation.mutateAsync({
      patientId,
      date: requestDate,
      notes: generalNotes,
      items: selectedTests.map((t) => ({ testId: t.id, notes: t.notes })),
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSelectPatient = (patient: {
    id: number;
    fullName: string;
    age?: number | null;
  }) => {
    setPatientId(patient.id);
    setPatientName(patient.fullName ?? "");
    setPatientAge(patient.age != null ? String(patient.age) : "");
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl" style={{ direction: "rtl" }}>
      <PageHeader backTo="/patients" />

      <main className="container mx-auto px-4 py-8 print:p-0">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1 print:hidden">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Available Tests</CardTitle>
                <Input
                  value={availableSearch}
                  onChange={(e) => setAvailableSearch(e.target.value)}
                  placeholder="Search by test name or category..."
                  className="max-w-xs text-right"
                  dir="rtl"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4 max-h-96 overflow-y-auto">
              {Object.entries(groupedTests).map(([category, tests]) => (
                <div key={category}>
                  <h3 className="font-bold text-sm mb-2 text-primary">{category}</h3>
                  <div className="space-y-2">
                    {tests.map((test) => (
                      <div key={test.id} className="flex items-center space-x-2 space-x-reverse p-2 hover:bg-gray-100 rounded">
                        <Checkbox
                          id={String(test.id)}
                          checked={selectedTests.some((t) => t.id === test.id)}
                          onCheckedChange={() => handleSelectTest(test)}
                        />
                        <label htmlFor={String(test.id)} className="text-sm cursor-pointer flex-1 text-center">
                          {test.name}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="lg:col-span-2 space-y-6">
            <Card className="print:hidden">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>Blank Templates</CardTitle>
                  <div className="flex items-center gap-2">
                    <input
                      ref={importInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={(e) => void handleImportTestTemplates(e)}
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
                {blankTestTemplates.map((template) => (
                  <div key={template.id} className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      type="button"
                      className="justify-start flex-1"
                      onClick={() => handleApplyBlankTemplate(template.id)}
                    >
                      {getTemplateDisplayName(template.id, template.name)}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      title="Save template content"
                      aria-label="Save template content"
                      onClick={() => handleSaveTemplateContent(template.id)}
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      title="Rename"
                      aria-label="Rename template"
                      onClick={() => handleRenameTemplate(template.id, template.name)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      title="Delete override"
                      aria-label="Delete template override"
                      onClick={() => handleDeleteTemplateOverride(template.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="print:hidden">
              <CardHeader>
                <CardTitle>Patient Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <PatientPicker onSelect={handleSelectPatient} />
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Name</label>
                    <Input value={patientName} readOnly placeholder="Patient name" className="text-center" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Age</label>
                    <Input value={patientAge} readOnly placeholder="Age" className="text-center" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Date</label>
                    <div className="space-y-1">
                      <Input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} />
                      <span className="text-[10px] text-muted-foreground">{formatDateLabel(requestDate)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="hidden print:block">
              <CardContent className="pt-6">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><span className="font-medium">Name:</span> {patientName}</div>
                  <div><span className="font-medium">Age:</span> {patientAge}</div>
                  <div><span className="font-medium">Date:</span> {requestDate}</div>
                </div>
              </CardContent>
            </Card>

            <Card className="request-tests-print-list">
              <CardHeader className="print:hidden">
                <CardTitle>Selected Tests ({selectedTests.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedTests.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No tests selected yet.</p>
                ) : (
                  selectedTests.map((test, index) => (
                    <div key={test.id} className="border rounded-lg p-4 print:border-0 print:rounded-none print:p-2">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <p className="font-bold">{index + 1}. {test.name}</p>
                        </div>
                        <Button variant="destructive" size="sm" onClick={() => handleRemoveTest(test.id)} className="print:hidden">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="print:hidden">
                        <label className="block text-sm font-medium mb-1">Notes</label>
                        <Textarea
                          value={test.notes}
                          onChange={(e) => handleUpdateTestNotes(test.id, e.target.value)}
                          placeholder="Notes for this test"
                          className="min-h-16 text-xs text-center"
                        />
                      </div>
                      {test.notes && (
                        <div className="hidden print:block text-sm mt-2">
                          <span className="font-medium">Notes:</span> {test.notes}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="print:hidden">
              <CardHeader>
                <CardTitle>General Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  placeholder="Additional notes"
                  className="min-h-24 text-center"
                />
              </CardContent>
            </Card>
          </div>
        </div>
        <div className="print:hidden mt-4 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={handleSaveRequest}
            disabled={createRequestMutation.isPending}
            type="button"
          >
            <Save className="h-4 w-4 ml-2" />
            Save Request
          </Button>
          <Button variant="outline" onClick={handlePrint} type="button">
            <Printer className="h-4 w-4 ml-2" />
            Print
          </Button>
        </div>
      </main>
      <style>{`
        @media print {
          @page {
            size: A5;
            margin: 10mm;
          }
        }
      `}</style>
    </div>
  );
}


