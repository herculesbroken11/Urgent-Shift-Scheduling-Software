/**
 * Centralized route → role map.
 * Used by both App.tsx (ProtectedRoute enforcement) and AppSidebar (nav visibility).
 * A route with an empty roles array means "any authenticated user".
 */
import type { AppRole } from "@/lib/supabase-helpers";

export interface RouteRoleEntry {
  path: string;
  /** Roles allowed to access this route. Empty = any authenticated user. */
  roles: AppRole[];
}

const allRoles: AppRole[] = ["agency_admin", "scheduler", "requester", "interpreter"];

export const ROUTE_ROLES: RouteRoleEntry[] = [
  // Onboarding — any authenticated user
  { path: "/onboarding",             roles: [] },
  // Dashboard — everyone
  { path: "/dashboard",              roles: allRoles },
  // Admin & scheduler
  { path: "/appointments",           roles: ["agency_admin", "scheduler"] },
  { path: "/schedule-wizard",        roles: ["agency_admin", "scheduler"] },
  { path: "/customers",              roles: ["agency_admin", "scheduler"] },
  { path: "/customers/:id",          roles: ["agency_admin", "scheduler"] },
  { path: "/interpreters",           roles: ["agency_admin", "scheduler"] },
  // Admin only
  { path: "/billing-rates",          roles: ["agency_admin"] },
  { path: "/customer-billing",       roles: ["agency_admin"] },
  { path: "/interpreter-pay",        roles: ["agency_admin"] },
  { path: "/invoices",               roles: ["agency_admin"] },
  { path: "/billing-report",         roles: ["agency_admin"] },
  { path: "/notification-templates", roles: ["agency_admin"] },
  { path: "/notification-log",       roles: ["agency_admin"] },
  { path: "/audit-log",              roles: ["agency_admin"] },
  { path: "/reports",                roles: ["agency_admin"] },
  { path: "/calendar-settings",      roles: ["agency_admin"] },
  { path: "/regions",                roles: ["agency_admin"] },
  { path: "/import",                 roles: ["agency_admin"] },
  { path: "/import-history",         roles: ["agency_admin"] },
  { path: "/qbo-sync-log",          roles: ["agency_admin"] },
  { path: "/integration-health",   roles: ["agency_admin"] },
  // Requester
  { path: "/request",                roles: ["requester"] },
  { path: "/my-requests",            roles: ["requester"] },
  // Interpreter
  { path: "/my-schedule",            roles: ["interpreter"] },
  { path: "/my-earnings",            roles: ["interpreter"] },
  { path: "/my-languages",           roles: ["interpreter"] },
  { path: "/availability",           roles: ["interpreter"] },
  { path: "/available-jobs",         roles: ["interpreter"] },
  { path: "/time-tracking",          roles: ["interpreter"] },
  // Shared
  { path: "/messages",               roles: allRoles },
  { path: "/settings",               roles: allRoles },
];

/** Lookup helper: returns the allowed roles for a given path, or undefined if path is not mapped. */
const rolesByPath = new Map(ROUTE_ROLES.map((r) => [r.path, r.roles]));

export function getRolesForPath(path: string): AppRole[] | undefined {
  return rolesByPath.get(path);
}
