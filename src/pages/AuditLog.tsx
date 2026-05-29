import { useState, useMemo, useEffect } from "react";
import { useAuditLog } from "@/hooks/useAuditLog";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { History, Eye, Download, Filter, X, CalendarIcon, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgencyTimezone } from "@/hooks/useAgencyTimezone";
import { formatDateTimeInTz } from "@/lib/agency-timezone";
import { getStatusLabel } from "@/lib/status-labels";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const ACTION_COLORS: Record<string, string> = {
  INSERT: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  UPDATE: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  DELETE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  override_conflict: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
};

const ACTION_LABELS: Record<string, string> = {
  INSERT: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted",
  override_conflict: "Override",
};

const FRIENDLY_FIELDS: Record<string, string> = {
  status: "Status",
  interpreter_id: "Interpreter",
  scheduled_start: "Start Time",
  scheduled_end: "End Time",
  customer_id: "Customer",
  location_id: "Location",
  language_id: "Language",
  modality: "Modality",
  title: "Title",
  description: "Description",
  notes: "Notes",
  parking_cost: "Parking Cost",
  signature_data: "Signature",
  signature_timestamp: "Signature Time",
  actual_start: "Actual Start",
  actual_end: "Actual End",
  requester_notes: "Requester Notes",
  interpreter_notes: "Interpreter Notes",
  agency_notes: "Agency Notes",
  cancellation_reason: "Cancellation Reason",
  requester_id: "Requester",
  patient_client_name: "Patient/Client Name",
  client_reference: "Reference",
  is_self_claimable: "Self-Claimable",
};

const HIDDEN_FIELDS = new Set([
  "updated_at",
  "billing_breakdown",
  "billed_amount",
  "interpreter_pay_amount",
  "gcal_event_id",
  "gcal_sync_status",
  "gcal_last_synced_at",
  "gcal_sync_error",
  "qbo_sync_status",
  "qbo_last_synced_at",
  "source_hash",
  "interpreter_notes_history",
]);

const TIMESTAMP_FIELDS = new Set([
  "scheduled_start",
  "scheduled_end",
  "actual_start",
  "actual_end",
  "cancelled_at",
  "late_cancel_detected_at",
  "signature_timestamp",
  "created_at",
  "updated_at",
]);

const ID_FIELDS = new Set(["interpreter_id", "requester_id", "customer_id", "location_id", "language_id"]);

const PAGE_SIZE = 50;

type LookupMaps = {
  users: Record<string, string>;
  customers: Record<string, string>;
  locations: Record<string, string>;
  languages: Record<string, string>;
};

export default function AuditLog() {
  const agencyTz = useAgencyTimezone();
  const navigate = useNavigate();
  const [actionFilter, setActionFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [page, setPage] = useState(0);
  const [detailEntry, setDetailEntry] = useState<any | null>(null);

  const [committed, setCommitted] = useState({
    action: "all",
    search: "",
    dateFrom: undefined as Date | undefined,
    dateTo: undefined as Date | undefined,
  });

  const applyFilters = () => {
    setPage(0);
    setCommitted({ action: actionFilter, search, dateFrom, dateTo });
  };

  const hasActiveFilters = committed.action !== "all" || committed.search || committed.dateFrom || committed.dateTo;

  const clearFilters = () => {
    setActionFilter("all");
    setSearch("");
    setDateFrom(undefined);
    setDateTo(undefined);
    setPage(0);
    setCommitted({ action: "all", search: "", dateFrom: undefined, dateTo: undefined });
  };

  const { data, isFetching } = useAuditLog({
    action: committed.action === "all" ? undefined : committed.action,
    search: committed.search || undefined,
    dateFrom: committed.dateFrom?.toISOString(),
    dateTo: committed.dateTo?.toISOString(),
    page,
    pageSize: PAGE_SIZE,
  });

  const entries = data?.rows ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Collect referenced IDs across all entries on this page for batch lookup
  const referencedIds = useMemo(() => {
    const userIds = new Set<string>();
    const customerIds = new Set<string>();
    const locationIds = new Set<string>();
    const languageIds = new Set<string>();
    for (const e of entries) {
      for (const snap of [e.old_data, e.new_data]) {
        if (!snap) continue;
        if (snap.interpreter_id) userIds.add(snap.interpreter_id);
        if (snap.requester_id) userIds.add(snap.requester_id);
        if (snap.customer_id) customerIds.add(snap.customer_id);
        if (snap.location_id) locationIds.add(snap.location_id);
        if (snap.language_id) languageIds.add(snap.language_id);
      }
    }
    return {
      users: [...userIds],
      customers: [...customerIds],
      locations: [...locationIds],
      languages: [...languageIds],
    };
  }, [entries]);

  const { data: lookups } = useQuery<LookupMaps>({
    queryKey: ["audit-log-lookups", referencedIds],
    enabled:
      referencedIds.users.length +
        referencedIds.customers.length +
        referencedIds.locations.length +
        referencedIds.languages.length >
      0,
    queryFn: async () => {
      const [u, c, l, lang] = await Promise.all([
        referencedIds.users.length
          ? supabase.from("profiles").select("id, first_name, last_name").in("id", referencedIds.users)
          : Promise.resolve({ data: [] as any[] }),
        referencedIds.customers.length
          ? supabase.from("customers").select("id, name").in("id", referencedIds.customers)
          : Promise.resolve({ data: [] as any[] }),
        referencedIds.locations.length
          ? supabase.from("locations").select("id, name").in("id", referencedIds.locations)
          : Promise.resolve({ data: [] as any[] }),
        referencedIds.languages.length
          ? supabase.from("languages").select("id, name").in("id", referencedIds.languages)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const users: Record<string, string> = {};
      for (const p of (u.data ?? []) as any[]) {
        users[p.id] = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unknown";
      }
      const customers: Record<string, string> = {};
      for (const x of (c.data ?? []) as any[]) customers[x.id] = x.name;
      const locations: Record<string, string> = {};
      for (const x of (l.data ?? []) as any[]) locations[x.id] = x.name;
      const languages: Record<string, string> = {};
      for (const x of (lang.data ?? []) as any[]) languages[x.id] = x.name;
      return { users, customers, locations, languages };
    },
  });

  const maps: LookupMaps = lookups ?? { users: {}, customers: {}, locations: {}, languages: {} };

  const formatValue = (field: string, value: any): string => {
    if (value === null || value === undefined || value === "") return "—";
    if (field === "signature_data") return value ? "[signature image]" : "—";
    if (field === "status") return getStatusLabel(value, "agency_admin");
    if (field === "interpreter_id" || field === "requester_id") {
      return maps.users[value] || String(value).slice(0, 8);
    }
    if (field === "customer_id") return maps.customers[value] || String(value).slice(0, 8);
    if (field === "location_id") return maps.locations[value] || String(value).slice(0, 8);
    if (field === "language_id") return maps.languages[value] || String(value).slice(0, 8);
    if (TIMESTAMP_FIELDS.has(field)) {
      try {
        return formatDateTimeInTz(value, agencyTz);
      } catch {
        return String(value);
      }
    }
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const summarizeChanges = (entry: any): string => {
    if (entry.action === "INSERT") return "Created";
    if (entry.action === "DELETE") return "Deleted";
    const fields = (entry.changed_fields ?? [])
      .filter((f: string) => !HIDDEN_FIELDS.has(f))
      .map((f: string) => FRIENDLY_FIELDS[f] || f);
    if (fields.length === 0) return "Updated (metadata only)";
    if (fields.length <= 3) return fields.join(", ");
    return `${fields.slice(0, 3).join(", ")} +${fields.length - 3} more`;
  };

  const getAppointmentLabel = (entry: any): string => {
    const title = entry.new_data?.title || entry.old_data?.title;
    if (title) return title;
    if (entry.appointment_id) return `Appt ${String(entry.appointment_id).slice(0, 6).toUpperCase()}`;
    return "—";
  };

  const goToAppointment = (entry: any) => {
    if (!entry.appointment_id) return;
    navigate(`/appointments?edit=${entry.appointment_id}`);
  };

  const exportCSV = () => {
    const headers = ["When", "Action", "Appointment", "Changed By", "Changes"];
    const rows = entries.map((e) => [
      formatDateTimeInTz(e.created_at, agencyTz),
      e.action,
      getAppointmentLabel(e),
      e.changed_by_name ?? "System",
      summarizeChanges(e),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="h-6 w-6" /> Audit Log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track every appointment change automatically • Times shown in agency timezone ({agencyTz})
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={entries.length === 0} className="gap-1.5">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters</span>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto h-7 text-xs gap-1">
                <X className="h-3 w-3" /> Clear all
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="INSERT">Created</SelectItem>
                <SelectItem value="UPDATE">Updated</SelectItem>
                <SelectItem value="DELETE">Deleted</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder="Search appointment title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              className="h-9 text-sm"
            />

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-9 text-sm justify-start font-normal", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {dateFrom ? format(dateFrom, "MMM d, yyyy") : "From date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-9 text-sm justify-start font-normal", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {dateTo ? format(dateTo, "MMM d, yyyy") : "To date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>

            <Button onClick={applyFilters} size="sm" className="h-9">
              Apply Filters
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {totalCount} total {totalCount === 1 ? "entry" : "entries"}{hasActiveFilters ? " matching filters" : ""}
          </p>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Appointment</TableHead>
                <TableHead>Changed By</TableHead>
                <TableHead>Changes</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {isFetching ? "Loading…" : hasActiveFilters ? "No entries match your filters" : "No audit entries yet. Changes to appointments will appear here automatically."}
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => {
                  const apptLabel = getAppointmentLabel(entry);
                  const canLink = !!entry.appointment_id;
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTimeInTz(entry.created_at, agencyTz)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={ACTION_COLORS[entry.action] ?? ""}>
                          {entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium max-w-[220px]">
                        {canLink ? (
                          <button
                            type="button"
                            onClick={() => goToAppointment(entry)}
                            className="text-primary hover:underline inline-flex items-center gap-1 truncate max-w-full"
                            title={apptLabel}
                          >
                            <span className="truncate">{apptLabel}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </button>
                        ) : (
                          <span className="text-muted-foreground">{apptLabel}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{entry.changed_by_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[280px] truncate" title={summarizeChanges(entry)}>
                        {summarizeChanges(entry)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => setDetailEntry(entry)} title="View change detail">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 0 || isFetching} onClick={() => setPage((p) => p - 1)} className="gap-1">
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1 || isFetching} onClick={() => setPage((p) => p + 1)} className="gap-1">
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!detailEntry} onOpenChange={(o) => !o && setDetailEntry(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Change Detail</DialogTitle>
            <DialogDescription>
              {detailEntry && formatDateTimeInTz(detailEntry.created_at, agencyTz)}
              {" — "}
              {detailEntry?.changed_by_name}
            </DialogDescription>
          </DialogHeader>
          {detailEntry && (
            <div className="space-y-4">
              <div className="flex gap-2 items-center justify-between flex-wrap">
                <div className="flex gap-2 items-center">
                  <Badge variant="secondary" className={ACTION_COLORS[detailEntry.action] ?? ""}>
                    {detailEntry.action}
                  </Badge>
                  <span className="text-sm font-medium">{getAppointmentLabel(detailEntry)}</span>
                </div>
                {detailEntry.appointment_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => {
                      goToAppointment(detailEntry);
                      setDetailEntry(null);
                    }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open Appointment
                  </Button>
                )}
              </div>

              {detailEntry.action === "override_conflict" && detailEntry.new_data && (
                <div className="rounded-md border border-warning/40 bg-warning/10 p-3 space-y-1">
                  <div className="text-sm font-semibold">Conflict Override</div>
                  {detailEntry.new_data.reason && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Reason: </span>
                      <span>{detailEntry.new_data.reason}</span>
                    </div>
                  )}
                  {detailEntry.new_data.conflicting_entity_type && (
                    <div className="text-xs text-muted-foreground">
                      Conflicted with: {detailEntry.new_data.conflicting_entity_type}
                      {detailEntry.new_data.conflict_start && (
                        <> ({formatDateTimeInTz(detailEntry.new_data.conflict_start, agencyTz)}
                        {detailEntry.new_data.conflict_end && <> – {formatDateTimeInTz(detailEntry.new_data.conflict_end, agencyTz, { timeOnly: true })}</>})
                        </>
                      )}
                    </div>
                  )}
                  {detailEntry.new_data.conflicting_entity_id && (
                    <div className="text-xs text-muted-foreground font-mono break-all">
                      ID: {detailEntry.new_data.conflicting_entity_id}
                    </div>
                  )}
                </div>
              )}

              {detailEntry.action === "UPDATE" && detailEntry.changed_fields?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Changed Fields</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>Before</TableHead>
                        <TableHead>After</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailEntry.changed_fields
                        .filter((f: string) => !HIDDEN_FIELDS.has(f))
                        .map((field: string) => (
                          <TableRow key={field}>
                            <TableCell className="font-medium align-top">{FRIENDLY_FIELDS[field] || field}</TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[220px] break-words align-top">
                              {formatValue(field, detailEntry.old_data?.[field])}
                            </TableCell>
                            <TableCell className="text-sm max-w-[220px] break-words align-top">
                              {formatValue(field, detailEntry.new_data?.[field])}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {detailEntry.action === "INSERT" && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Created With</h4>
                  <div className="border rounded-md divide-y text-xs">
                    {Object.entries(detailEntry.new_data ?? {})
                      .filter(([k]) => !HIDDEN_FIELDS.has(k))
                      .map(([k, v]) => (
                        <div key={k} className="grid grid-cols-[140px_1fr] gap-2 px-3 py-1.5">
                          <span className="text-muted-foreground">{FRIENDLY_FIELDS[k] || k}</span>
                          <span className="break-words">{formatValue(k, v)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {detailEntry.action === "DELETE" && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Deleted Data</h4>
                  <div className="border rounded-md divide-y text-xs">
                    {Object.entries(detailEntry.old_data ?? {})
                      .filter(([k]) => !HIDDEN_FIELDS.has(k))
                      .map(([k, v]) => (
                        <div key={k} className="grid grid-cols-[140px_1fr] gap-2 px-3 py-1.5">
                          <span className="text-muted-foreground">{FRIENDLY_FIELDS[k] || k}</span>
                          <span className="break-words">{formatValue(k, v)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
