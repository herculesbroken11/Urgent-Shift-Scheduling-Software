/**
 * Centralized dashboard tile group definitions (v3).
 * Maps role-based grouped tiles to underlying v3 statuses.
 * Used by Dashboard.tsx for rendering and by destination pages for filter resolution.
 */

export type TimeWindow = "today" | "this_week" | "this_month";

export interface TileGroupDef {
  id: string;
  label: string;
  /** Which v3 statuses are included in this group's count */
  statuses: string[];
  /** Whether this tile's count is filtered by the time window */
  useTimeWindow: boolean;
  /** Route to navigate to on click */
  route: string;
  /** Tile color classes */
  tileColor: string;
  /** Tile number text color */
  textColor: string;
  /** Icon name hint (consumed by Dashboard) */
  icon: "inbox" | "clock" | "refresh" | "play" | "check" | "alert";
  /** Section: primary = actionable, secondary = outcomes */
  section: "primary" | "secondary";
}

/** Admin / Scheduler tiles */
export const ADMIN_TILES: TileGroupDef[] = [
  {
    id: "unassigned_requests",
    label: "Unassigned Requests",
    statuses: ["requested", "requested_last_minute"],
    useTimeWindow: true,
    route: "/appointments?group=unassigned_requests",
    tileColor: "bg-amber-200 border-amber-500 dark:bg-amber-900/60 dark:border-amber-500",
    textColor: "text-amber-900 dark:text-amber-200",
    icon: "inbox",
    section: "primary",
  },
  {
    id: "unconfirmed_assignments",
    label: "Unconfirmed Assignments",
    statuses: ["interpreter_assigned", "interpreter_assigned_last_minute"],
    useTimeWindow: true,
    route: "/appointments?group=unconfirmed_assignments",
    tileColor: "bg-blue-200 border-blue-500 dark:bg-blue-900/60 dark:border-blue-500",
    textColor: "text-blue-900 dark:text-blue-200",
    icon: "clock",
    section: "primary",
  },
  {
    id: "reassignments",
    label: "Reassignments Needed",
    statuses: ["reassignment_needed"],
    useTimeWindow: true,
    route: "/appointments?group=reassignments",
    tileColor: "bg-rose-200 border-rose-500 dark:bg-rose-900/60 dark:border-rose-500",
    textColor: "text-rose-900 dark:text-rose-200",
    icon: "refresh",
    section: "primary",
  },
  {
    id: "active_today",
    label: "Active Appointments",
    statuses: ["interpreter_confirmed", "in_progress"],
    useTimeWindow: true,
    route: "/appointments?group=active_today",
    tileColor: "bg-cyan-200 border-cyan-500 dark:bg-cyan-900/60 dark:border-cyan-500",
    textColor: "text-cyan-900 dark:text-cyan-200",
    icon: "play",
    section: "primary",
  },
  {
    id: "completed",
    label: "Completed",
    statuses: ["completed", "completed_last_minute"],
    useTimeWindow: true,
    route: "/appointments?group=completed",
    tileColor: "bg-emerald-200 border-emerald-500 dark:bg-emerald-900/60 dark:border-emerald-500",
    textColor: "text-emerald-900 dark:text-emerald-200",
    icon: "check",
    section: "secondary",
  },
  {
    id: "disruptions",
    label: "Disruptions",
    statuses: ["late_cancel_no_show_client", "no_show_interpreter", "cancelled"],
    useTimeWindow: true,
    route: "/appointments?group=disruptions",
    tileColor: "bg-red-200 border-red-500 dark:bg-red-900/60 dark:border-red-500",
    textColor: "text-red-900 dark:text-red-200",
    icon: "alert",
    section: "secondary",
  },
];

/** Interpreter tiles */
export const INTERPRETER_TILES: TileGroupDef[] = [
  {
    id: "new_assignments",
    label: "New Assignments",
    statuses: ["interpreter_assigned", "interpreter_assigned_last_minute"],
    useTimeWindow: false,
    route: "/my-schedule?group=new_assignments",
    tileColor: "bg-blue-200 border-blue-500 dark:bg-blue-900/60 dark:border-blue-500",
    textColor: "text-blue-900 dark:text-blue-200",
    icon: "inbox",
    section: "primary",
  },
  {
    id: "upcoming",
    label: "Upcoming",
    statuses: ["interpreter_confirmed"],
    useTimeWindow: true,
    route: "/my-schedule?group=upcoming",
    tileColor: "bg-cyan-200 border-cyan-500 dark:bg-cyan-900/60 dark:border-cyan-500",
    textColor: "text-cyan-900 dark:text-cyan-200",
    icon: "clock",
    section: "primary",
  },
  {
    id: "in_progress",
    label: "In Progress",
    statuses: ["in_progress"],
    useTimeWindow: false,
    route: "/my-schedule?group=in_progress",
    tileColor: "bg-fuchsia-200 border-fuchsia-500 dark:bg-fuchsia-900/60 dark:border-fuchsia-500",
    textColor: "text-fuchsia-900 dark:text-fuchsia-200",
    icon: "play",
    section: "primary",
  },
  {
    id: "completed",
    label: "Completed",
    statuses: ["completed", "completed_last_minute"],
    useTimeWindow: true,
    route: "/my-schedule?group=completed",
    tileColor: "bg-emerald-200 border-emerald-500 dark:bg-emerald-900/60 dark:border-emerald-500",
    textColor: "text-emerald-900 dark:text-emerald-200",
    icon: "check",
    section: "secondary",
  },
  {
    id: "no_show",
    label: "No-Show",
    statuses: ["no_show_interpreter"],
    useTimeWindow: true,
    route: "/my-schedule?group=no_show",
    tileColor: "bg-red-200 border-red-500 dark:bg-red-900/60 dark:border-red-500",
    textColor: "text-red-900 dark:text-red-200",
    icon: "alert",
    section: "secondary",
  },
];

/** Requester tiles */
export const REQUESTER_TILES: TileGroupDef[] = [
  {
    id: "open_requests",
    label: "Open Requests",
    statuses: ["requested", "requested_last_minute"],
    useTimeWindow: true,
    route: "/my-requests?group=open_requests",
    tileColor: "bg-amber-200 border-amber-500 dark:bg-amber-900/60 dark:border-amber-500",
    textColor: "text-amber-900 dark:text-amber-200",
    icon: "inbox",
    section: "primary",
  },
  {
    id: "upcoming_appointments",
    label: "Upcoming Appointments",
    statuses: ["interpreter_assigned", "interpreter_assigned_last_minute", "interpreter_confirmed", "in_progress"],
    useTimeWindow: true,
    route: "/my-requests?group=upcoming_appointments",
    tileColor: "bg-cyan-200 border-cyan-500 dark:bg-cyan-900/60 dark:border-cyan-500",
    textColor: "text-cyan-900 dark:text-cyan-200",
    icon: "play",
    section: "primary",
  },
  {
    id: "completed",
    label: "Completed",
    statuses: ["completed", "completed_last_minute"],
    useTimeWindow: true,
    route: "/my-requests?group=completed",
    tileColor: "bg-emerald-200 border-emerald-500 dark:bg-emerald-900/60 dark:border-emerald-500",
    textColor: "text-emerald-900 dark:text-emerald-200",
    icon: "check",
    section: "secondary",
  },
  {
    id: "cancelled_disrupted",
    label: "Cancelled / Disrupted",
    statuses: ["cancelled", "late_cancel_no_show_client"],
    useTimeWindow: true,
    route: "/my-requests?group=cancelled_disrupted",
    tileColor: "bg-red-200 border-red-500 dark:bg-red-900/60 dark:border-red-500",
    textColor: "text-red-900 dark:text-red-200",
    icon: "alert",
    section: "secondary",
  },
];

/**
 * Resolve a ?group= query param to the corresponding v3 status array.
 * Used by Appointments, MySchedule, MyRequests pages.
 */
export function resolveGroupToStatuses(group: string | null): string[] | null {
  if (!group) return null;
  const allGroups = [...ADMIN_TILES, ...INTERPRETER_TILES, ...REQUESTER_TILES];
  const match = allGroups.find((g) => g.id === group);
  return match?.statuses ?? null;
}

/**
 * Get the label for a group (for filter badge display).
 */
export function getGroupLabel(group: string): string {
  const allGroups = [...ADMIN_TILES, ...INTERPRETER_TILES, ...REQUESTER_TILES];
  const match = allGroups.find((g) => g.id === group);
  return match?.label ?? group;
}

/** Default time windows per role */
export const DEFAULT_TIME_WINDOW: Record<string, TimeWindow> = {
  agency_admin: "this_week",
  scheduler: "this_week",
  interpreter: "today",
  requester: "this_week",
};

/** Get tiles for a role */
export function getTilesForRole(role: string): TileGroupDef[] {
  if (role === "interpreter") return INTERPRETER_TILES;
  if (role === "requester") return REQUESTER_TILES;
  return ADMIN_TILES; // admin + scheduler
}
