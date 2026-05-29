import { useAuth } from "@/contexts/AuthContext";
import { useDemo } from "@/contexts/DemoContext";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import {
  Globe, LayoutDashboard, Calendar, Users, Building2, ClipboardList,
  Clock, MapPin, FileText, MessageSquare, BarChart3, Settings, LogOut, Briefcase, Star, DollarSign, Bell, Eye, History, Ban, Upload, Shield, Activity, CalendarClock,
} from "lucide-react";
import { AppRole } from "@/lib/supabase-helpers";
import { ROUTE_ROLES } from "@/lib/route-roles";
import { Badge } from "@/components/ui/badge";
import { usePlatformAuth } from "@/hooks/usePlatformAuth";
import { useConversations } from "@/hooks/useMessages";

/** Icons & labels for sidebar nav items, keyed by path */
const NAV_META: Record<string, { label: string; icon: React.ElementType; group: string }> = {
  "/dashboard":              { label: "Dashboard",              icon: LayoutDashboard, group: "Overview" },
  "/appointments":           { label: "Appointments",           icon: Calendar,        group: "Scheduling" },
  "/schedule-wizard":        { label: "Schedule Wizard",        icon: CalendarClock,   group: "Scheduling" },
  "/interpreters":           { label: "Interpreters",           icon: Users,           group: "Scheduling" },
  "/customers":              { label: "Customers",              icon: Building2,       group: "Scheduling" },
  "/billing-rates":          { label: "Billing Rates",          icon: DollarSign,      group: "Billing" },
  "/customer-billing":       { label: "Customer Billing",       icon: Building2,       group: "Billing" },
  "/interpreter-pay":        { label: "Interpreter Pay",        icon: Briefcase,       group: "Billing" },
  "/invoices":               { label: "Invoices",               icon: FileText,        group: "Billing" },
  "/billing-report":         { label: "Billing Report",         icon: FileText,        group: "Billing" },
  "/notification-templates": { label: "Notification Templates", icon: Bell,            group: "Admin" },
  "/notification-log":       { label: "Notification Log",       icon: FileText,        group: "Admin" },
  "/audit-log":              { label: "Audit Log",              icon: History,         group: "Admin" },
  "/reports":                { label: "Reports",                icon: BarChart3,       group: "Admin" },
  "/calendar-settings":      { label: "Calendar Sync",          icon: Calendar,        group: "Admin" },
  "/regions":                { label: "Regions",                icon: MapPin,          group: "Admin" },
  "/import":                 { label: "Import Data",            icon: Upload,          group: "Admin" },
  "/import-history":         { label: "Import History",         icon: History,         group: "Admin" },
  "/qbo-sync-log":           { label: "QBO Sync Log",           icon: FileText,        group: "Admin" },
  "/integration-health":     { label: "Integration Health",     icon: Activity,        group: "Admin" },
  "/request":                { label: "Request Interpreter",    icon: ClipboardList,   group: "Requests" },
  "/my-requests":            { label: "Requests",               icon: Calendar,        group: "Requests" },
  "/my-schedule":            { label: "My Schedule",            icon: Calendar,        group: "My Work" },
  "/my-earnings":            { label: "My Earnings",            icon: DollarSign,      group: "My Work" },
  "/my-languages":           { label: "My Languages",           icon: Star,            group: "My Work" },
  "/availability":           { label: "Block Time",             icon: Ban,             group: "My Work" },
  "/available-jobs":         { label: "Available Jobs",         icon: Briefcase,       group: "My Work" },
  "/time-tracking":          { label: "Time Tracking",          icon: Clock,           group: "My Work" },
  "/messages":               { label: "Messages",              icon: MessageSquare,    group: "Overview" },
  "/settings":               { label: "Settings",              icon: Settings,         group: "Overview" },
};

/** Paths to hide from the sidebar (still protected, just not shown in nav) */
const HIDDEN_PATHS = new Set(["/onboarding", "/customers/:id"]);

/** Group display order */
const GROUP_ORDER = ["Overview", "Scheduling", "Requests", "My Work", "Billing", "Admin"];

/** Build nav items from the centralized route-role map */
const navItems = ROUTE_ROLES
  .filter((r) => !HIDDEN_PATHS.has(r.path) && NAV_META[r.path])
  .map((r) => ({
    path: r.path,
    roles: r.roles,
    ...NAV_META[r.path]!,
  }));

export function AppSidebar() {
  const { profile, roles, signOut, hasRole, isDemoMode } = useAuth();
  const { exitDemo, switchRole } = useDemo();
  const navigate = useNavigate();
  const location = useLocation();
  const { isPlatformOwner } = usePlatformAuth();
  const { conversations = [] } = useConversations();
  const unreadTotal = conversations.reduce((sum: number, c: any) => sum + (c.unread_count || 0), 0);

  const visibleItems = navItems.filter((item) =>
    item.roles.length === 0 || item.roles.some((r) => hasRole(r))
  );

  // Group visible items
  const grouped = new Map<string, typeof visibleItems>();
  for (const item of visibleItems) {
    const arr = grouped.get(item.group) || [];
    arr.push(item);
    grouped.set(item.group, arr);
  }

  const roleLabel = hasRole("agency_admin")
    ? "Admin"
    : hasRole("scheduler")
    ? "Scheduler"
    : hasRole("requester")
    ? "Requester"
    : hasRole("interpreter")
    ? "Interpreter"
    : "User";

  const handleExit = () => {
    if (isDemoMode) {
      exitDemo();
      navigate("/");
    } else {
      signOut();
    }
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2">
          <Globe className="h-7 w-7 text-sidebar-primary" />
          <div>
            <h2 className="text-base font-bold leading-tight text-sidebar-foreground">BlueThread Solution</h2>
            <p className="text-xs text-sidebar-foreground/60">{roleLabel} Portal</p>
          </div>
        </div>
        {isDemoMode && (
          <Badge className="mt-2 w-full justify-center gap-1.5 border-0 bg-warning/20 text-warning text-xs">
            <Eye className="h-3 w-3" />
            Demo Mode
          </Badge>
        )}
      </SidebarHeader>

      <SidebarContent>
        {GROUP_ORDER.filter((g) => grouped.has(g)).map((groupName) => (
          <SidebarGroup key={groupName}>
            <SidebarGroupLabel>{groupName}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {grouped.get(groupName)!.map((item) => {
                  const showUnread = item.path === "/messages" && unreadTotal > 0;
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={location.pathname === item.path}
                        onClick={() => navigate(item.path)}
                        tooltip={item.label}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                        {showUnread && (
                          <Badge className="ml-auto h-5 min-w-5 px-1.5 bg-primary text-primary-foreground border-0 text-[10px] font-semibold">
                            {unreadTotal > 99 ? "99+" : unreadTotal}
                          </Badge>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {!isDemoMode && isPlatformOwner && (
          <SidebarGroup>
            <SidebarGroupLabel>Platform</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => navigate("/platform/dashboard")} tooltip="Platform Console">
                    <Shield className="h-4 w-4" />
                    <span>Platform Console</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isDemoMode && (
          <SidebarGroup>
            <SidebarGroupLabel>Demo</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => { switchRole(); navigate("/demo"); }}>
                    <Users className="h-4 w-4" />
                    <span>Switch Role</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-medium text-sidebar-accent-foreground">
            {profile?.first_name?.[0]}{profile?.last_name?.[0]}
          </div>
          <div className="flex-1 truncate">
            <p className="text-sm font-medium leading-tight text-sidebar-foreground">
              {profile?.first_name} {profile?.last_name}
            </p>
            <p className="text-xs text-sidebar-foreground/60 truncate">{profile?.email}</p>
          </div>
          <button onClick={handleExit} className="rounded p-1 text-sidebar-foreground/60 hover:text-sidebar-foreground" title={isDemoMode ? "Exit Demo" : "Sign Out"}>
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
