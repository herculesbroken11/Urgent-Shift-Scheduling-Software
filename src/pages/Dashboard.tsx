import { useAuth } from "@/contexts/AuthContext";
import { useDemoData } from "@/contexts/DemoDataContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, endOfDay, format } from "date-fns";
import { utcToLocalParts, localToUtcIso, formatDateTimeInTz } from "@/lib/agency-timezone";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { CalendarPlus, Inbox, Clock, RefreshCw, Play, CheckCircle2, AlertTriangle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AppointmentCalendar, type CalendarTimeRange } from "@/components/appointments/AppointmentCalendar";
import { AppointmentFormDialog } from "@/components/appointments/AppointmentFormDialog";
import { cn } from "@/lib/utils";
import { ActivityDetailDialog } from "@/components/dashboard/ActivityDetailDialog";
import { SetupChecklist } from "@/components/dashboard/SetupChecklist";
import { useAgencySettings, AppointmentStatus } from "@/hooks/useAgencySettings";
import { getStatusLabel } from "@/lib/status-labels";
import { statusBadgeColors as statusColors, statusRowColors } from "@/lib/status-colors";
import { useAdaptedQuery } from "@/lib/data-adapter";
import { useAgencyTimezone } from "@/hooks/useAgencyTimezone";
import {
  type TimeWindow,
  type TileGroupDef,
  getTilesForRole,
  DEFAULT_TIME_WINDOW,
} from "@/lib/dashboard-tile-groups";

const ICON_MAP = {
  inbox: Inbox,
  clock: Clock,
  refresh: RefreshCw,
  play: Play,
  check: CheckCircle2,
  alert: AlertTriangle,
} as const;

const TIME_WINDOW_OPTIONS: { value: TimeWindow; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
];

function getTimeWindowRange(window: TimeWindow, timezone: string): { from: string; to: string } {
  // Compute day boundaries in the agency's timezone, then convert to UTC
  const now = new Date();
  // Get "today" in agency timezone
  const todayParts = utcToLocalParts(now.toISOString(), timezone);
  const todayDate = todayParts.date; // yyyy-MM-dd

  if (!todayDate) {
    // Fallback to browser-local if timezone conversion fails
    switch (window) {
      case "today":
        return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
      case "this_week":
        return { from: startOfWeek(now, { weekStartsOn: 1 }).toISOString(), to: endOfWeek(now, { weekStartsOn: 1 }).toISOString() };
      case "this_month":
        return { from: startOfMonth(now).toISOString(), to: endOfMonth(now).toISOString() };
    }
  }

  // Parse the agency-local date
  const [year, month, day] = todayDate.split("-").map(Number);
  const localDate = new Date(year, month - 1, day);

  let fromDate: string;
  let toDate: string;

  switch (window) {
    case "today":
      fromDate = todayDate;
      toDate = todayDate;
      break;
    case "this_week": {
      const ws = startOfWeek(localDate, { weekStartsOn: 1 });
      const we = endOfWeek(localDate, { weekStartsOn: 1 });
      fromDate = format(ws, "yyyy-MM-dd");
      toDate = format(we, "yyyy-MM-dd");
      break;
    }
    case "this_month": {
      const ms = startOfMonth(localDate);
      const me = endOfMonth(localDate);
      fromDate = format(ms, "yyyy-MM-dd");
      toDate = format(me, "yyyy-MM-dd");
      break;
    }
  }

  // Convert agency-local boundaries to UTC
  const fromUtc = localToUtcIso(fromDate, "00:00", timezone) || startOfDay(now).toISOString();
  const toUtc = localToUtcIso(toDate, "23:59", timezone) || endOfDay(now).toISOString();

  return { from: fromUtc, to: toUtc };
}

export default function Dashboard() {
  const { profile, primaryRole, user, hasRole } = useAuth();
  const { state } = useDemoData();
  const navigate = useNavigate();
  const agencyId = profile?.agency_id;
  const [selectedAppt, setSelectedAppt] = useState<any | null>(null);
  const [calendarView, setCalendarView] = useState<"day" | "week" | "month">("month");
  const [createOpen, setCreateOpen] = useState(false);
  const [createInitial, setCreateInitial] = useState<{ start_date: string; start_time: string; end_date: string; end_time: string } | null>(null);
  const agencyTz = useAgencyTimezone();

  const isInterpreter = hasRole("interpreter") && !hasRole("agency_admin") && !hasRole("scheduler");
  const isRequester = hasRole("requester") && !hasRole("agency_admin") && !hasRole("scheduler");
  const userId = user?.id;
  const viewerRole = isInterpreter ? "interpreter" : isRequester ? "requester" : primaryRole;
  const effectiveRole = isInterpreter ? "interpreter" : isRequester ? "requester" : (primaryRole ?? "agency_admin");

  const tiles = getTilesForRole(effectiveRole);
  const defaultWindow = DEFAULT_TIME_WINDOW[effectiveRole] ?? "this_week";
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(defaultWindow);

  // Collect all statuses needed for counting
  const allTileStatuses = useMemo(
    () => [...new Set(tiles.flatMap((t) => t.statuses))],
    [tiles],
  );

  const timeRange = useMemo(() => getTimeWindowRange(timeWindow, agencyTz), [timeWindow, agencyTz]);

  // Fetch windowed counts — one query for the selected time window
  const { data: windowedCounts } = useAdaptedQuery<Record<string, number> | null>({
    queryKey: ["dashboard-grouped-counts", agencyId, isInterpreter, isRequester, userId, profile?.customer_id, allTileStatuses, timeRange.from, timeRange.to],
    queryFn: async () => {
      if (!agencyId) return null;
      const { data, error } = await (supabase.rpc as any)("get_dashboard_counts", {
        _agency_id: agencyId,
        _statuses: allTileStatuses,
        _interpreter_id: isInterpreter && userId ? userId : null,
        _customer_id: isRequester && profile?.customer_id ? profile.customer_id : null,
        _date_from: timeRange.from,
        _date_to: timeRange.to,
      });
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const s of allTileStatuses) counts[s] = 0;
      if (data) Object.assign(counts, data);
      return counts;
    },
    demoFn: () => {
      let appts = state.appointments.filter((a: any) => a.scheduled_start);
      if (isInterpreter && userId) appts = appts.filter((a: any) => a.interpreter_id === userId);
      if (isRequester && profile?.customer_id) appts = appts.filter((a: any) => a.customer_id === profile.customer_id);
      // Apply time window
      appts = appts.filter((a: any) => a.scheduled_start >= timeRange.from && a.scheduled_start <= timeRange.to);
      const counts: Record<string, number> = {};
      for (const s of allTileStatuses) counts[s] = 0;
      for (const a of appts) {
        if (counts[a.status] !== undefined) counts[a.status]++;
      }
      return counts;
    },
    enabled: !!agencyId,
  });

  // Separate query for non-windowed tiles (interpreter new_assignments, in_progress)
  const nonWindowedTiles = tiles.filter((t) => !t.useTimeWindow);
  const needsNonWindowed = nonWindowedTiles.length > 0;

  const nonWindowedStatuses = useMemo(
    () => [...new Set(nonWindowedTiles.flatMap((t) => t.statuses))],
    [nonWindowedTiles],
  );

  const { data: nonWindowedCounts } = useAdaptedQuery<Record<string, number> | null>({
    queryKey: ["dashboard-nonwindowed-counts", agencyId, isInterpreter, isRequester, userId, profile?.customer_id, nonWindowedStatuses],
    queryFn: async () => {
      if (!agencyId || !needsNonWindowed) return null;
      const { data, error } = await (supabase.rpc as any)("get_dashboard_counts", {
        _agency_id: agencyId,
        _statuses: nonWindowedStatuses,
        _interpreter_id: isInterpreter && userId ? userId : null,
        _customer_id: isRequester && profile?.customer_id ? profile.customer_id : null,
      });
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const s of nonWindowedStatuses) counts[s] = 0;
      if (data) Object.assign(counts, data);
      return counts;
    },
    demoFn: () => {
      if (!needsNonWindowed) return null;
      let appts = state.appointments.filter((a: any) => a.scheduled_start);
      if (isInterpreter && userId) appts = appts.filter((a: any) => a.interpreter_id === userId);
      if (isRequester && profile?.customer_id) appts = appts.filter((a: any) => a.customer_id === profile.customer_id);
      const counts: Record<string, number> = {};
      for (const s of nonWindowedStatuses) counts[s] = 0;
      for (const a of appts) {
        if (counts[a.status] !== undefined) counts[a.status]++;
      }
      return counts;
    },
    enabled: !!agencyId && needsNonWindowed,
  });

  // Compute tile count from appropriate source
  const getTileCount = (tile: TileGroupDef): number => {
    if (!tile.useTimeWindow) {
      // Non-windowed (all-time)
      if (!nonWindowedCounts) return 0;
      return tile.statuses.reduce((sum, s) => sum + (nonWindowedCounts[s] ?? 0), 0);
    }
    // Windowed
    if (!windowedCounts) return 0;
    return tile.statuses.reduce((sum, s) => sum + (windowedCounts[s] ?? 0), 0);
  };

  const primaryTiles = tiles.filter((t) => t.section === "primary");
  const secondaryTiles = tiles.filter((t) => t.section === "secondary");

  // Recent activity (unchanged)
  const allVisibleStatuses = allTileStatuses;
  const { data: recentActivity } = useAdaptedQuery<any[]>({
    queryKey: ["dashboard-recent-activity", agencyId, isInterpreter, isRequester, userId, profile?.customer_id],
    queryFn: async () => {
      if (!agencyId) return [];
      const todayStart = startOfDay(new Date()).toISOString();
      let query = supabase
        .from("appointments")
        .select("id, title, status, scheduled_start, scheduled_end, created_at, description, notes, modality, custom_fields, customer_id, customers(name), language_id, languages(name), location_id, locations(name, address_line1, city, state, zip_code), interpreter_id, interpreter:profiles!appointments_interpreter_id_fkey(first_name, last_name)")
        .eq("agency_id", agencyId)
        .eq("is_import_staged", false).eq("is_deleted", false)
        .gte("scheduled_start", todayStart)
        .order("scheduled_start", { ascending: true })
        .limit(10);
      if (isInterpreter && userId) query = query.eq("interpreter_id", userId);
      if (isRequester && profile?.customer_id) query = query.eq("customer_id", profile.customer_id);
      const { data } = await query;
      return data ?? [];
    },
    demoFn: () => {
      const now = new Date();
      let appts = [...state.appointments].filter(a => {
        if (!a.scheduled_start) return false;
        return new Date(a.scheduled_start) >= startOfDay(now);
      });
      if (isInterpreter && userId) {
        appts = appts.filter(a => a.interpreter_id === userId);
      }
      return appts
        .filter(a => a.created_at && !isNaN(new Date(a.created_at).getTime()))
        .sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime())
        .slice(0, 10);
    },
    enabled: !!agencyId,
  });

  const renderGroupedTile = (tile: TileGroupDef) => {
    const count = getTileCount(tile);
    const IconComp = ICON_MAP[tile.icon];
    return (
      <Card
        key={tile.id}
        className={cn("cursor-pointer transition-colors hover:brightness-95 border", tile.tileColor)}
        onClick={() => navigate(tile.route)}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className={cn("text-3xl font-bold", tile.textColor)}>{count}</p>
              <p className="text-xs font-medium text-muted-foreground mt-1">{tile.label}</p>
            </div>
            <IconComp className={cn("h-6 w-6 opacity-40", tile.textColor)} />
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {!user?.last_sign_in_at
            ? `Welcome, ${profile?.first_name ?? "there"}`
            : `Welcome back, ${profile?.first_name ?? "there"}`}
        </h1>
        <p className="text-muted-foreground">
          {isInterpreter ? "Here's an overview of your assignments" : "Here's an overview of your workspace"}
        </p>
      </div>

      <SetupChecklist />

      {/* Time Window Toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {primaryTiles.length > 0
            ? isInterpreter
              ? "Assignments"
              : isRequester
              ? "Requests"
              : "Actionable"
            : "Overview"}
        </h2>
        <div className="flex items-center gap-1 border rounded-lg overflow-hidden bg-card">
          {TIME_WINDOW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTimeWindow(opt.value)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                timeWindow === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Primary / Actionable Tiles */}
      {primaryTiles.length > 0 && (
        <div className={cn(
          "grid gap-3",
          primaryTiles.length <= 2 ? "grid-cols-2" : primaryTiles.length <= 3 ? "grid-cols-3" : "grid-cols-2 lg:grid-cols-4"
        )}>
          {primaryTiles.map(renderGroupedTile)}
        </div>
      )}

      {/* Secondary / Outcome Tiles */}
      {secondaryTiles.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Outcomes</h2>
          <div className={cn(
            "grid gap-3",
            secondaryTiles.length <= 2 ? "grid-cols-2" : "grid-cols-3"
          )}>
            {secondaryTiles.map(renderGroupedTile)}
          </div>
        </div>
      )}

      {/* Upcoming Appointments */}
      <Card>
        <CardHeader>
          <CardTitle>{isInterpreter ? "Upcoming Assignments" : "Upcoming Appointments"}</CardTitle>
          <CardDescription>Today's and future appointment activity</CardDescription>
        </CardHeader>
        <CardContent>
          {!recentActivity || recentActivity.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <CalendarPlus className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No upcoming appointments yet.</p>
              <Button variant="outline" size="sm" onClick={() => navigate(isInterpreter ? "/my-schedule" : isRequester ? "/my-requests" : "/appointments")}>
                {isInterpreter ? "View My Schedule" : isRequester ? "View My Requests" : "View All Appointments"}
              </Button>
            </div>
          ) : isRequester ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 py-1">Status</TableHead>
                  <TableHead className="h-8 py-1">Patient/Client</TableHead>
                  <TableHead className="h-8 py-1">Date & Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentActivity.filter((appt) => allVisibleStatuses.includes(appt.status as AppointmentStatus)).map((appt) => {
                  const cf = (appt.custom_fields as any) || {};
                  return (
                    <TableRow
                      key={appt.id}
                      className={cn("cursor-pointer", statusRowColors[appt.status] ?? "")}
                      onClick={() => setSelectedAppt(appt)}
                    >
                      <TableCell className="py-1.5">
                        <Badge variant="outline" className={cn("text-xs", statusColors[appt.status] ?? "")}>
                          {getStatusLabel(appt.status, viewerRole, (appt as any).interpreter_id)}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1.5 font-medium">{cf.client_name || "—"}</TableCell>
                      <TableCell className="py-1.5 text-muted-foreground whitespace-nowrap">
                        {appt.scheduled_start ? formatDateTimeInTz(appt.scheduled_start, agencyTz) : "TBD"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="space-y-1">
              {recentActivity.filter((appt) => allVisibleStatuses.includes(appt.status as AppointmentStatus)).map((appt) => (
                <div
                  key={appt.id}
                  className={cn("flex items-center gap-3 rounded border px-2.5 py-1.5 cursor-pointer transition-colors hover:brightness-95 text-sm", statusRowColors[appt.status] ?? "")}
                  onClick={() => setSelectedAppt(appt)}
                >
                  <Badge variant="outline" className={cn("text-[11px] px-1.5 py-0 shrink-0", statusColors[appt.status] ?? "")}>
                    {getStatusLabel(appt.status, viewerRole, (appt as any).interpreter_id)}
                  </Badge>
                  <p className="font-medium truncate flex-shrink min-w-0">
                    {appt.title
                      || (appt as any).languages?.name
                      || (appt.scheduled_start ? formatDateTimeInTz(appt.scheduled_start, agencyTz, { dateOnly: true }) : "Appointment")}
                  </p>
                  <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                    {(appt as any).customers?.name}
                  </span>
                  {appt.scheduled_start && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-auto">
                      {formatDateTimeInTz(appt.scheduled_start, agencyTz)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Calendar View */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Calendar View</h2>
          <div className="flex gap-1">
            {(["day", "week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setCalendarView(v)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md border transition-colors",
                  calendarView === v
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-accent"
                )}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <AppointmentCalendar
          view={calendarView}
          customerId={isRequester ? (profile?.customer_id ?? undefined) : undefined}
          interpreterId={isInterpreter ? (user?.id ?? undefined) : undefined}
          onCreateRequest={
            isInterpreter
              ? undefined
              : isRequester
                ? (range) => {
                    const params = new URLSearchParams({
                      date: range.date,
                      start: range.start_time,
                      end: range.end_time,
                      end_date: range.date,
                    });
                    navigate(`/request?${params.toString()}`);
                  }
                : (range) => {
                    setCreateInitial({
                      start_date: range.date,
                      start_time: range.start_time,
                      end_date: range.date,
                      end_time: range.end_time,
                    });
                    setCreateOpen(true);
                  }
          }
        />
      </div>

      {createInitial && (
        <AppointmentFormDialog
          open={createOpen}
          onOpenChange={(v) => {
            setCreateOpen(v);
            if (!v) setCreateInitial(null);
          }}
          initialValues={createInitial}
        />
      )}

      <ActivityDetailDialog
        appointment={selectedAppt}
        open={!!selectedAppt}
        onOpenChange={(open) => { if (!open) setSelectedAppt(null); }}
      />
    </div>
  );
}
