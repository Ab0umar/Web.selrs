import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import GlobalCommandPalette from "./components/GlobalCommandPalette";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import ProtectedRoute from "./components/ProtectedRoute";
import { applyMobileQaState, getMobileQaEnabled, markOverflowInSheets, startMobileQaWatcher } from "@/lib/mobileQa";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { ArrowRight, Layers, Monitor, Moon, Printer, Save, Sun } from "lucide-react";
import { toast } from "sonner";

const NotFound = lazy(() => import("./pages/NotFound"));
const Home = lazy(() => import("./pages/Home"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Patients = lazy(() => import("./pages/Patients"));
const PatientDetails = lazy(() => import("./pages/PatientDetails"));
const ExaminationForm = lazy(() => import("./pages/ExaminationForm"));
const Appointments = lazy(() => import("./pages/Appointments"));
const MedicalReports = lazy(() => import("./pages/MedicalReports"));
const Surgeries = lazy(() => import("./pages/Surgeries"));
const ConsultantSheet = lazy(() => import("./pages/ConsultantSheet"));
const ConsultantFollowupPage = lazy(() => import("./pages/ConsultantFollowupPage"));
const SpecialistSheet = lazy(() => import("./pages/SpecialistSheet"));
const LasikExamSheet = lazy(() => import("./pages/LasikExamSheet"));
const LasikFollowupPage = lazy(() => import("./pages/LasikFollowupPage"));
const OperationSheet = lazy(() => import("./pages/OperationSheet"));
const ExternalOperationSheet = lazy(() => import("./pages/ExternalOperationSheet"));
const PentacamSheet = lazy(() => import("./pages/PentacamSheet"));
const RefractionPage = lazy(() => import("./pages/RefractionPage"));
const MedicationsTestsManagement = lazy(() => import("./pages/MedicationsTestsManagement"));
const MedicationsManagement = lazy(() => import("./pages/MedicationsManagement"));
const WritePrescription = lazy(() => import("./pages/WritePrescription"));
const RequestTests = lazy(() => import("./pages/RequestTests"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminMigrations = lazy(() => import("./pages/AdminMigrations"));
const AdminApiTools = lazy(() => import("./pages/AdminApiTools"));
const AdminStatus = lazy(() => import("./pages/AdminStatus"));
const AdminSettings = lazy(() => import("./pages/AdminSettings"));
const AdminPentacamFailed = lazy(() => import("./pages/AdminPentacamFailed"));
const AdminPermissions = lazy(() => import("./pages/AdminPermissions"));
const AdminSheets = lazy(() => import("./pages/AdminSheets"));
const AdminSheetDesigner = lazy(() => import("./pages/AdminSheetDesigner"));
const AdminDoctors = lazy(() => import("./pages/AdminDoctors"));
const SheetCopies = lazy(() => import("./pages/AdminSheetCopies"));
const ForcePasswordChange = lazy(() => import("./pages/ForcePasswordChange"));
const Profile = lazy(() => import("./pages/Profile"));
const APP_NOTIFICATION_FEED_KEY = "app_notifications_feed_v1";

type AppNotificationItem = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  kind?: "info" | "success" | "warning" | "error";
};

function LegacySurgerySheetRedirect() {
  useEffect(() => {
    const match = window.location.pathname.match(/^\/sheets\/surgery\/([^/?#]+)/i);
    const id = match?.[1];
    const suffix = window.location.search || "";
    window.location.replace(id ? `/sheets/operation/${id}${suffix}` : `/sheets/operation${suffix}`);
  }, []);
  return null;
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/login"} component={Home} />
      <Route path={"/force-password-change"} component={() => <ProtectedRoute><ForcePasswordChange /></ProtectedRoute>} />
      <Route path={"/profile"} component={() => <ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path={"/"} component={Home} />
      <Route path={"/dashboard"} component={() => <ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path={"/patients"} component={() => <ProtectedRoute><Patients /></ProtectedRoute>} />
      <Route path={"/patients/:id"} component={() => <ProtectedRoute><PatientDetails /></ProtectedRoute>} />
      <Route path={"/examination"} component={() => <ProtectedRoute><ExaminationForm /></ProtectedRoute>} />
      <Route path={"/examination/:id"} component={() => <ProtectedRoute><ExaminationForm /></ProtectedRoute>} />
      <Route path={"/appointments"} component={() => <ProtectedRoute><Appointments /></ProtectedRoute>} />
      <Route path={"/medical-reports"} component={() => <ProtectedRoute><MedicalReports /></ProtectedRoute>} />
      <Route path={"/surgeries"} component={() => <ProtectedRoute><Surgeries /></ProtectedRoute>} />
      <Route path={"/sheets/consultant/:id"} component={() => <ProtectedRoute><ConsultantSheet /></ProtectedRoute>} />
      <Route path={"/sheets/consultant/:id/followup"} component={() => <ProtectedRoute><ConsultantFollowupPage /></ProtectedRoute>} />
      <Route path={"/sheets/specialist/:id"} component={() => <ProtectedRoute><SpecialistSheet /></ProtectedRoute>} />
      <Route path={"/sheets/lasik/:id"} component={() => <ProtectedRoute><LasikExamSheet /></ProtectedRoute>} />
      <Route path={"/sheets/lasik/:id/followup"} component={() => <ProtectedRoute><LasikFollowupPage /></ProtectedRoute>} />
      <Route path={"/sheets/operation/:id"} component={() => <ProtectedRoute><OperationSheet /></ProtectedRoute>} />
      <Route path={"/sheets/surgery/:id"} component={() => <ProtectedRoute><LegacySurgerySheetRedirect /></ProtectedRoute>} />
      <Route path={"/sheets/external/:id"} component={() => <ProtectedRoute><ExternalOperationSheet /></ProtectedRoute>} />
      <Route path={"/sheets/pentacam"} component={() => <ProtectedRoute><PentacamSheet /></ProtectedRoute>} />
      <Route path={"/sheets/pentacam/:id"} component={() => <ProtectedRoute><PentacamSheet /></ProtectedRoute>} />
      <Route path={"/refraction"} component={() => <ProtectedRoute><RefractionPage /></ProtectedRoute>} />
      <Route path={"/refraction/:id"} component={() => <ProtectedRoute><RefractionPage /></ProtectedRoute>} />
      <Route path={"/medications"} component={() => <ProtectedRoute><MedicationsManagement /></ProtectedRoute>} />
      <Route path={"/prescription"} component={() => <ProtectedRoute><WritePrescription /></ProtectedRoute>} />
      <Route path={"/tests"} component={() => <ProtectedRoute><MedicationsTestsManagement /></ProtectedRoute>} />
      <Route path={"/request-tests"} component={() => <ProtectedRoute><RequestTests /></ProtectedRoute>} />
      <Route path={"/sheet-copies"} component={() => <ProtectedRoute><SheetCopies /></ProtectedRoute>} />
      <Route path={"/admin/users"} component={() => <ProtectedRoute requiredRoles={["admin"]}><AdminUsers /></ProtectedRoute>} />
      <Route path={"/admin/migrations"} component={() => <ProtectedRoute requiredRoles={["admin"]}><AdminMigrations /></ProtectedRoute>} />
      <Route path={"/admin/api-tools"} component={() => <ProtectedRoute requiredRoles={["admin"]}><AdminApiTools /></ProtectedRoute>} />
      <Route path={"/admin/status"} component={() => <ProtectedRoute requiredRoles={["admin"]}><AdminStatus /></ProtectedRoute>} />
      <Route path={"/admin/settings"} component={() => <ProtectedRoute requiredRoles={["admin"]}><AdminSettings /></ProtectedRoute>} />
      <Route path={"/admin/pentacam-failed"} component={() => <ProtectedRoute requiredRoles={["admin"]}><AdminPentacamFailed /></ProtectedRoute>} />
      <Route path={"/admin/permissions"} component={() => <ProtectedRoute requiredRoles={["admin"]}><AdminPermissions /></ProtectedRoute>} />
      <Route path={"/admin/sheets"} component={() => <ProtectedRoute requiredRoles={["admin"]}><AdminSheets /></ProtectedRoute>} />
      <Route path={"/admin/sheet-designer"} component={() => <ProtectedRoute requiredRoles={["admin"]}><AdminSheetDesigner /></ProtectedRoute>} />
      <Route path={"/admin/doctors"} component={() => <ProtectedRoute requiredRoles={["admin"]}><AdminDoctors /></ProtectedRoute>} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  if (!toggleTheme) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      className="fixed bottom-3 left-3 z-[1000] rounded-full bg-background/90 backdrop-blur"
      aria-label={
        theme === "light"
          ? "Switch to dark mode"
          : theme === "dark"
            ? "Switch to Windows 7 mode"
            : "Switch to light mode"
      }
      title={
        theme === "light"
          ? "Dark mode"
          : theme === "dark"
            ? "Windows 7 mode"
            : "Light mode"
      }
    >
      {theme === "light" ? (
        <Moon className="h-4 w-4" />
      ) : theme === "dark" ? (
        <Monitor className="h-4 w-4" />
      ) : (
        <Sun className="h-4 w-4" />
      )}
    </Button>
  );
}

function AppNotificationsBridge() {
  const { user, isAuthenticated } = useAuth();
  const initializedRef = useRef(false);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const storageKey = `selrs_seen_app_notifications_${String(user?.id ?? "guest")}`;
  const notificationsQuery = trpc.medical.getSystemSetting.useQuery(
    { key: APP_NOTIFICATION_FEED_KEY },
    {
      enabled: isAuthenticated,
      refetchInterval: 15000,
      refetchOnWindowFocus: true,
      staleTime: 5000,
    }
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      const ids = Array.isArray(parsed) ? parsed.map((value) => String(value ?? "").trim()).filter(Boolean) : [];
      seenIdsRef.current = new Set(ids);
    } catch {
      seenIdsRef.current = new Set();
    }
    initializedRef.current = false;
  }, [storageKey]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const itemsRaw = (notificationsQuery.data as any)?.value;
    const items = Array.isArray(itemsRaw) ? (itemsRaw as AppNotificationItem[]) : [];
    if (items.length === 0) return;

    if (!initializedRef.current) {
      for (const item of items) {
        const id = String(item?.id ?? "").trim();
        if (id) seenIdsRef.current.add(id);
      }
      initializedRef.current = true;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, JSON.stringify(Array.from(seenIdsRef.current).slice(-200)));
      }
      return;
    }

    const unseen = [...items]
      .reverse()
      .filter((item) => {
        const id = String(item?.id ?? "").trim();
        return id && !seenIdsRef.current.has(id);
      });

    if (unseen.length === 0) return;

    for (const item of unseen) {
      const id = String(item.id ?? "").trim();
      if (!id) continue;
      const title = String(item.title ?? "").trim() || "Notification";
      const message = String(item.message ?? "").trim();
      const tone = item.kind ?? "info";
      seenIdsRef.current.add(id);
      if (tone === "success") toast.success(title, { description: message });
      else if (tone === "warning") toast.warning(title, { description: message });
      else if (tone === "error") toast.error(title, { description: message });
      else toast(title, { description: message });
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, JSON.stringify(Array.from(seenIdsRef.current).slice(-200)));
    }
  }, [isAuthenticated, notificationsQuery.data, storageKey]);

  return null;
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  const [qaEnabled, setQaEnabled] = useState(false);
  const [overflowCount, setOverflowCount] = useState(0);
  const [showSheetBar, setShowSheetBar] = useState(false);
  const [sectionsCollapsed, setSectionsCollapsed] = useState(false);

  useEffect(() => {
    let stopWatcher: () => void = () => {};

    const syncQa = () => {
      const enabled = getMobileQaEnabled();
      setQaEnabled(enabled);
      applyMobileQaState(enabled);
      stopWatcher();
      if (enabled) {
        stopWatcher = startMobileQaWatcher((count) => setOverflowCount(count));
      } else {
        stopWatcher = () => {};
        setOverflowCount(markOverflowInSheets());
      }
    };

    syncQa();
    window.addEventListener("mobile-qa-toggle", syncQa);
    return () => {
      stopWatcher();
      window.removeEventListener("mobile-qa-toggle", syncQa);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isMobileSheetRoute = () => {
      const path = window.location.pathname;
      const isSheetPath = path.startsWith("/sheets/") || path.startsWith("/refraction/");
      return isSheetPath && window.matchMedia("(max-width: 640px)").matches;
    };

    let previous = "";
    const sync = () => {
      const key = `${window.location.pathname}|${window.innerWidth}`;
      if (key === previous) return;
      previous = key;
      setShowSheetBar(isMobileSheetRoute());
    };

    sync();
    const timer = window.setInterval(sync, 400);
    window.addEventListener("resize", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  useEffect(() => {
    if (!showSheetBar) return;
    const root = document.querySelector(".sheet-layout");
    if (!root) return;

    const addCollapsers = () => {
      const sections = Array.from(document.querySelectorAll<HTMLElement>(".sheet-layout .sheet-section-card"));
      sections.forEach((section, index) => {
        if (section.dataset.collapserBound === "1") return;
        section.dataset.collapserBound = "1";

        const titleSource =
          section.getAttribute("data-section-title") ||
          section.querySelector("h2,h3,.font-bold")?.textContent ||
          `Section ${index + 1}`;
        const title = String(titleSource || `Section ${index + 1}`).trim().slice(0, 40);

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "sheet-section-toggle print:hidden";
        toggle.textContent = title;
        toggle.addEventListener("click", () => {
          section.classList.toggle("sheet-section-collapsed");
          toggle.classList.toggle("is-collapsed", section.classList.contains("sheet-section-collapsed"));
        });

        section.parentElement?.insertBefore(toggle, section);
      });
    };

    addCollapsers();
    const observer = new MutationObserver(() => addCollapsers());
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [showSheetBar]);

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>(".sheet-layout .sheet-section-card"));
    sections.forEach((section) => {
      section.classList.toggle("sheet-section-collapsed", sectionsCollapsed);
    });
    const toggles = Array.from(document.querySelectorAll<HTMLElement>(".sheet-section-toggle"));
    toggles.forEach((toggle) => {
      toggle.classList.toggle("is-collapsed", sectionsCollapsed);
    });
  }, [sectionsCollapsed]);

  useEffect(() => {
    const originalPrint = window.print?.bind(window);
    if (!originalPrint) return;

    let isPrinting = false;
    window.print = () => {
      if (isPrinting) return;
      isPrinting = true;

      let afterPrintFired = false;
      const capacitor = (window as any).Capacitor;
      const isNativeCapacitor = Boolean(capacitor?.isNativePlatform?.());
      const isAndroid = capacitor?.getPlatform?.() === "android";
      const getNativePrinter = () => (window as any).cordova?.plugins?.printer;

      const cleanup = () => {
        window.removeEventListener("afterprint", onAfterPrint);
        isPrinting = false;
      };

      const onAfterPrint = () => {
        afterPrintFired = true;
        cleanup();
      };

      window.addEventListener("afterprint", onAfterPrint, { once: true });
      const urlHasAutoPrint = new URLSearchParams(window.location.search).get("autoprint") === "1";

      const openPrintPage = () => {
        const printUrl = new URL(window.location.href);
        printUrl.searchParams.set("autoprint", "1");
        const opened = window.open(printUrl.toString(), "_blank", "noopener,noreferrer");
        if (!opened) {
          // Android WebView often blocks popups; open in same tab to guarantee navigation.
          window.location.assign(printUrl.toString());
        }
      };

      const runBrowserPrintFallback = () => {
        if (urlHasAutoPrint) {
          toast.info("Preparing print...");
          try {
            originalPrint();
            toast.success("Print dialog opened");
          } finally {
            window.setTimeout(() => {
              if (!afterPrintFired) cleanup();
            }, 1800);
          }
          return;
        }
        if (isNativeCapacitor && isAndroid) {
          toast.info("Preparing print...");
          openPrintPage();
          toast.success("Print page opened");
          window.setTimeout(() => {
            if (!afterPrintFired) cleanup();
          }, 1800);
          return;
        }
        try {
          originalPrint();
        } finally {
          window.setTimeout(() => {
            if (!afterPrintFired) cleanup();
          }, 1800);
        }
      };

      const runNativePrint = (nativePrinter: any) => {
        try {
          toast.info("Preparing print...");
          nativePrinter.print(
            "",
            { name: document.title || "SELRS" },
            () => {
              toast.success("Print dialog opened");
              cleanup();
            },
          );
          window.setTimeout(() => {
            if (!afterPrintFired) cleanup();
          }, 3000);
        } catch {
          runBrowserPrintFallback();
        }
      };

      if (isNativeCapacitor && isAndroid) {
        const nativePrinter = getNativePrinter();
        if (typeof nativePrinter?.print === "function") {
          runNativePrint(nativePrinter);
          return;
        }

        // In some builds, Cordova plugins become available only after deviceready.
        let resolved = false;
        const onDeviceReady = () => {
          if (resolved) return;
          const latePrinter = getNativePrinter();
          if (typeof latePrinter?.print === "function") {
            resolved = true;
            runNativePrint(latePrinter);
          }
        };

        document.addEventListener("deviceready", onDeviceReady, { once: true });
        window.setTimeout(() => {
          if (resolved) return;
          document.removeEventListener("deviceready", onDeviceReady);
          runBrowserPrintFallback();
        }, 1200);
        return;
      }

      // Call print synchronously to preserve the user-gesture context.
      try {
        runBrowserPrintFallback();
      } catch {
        cleanup();
      }
    };

    return () => {
      window.print = originalPrint;
    };
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        switchable
      >
        <TooltipProvider>
          <AppNotificationsBridge />
          <Toaster />
          <div className="page-layout">
            <Suspense fallback={<div className="p-6 text-center text-muted-foreground">Loading...</div>}>
              <Router />
            </Suspense>
          </div>
          <GlobalCommandPalette />
          <ThemeToggle />
          {showSheetBar && (
            <div className="sheet-unified-actions print:hidden" role="group" aria-label="Sheet actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  window.history.back();
                }}
              >
                <ArrowRight className="h-4 w-4" />
                Back
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={() => {
                  const candidates = Array.from(document.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
                  const saveButton = candidates.find((btn) =>
                    /(save|حفظ|تحديث)/i.test((btn.textContent || "").trim())
                  );
                  if (saveButton) {
                    saveButton.click();
                    toast.success("Saved");
                  } else {
                    toast.info("No save button on this section");
                  }
                }}
              >
                <Save className="h-4 w-4" />
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" />
                Print
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSectionsCollapsed((v) => !v)}
              >
                <Layers className="h-4 w-4" />
                {sectionsCollapsed ? "Expand" : "Collapse"}
              </Button>
            </div>
          )}
          {qaEnabled && (
            <div className="fixed bottom-3 right-3 z-[1000] rounded-md border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 shadow-sm">
              Overflow: {overflowCount}
            </div>
          )}
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
