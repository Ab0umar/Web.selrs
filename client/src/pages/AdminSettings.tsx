import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getTrpcErrorMessage } from "@/lib/utils";
import AdminStatus from "./AdminStatus";
import AdminApiTools from "./AdminApiTools";
import AdminMigrations from "./AdminMigrations";
import { DEFAULT_APPOINTMENTS_PRICING } from "./Appointments";

const KEY = "selrs_preferred_url";
const PRICING_SETTING_KEY = "appointments_pricing_v1";
const MOBILE_SHEET_MODE_KEY = "mobile_sheet_mode_v1";
type PricingConfig = typeof DEFAULT_APPOINTMENTS_PRICING;
const clonePricing = (value: PricingConfig): PricingConfig => JSON.parse(JSON.stringify(value));
const toSafeNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export default function AdminSettings() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [preferredUrl, setPreferredUrl] = useState("");
  const [pricingJson, setPricingJson] = useState("");
  const [pricingForm, setPricingForm] = useState<PricingConfig>(clonePricing(DEFAULT_APPOINTMENTS_PRICING));
  const pricingSettingQuery = trpc.medical.getSystemSetting.useQuery(
    { key: PRICING_SETTING_KEY },
    { refetchOnWindowFocus: false }
  );
  const mobileSheetModeSettingQuery = trpc.medical.getSystemSetting.useQuery(
    { key: MOBILE_SHEET_MODE_KEY },
    { refetchOnWindowFocus: false }
  );
  const updateSettingMutation = trpc.medical.updateSystemSetting.useMutation();

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    const saved = localStorage.getItem(KEY) || "";
    setPreferredUrl(saved);
  }, []);

  useEffect(() => {
    const serverValue = (pricingSettingQuery.data as any)?.value;
    const payload = serverValue && typeof serverValue === "object" ? (serverValue as PricingConfig) : DEFAULT_APPOINTMENTS_PRICING;
    setPricingForm(clonePricing(payload));
    setPricingJson(JSON.stringify(payload, null, 2));
  }, [pricingSettingQuery.data]);

  if (!isAuthenticated || user?.role !== "admin") return null;

  const handleSave = () => {
    localStorage.setItem(KEY, preferredUrl.trim());
    toast.success("Settings Saved");
  };

  const mobileSheetModeValueRaw = (mobileSheetModeSettingQuery.data as any)?.value;
  const mobileSheetModeEnabled = Boolean(
    mobileSheetModeValueRaw && typeof mobileSheetModeValueRaw === "object"
      ? mobileSheetModeValueRaw.enabled
      : mobileSheetModeValueRaw
  );

  const handleToggleMobileSheetMode = async (enabled: boolean) => {
    try {
      await updateSettingMutation.mutateAsync({
        key: MOBILE_SHEET_MODE_KEY,
        value: { enabled },
      });
      await mobileSheetModeSettingQuery.refetch();
      toast.success(enabled ? "Mobile sheet mode enabled" : "Mobile sheet mode disabled");
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to update mobile sheet mode"));
    }
  };

  const savePricingSetting = async (value: PricingConfig) => {
    await updateSettingMutation.mutateAsync({
      key: PRICING_SETTING_KEY,
      value,
    });
    await pricingSettingQuery.refetch();
  };

  const handleSavePricing = async () => {
    try {
      const parsed = JSON.parse(pricingJson) as PricingConfig;
      setPricingForm(clonePricing(parsed));
      await savePricingSetting(parsed);
      toast.success("Appointments pricing saved");
    } catch (error) {
      if (error instanceof SyntaxError) {
        toast.error("Invalid JSON format");
        return;
      }
      toast.error(getTrpcErrorMessage(error, "Failed to save appointments pricing"));
    }
  };
  const handleSavePricingForm = async () => {
    try {
      await savePricingSetting(pricingForm);
      setPricingJson(JSON.stringify(pricingForm, null, 2));
      toast.success("Appointments pricing saved");
    } catch (error) {
      toast.error(getTrpcErrorMessage(error, "Failed to save appointments pricing"));
    }
  };
  const handleApplyJsonToForm = () => {
    try {
      const parsed = JSON.parse(pricingJson) as PricingConfig;
      setPricingForm(clonePricing(parsed));
      toast.success("JSON applied to form");
    } catch {
      toast.error("Invalid JSON format");
    }
  };

  const handleResetPricing = () => {
    const defaults = clonePricing(DEFAULT_APPOINTMENTS_PRICING);
    setPricingForm(defaults);
    setPricingJson(JSON.stringify(defaults, null, 2));
  };
  const setField = (setter: (draft: PricingConfig) => void) => {
    setPricingForm((prev) => {
      const next = clonePricing(prev);
      setter(next);
      setPricingJson(JSON.stringify(next, null, 2));
      return next;
    });
  };
  const PriceField = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: number;
    onChange: (value: number) => void;
  }) => (
    <label className="grid grid-cols-[1fr_150px] items-center gap-3 text-sm">
      <span className="text-gray-900 font-medium">{label}</span>
      <Input
        type="number"
        value={String(value)}
        onChange={(e) => onChange(toSafeNumber(e.target.value))}
      />
    </label>
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-4">
        <Button variant="outline" onClick={() => setLocation("/dashboard?tab=admin")}>
          Admin Home
        </Button>
      </div>
      <Tabs defaultValue="settings" className="w-full">
        <TabsList className="mb-6 grid w-full grid-cols-4">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="status">System Status</TabsTrigger>
          <TabsTrigger value="api">API Tools</TabsTrigger>
          <TabsTrigger value="migrations">Migrations</TabsTrigger>
        </TabsList>

      <TabsContent value="settings">
      <Card className="max-w-3xl mb-6">
        <CardHeader>
          <CardTitle>Preferred Server URL</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground">Current URL: {window.location.origin}</div>
          <Input
            value={preferredUrl}
            onChange={(e) => setPreferredUrl(e.target.value)}
            placeholder="https://app.example.com"
            dir="ltr"
          />
          <Button onClick={handleSave} className="bg-primary">
            Save
          </Button>
        </CardContent>
      </Card>
      <Card className="max-w-3xl mb-6">
        <CardHeader>
          <CardTitle>Mobile Sheet Mode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              Enable mobile-safe sheet layout tweaks (sheets pages only).
            </div>
            <Switch
              checked={mobileSheetModeEnabled}
              onCheckedChange={handleToggleMobileSheetMode}
              disabled={updateSettingMutation.isPending}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            DB-backed setting. Applies to Consultant, Specialist, Lasik, and External sheets.
          </div>
        </CardContent>
      </Card>
      <Card className="max-w-3xl mb-6">
        <CardHeader>
          <CardTitle>Appointments Pricing Rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
            Pricing UI Version: 2026-02-17-02
          </div>
          <div className="text-sm font-semibold">Form Editor</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-md border p-3 space-y-2">
              <div className="text-sm font-semibold">Amount - PRK</div>
              <PriceField label="Dr. Saadany (Consultant Saadany)" value={pricingForm.amount.prk.saadanyConsultantSaadany} onChange={(v) => setField((d) => { d.amount.prk.saadanyConsultantSaadany = v; })} />
              <PriceField label="Consultant" value={pricingForm.amount.prk.saadanyConsultant} onChange={(v) => setField((d) => { d.amount.prk.saadanyConsultant = v; })} />
              <PriceField label="Specialist" value={pricingForm.amount.prk.saadanySpecialist} onChange={(v) => setField((d) => { d.amount.prk.saadanySpecialist = v; })} />
              <PriceField label="Fallback (other cases)" value={pricingForm.amount.prk.fallback} onChange={(v) => setField((d) => { d.amount.prk.fallback = v; })} />
            </div>
            <div className="rounded-md border p-3 space-y-2">
              <div className="text-sm font-semibold">Amount - Lasik</div>
              <PriceField label="Dr. Saadany (Consultant Saadany)" value={pricingForm.amount.lasik.saadanyConsultantSaadany} onChange={(v) => setField((d) => { d.amount.lasik.saadanyConsultantSaadany = v; })} />
              <PriceField label="Consultant" value={pricingForm.amount.lasik.saadanyConsultant} onChange={(v) => setField((d) => { d.amount.lasik.saadanyConsultant = v; })} />
              <PriceField label="Dr. Sawaf" value={pricingForm.amount.lasik.sawaf} onChange={(v) => setField((d) => { d.amount.lasik.sawaf = v; })} />
              <PriceField label="Fallback (other cases)" value={pricingForm.amount.lasik.fallback} onChange={(v) => setField((d) => { d.amount.lasik.fallback = v; })} />
            </div>
            <div className="rounded-md border p-3 space-y-2">
              <div className="text-sm font-semibold">Center Account (Paid by Doctor) - PRK</div>
              <PriceField label="Dr. Saadany" value={pricingForm.doctorAccount.prk.saadany} onChange={(v) => setField((d) => { d.doctorAccount.prk.saadany = v; })} />
              <PriceField label="Consultant" value={pricingForm.doctorAccount.prk.consultant} onChange={(v) => setField((d) => { d.doctorAccount.prk.consultant = v; })} />
              <PriceField label="Specialist" value={pricingForm.doctorAccount.prk.specialist} onChange={(v) => setField((d) => { d.doctorAccount.prk.specialist = v; })} />
              <PriceField label="Dr. Sawaf" value={pricingForm.doctorAccount.prk.sawaf} onChange={(v) => setField((d) => { d.doctorAccount.prk.sawaf = v; })} />
              <PriceField label="Others" value={pricingForm.doctorAccount.prk.others} onChange={(v) => setField((d) => { d.doctorAccount.prk.others = v; })} />
            </div>
            <div className="rounded-md border p-3 space-y-2">
              <div className="text-sm font-semibold">Center Account (Paid by Doctor) - Lasik</div>
              <PriceField label="Dr. Saadany" value={pricingForm.doctorAccount.lasik.saadany} onChange={(v) => setField((d) => { d.doctorAccount.lasik.saadany = v; })} />
              <PriceField label="Consultant" value={pricingForm.doctorAccount.lasik.consultant} onChange={(v) => setField((d) => { d.doctorAccount.lasik.consultant = v; })} />
              <PriceField label="Dr. Sawaf (Moria/Lasik)" value={pricingForm.doctorAccount.lasik.sawafMoria} onChange={(v) => setField((d) => { d.doctorAccount.lasik.sawafMoria = v; })} />
              <PriceField label="Dr. Sawaf (Metal)" value={pricingForm.doctorAccount.lasik.sawafMetal} onChange={(v) => setField((d) => { d.doctorAccount.lasik.sawafMetal = v; })} />
              <PriceField label="Others (Moria/Lasik)" value={pricingForm.doctorAccount.lasik.othersMoria} onChange={(v) => setField((d) => { d.doctorAccount.lasik.othersMoria = v; })} />
              <PriceField label="Others (Metal)" value={pricingForm.doctorAccount.lasik.othersMetal} onChange={(v) => setField((d) => { d.doctorAccount.lasik.othersMetal = v; })} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSavePricingForm} disabled={updateSettingMutation.isPending}>
              Save From Form
            </Button>
            <Button type="button" variant="outline" onClick={handleResetPricing}>
              Reset To Defaults
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">
            JSON Editor (kept as requested). You can edit JSON directly too.
          </div>
          <textarea
            value={pricingJson}
            onChange={(e) => setPricingJson(e.target.value)}
            className="w-full min-h-[360px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
            dir="ltr"
          />
          <div className="flex gap-2">
            <Button onClick={handleSavePricing} disabled={updateSettingMutation.isPending}>
              Save From JSON
            </Button>
            <Button type="button" variant="outline" onClick={handleApplyJsonToForm}>
              Apply JSON To Form
            </Button>
            <Button type="button" variant="outline" onClick={handleResetPricing}>
              Reset To Defaults
            </Button>
          </div>
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="status">
        <AdminStatus />
      </TabsContent>

      <TabsContent value="api">
        <AdminApiTools />
      </TabsContent>

      <TabsContent value="migrations">
        <AdminMigrations />
      </TabsContent>
      </Tabs>
    </div>
  );
}
