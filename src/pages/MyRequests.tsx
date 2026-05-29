import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAgencySettings } from "@/hooks/useAgencySettings";
import { useAppointments, useAppointmentMutations, useCustomers, useLocations, useLocationMutations } from "@/hooks/useAgencyData";
import { useAuth } from "@/contexts/AuthContext";
import { useRequestorLocations } from "@/hooks/useCustomerRequestors";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, XCircle, Download, CalendarIcon, Navigation, MapPin, MessageSquare, Plus } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { useAgencyTimezone } from "@/hooks/useAgencyTimezone";
import { formatDateTimeInTz, utcToLocalParts, localToUtcIso } from "@/lib/agency-timezone";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ColumnLayoutEditor, useColumnLayout, type ColumnDef } from "@/components/appointments/ColumnLayoutEditor";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { RequestDetailDialog } from "@/components/appointments/RequestDetailDialog";
import { statusBadgeColors } from "@/lib/status-colors";
import { getStatusLabel } from "@/lib/status-labels";
import { supabase } from "@/integrations/supabase/client";
import { resolveGroupToStatuses, getGroupLabel } from "@/lib/dashboard-tile-groups";
import { resolveRate, type BillingRateRecord } from "@/lib/billing-engine";
import { useBillingRates } from "@/hooks/useBillingData";
import { getAppointmentLabel } from "@/hooks/useAgencyData";

const REQUESTER_STATUSES = [
  "requested", "requested_last_minute",
  "interpreter_assigned", "interpreter_assigned_last_minute",
  "interpreter_confirmed", "in_progress",
  "completed", "completed_last_minute",
  "cancelled", "late_cancel_no_show_client",
];

const TERMINAL_STATUSES = ["cancelled", "late_cancel_no_show_client", "completed", "completed_last_minute"];

const ALL_COLUMNS: ColumnDef[] = [
  { id: "view", label: "ID", minWidth: "w-16" },
  { id: "date", label: "Date", minWidth: "w-24" },
  { id: "status", label: "Status" },
  { id: "requested_by", label: "Requested By" },
  { id: "category", label: "Category" },
  { id: "location", label: "At" },
  { id: "client", label: "Customer" },
  { id: "start", label: "Start", minWidth: "w-20" },
  { id: "end", label: "End", minWidth: "w-20" },
  { id: "language", label: "Language" },
  { id: "modality", label: "Modality", defaultVisible: false },
  { id: "actions", label: "", minWidth: "w-10" },
];

type DatePreset = "today" | "week" | "month" | "all" | "custom";

/* ── helpers ── */

async function getAdminSchedulerIds(agencyId: string, excludeUserId: string): Promise<string[]> {
  const { data } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .eq("agency_id", agencyId)
    .in("role", ["agency_admin", "scheduler"]);
  if (!data) return [];
  return [...new Set(data.map((r: any) => r.user_id).filter((id: string) => id !== excludeUserId))];
}

async function sendLocationChangeNotifications(
  agencyId: string,
  currentUserId: string,
  appt: any,
  newLocationName: string,
) {
  const title = getAppointmentLabel(appt);
  const message = `Location changed for appointment: ${title} — new location: ${newLocationName}`;
  const payload = {
    channel: "in_app" as const,
    type: "location_changed",
    title: "Location Changed",
    message,
    related_entity_type: "appointment",
    related_entity_id: appt.id,
  };

  const targets: string[] = [];

  // Notify interpreter if assigned
  if (appt.interpreter_id && appt.interpreter_id !== currentUserId) {
    targets.push(appt.interpreter_id);
  }

  // Notify admin/schedulers
  const adminIds = await getAdminSchedulerIds(agencyId, currentUserId);
  targets.push(...adminIds);

  const unique = [...new Set(targets)];
  await Promise.allSettled(
    unique.map((id) =>
      supabase.functions.invoke("send-notification", { body: { ...payload, target_user_id: id } }),
    ),
  );
}

/* ── component ── */

export default function MyRequests() {
  const navigate = useNavigate();
  const agencyTz = useAgencyTimezone();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile, user } = useAuth();
  const [search, setSearch] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);
  const initialStatus = searchParams.get("status") || "all";
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const groupParam = searchParams.get("group");
  const groupStatuses = resolveGroupToStatuses(groupParam);
  const { columns, visibleColumns, toggleColumn, moveColumn, resetToDefaults } = useColumnLayout(ALL_COLUMNS);
  const colMap = Object.fromEntries(ALL_COLUMNS.map((c) => [c.id, c]));

  const [selectedAppointment, setSelectedAppointment] = useState<any | null>(null);
  const customerId = profile?.customer_id;
  const { data: appointments = [], isLoading } = useAppointments({ status: statusFilter, customerId: customerId || undefined });

  // Auto-open detail dialog when ?appointment=ID is in the URL (e.g. clicked from a notification)
  const apptParam = searchParams.get("appointment");
  useEffect(() => {
    if (!apptParam || !appointments.length) return;
    const found = (appointments as any[]).find((a) => a.id === apptParam);
    if (found && (!selectedAppointment || selectedAppointment.id !== apptParam)) {
      setSelectedAppointment(found);
      searchParams.delete("appointment");
      setSearchParams(searchParams, { replace: true });
    }
  }, [apptParam, appointments]);

  const { update } = useAppointmentMutations();
  const { data: customers = [] } = useCustomers();
  const { data: billingRates = [] } = useBillingRates();

  // Location editing
  const { data: accessibleLocations } = useRequestorLocations(customerId);
  const { data: allLocations = [] } = useLocations(customerId);
  const availableLocations = useMemo(() => accessibleLocations ?? allLocations, [accessibleLocations, allLocations]);
  const [locationDialogAppt, setLocationDialogAppt] = useState<any | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [locPopoverOpen, setLocPopoverOpen] = useState(false);
  const [locSearch, setLocSearch] = useState("");
  const [newLocOpen, setNewLocOpen] = useState(false);
  const [newLocForm, setNewLocForm] = useState({ name: "", address_line1: "", city: "", state: "", zip_code: "" });
  const locationMutations = useLocationMutations();

  // Notes editing
  const [notesDialogAppt, setNotesDialogAppt] = useState<any | null>(null);
  const [notesValue, setNotesValue] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Cancel dialogs
  const [cancelApptId, setCancelApptId] = useState<string | null>(null);
  const [lateCancelAppt, setLateCancelAppt] = useState<any | null>(null);
  const [lateCancelHours, setLateCancelHours] = useState(0);

  const customerName = useMemo(() => {
    if (!profile?.customer_id) return null;
    const c = customers.find((c: any) => c.id === profile.customer_id);
    return c?.name ?? null;
  }, [customers, profile?.customer_id]);

  // Agency-timezone-aware date range for presets
  const dateRange = useMemo(() => {
    const now = new Date();
    const todayParts = utcToLocalParts(now.toISOString(), agencyTz);
    const todayDate = todayParts.date; // yyyy-MM-dd
    if (!todayDate) return null; // fallback handled below

    const [year, month, day] = todayDate.split("-").map(Number);
    const localDate = new Date(year, month - 1, day);

    let fromDate: string;
    let toDate: string;

    switch (datePreset) {
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
      case "custom":
        if (!customFrom || !customTo) return null;
        fromDate = format(customFrom, "yyyy-MM-dd");
        toDate = format(customTo, "yyyy-MM-dd");
        break;
      default:
        return null; // "all" — no date filter
    }

    const fromUtc = localToUtcIso(fromDate, "00:00", agencyTz) || startOfDay(now).toISOString();
    const toUtc = localToUtcIso(toDate, "23:59", agencyTz) || endOfDay(now).toISOString();
    return { from: fromUtc, to: toUtc };
  }, [datePreset, customFrom, customTo, agencyTz]);

  const filteredAppointments = useMemo(() => {
    let list = (appointments as any[]).filter((a) => {
      if (!customerId) return a.requester_id === profile?.id;
      return true;
    });

    if (dateRange) {
      list = list.filter((a) => {
        if (!a.scheduled_start) return false;
        return a.scheduled_start >= dateRange.from && a.scheduled_start <= dateRange.to;
      });
    }

    if (groupStatuses) {
      list = list.filter((a) => groupStatuses.includes(a.status));
    } else if (statusFilter !== "all") {
      list = list.filter((a) => a.status === statusFilter);
    }

    if (search) {
      const s = search.toLowerCase();
      list = list.filter((a) =>
        a.title?.toLowerCase().includes(s) ||
        a.customers?.name?.toLowerCase().includes(s) ||
        a.languages?.name?.toLowerCase().includes(s) ||
        a.locations?.name?.toLowerCase().includes(s) ||
        `${a.requester?.first_name ?? ""} ${a.requester?.last_name ?? ""}`.toLowerCase().includes(s) ||
        `${a.interpreter?.first_name ?? ""} ${a.interpreter?.last_name ?? ""}`.toLowerCase().includes(s)
      );
    }

    list.sort((a, b) => {
      const da = a.scheduled_start ? new Date(a.scheduled_start).getTime() : 0;
      const db = b.scheduled_start ? new Date(b.scheduled_start).getTime() : 0;
      return db - da;
    });

    return list;
  }, [appointments, profile?.id, profile?.customer_id, dateRange, statusFilter, search, groupStatuses]);

  /* ── Cancel logic with late-cancel detection ── */

  const handleCancelClick = (appt: any) => {
    if (!appt.scheduled_start) {
      setCancelApptId(appt.id);
      return;
    }

    const hoursUntilStart = (new Date(appt.scheduled_start).getTime() - Date.now()) / 3_600_000;
    let windowHours = 24; // default
    try {
      const rate = resolveRate(billingRates as BillingRateRecord[], appt.customer_id || null);
      windowHours = rate.cancellation_window_hours ?? 24;
    } catch {
      // No rate found — use default
    }

    if (hoursUntilStart <= windowHours && hoursUntilStart >= 0) {
      setLateCancelAppt(appt);
      setLateCancelHours(windowHours);
    } else {
      setCancelApptId(appt.id);
    }
  };

  // Statuses from which a requester is allowed to cancel
  const CANCELLABLE_STATUSES = [
    "requested", "requested_last_minute",
    "interpreter_assigned", "interpreter_assigned_last_minute",
    "interpreter_confirmed", "reassignment_needed",
  ];

  const handleStandardCancel = async () => {
    if (!cancelApptId) return;
    try {
      const { data, error } = await supabase
        .from("appointments")
        .update({ status: "cancelled" as any, cancellation_reason: "Cancelled by requester", cancelled_at: new Date().toISOString() })
        .eq("id", cancelApptId)
        .in("status", CANCELLABLE_STATUSES as any)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error("This appointment was updated by someone else. Please refresh and try again.");
        setCancelApptId(null);
        queryClient.invalidateQueries({ queryKey: ["appointments"] });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Request cancelled");
      setCancelApptId(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to cancel appointment");
    }
  };

  const handleLateCancel = async () => {
    if (!lateCancelAppt) return;
    const now = new Date().toISOString();
    try {
      const { data, error } = await supabase
        .from("appointments")
        .update({
          status: "late_cancel_no_show_client" as any,
          cancellation_reason: "Late cancellation by requester",
          cancelled_at: now,
          late_cancel_detected_at: now,
        })
        .eq("id", lateCancelAppt.id)
        .in("status", CANCELLABLE_STATUSES as any)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error("This appointment was updated by someone else. Please refresh and try again.");
        setLateCancelAppt(null);
        queryClient.invalidateQueries({ queryKey: ["appointments"] });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Request cancelled (late cancellation)");
      setLateCancelAppt(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to cancel appointment");
    }
  };

  // Requester can only cancel — never set arbitrary status
  const REQUESTER_ALLOWED_STATUSES = ["cancelled", "late_cancel_no_show_client"];

  const handleStatusUpdate = (id: string, status: string) => {
    if (!REQUESTER_ALLOWED_STATUSES.includes(status)) {
      toast.error("You do not have permission to change the appointment status.");
      return;
    }
    const extra: any = { id, status };
    if (status === "cancelled") {
      extra.cancellation_reason = "Cancelled by requester";
      extra.cancelled_at = new Date().toISOString();
    }
    update.mutate(extra, {
      onSuccess: () => { toast.success("Status updated"); setSelectedAppointment(null); },
    });
  };

  /* ── Location change ── */

  const handleOpenLocationDialog = (appt: any) => {
    setLocationDialogAppt(appt);
    setSelectedLocationId(appt.location_id || "");
  };

  const handleSaveLocation = async () => {
    if (!locationDialogAppt || !selectedLocationId) return;
    setSavingLocation(true);
    try {
      let query = supabase
        .from("appointments")
        .update({ location_id: selectedLocationId })
        .eq("id", locationDialogAppt.id);
      // Defense-in-depth: scope by agency_id and customer (shared across requesters)
      if (profile?.agency_id) {
        query = query.eq("agency_id", profile.agency_id);
      }
      if (customerId) {
        query = query.eq("customer_id", customerId);
      }
      const { error } = await query;
      if (error) throw error;

      const newLoc = availableLocations.find((l: any) => l.id === selectedLocationId);
      const locName = newLoc?.name || "Unknown";

      if (profile?.agency_id && user?.id) {
        await sendLocationChangeNotifications(profile.agency_id, user.id, locationDialogAppt, locName);
      }

      // Invalidate appointment queries so UI refreshes immediately
      queryClient.invalidateQueries({ queryKey: ["appointments"] });

      toast.success("Location updated and notifications sent");
      setLocationDialogAppt(null);
    } catch {
      toast.error("Failed to update location");
    } finally {
      setSavingLocation(false);
    }
  };

  const handleAddNewLocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      toast.error("No customer linked to your account");
      return;
    }
    locationMutations.create.mutate(
      {
        customer_id: customerId,
        name: newLocForm.name,
        address_line1: newLocForm.address_line1 || null,
        city: newLocForm.city || null,
        state: newLocForm.state || null,
        zip_code: newLocForm.zip_code || null,
      },
      {
        onSuccess: (data: any) => {
          setSelectedLocationId(data.id);
          setNewLocOpen(false);
          setNewLocForm({ name: "", address_line1: "", city: "", state: "", zip_code: "" });
          toast.success("Location added");
        },
        onError: (err: any) => toast.error(`Failed to add location: ${err.message}`),
      }
    );
  };

  const handleOpenNotesDialog = (appt: any) => {
    setNotesDialogAppt(appt);
    setNotesValue(appt.requester_notes ?? "");
  };

  const handleSaveNotes = async () => {
    if (!notesDialogAppt) return;
    setSavingNotes(true);
    try {
      let query = supabase
        .from("appointments")
        .update({ requester_notes: notesValue || null })
        .eq("id", notesDialogAppt.id);
      // Defense-in-depth: scope by agency_id and customer (shared across requesters)
      if (profile?.agency_id) {
        query = query.eq("agency_id", profile.agency_id);
      }
      if (customerId) {
        query = query.eq("customer_id", customerId);
      }
      const { error } = await query;
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Notes saved");
      setNotesDialogAppt(null);
    } catch {
      toast.error("Failed to save notes");
    } finally {
      setSavingNotes(false);
    }
  };

  /* ── Export ── */

  const exportCSV = () => {
    const headers = ["ID", "Date", "Status", "Requested By", "Category", "Location", "Customer", "Start", "End", "Language"];
    const rows = filteredAppointments.map((a: any) => [
      a.id.slice(0, 6).toUpperCase(),
      a.scheduled_start ? formatDateTimeInTz(a.scheduled_start, agencyTz, { dateOnly: true }) : "",
      getStatusLabel(a.status, "requester"),
      a.requester ? `${a.requester.first_name ?? ""} ${a.requester.last_name ?? ""}`.trim() : "",
      a.description ? "Medical" : "General",
      a.locations?.name ?? "",
      a.customers?.name ?? "",
      a.scheduled_start ? formatDateTimeInTz(a.scheduled_start, agencyTz, { timeOnly: true }) : "",
      a.scheduled_end ? formatDateTimeInTz(a.scheduled_end, agencyTz, { timeOnly: true }) : "",
      a.languages?.name ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `org-requests-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = () => {
    const headers = ["ID", "Date", "Status", "Requested By", "Category", "Location", "Customer", "Start", "End", "Language"];
    const rows = filteredAppointments.map((a: any) => [
      a.id.slice(0, 6).toUpperCase(),
      a.scheduled_start ? formatDateTimeInTz(a.scheduled_start, agencyTz, { dateOnly: true }) : "",
      getStatusLabel(a.status, "requester"),
      a.requester ? `${a.requester.first_name ?? ""} ${a.requester.last_name ?? ""}`.trim() : "",
      a.description ? "Medical" : "General",
      a.locations?.name ?? "",
      a.customers?.name ?? "",
      a.scheduled_start ? formatDateTimeInTz(a.scheduled_start, agencyTz, { timeOnly: true }) : "",
      a.scheduled_end ? formatDateTimeInTz(a.scheduled_end, agencyTz, { timeOnly: true }) : "",
      a.languages?.name ?? "",
    ]);
    const text = [headers, ...rows].map((r) => r.join("\t")).join("\n");
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  /* ── Render cell ── */

  function renderCell(colId: string, a: any) {
    switch (colId) {
      case "view":
        return <span className="text-info font-medium text-sm">{a.id.slice(0, 5).toUpperCase()}</span>;
      case "date":
        return <span className="text-sm whitespace-nowrap">{a.scheduled_start ? formatDateTimeInTz(a.scheduled_start, agencyTz, { dateOnly: true }) : "—"}</span>;
      case "status":
        return <Badge variant="outline" className={`text-xs ${statusBadgeColors[a.status] ?? ""}`}>{getStatusLabel(a.status, "requester")}</Badge>;
      case "requested_by":
        return <span className="text-sm">{a.requester ? `${a.requester.first_name ?? ""} ${a.requester.last_name ?? ""}`.trim() || "—" : "—"}</span>;
      case "category":
        return <span className="text-sm">{a.description ? "Medical" : "General"}</span>;
      case "location": {
        const isVirtual = a.modality === "opi" || a.modality === "vri";
        const virtualLabel = a.modality === "opi" ? "Virtual (Phone)" : a.modality === "vri" ? "Virtual (Video)" : "Virtual";
        return (
          <div className="text-sm">
            <div className="flex items-center gap-1">
              {a.locations?.name ? (
                <span className="text-info">{a.locations.name}</span>
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
      case "start": {
        const startTime = a.actual_start
          ? formatDateTimeInTz(a.actual_start, agencyTz, { timeOnly: true })
          : a.scheduled_start
          ? formatDateTimeInTz(a.scheduled_start, agencyTz, { timeOnly: true })
          : null;
        return (
          <span className="text-sm whitespace-nowrap" title={a.actual_start ? "Actual time recorded by interpreter" : undefined}>
            {startTime ?? "—"}{a.actual_start ? <span className="text-muted-foreground ml-0.5">*</span> : null}
          </span>
        );
      }
      case "end": {
        const endTime = a.actual_end
          ? formatDateTimeInTz(a.actual_end, agencyTz, { timeOnly: true })
          : a.scheduled_end
          ? formatDateTimeInTz(a.scheduled_end, agencyTz, { timeOnly: true })
          : null;
        const isCompleted = ["completed", "completed_last_minute"].includes(a.status);
        return (
          <span className="text-sm whitespace-nowrap" title={a.actual_end ? "Actual time recorded by interpreter" : undefined}>
            {endTime ?? (isCompleted ? "Completed" : "—")}{a.actual_end ? <span className="text-muted-foreground ml-0.5">*</span> : null}
          </span>
        );
      }
      case "language":
        return <span className="text-sm">{a.languages?.name ?? "—"}</span>;
      case "modality":
        return <span className="text-sm capitalize">{a.modality?.replace("_", " ") ?? "—"}</span>;
      case "actions": {
        const isTerminal = TERMINAL_STATUSES.includes(a.status);
        return (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {!isTerminal && (
              <>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Change Location" onClick={() => handleOpenLocationDialog(a)}>
                  <MapPin className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit Notes" onClick={() => handleOpenNotesDialog(a)}>
                  <MessageSquare className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Cancel" onClick={() => handleCancelClick(a)}>
                  <XCircle className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        );
      }
      default:
        return null;
    }
  }

  const pageTitle = customerName ? `${customerName} Requests` : "Organization Requests";

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>

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

      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
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

        {/* Status filter — requester-visible only */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {REQUESTER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{getStatusLabel(s, "requester")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Second row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyToClipboard} className="text-xs h-7">Copy</Button>
          <Button variant="outline" size="sm" onClick={exportCSV} className="text-xs h-7 gap-1">
            <Download className="h-3 w-3" />CSV
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
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search requests..." className="h-8 text-sm pr-8" />
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>

      {/* Table */}
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
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : filteredAppointments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length} className="text-center py-12">
                  <p className="text-muted-foreground">No requests found</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredAppointments.map((a: any) => (
                <TableRow key={a.id} className="hover:bg-info/5 cursor-pointer" onClick={() => setSelectedAppointment(a)}>
                  {visibleColumns.map((vc, idx) => (
                    <TableCell key={vc.id} className={cn(idx === 0 && "sticky left-0 z-10 bg-card")}>
                      {renderCell(vc.id, a)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <RequestDetailDialog
        appointment={selectedAppointment}
        open={!!selectedAppointment}
        onOpenChange={(open) => { if (!open) setSelectedAppointment(null); }}
        onUpdateStatus={handleStatusUpdate}
        isUpdating={update.isPending}
        onCancelClick={(appt) => { setSelectedAppointment(null); handleCancelClick(appt); }}
        onLocationClick={(appt) => { setSelectedAppointment(null); handleOpenLocationDialog(appt); }}
        onNotesClick={(appt) => { setSelectedAppointment(null); handleOpenNotesDialog(appt); }}
      />

      {/* Standard cancel dialog */}
      <AlertDialog open={!!cancelApptId} onOpenChange={(open) => { if (!open) setCancelApptId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Request</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this request? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Request</AlertDialogCancel>
            <AlertDialogAction onClick={handleStandardCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Cancel Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Late cancel warning dialog */}
      <AlertDialog open={!!lateCancelAppt} onOpenChange={(open) => { if (!open) setLateCancelAppt(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="text-destructive">⚠️</span> Late Cancellation Warning
            </AlertDialogTitle>
            <AlertDialogDescription>
              This appointment is within the late cancellation window ({lateCancelHours} hours).
              Cancelling will result in a charge at the full scheduled duration.
              Do you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Appointment</AlertDialogCancel>
            <AlertDialogAction onClick={handleLateCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Cancel Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Location change dialog */}
      <Dialog open={!!locationDialogAppt} onOpenChange={(open) => { if (!open) setLocationDialogAppt(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Location</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="text-sm">Select new location</Label>
            <Popover open={locPopoverOpen} onOpenChange={setLocPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between h-9 text-sm font-normal">
                  {(() => {
                    const sel = availableLocations.find((l: any) => l.id === selectedLocationId);
                    return sel ? (
                      <span className="truncate">{sel.name}{sel.address_line1 ? ` - ${sel.address_line1}` : ""}</span>
                    ) : (
                      <span className="text-muted-foreground">Select location...</span>
                    );
                  })()}
                  <MapPin className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Search locations..." value={locSearch} onValueChange={setLocSearch} />
                  <CommandList>
                    <CommandEmpty>No locations found.</CommandEmpty>
                    <CommandGroup>
                      {availableLocations
                        .filter((l: any) => {
                          if (!locSearch) return true;
                          const q = locSearch.toLowerCase();
                          return l.name?.toLowerCase().includes(q) || l.address_line1?.toLowerCase().includes(q) || l.city?.toLowerCase().includes(q);
                        })
                        .map((loc: any) => (
                          <CommandItem
                            key={loc.id}
                            value={loc.id}
                            onSelect={() => {
                              setSelectedLocationId(loc.id);
                              setLocPopoverOpen(false);
                              setLocSearch("");
                            }}
                          >
                            <span className="text-sm">{loc.name}{loc.address_line1 ? ` - ${loc.address_line1}` : ""}</span>
                          </CommandItem>
                        ))}
                    </CommandGroup>
                    {customerId && (
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => {
                            setLocPopoverOpen(false);
                            setNewLocOpen(true);
                          }}
                          className="text-primary"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add New Location
                        </CommandItem>
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setLocationDialogAppt(null)}>Cancel</Button>
              <Button size="sm" onClick={handleSaveLocation} disabled={savingLocation || !selectedLocationId || selectedLocationId === locationDialogAppt?.location_id}>
                {savingLocation ? "Saving..." : "Update Location"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add New Location Modal */}
      <Dialog open={newLocOpen} onOpenChange={setNewLocOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Location</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddNewLocation} className="space-y-4">
            <div className="space-y-2">
              <Label>Location Name *</Label>
              <Input required value={newLocForm.name} onChange={(e) => setNewLocForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Main Office, Home" />
            </div>
            <div className="space-y-2">
              <Label>Street Address</Label>
              <Input value={newLocForm.address_line1} onChange={(e) => setNewLocForm((f) => ({ ...f, address_line1: e.target.value }))} placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2"><Label>City</Label><Input value={newLocForm.city} onChange={(e) => setNewLocForm((f) => ({ ...f, city: e.target.value }))} /></div>
              <div className="space-y-2"><Label>State</Label><Input value={newLocForm.state} onChange={(e) => setNewLocForm((f) => ({ ...f, state: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Zip</Label><Input value={newLocForm.zip_code} onChange={(e) => setNewLocForm((f) => ({ ...f, zip_code: e.target.value }))} /></div>
            </div>
            <p className="text-xs text-muted-foreground">This location will be saved to your organization's permanent location list.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setNewLocOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={locationMutations.create.isPending}>Add Location</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Notes editing dialog */}
      <Dialog open={!!notesDialogAppt} onOpenChange={(open) => { if (!open) setNotesDialogAppt(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Notes</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              placeholder="Notes visible to interpreter & agency..."
              className="min-h-[80px]"
            />
            <p className="text-xs text-muted-foreground">Visible to the assigned interpreter and agency staff</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setNotesDialogAppt(null)}>Cancel</Button>
              <Button size="sm" onClick={handleSaveNotes} disabled={savingNotes}>
                {savingNotes ? "Saving..." : "Save Notes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
