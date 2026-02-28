import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  type BaseSheetTemplateConfig,
  coerceSheetDesignerConfig,
  DEFAULT_SHEET_DESIGNER_CONFIG,
  loadSheetDesignerConfig,
  saveSheetDesignerConfig,
  type FollowupTemplateConfig,
  type SheetLayoutConfig,
  type SheetCssKey,
  type SheetTemplateKey,
  type SheetDesignerConfig,
} from "@/lib/sheetDesigner";

const FOLLOWUP_TEXT_FIELDS: Array<{ key: keyof FollowupTemplateConfig; label: string }> = [
  { key: "rtLabel", label: "RT Label" },
  { key: "ltLabel", label: "LT Label" },
  { key: "operationTypeLabel", label: "Operation Type Label" },
  { key: "operationDateLabel", label: "Operation Date Label" },
  { key: "nextFollowupLabel", label: "Next Follow-up Label" },
  { key: "followupDateLabel", label: "Follow-up Date Label" },
  { key: "vaLabel", label: "V.A Label" },
  { key: "refractionLabel", label: "Refraction Label" },
  { key: "flapLabel", label: "Flap Label" },
  { key: "edgesLabel", label: "Edges Label" },
  { key: "bedLabel", label: "Bed Label" },
  { key: "iopLabel", label: "IOP Label" },
  { key: "treatmentLabel", label: "Treatment Label" },
  { key: "receptionLabel", label: "Reception Signature Label" },
  { key: "nurseLabel", label: "Nurse Signature Label" },
  { key: "doctorLabel", label: "Doctor Signature Label" },
];

const SHEET_TEMPLATE_FIELDS: Array<{ key: keyof BaseSheetTemplateConfig; label: string }> = [
  { key: "sheetTitle", label: "Sheet Title" },
  { key: "patientInfoTitle", label: "Patient Info Title" },
  { key: "doctorLabel", label: "Doctor Label" },
  { key: "examinationDateLabel", label: "Examination Date Label" },
  { key: "notesLabel", label: "Notes Label" },
  { key: "signatureLabel", label: "Signature Label" },
];
type FollowupKey = "followupConsultant" | "followupLasik";

export default function AdminSheetDesigner() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [config, setConfig] = useState<SheetDesignerConfig>(DEFAULT_SHEET_DESIGNER_CONFIG);
  const settingsQuery = trpc.medical.getSystemSetting.useQuery(
    { key: "sheet_designer_config" },
    { enabled: isAuthenticated, refetchOnWindowFocus: false }
  );
  const updateSettingMutation = trpc.medical.updateSystemSetting.useMutation();

  useEffect(() => {
    if (!isAuthenticated) setLocation("/");
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    setConfig(loadSheetDesignerConfig());
  }, []);

  useEffect(() => {
    if (!settingsQuery.data?.value) return;
    const merged = coerceSheetDesignerConfig(settingsQuery.data.value);
    setConfig(merged);
    saveSheetDesignerConfig(merged);
  }, [settingsQuery.data]);

  if (!isAuthenticated || user?.role !== "admin") return null;

  const updateCss = (key: SheetCssKey, value: string) => {
    setConfig((prev) => ({ ...prev, css: { ...prev.css, [key]: value } }));
  };

  const updateTemplate = <K extends keyof BaseSheetTemplateConfig>(
    sheet: SheetTemplateKey,
    key: K,
    value: BaseSheetTemplateConfig[K]
  ) => {
    setConfig((prev) => ({
      ...prev,
      templates: {
        ...prev.templates,
        [sheet]: { ...prev.templates[sheet], [key]: value },
      },
    }));
  };

  const updateLayout = <K extends keyof SheetLayoutConfig>(
    sheet: SheetCssKey,
    key: K,
    value: SheetLayoutConfig[K]
  ) => {
    setConfig((prev) => ({
      ...prev,
      layout: {
        ...prev.layout,
        [sheet]: { ...prev.layout[sheet], [key]: value },
      },
    }));
  };

  const updateFollowup = <K extends keyof FollowupTemplateConfig>(
    section: FollowupKey,
    key: K,
    value: FollowupTemplateConfig[K]
  ) => {
    setConfig((prev) => ({ ...prev, [section]: { ...prev[section], [key]: value } }));
  };

  const renderFollowupTextFields = (section: FollowupKey) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {FOLLOWUP_TEXT_FIELDS.map((field) => (
        <div key={String(field.key)}>
          <label className="text-sm font-medium">{field.label}</label>
          <Input
            value={String(config[section][field.key])}
            onChange={(e) => updateFollowup(section, field.key, e.target.value as any)}
          />
        </div>
      ))}
    </div>
  );

  const renderFollowupNameFields = (section: FollowupKey) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label className="text-sm font-medium">Follow-up Name 1</label>
        <Input
          value={config[section].followupNames[0]}
          onChange={(e) =>
            updateFollowup(section, "followupNames", [
              e.target.value,
              config[section].followupNames[1],
              config[section].followupNames[2],
              config[section].followupNames[3],
            ])
          }
        />
      </div>
      <div>
        <label className="text-sm font-medium">Follow-up Name 2</label>
        <Input
          value={config[section].followupNames[1]}
          onChange={(e) =>
            updateFollowup(section, "followupNames", [
              config[section].followupNames[0],
              e.target.value,
              config[section].followupNames[2],
              config[section].followupNames[3],
            ])
          }
        />
      </div>
      <div>
        <label className="text-sm font-medium">Follow-up Name 3</label>
        <Input
          value={config[section].followupNames[2]}
          onChange={(e) =>
            updateFollowup(section, "followupNames", [
              config[section].followupNames[0],
              config[section].followupNames[1],
              e.target.value,
              config[section].followupNames[3],
            ])
          }
        />
      </div>
      <div>
        <label className="text-sm font-medium">Follow-up Name 4</label>
        <Input
          value={config[section].followupNames[3]}
          onChange={(e) =>
            updateFollowup(section, "followupNames", [
              config[section].followupNames[0],
              config[section].followupNames[1],
              config[section].followupNames[2],
              e.target.value,
            ])
          }
        />
      </div>
    </div>
  );

  const renderFollowupLayoutFields = (section: FollowupKey, labelPrefix = "") => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label className="text-sm font-medium">{labelPrefix}Offset X (mm)</label>
        <Input
          type="number"
          step="1"
          value={config[section].offsetXmm}
          onChange={(e) => updateFollowup(section, "offsetXmm", Number(e.target.value) || 0)}
        />
      </div>
      <div>
        <label className="text-sm font-medium">{labelPrefix}Offset Y (mm)</label>
        <Input
          type="number"
          step="1"
          value={config[section].offsetYmm}
          onChange={(e) => updateFollowup(section, "offsetYmm", Number(e.target.value) || 0)}
        />
      </div>
      <div>
        <label className="text-sm font-medium">{labelPrefix}Scale</label>
        <Input
          type="number"
          step="0.01"
          value={config[section].scale}
          onChange={(e) => updateFollowup(section, "scale", Number(e.target.value) || 1)}
        />
      </div>
      <div>
        <label className="text-sm font-medium">Gap Between Follow-up Tables (mm)</label>
        <Input
          type="number"
          step="1"
          value={config[section].tableGapMm}
          onChange={(e) => updateFollowup(section, "tableGapMm", Number(e.target.value) || 0)}
        />
      </div>
    </div>
  );

  const handleSave = async () => {
    try {
      await updateSettingMutation.mutateAsync({
        key: "sheet_designer_config",
        value: config,
      });
      saveSheetDesignerConfig(config);
      toast.success("Sheet designer saved");
    } catch {
      toast.error("Failed to save sheet designer");
    }
  };

  const handleReset = async () => {
    try {
      setConfig(DEFAULT_SHEET_DESIGNER_CONFIG);
      await updateSettingMutation.mutateAsync({
        key: "sheet_designer_config",
        value: DEFAULT_SHEET_DESIGNER_CONFIG,
      });
      saveSheetDesignerConfig(DEFAULT_SHEET_DESIGNER_CONFIG);
      toast.success("Sheet designer reset to default");
    } catch {
      toast.error("Failed to reset sheet designer");
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Advanced Sheet Designer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Full editing: Follow-up labels/layout + custom CSS for all sheets.
          </p>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={updateSettingMutation.isPending}>Save All</Button>
            <Button variant="outline" onClick={handleReset} disabled={updateSettingMutation.isPending}>Reset Default</Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="consultant-followup" className="w-full">
        <TabsList className="grid w-full grid-cols-9">
          <TabsTrigger value="consultant-followup">Consultant Follow-up</TabsTrigger>
          <TabsTrigger value="consultant-template">Consultant</TabsTrigger>
          <TabsTrigger value="specialist-template">Specialist</TabsTrigger>
          <TabsTrigger value="lasik-template">LASIK</TabsTrigger>
          <TabsTrigger value="external-template">External</TabsTrigger>
          <TabsTrigger value="consultant-css">Consultant CSS</TabsTrigger>
          <TabsTrigger value="specialist-css">Specialist CSS</TabsTrigger>
          <TabsTrigger value="lasik-css">LASIK CSS</TabsTrigger>
          <TabsTrigger value="external-css">External CSS</TabsTrigger>
        </TabsList>

        <TabsContent value="consultant-followup" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Consultant Follow-up Template</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {renderFollowupTextFields("followupConsultant")}
              {renderFollowupNameFields("followupConsultant")}
              {renderFollowupLayoutFields("followupConsultant")}
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="consultant-template" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Consultant</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SHEET_TEMPLATE_FIELDS.map((field) => (
                <div key={`consultant-${String(field.key)}`}>
                  <label className="text-sm font-medium">{field.label}</label>
                  <Input
                    value={String(config.templates.consultant[field.key])}
                    onChange={(e) => updateTemplate("consultant", field.key, e.target.value as any)}
                  />
                </div>
              ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium">Offset X (mm)</label>
                  <Input
                    type="number"
                    step="1"
                    value={config.layout.consultant.offsetXmm}
                    onChange={(e) => updateLayout("consultant", "offsetXmm", Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Offset Y (mm)</label>
                  <Input
                    type="number"
                    step="1"
                    value={config.layout.consultant.offsetYmm}
                    onChange={(e) => updateLayout("consultant", "offsetYmm", Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Scale</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={config.layout.consultant.scale}
                    onChange={(e) => updateLayout("consultant", "scale", Number(e.target.value) || 1)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="specialist-template" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Specialist</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SHEET_TEMPLATE_FIELDS.map((field) => (
                <div key={`specialist-${String(field.key)}`}>
                  <label className="text-sm font-medium">{field.label}</label>
                  <Input
                    value={String(config.templates.specialist[field.key])}
                    onChange={(e) => updateTemplate("specialist", field.key, e.target.value as any)}
                  />
                </div>
              ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium">Offset X (mm)</label>
                  <Input
                    type="number"
                    step="1"
                    value={config.layout.specialist.offsetXmm}
                    onChange={(e) => updateLayout("specialist", "offsetXmm", Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Offset Y (mm)</label>
                  <Input
                    type="number"
                    step="1"
                    value={config.layout.specialist.offsetYmm}
                    onChange={(e) => updateLayout("specialist", "offsetYmm", Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Scale</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={config.layout.specialist.scale}
                    onChange={(e) => updateLayout("specialist", "scale", Number(e.target.value) || 1)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lasik-template" className="mt-4">
          <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>LASIK</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SHEET_TEMPLATE_FIELDS.map((field) => (
                <div key={`lasik-${String(field.key)}`}>
                  <label className="text-sm font-medium">{field.label}</label>
                  <Input
                    value={String(config.templates.lasik[field.key])}
                    onChange={(e) => updateTemplate("lasik", field.key, e.target.value as any)}
                  />
                </div>
              ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium">Offset X (mm)</label>
                  <Input
                    type="number"
                    step="1"
                    value={config.layout.lasik.offsetXmm}
                    onChange={(e) => updateLayout("lasik", "offsetXmm", Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Offset Y (mm)</label>
                  <Input
                    type="number"
                    step="1"
                    value={config.layout.lasik.offsetYmm}
                    onChange={(e) => updateLayout("lasik", "offsetYmm", Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Scale</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={config.layout.lasik.scale}
                    onChange={(e) => updateLayout("lasik", "scale", Number(e.target.value) || 1)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>LASIK Follow-up (Print)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                These controls are used only by LASIK follow-up print layout.
              </p>
              {renderFollowupTextFields("followupLasik")}
              {renderFollowupNameFields("followupLasik")}
              {renderFollowupLayoutFields("followupLasik", "Follow-up ")}
            </CardContent>
          </Card>
          </div>
        </TabsContent>

        <TabsContent value="external-template" className="mt-4">
          <Card>
            <CardHeader><CardTitle>External</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SHEET_TEMPLATE_FIELDS.map((field) => (
                <div key={`external-${String(field.key)}`}>
                  <label className="text-sm font-medium">{field.label}</label>
                  <Input
                    value={String(config.templates.external[field.key])}
                    onChange={(e) => updateTemplate("external", field.key, e.target.value as any)}
                  />
                </div>
              ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium">Offset X (mm)</label>
                  <Input
                    type="number"
                    step="1"
                    value={config.layout.external.offsetXmm}
                    onChange={(e) => updateLayout("external", "offsetXmm", Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Offset Y (mm)</label>
                  <Input
                    type="number"
                    step="1"
                    value={config.layout.external.offsetYmm}
                    onChange={(e) => updateLayout("external", "offsetYmm", Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Scale</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={config.layout.external.scale}
                    onChange={(e) => updateLayout("external", "scale", Number(e.target.value) || 1)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="consultant-css" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Consultant Sheet Custom CSS</CardTitle></CardHeader>
            <CardContent>
              <Textarea
                className="min-h-[320px] font-mono text-xs"
                value={config.css.consultant}
                onChange={(e) => updateCss("consultant", e.target.value)}
                placeholder=".sheet-layout .some-class { font-size: 12px; }"
                dir="ltr"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="specialist-css" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Specialist Sheet Custom CSS</CardTitle></CardHeader>
            <CardContent>
              <Textarea
                className="min-h-[320px] font-mono text-xs"
                value={config.css.specialist}
                onChange={(e) => updateCss("specialist", e.target.value)}
                placeholder=".sheet-layout .some-class { font-size: 12px; }"
                dir="ltr"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lasik-css" className="mt-4">
          <Card>
            <CardHeader><CardTitle>LASIK Sheet Custom CSS</CardTitle></CardHeader>
            <CardContent>
              <Textarea
                className="min-h-[320px] font-mono text-xs"
                value={config.css.lasik}
                onChange={(e) => updateCss("lasik", e.target.value)}
                placeholder=".sheet-layout .some-class { font-size: 12px; }"
                dir="ltr"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="external-css" className="mt-4">
          <Card>
            <CardHeader><CardTitle>External Sheet Custom CSS</CardTitle></CardHeader>
            <CardContent>
              <Textarea
                className="min-h-[320px] font-mono text-xs"
                value={config.css.external}
                onChange={(e) => updateCss("external", e.target.value)}
                placeholder=".sheet-layout .some-class { font-size: 12px; }"
                dir="ltr"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
