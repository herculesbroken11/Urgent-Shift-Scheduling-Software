import { lazy, Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DemoProvider } from "@/contexts/DemoContext";
import { DemoDataProvider } from "@/contexts/DemoDataContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { getRolesForPath } from "@/lib/route-roles";
import { PlatformGuard } from "@/components/platform/PlatformGuard";
import { PlatformLayout } from "@/components/platform/PlatformLayout";
import { RecoveryRedirect } from "@/components/RecoveryRedirect";

// Eagerly loaded (critical path)
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Landing from "./pages/Landing";
import DemoSelect from "./pages/DemoSelect";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

// Lazy loaded (secondary routes)
const Onboarding = lazy(() => import("./pages/Onboarding"));
const PendingApproval = lazy(() => import("./pages/PendingApproval"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const JoinAgency = lazy(() => import("./pages/JoinAgency"));
const Appointments = lazy(() => import("./pages/Appointments"));
const ScheduleWizard = lazy(() => import("./pages/ScheduleWizard"));
const Customers = lazy(() => import("./pages/Customers"));
const CustomerDetail = lazy(() => import("./pages/CustomerDetail"));
const Interpreters = lazy(() => import("./pages/Interpreters"));
const RequestInterpreter = lazy(() => import("./pages/RequestInterpreter"));
const MyRequests = lazy(() => import("./pages/MyRequests"));
const MySchedule = lazy(() => import("./pages/MySchedule"));
const MyEarnings = lazy(() => import("./pages/MyEarnings"));
const TimeTracking = lazy(() => import("./pages/TimeTracking"));
const MyLanguages = lazy(() => import("./pages/MyLanguages"));
const Availability = lazy(() => import("./pages/Availability"));
const AvailableJobs = lazy(() => import("./pages/AvailableJobs"));
const BillingRates = lazy(() => import("./pages/BillingRates"));
const InterpreterPay = lazy(() => import("./pages/InterpreterPay"));
const Invoices = lazy(() => import("./pages/Invoices"));
const BillingReport = lazy(() => import("./pages/BillingReport"));
const NotificationTemplates = lazy(() => import("./pages/NotificationTemplates"));
const NotificationLog = lazy(() => import("./pages/NotificationLog"));
const Reports = lazy(() => import("./pages/Reports"));
const CalendarSettings = lazy(() => import("./pages/CalendarSettings"));
const Messages = lazy(() => import("./pages/Messages"));
const Settings = lazy(() => import("./pages/Settings"));
const Regions = lazy(() => import("./pages/Regions"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const ImportWizard = lazy(() => import("./pages/ImportWizard"));
const ImportHistory = lazy(() => import("./pages/ImportHistory"));
const QboSyncLog = lazy(() => import("./pages/QboSyncLog"));
const CustomerBillingAssignment = lazy(() => import("./pages/CustomerBillingAssignment"));
const IntegrationHealth = lazy(() => import("./pages/IntegrationHealth"));

// Platform
const PlatformDashboard = lazy(() => import("./pages/platform/PlatformDashboard"));
const PlatformAgencies = lazy(() => import("./pages/platform/PlatformAgencies"));
const PlatformAgencyDetail = lazy(() => import("./pages/platform/PlatformAgencyDetail"));
const PlatformUsers = lazy(() => import("./pages/platform/PlatformUsers"));
const PlatformRevenue = lazy(() => import("./pages/platform/PlatformRevenue"));
const PlatformSupport = lazy(() => import("./pages/platform/PlatformSupport"));
const PlatformFeatureFlags = lazy(() => import("./pages/platform/PlatformFeatureFlags"));
const PlatformDiagnostics = lazy(() => import("./pages/platform/PlatformDiagnostics"));
const PlatformAudit = lazy(() => import("./pages/platform/PlatformAudit"));
const PlatformSettings = lazy(() => import("./pages/platform/PlatformSettings"));
const PlatformRunbook = lazy(() => import("./pages/platform/PlatformRunbook"));

const queryClient = new QueryClient();

/** Helper — looks up required roles from the centralized route-role map */
const r = (path: string) => getRolesForPath(path) ?? undefined;

function SuspenseFallback() {
  return <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Loading…</div>;
}

/** Wrap a lazy page in Suspense + ProtectedRoute + AppLayout */
function P({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRoles={r(path)}>
      <AppLayout>
        <Suspense fallback={<SuspenseFallback />}>{children}</Suspense>
      </AppLayout>
    </ProtectedRoute>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DemoProvider>
          <DemoDataProvider>
          <AuthProvider>
            <RecoveryRedirect />
            <Suspense fallback={<SuspenseFallback />}>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/reset-password" element={<Suspense fallback={<SuspenseFallback />}><ResetPassword /></Suspense>} />
              <Route path="/demo" element={<DemoSelect />} />

              {/* Onboarding — any authenticated user */}
              <Route path="/onboarding" element={<ProtectedRoute requiredRoles={r("/onboarding")}><Suspense fallback={<SuspenseFallback />}><Onboarding /></Suspense></ProtectedRoute>} />
              <Route path="/pending-approval" element={<ProtectedRoute requiredRoles={r("/onboarding")}><Suspense fallback={<SuspenseFallback />}><PendingApproval /></Suspense></ProtectedRoute>} />

              {/* All roles */}
              <Route path="/dashboard" element={<P path="/dashboard"><Dashboard /></P>} />
              <Route path="/messages" element={<P path="/messages"><Messages /></P>} />
              <Route path="/settings" element={<P path="/settings"><Settings /></P>} />

              {/* Admin & Scheduler */}
              <Route path="/appointments" element={<P path="/appointments"><Appointments /></P>} />
              <Route path="/schedule-wizard" element={<P path="/schedule-wizard"><ScheduleWizard /></P>} />
              <Route path="/customers" element={<P path="/customers"><Customers /></P>} />
              <Route path="/customers/:id" element={<P path="/customers/:id"><CustomerDetail /></P>} />
              <Route path="/interpreters" element={<P path="/interpreters"><Interpreters /></P>} />

              {/* Admin only */}
              <Route path="/billing-rates" element={<P path="/billing-rates"><BillingRates /></P>} />
              <Route path="/customer-billing" element={<P path="/customer-billing"><CustomerBillingAssignment /></P>} />
              <Route path="/interpreter-pay" element={<P path="/interpreter-pay"><InterpreterPay /></P>} />
              <Route path="/invoices" element={<P path="/invoices"><Invoices /></P>} />
              <Route path="/billing-report" element={<P path="/billing-report"><BillingReport /></P>} />
              <Route path="/notification-templates" element={<P path="/notification-templates"><NotificationTemplates /></P>} />
              <Route path="/notification-log" element={<P path="/notification-log"><NotificationLog /></P>} />
              <Route path="/audit-log" element={<P path="/audit-log"><AuditLog /></P>} />
              <Route path="/reports" element={<P path="/reports"><Reports /></P>} />
              <Route path="/calendar-settings" element={<P path="/calendar-settings"><CalendarSettings /></P>} />
              <Route path="/regions" element={<P path="/regions"><Regions /></P>} />
              <Route path="/import" element={<P path="/import"><ImportWizard /></P>} />
              <Route path="/import-history" element={<P path="/import-history"><ImportHistory /></P>} />
              <Route path="/qbo-sync-log" element={<P path="/qbo-sync-log"><QboSyncLog /></P>} />
              <Route path="/integration-health" element={<P path="/integration-health"><IntegrationHealth /></P>} />

              {/* Requester */}
              <Route path="/request" element={<P path="/request"><RequestInterpreter /></P>} />
              <Route path="/my-requests" element={<P path="/my-requests"><MyRequests /></P>} />

              {/* Interpreter */}
              <Route path="/my-schedule" element={<P path="/my-schedule"><MySchedule /></P>} />
              <Route path="/my-earnings" element={<P path="/my-earnings"><MyEarnings /></P>} />
              <Route path="/time-tracking" element={<P path="/time-tracking"><TimeTracking /></P>} />
              <Route path="/my-languages" element={<P path="/my-languages"><MyLanguages /></P>} />
              <Route path="/availability" element={<P path="/availability"><Availability /></P>} />
              <Route path="/available-jobs" element={<P path="/available-jobs"><AvailableJobs /></P>} />

              {/* Platform Owner Console */}
              <Route path="/platform/dashboard" element={<PlatformGuard><PlatformLayout><PlatformDashboard /></PlatformLayout></PlatformGuard>} />
              <Route path="/platform/agencies" element={<PlatformGuard><PlatformLayout><PlatformAgencies /></PlatformLayout></PlatformGuard>} />
              <Route path="/platform/agencies/:id" element={<PlatformGuard><PlatformLayout><PlatformAgencyDetail /></PlatformLayout></PlatformGuard>} />
              <Route path="/platform/users" element={<PlatformGuard><PlatformLayout><PlatformUsers /></PlatformLayout></PlatformGuard>} />
              <Route path="/platform/revenue" element={<PlatformGuard><PlatformLayout><PlatformRevenue /></PlatformLayout></PlatformGuard>} />
              <Route path="/platform/support" element={<PlatformGuard><PlatformLayout><PlatformSupport /></PlatformLayout></PlatformGuard>} />
              <Route path="/platform/feature-flags" element={<PlatformGuard><PlatformLayout><PlatformFeatureFlags /></PlatformLayout></PlatformGuard>} />
              <Route path="/platform/diagnostics" element={<PlatformGuard><PlatformLayout><PlatformDiagnostics /></PlatformLayout></PlatformGuard>} />
              <Route path="/platform/audit" element={<PlatformGuard><PlatformLayout><PlatformAudit /></PlatformLayout></PlatformGuard>} />
              <Route path="/platform/settings" element={<PlatformGuard><PlatformLayout><PlatformSettings /></PlatformLayout></PlatformGuard>} />
              <Route path="/platform/runbook" element={<PlatformGuard><PlatformLayout><PlatformRunbook /></PlatformLayout></PlatformGuard>} />

              {/* Join link (public route, auth handled in component) */}
              <Route path="/join/:agencySlug" element={<Suspense fallback={<SuspenseFallback />}><JoinAgency /></Suspense>} />

              {/* Catch-all */}
              <Route path="/" element={<Landing />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </AuthProvider>
          </DemoDataProvider>
        </DemoProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
