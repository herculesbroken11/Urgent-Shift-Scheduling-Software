import { Link, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationCenter } from "@/components/NotificationCenter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import { useDemo } from "@/contexts/DemoContext";
import { Button } from "@/components/ui/button";
import { X, Sparkles, ChevronRight, Home } from "lucide-react";
import { useState } from "react";

/** Breadcrumb labels for known routes */
const BREADCRUMB_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/appointments": "Appointments",
  "/interpreters": "Interpreters",
  "/customers": "Customers",
  "/billing-rates": "Billing Rates",
  "/customer-billing": "Customer Billing",
  "/interpreter-pay": "Interpreter Pay",
  "/invoices": "Invoices",
  "/billing-report": "Billing Report",
  "/notification-templates": "Notification Templates",
  "/notification-log": "Notification Log",
  "/audit-log": "Audit Log",
  "/reports": "Reports",
  "/calendar-settings": "Calendar Sync",
  "/regions": "Regions",
  "/import": "Import Data",
  "/import-history": "Import History",
  "/qbo-sync-log": "QBO Sync Log",
  "/integration-health": "Integration Health",
  "/request": "Request Interpreter",
  "/my-requests": "Requests",
  "/my-schedule": "My Schedule",
  "/my-earnings": "My Earnings",
  "/my-languages": "My Languages",
  "/availability": "Block Time",
  "/available-jobs": "Available Jobs",
  "/time-tracking": "Time Tracking",
  "/messages": "Messages",
  "/settings": "Settings",
};

function DemoBanner() {
  const [dismissed, setDismissed] = useState(false);
  const { exitDemo } = useDemo();

  if (dismissed) return null;

  return (
    <div className="relative z-50 flex items-center justify-center gap-3 bg-primary px-4 py-2 text-primary-foreground text-sm">
      <Sparkles className="h-4 w-4 shrink-0" />
      <span className="font-medium">
        You're exploring a demo.{" "}
        <Link to="/signup" className="underline underline-offset-2 hover:opacity-80 font-semibold">
          Sign up for free
        </Link>{" "}
        to create your own agency.
      </span>
      <div className="flex items-center gap-2 ml-2">
        <Button
          size="sm"
          variant="secondary"
          className="h-7 px-3 text-xs font-semibold"
          onClick={() => {
            exitDemo();
            window.location.href = "/";
          }}
        >
          Exit Demo
        </Button>
        <button
          onClick={() => setDismissed(true)}
          className="text-primary-foreground/70 hover:text-primary-foreground transition-colors"
          aria-label="Dismiss banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Breadcrumbs() {
  const location = useLocation();
  const pathname = location.pathname;
  const label = BREADCRUMB_LABELS[pathname];

  // Don't show breadcrumbs on dashboard or if label not found
  if (pathname === "/dashboard" || !label) return null;

  return (
    <nav className="hidden lg:flex items-center gap-1 text-sm text-muted-foreground">
      <Link to="/dashboard" className="hover:text-foreground transition-colors">
        <Home className="h-3.5 w-3.5" />
      </Link>
      <ChevronRight className="h-3 w-3" />
      <span className="text-foreground font-medium">{label}</span>
    </nav>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { isDemoMode } = useAuth();

  return (
    <SidebarProvider>
      <div className="flex flex-col min-h-screen w-full">
        {isDemoMode && <DemoBanner />}
        <div className="flex flex-1">
          <AppSidebar />
          <main className="flex-1 overflow-auto">
            <div className="flex items-center gap-2 border-b px-4 py-2.5">
              <div className="lg:hidden"><SidebarTrigger /></div>
              <span className="text-sm font-medium lg:hidden">BlueThread Solution</span>
              <Breadcrumbs />
              <div className="ml-auto flex items-center gap-1">
                <ThemeToggle />
                <NotificationCenter />
              </div>
            </div>
            <div className="page-container">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
