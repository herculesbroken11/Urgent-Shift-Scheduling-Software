import { useState, useEffect } from "react";
import { useAgencySettings } from "@/hooks/useAgencySettings";
import { Button } from "@/components/ui/button";
import { Plus, Copy, Download, Search, CalendarIcon, Repeat, ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { useAgencyTimezone } from "@/hooks/useAgencyTimezone";
import { utcToLocalParts, localToUtcIso } from "@/lib/agency-timezone";
import { formatDateTimeInTz } from "@/lib/agency-timezone";
import { AppointmentFormDialog } from "@/components/appointments/AppointmentFormDialog";
import { usePaginatedAppointments } from "@/hooks/usePaginatedAppointments";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ColumnLayoutEditor, useColumnLayout, type ColumnDef } from "@/components/appointments/ColumnLayoutEditor";
import { Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchParams } from "react-router-dom";

const ALL_COLUMNS: ColumnDef[] = [
  { id: "view", label: "View", minWidth: "w-16" },
  { id: "date", label: "Date", minWidth: "w-24" },
  { id: "status", label: "Status" },
  { id: "category", label: "Category" },
  { id: "location", label: "At" },
  { id: "client", label: "Customer" },
  { id: "start", label: "Start", minWidth: "w-20" },
  { id: "end", label: "End", minWidth: "w-20" },
  { id: "language", label: "Language" },
  { id: "interpreter", label: "Interpreter" },
  { id: "modality", label: "Modality", defaultVisible: false },
  { id: "actions", label: "", minWidth: "w-10" },
];

import { statusBadgeColors } from "@/lib/status-colors";
import { getStatusLabel } from "@/lib/status-labels";
import { STATUS_LABELS } from "@/lib/status-labels";
import { resolveGroupToStatuses, getGroupLabel } from "@/lib/dashboard-tile-groups";

const statusColors = statusBadgeColors;

type DatePreset = "today" | "week" | "month" | "all" | "custom";
type AssignmentFilter = "all" | "assigned" | "unassigned";

const PAGE_SIZE = 50;

function renderCell(
  colId: string,
  a: any,
  actions: { setEditingAppointment: any; setDuplicateValues: any; setFormOpen: any },
  agencyTz: string
) {
  switch (colId) {
    case "view": {
      const isRecurring = !!a.parent_recurring_id || !!a.recurrence_rule;
      return (
        <span className="text-info font-medium text-sm hover:underline flex items-center gap-1">
          {a.id.slice(0, 5).toUpperCase()}
          {isRecurring && <Repeat className="h-3 w-3 text-muted-foreground" />}
        </span>
      );
    }
    case "date":
      return (
        <span className="text-sm whitespace-nowrap">
          {a.scheduled_start ? formatDateTimeInTz(a.scheduled_start, agencyTz, { dateOnly: true }) : "—"}
        </span>
      );
    case "status":
      return (
        <Badge variant="outline" className={`text-xs ${statusColors[a.status] ?? ""}`}>
          {STATUS_LABELS[a.status] ?? a.status}
        </Badge>
      );
    case "category":
      return <span className="text-sm">{a.category ?? "—"}</span>;
    case "location": {
      const isVirtual = a.modality === "opi" || a.modality === "vri";
      const virtualLabel = a.modality === "opi" ? "Virtual (Phone)" : a.modality === "vri" ? "Virtual (Video)" : "Virtual";
      return (
        <div className="text-sm">
          <div className="flex items-center gap-1">
            {a.locations?.name ? (
              <span className="text-info hover:underline">{a.locations.name}</span>
            ) : isVirtual ? (
              <span className="text-muted-foreground italic">{virtualLabel}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
            {a.locations?.address_line1 && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([a.locations.address_line1, a.locations.city].filter(Boolean).join(", "))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary"
                onClick={(e) => e.stopPropagation()}
              >
                <Navigation className="h-3 w-3" />
              </a>
            )}
          </div>
          {a.title && <div className="text-muted-foreground text-xs">{a.title}</div>}
        </div>
      );
    }
    case "client":
      return <span className="text-sm">{a.customers?.name ?? "—"}</span>;
    case "start":
      return (
        <span className="text-sm whitespace-nowrap">
          {a.scheduled_start ? formatDateTimeInTz(a.scheduled_start, agencyTz, { timeOnly: true }) : "—"}
        </span>
      );
    case "end": {
      const endTime = a.actual_end
        ? formatDateTimeInTz(a.actual_end, agencyTz, { timeOnly: true })
        : a.scheduled_end
        ? formatDateTimeInTz(a.scheduled_end, agencyTz, { timeOnly: true })
        : null;
      const isCompleted = ["completed", "completed_last_minute"].includes(a.status);
      return (
        <span className="text-sm whitespace-nowrap">
          {endTime ?? (isCompleted ? "Completed" : "—")}
        </span>
      );
    }
    case "language":
      return <span className="text-sm">{a.languages?.name ?? "—"}</span>;
    case "interpreter":
      return a.interpreter ? (
        <span className="text-sm text-info hover:underline">
          {a.interpreter.first_name} {a.interpreter.last_name}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">Unassigned</span>
      );
    case "modality":
      return <span className="text-sm capitalize">{a.modality?.replace("_", " ") ?? "—"}</span>;
    case "actions":
      return (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Duplicate appointment"
          onClick={(e) => {
            e.stopPropagation();
            const cf = a.custom_fields as any;
            actions.setEditingAppointment(undefined);
            actions.setDuplicateValues({
              title: a.title ?? "",
              description: a.description ?? "",
              customer_id: a.customer_id ?? "",
              location_id: a.location_id ?? "",
              language_id: a.language_id ?? "",
              interpreter_id: a.interpreter_id ?? "",
              notes: a.notes ?? "",
              include_mileage: cf?.include_mileage ?? false,
              include_travel: cf?.include_travel ?? false,
            });
            actions.setFormOpen(true);
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      );
    default:
      return null;
  }
}

function getDateRange(preset: DatePreset, agencyTz: string, customFrom?: Date, customTo?: Date) {
  const now = new Date();
  if (preset === "all") return { from: undefined, to: undefined };
  if (preset === "custom") {
    if (customFrom && customTo) {
      const fromDate = format(customFrom, "yyyy-MM-dd");
      const toDate = format(customTo, "yyyy-MM-dd");
      const fromUtc = localToUtcIso(fromDate, "00:00", agencyTz) || startOfDay(customFrom).toISOString();
      const toUtc = localToUtcIso(toDate, "23:59", agencyTz) || endOfDay(customTo).toISOString();
      return { from: fromUtc, to: toUtc };
    }
    return { from: undefined, to: undefined };
  }

  // Compute day boundaries in the agency's timezone, then convert to UTC
  const todayParts = utcToLocalParts(now.toISOString(), agencyTz);
  const todayDate = todayParts.date;
  if (!todayDate) {
    // Fallback to browser-local
    switch (preset) {
      case "today":
        return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
      case "week":
        return { from: startOfWeek(now, { weekStartsOn: 1 }).toISOString(), to: endOfWeek(now, { weekStartsOn: 1 }).toISOString() };
      case "month":
        return { from: startOfMonth(now).toISOString(), to: endOfMonth(now).toISOString() };
      default:
        return { from: undefined, to: undefined };
    }
  }

  const [year, month, day] = todayDate.split("-").map(Number);
  const localDate = new Date(year, month - 1, day);
  let fromDate: string;
  let toDate: string;

  switch (preset) {
    case "today":
      fromDate = todayDate;
      toDate = todayDate;
      break;
    case "week": {
      const ws = startOfWeek(localDate, { weekStartsOn: 1 });
      const we = endOfWeek(localDate, { weekStartsOn: 1 });
      fromDate = format(ws, "yyyy-MM-dd");
      toDate = format(we, "yyyy-MM-dd");
      break;
    }
    case "month": {
      const ms = startOfMonth(localDate);
      const me = endOfMonth(localDate);
      fromDate = format(ms, "yyyy-MM-dd");
      toDate = format(me, "yyyy-MM-dd");
      break;
    }
    default:
      return { from: undefined, to: undefined };
  }

  const fromUtc = localToUtcIso(fromDate, "00:00", agencyTz) || startOfDay(now).toISOString();
  const toUtc = localToUtcIso(toDate, "23:59", agencyTz) || endOfDay(now).toISOString();
  return { from: fromUtc, to: toUtc };
}

export default function Appointments() {
  const { getVisibleStatuses } = useAgencySettings();
  const visibleStatuses = getVisibleStatuses();
  const agencyTz = useAgencyTimezone();
  const [formOpen, setFormOpen] = useState(false);
  const [duplicateValues, setDuplicateValues] = useState<any>(undefined);
  const [editingAppointment, setEditingAppointment] = useState<any>(undefined);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>("all");
  const [searchParams, setSearchParams] = useSearchParams();
  const groupParam = searchParams.get("group");
  const groupStatuses = resolveGroupToStatuses(groupParam);
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") || "all");
  const [page, setPage] = useState(0);
  const { columns, visibleColumns, toggleColumn, moveColumn, resetToDefaults } = useColumnLayout(ALL_COLUMNS);
  const colMap = Object.fromEntries(ALL_COLUMNS.map((c) => [c.id, c]));

  // Sync status filter from URL params (e.g. when clicking dashboard tiles)
  useEffect(() => {
    const urlStatus = searchParams.get("status");
    if (urlStatus && urlStatus !== statusFilter) {
      setStatusFilter(urlStatus);
      setDatePreset("all");
    }
  }, [searchParams]);

  // Debounce search to avoid excessive RPC calls
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 0 when filters change
  useEffect(() => {
    setPage(0);
  }, [statusFilter, datePreset, customFrom, customTo, assignmentFilter, debouncedSearch]);

  const dateRange = getDateRange(datePreset, agencyTz, customFrom, customTo);

  const { data: result } = usePaginatedAppointments({
    status: groupStatuses ? "all" : statusFilter,
    statuses: groupStatuses ?? undefined,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    search: debouncedSearch || undefined,
    assignment: assignmentFilter,
    page,
    pageSize: PAGE_SIZE,
  });

  const appointments = result?.data ?? [];
  const totalCount = result?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Auto-open edit dialog when navigating with ?edit=<id>
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && appointments.length > 0) {
      const match = appointments.find((a: any) => a.id === editId);
      if (match) {
        setEditingAppointment(match);
        setDuplicateValues(undefined);
        setFormOpen(true);
        searchParams.delete("edit");
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [searchParams, appointments]);

  const exportCSV = () => {
    const headers = ["ID", "Date", "Status", "Category", "Location", "Customer", "Start", "End", "Language", "Interpreter"];
    const rows = appointments.map((a: any) => [
      a.id.slice(0, 6).toUpperCase(),
      a.scheduled_start ? formatDateTimeInTz(a.scheduled_start, agencyTz, { dateOnly: true }) : "",
      STATUS_LABELS[a.status] ?? a.status,
      a.category ?? "",
      a.locations?.name ?? "",
      a.customers?.name ?? "",
      a.scheduled_start ? formatDateTimeInTz(a.scheduled_start, agencyTz, { timeOnly: true }) : "",
      a.scheduled_end ? formatDateTimeInTz(a.scheduled_end, agencyTz, { timeOnly: true }) : "",
      a.languages?.name ?? "",
      a.interpreter ? `${a.interpreter.first_name} ${a.interpreter.last_name}` : "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `appointments-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = () => {
    const headers = ["ID", "Date", "Status", "Category", "Location", "Customer", "Start", "End", "Language", "Interpreter"];
    const rows = appointments.map((a: any) => [
      a.id.slice(0, 6).toUpperCase(),
      a.scheduled_start ? formatDateTimeInTz(a.scheduled_start, agencyTz, { dateOnly: true }) : "",
      STATUS_LABELS[a.status] ?? a.status,
      a.category ?? "",
      a.locations?.name ?? "",
      a.customers?.name ?? "",
      a.scheduled_start ? formatDateTimeInTz(a.scheduled_start, agencyTz, { timeOnly: true }) : "",
      a.scheduled_end ? formatDateTimeInTz(a.scheduled_end, agencyTz, { timeOnly: true }) : "",
      a.languages?.name ?? "",
      a.interpreter ? `${a.interpreter.first_name} ${a.interpreter.last_name}` : "",
    ]);
    const text = [headers, ...rows].map((r) => r.join("\t")).join("\n");
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-4 p-4">
      {/* Group filter badge */}
      {groupParam && groupStatuses && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtered by:</span>
          <Badge variant="secondary" className="gap-1">
            {getGroupLabel(groupParam)}
            <button onClick={() => { searchParams.delete("group"); setSearchParams(searchParams, { replace: true }); }} className="ml-0.5 hover:text-foreground">
              <span className="text-xs">✕</span>
            </button>
          </Badge>
        </div>
      )}
      {/* Top bar: filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => { setEditingAppointment(undefined); setDuplicateValues(undefined); setFormOpen(true); }}
          className="gap-2"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Appointment
        </Button>

        {/* Date range presets */}
        <div className="flex items-center gap-1 border rounded-lg overflow-hidden bg-card">
          {(["all", "today", "week", "month", "custom"] as DatePreset[]).map((p) => (
            <Button
              key={p}
              variant={datePreset === p ? "default" : "ghost"}
              size="sm"
              className="rounded-none text-xs h-8 px-3"
              onClick={() => setDatePreset(p)}
            >
              {p === "all" ? "All Dates" : p === "today" ? "Today" : p === "week" ? "This Week" : p === "month" ? "This Month" : "Custom"}
            </Button>
          ))}
        </div>

        {datePreset === "custom" && (
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("text-xs h-8 gap-1", !customFrom && "text-muted-foreground")}>
                  <CalendarIcon className="h-3 w-3" />
                  {customFrom ? format(customFrom, "MMM d, yyyy") : "From"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <span className="text-xs text-muted-foreground">–</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("text-xs h-8 gap-1", !customTo && "text-muted-foreground")}>
                  <CalendarIcon className="h-3 w-3" />
                  {customTo ? format(customTo, "MMM d, yyyy") : "To"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customTo} onSelect={setCustomTo} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        )}

        <Select value={assignmentFilter} onValueChange={(v) => setAssignmentFilter(v as AssignmentFilter)}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Interpreters</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(STATUS_LABELS)
              .filter(([k]) => visibleStatuses.includes(k as any))
              .map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {/* Second row: search + export + columns */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyToClipboard} className="text-xs h-7">
            Copy
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} className="text-xs h-7 gap-1">
            <Download className="h-3 w-3" />
            CSV
          </Button>
          <ColumnLayoutEditor
            allColumns={ALL_COLUMNS}
            columns={columns}
            toggleColumn={toggleColumn}
            moveColumn={moveColumn}
            resetToDefaults={resetToDefaults}
          />
        </div>
        <div className="relative w-56">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search appointments..."
            className="h-8 text-sm pr-8"
          />
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>

      {/* Full table */}
      <div className="border rounded-lg bg-card overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className="bg-muted/30">
              {visibleColumns.map((vc, idx) => {
                const def = colMap[vc.id];
                return (
                  <TableHead key={vc.id} className={cn("text-xs font-semibold", def?.minWidth, idx === 0 && "sticky left-0 z-30 bg-background")}>
                    {def?.label ?? ""}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {appointments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Calendar className="h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-foreground">No appointments found</p>
                    <p className="text-xs text-muted-foreground">
                      {statusFilter !== "all" || debouncedSearch
                        ? "Try adjusting your filters or search."
                        : "Create your first appointment to get started."}
                    </p>
                    {statusFilter === "all" && !debouncedSearch && (
                      <Button size="sm" className="mt-2" onClick={() => { setEditingAppointment(undefined); setDuplicateValues(undefined); setFormOpen(true); }}>
                        <Plus className="mr-1 h-3.5 w-3.5" />Create Appointment
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              appointments.map((a: any) => (
                <TableRow
                  key={a.id}
                  className="hover:bg-info/5 cursor-pointer"
                  onClick={() => {
                    setEditingAppointment(a);
                    setDuplicateValues(undefined);
                    setFormOpen(true);
                  }}
                >
                  {visibleColumns.map((vc, idx) => (
                    <TableCell key={vc.id} className={cn(idx === 0 && "sticky left-0 z-10 bg-card")}>
                      {renderCell(vc.id, a, {
                        setEditingAppointment,
                        setDuplicateValues,
                        setFormOpen,
                      }, agencyTz)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Showing {totalCount === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount} {totalCount === 1 ? "entry" : "entries"}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="h-3 w-3" />
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <AppointmentFormDialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) {
            setDuplicateValues(undefined);
            setEditingAppointment(undefined);
          }
        }}
        initialValues={duplicateValues}
        editingAppointment={editingAppointment}
      />
    </div>
  );
}
