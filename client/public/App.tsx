import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import ProtectedRoute from "./components/ProtectedRoute";

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
const ExternalOperationSheet = lazy(() => import("./pages/ExternalOperationSheet"));
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
const AdminPermissions = lazy(() => import("./pages/AdminPermissions"));
const AdminSheets = lazy(() => import("./pages/AdminSheets"));
const AdminSheetDesigner = lazy(() => import("./pages/AdminSheetDesigner"));
const AdminDoctors = lazy(() => import("./pages/AdminDoctors"));
const SheetCopies = lazy(() => import("./pages/AdminSheetCopies"));
const ForcePasswordChange = lazy(() => import("./pages/ForcePasswordChange"));
const Profile = lazy(() => import("./pages/Profile"));

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
      <Route path={"/sheets/external/:id"} component={() => <ProtectedRoute><ExternalOperationSheet /></ProtectedRoute>} />
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

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <div className="page-layout">
            <Suspense fallback={<div className="p-6 text-center text-muted-foreground">Loading...</div>}>
              <Router />
            </Suspense>
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
