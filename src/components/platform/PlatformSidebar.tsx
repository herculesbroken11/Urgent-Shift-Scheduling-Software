import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarGroupContent,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, Building2, Users, DollarSign, Headphones, ToggleLeft,
  Activity, Shield, LogOut, ArrowLeft, Settings, BookOpen,
} from "lucide-react";

const navItems = [
  { path: "/platform/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/platform/agencies", label: "Agencies", icon: Building2 },
  { path: "/platform/users", label: "Users", icon: Users },
  { path: "/platform/revenue", label: "Revenue", icon: DollarSign },
  { path: "/platform/support", label: "Support", icon: Headphones },
  { path: "/platform/feature-flags", label: "Feature Flags", icon: ToggleLeft },
  { path: "/platform/diagnostics", label: "Diagnostics", icon: Activity },
  { path: "/platform/audit", label: "Audit Log", icon: Shield },
  { path: "/platform/settings", label: "Settings", icon: Settings },
  { path: "/platform/runbook", label: "Billing Runbook", icon: BookOpen },
];

export function PlatformSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOut } = useAuth();

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2">
          <Shield className="h-7 w-7 text-primary" />
          <div>
            <h2 className="text-base font-bold leading-tight text-sidebar-foreground">BlueThread</h2>
            <p className="text-xs text-primary font-medium">Platform Owner</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={location.pathname === item.path || location.pathname.startsWith(item.path + '/')}
                    onClick={() => navigate(item.path)}
                    tooltip={item.label}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => navigate("/dashboard")} tooltip="Back to App">
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to App</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
          </div>
          <button onClick={() => signOut()} className="rounded p-1 text-sidebar-foreground/60 hover:text-sidebar-foreground">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
