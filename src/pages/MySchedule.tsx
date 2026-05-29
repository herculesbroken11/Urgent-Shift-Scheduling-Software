import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoData } from "@/contexts/DemoDataContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Clock, MapPin, Globe, Building2, CalendarDays, PenLine, Navigation, X,
  CheckCircle2, XCircle, UserX, RefreshCw, AlertTriangle, MessageSquare, ChevronDown, ChevronUp,
} from "lucide-react";
import { format, isSameDay, startOfMonth, endOfMonth } from "date-fns";
import { useAgencyTimezone } from "@/hooks/useAgencyTimezone";
import { formatDateTimeInTz } from "@/lib/agency-timezone";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { sendCompletionNotification, getAppointmentLabel } from "@/hooks/useAgencyData";
import { useSearchParams } from "react-router-dom";
import { getStatusLabel } from "@/lib/status-labels";
import { resolveGroupToStatuses, getGroupLabel } from "@/lib/dashboard-tile-groups";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { statusCardBorderColors, statusTileColors } from "@/lib/status-colors";
import { CompleteAppointmentDialog } from "@/components/appointments/CompleteAppointmentDialog";
import { useAdaptedQuery, useAdaptedMutation } from "@/lib/data-adapter";

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

async function notifyAdmins(
  agencyId: string,
  excludeUserId: string,
  payload: { type: string; title: string; message: string; related_entity_type?: string; related_entity_id?: string },
) {
  const ids = await getAdminSchedulerIds(agencyId, excludeUserId);
  await Promise.allSettled(
    ids.map((targetId) =>
      supabase.functions.invoke("send-notification", {
        body: { channel: "in_app", target_user_id: targetId, ...payload },
      }),
    ),
  );
}

function hoursUntil(dateStr: string | null): number {
  if (!dateStr) return Infinity;
  return (new Date(dateStr).getTime() - Date.now()) / 3_600_000;
}

/* ── component ── */

export default function MySchedule() {
  const { user, profile } = useAuth();
  const { state, updateItem, enrichAppointment } = useDemoData();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status");
  const groupParam = searchParams.get("group");
  const groupStatuses = resolveGroupToStatuses(groupParam);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [month, setMonth] = useState(new Date());
  const [signingApptId, setSigningApptId] = useState<string | null>(null);
  const [rejectingApptId, setRejectingApptId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [noShowApptId, setNoShowApptId] = useState<string | null>(null);
  const [reassignApptId, setReassignApptId] = useState<string | null>(null);
  const [reassignReason, setReassignReason] = useState("");
  const [selfNoShowApptId, setSelfNoShowApptId] = useState<string | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<Record<string, boolean>>({});
  const agencyTz = useAgencyTimezone();
  const [highlightApptId, setHighlightApptId] = useState<string | null>(null);
  const apptParam = searchParams.get("appointment");

  const interpreterName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "An interpreter";

  const { data: appointments = [], isLoading } = useAdaptedQuery<any[]>({
    queryKey: ["my-schedule", user?.id, month.getMonth(), month.getFullYear()],
    queryFn: async () => {
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const { data, error } = await supabase
        .from("appointments")
        .select("*, customers(name), locations(name, address_line1, city, state, zip_code), languages(name)")
        .eq("agency_id", profile!.agency_id!)
        .eq("interpreter_id", user!.id)
        .eq("is_import_staged", false).eq("is_deleted", false)
        .gte("scheduled_start", start.toISOString())
        .lte("scheduled_start", end.toISOString())
        .not("status", "eq", "cancelled")
        .order("scheduled_start", { ascending: true });
      if (error) throw error;
      return data;
    },
    demoFn: () => {
      return state.appointments
        .filter((a: any) => a.interpreter_id === user?.id && !["cancelled"].includes(a.status))
        .map((a: any) => enrichAppointment(a));
    },
    enabled: !!user && !!profile?.agency_id,
  });

  const signingAppt = useMemo(
    () => appointments.find((a: any) => a.id === signingApptId) || null,
    [appointments, signingApptId],
  );

  // When ?appointment=ID is present (e.g. from a notification), jump the calendar to that
  // appointment's month/date and scroll/highlight the card.
  useEffect(() => {
    if (!apptParam) return;
    let cancelled = false;
    (async () => {
      // First check loaded appointments
      let target: any = (appointments as any[]).find((a) => a.id === apptParam);
      if (!target) {
        // Fetch from DB if not in current month
        const { data } = await supabase
          .from("appointments")
          .select("id, scheduled_start")
          .eq("id", apptParam)
          .maybeSingle();
        target = data;
      }
      if (cancelled || !target?.scheduled_start) return;
      const d = new Date(target.scheduled_start);
      setMonth(d);
      setSelectedDate(d);
      setHighlightApptId(apptParam);
      // Scroll into view after render
      setTimeout(() => {
        const el = document.getElementById(`appt-${apptParam}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 250);
      // Clear the URL param so it doesn't re-trigger
      searchParams.delete("appointment");
      setSearchParams(searchParams, { replace: true });
      // Drop the highlight after a few seconds
      setTimeout(() => setHighlightApptId(null), 3500);
    })();
    return () => { cancelled = true; };
  }, [apptParam]);


  /* ── helpers: fetch fresh appointment row ── */

  async function fetchFreshAppointment(apptId: string) {
    const { data, error } = await supabase
      .from("appointments")
      .select("id, status, custom_fields, interpreter_notes, interpreter_notes_history, title, scheduled_start")
      .eq("id", apptId)
      .single();
    if (error || !data) throw new Error("Could not load appointment. Please refresh and try again.");
    return data;
  }

  /* ── mutations ── */

  const CONFIRMABLE_STATUSES = ["interpreter_assigned", "interpreter_assigned_last_minute"];

  const confirmJob = useAdaptedMutation<string>({
    mutationFn: async (apptId: string) => {
      const { data, error } = await supabase
        .from("appointments")
        .update({ status: "interpreter_confirmed" })
        .eq("id", apptId)
        .in("status", CONFIRMABLE_STATUSES as any)
        .select("id, title, scheduled_start");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("This appointment was already updated. Please refresh and try again.");
      }
      const fresh = data[0];
      await notifyAdmins(profile!.agency_id!, user!.id, {
        type: "interpreter_confirmed",
        title: "Assignment Confirmed",
        message: `Interpreter ${interpreterName} confirmed appointment: ${getAppointmentLabel(fresh)}`,
        related_entity_type: "appointment",
        related_entity_id: apptId,
      });
    },
    demoFn: (apptId: string) => {
      updateItem("appointments", apptId, { status: "interpreter_confirmed" });
    },
    invalidateKeys: [["my-schedule"], ["appointments"]],
    successMessage: "Assignment confirmed!",
  });

  const rejectJob = useAdaptedMutation<string>({
    mutationFn: async (apptId: string) => {
      // Fetch fresh row to avoid stale closure reads for custom_fields
      const fresh = await fetchFreshAppointment(apptId);
      const isLM = fresh.status === "interpreter_assigned_last_minute";
      // If the interpreter had already confirmed (or appointment is in progress),
      // route to reassignment_needed instead of dumping back to unassigned requests.
      const wasConfirmed =
        fresh.status === "interpreter_confirmed" || fresh.status === "in_progress";
      const newStatus = wasConfirmed
        ? "reassignment_needed"
        : isLM
        ? "requested_last_minute"
        : "requested";
      const existing = (fresh.custom_fields as Record<string, any>) || {};
      const rejectionHistory = Array.isArray(existing.rejection_history) ? [...existing.rejection_history] : [];
      rejectionHistory.push({
        interpreter_name: interpreterName,
        interpreter_id: user!.id,
        rejected_at: new Date().toISOString(),
        reason: rejectReason.trim() || null,
        prior_status: fresh.status,
      });

      const { error } = await supabase.from("appointments").update({
        status: newStatus,
        interpreter_id: null,
        custom_fields: { ...existing, rejection_history: rejectionHistory },
      }).eq("id", apptId);
      if (error) throw error;

      await notifyAdmins(profile!.agency_id!, user!.id, {
        type: "interpreter_rejected",
        title: wasConfirmed ? "Reassignment Needed" : "Assignment Declined",
        message: `Interpreter ${interpreterName} ${wasConfirmed ? "withdrew from confirmed" : "declined"} appointment: ${getAppointmentLabel(fresh)}${rejectReason.trim() ? `. Reason: ${rejectReason.trim()}` : ""}`,
        related_entity_type: "appointment",
        related_entity_id: apptId,
      });
    },
    demoFn: (apptId: string) => {
      updateItem("appointments", apptId, { status: "requested", interpreter_id: null });
    },
    invalidateKeys: [["my-schedule"], ["appointments"]],
    onSuccess: () => {
      toast.success("Assignment declined. The agency has been notified.");
      setRejectingApptId(null);
      setRejectReason("");
    },
    errorTitle: "Error",
  });

  const reassignJob = useAdaptedMutation<string>({
    mutationFn: async (apptId: string) => {
      // Fetch fresh row to avoid stale closure reads for notes history
      const fresh = await fetchFreshAppointment(apptId);
      const existingHistory = Array.isArray(fresh.interpreter_notes_history) ? [...(fresh.interpreter_notes_history as any[])] : [];
      const currentNotes = (fresh.interpreter_notes as string) || "";
      if (currentNotes.trim()) {
        existingHistory.push({
          interpreter_name: interpreterName,
          interpreter_id: user!.id,
          notes: currentNotes,
          timestamp: new Date().toISOString(),
        });
      }

      const { error } = await supabase.from("appointments").update({
        status: "reassignment_needed",
        interpreter_id: null,
        interpreter_notes: null,
        interpreter_notes_history: existingHistory,
      }).eq("id", apptId);
      if (error) throw error;

      await notifyAdmins(profile!.agency_id!, user!.id, {
        type: "reassignment_needed",
        title: "Reassignment Requested",
        message: `Interpreter ${interpreterName} requested reassignment for: ${getAppointmentLabel(fresh)}${reassignReason.trim() ? `. Reason: ${reassignReason.trim()}` : ""}`,
        related_entity_type: "appointment",
        related_entity_id: apptId,
      });
    },
    demoFn: (apptId: string) => {
      updateItem("appointments", apptId, { status: "reassignment_needed", interpreter_id: null, interpreter_notes: null });
    },
    invalidateKeys: [["my-schedule"], ["appointments"]],
    onSuccess: () => {
      toast.success("Reassignment requested. The agency has been notified.");
      setReassignApptId(null);
      setReassignReason("");
    },
    errorTitle: "Error",
  });

  const NO_SHOW_CLIENT_STATUSES = ["in_progress", "interpreter_confirmed"];

  const noShowJob = useAdaptedMutation<string>({
    mutationFn: async (apptId: string) => {
      const { data, error } = await supabase
        .from("appointments")
        .update({ status: "late_cancel_no_show_client" })
        .eq("id", apptId)
        .in("status", NO_SHOW_CLIENT_STATUSES as any)
        .select("id, title, scheduled_start");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("This appointment was already updated. Please refresh and try again.");
      }
      const fresh = data[0];
      await notifyAdmins(profile!.agency_id!, user!.id, {
        type: "client_no_show",
        title: "Client No-Show",
        message: `Interpreter ${interpreterName} reported client no-show for: ${getAppointmentLabel(fresh)}`,
        related_entity_type: "appointment",
        related_entity_id: apptId,
      });
    },
    demoFn: (apptId: string) => {
      updateItem("appointments", apptId, { status: "late_cancel_no_show_client" });
    },
    invalidateKeys: [["my-schedule"], ["appointments"]],
    onSuccess: () => {
      toast.success("Marked as client no-show. The agency has been notified.");
      setNoShowApptId(null);
    },
    errorTitle: "Error",
  });

  const SELF_NO_SHOW_STATUSES = ["interpreter_confirmed", "in_progress"];

  const selfNoShowJob = useAdaptedMutation<string>({
    mutationFn: async (apptId: string) => {
      const { data, error } = await supabase
        .from("appointments")
        .update({ status: "no_show_interpreter" })
        .eq("id", apptId)
        .in("status", SELF_NO_SHOW_STATUSES as any)
        .select("id, title, scheduled_start");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("This appointment was already updated. Please refresh and try again.");
      }
      const fresh = data[0];
      await notifyAdmins(profile!.agency_id!, user!.id, {
        type: "interpreter_no_show_self_report",
        title: "Interpreter No-Show (Self-Reported)",
        message: `Interpreter ${interpreterName} self-reported no-show for: ${getAppointmentLabel(fresh)}`,
        related_entity_type: "appointment",
        related_entity_id: apptId,
      });
    },
    demoFn: (apptId: string) => {
      updateItem("appointments", apptId, { status: "no_show_interpreter" });
    },
    invalidateKeys: [["my-schedule"], ["appointments"]],
    onSuccess: () => {
      toast.success("No-show reported. The agency has been notified.");
      setSelfNoShowApptId(null);
    },
    errorTitle: "Error",
  });

  const queryClient = useQueryClient();
  const saveInterpreterNotes = async (apptId: string, notes: string) => {
    setSavingNotes((p) => ({ ...p, [apptId]: true }));
    try {
      let query = supabase.from("appointments").update({ interpreter_notes: notes }).eq("id", apptId);
      // Defense-in-depth: scope by interpreter_id
      if (user?.id) {
        query = query.eq("interpreter_id", user.id);
      }
      const { error } = await query;
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["my-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Notes saved");
    } catch {
      toast.error("Failed to save notes");
    } finally {
      setSavingNotes((p) => ({ ...p, [apptId]: false }));
    }
  };

  /* ── filtering ── */

  const filteredAppointments = groupStatuses
    ? appointments.filter((a: any) => groupStatuses.includes(a.status))
    : statusFilter
    ? appointments.filter((a: any) => a.status === statusFilter)
    : appointments;

  const datesWithAppts = new Set(
    filteredAppointments.map((a: any) => format(new Date(a.scheduled_start), "yyyy-MM-dd")),
  );

  const displayAppointments = groupStatuses || statusFilter
    ? [...filteredAppointments].sort((a: any, b: any) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime())
    : filteredAppointments.filter((a: any) => isSameDay(new Date(a.scheduled_start), selectedDate));

  const getDirectionsUrl = (loc: any) => {
    if (!loc) return null;
    const parts = [loc.address_line1, loc.city, loc.state, loc.zip_code].filter(Boolean).join(", ");
    if (!parts) return null;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(parts)}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Schedule</h1>
        <p className="text-muted-foreground">Your assigned appointments and upcoming jobs</p>
      </div>

      {(statusFilter || groupParam) && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtered by:</span>
          <Badge variant="secondary" className="gap-1">
            {groupParam ? getGroupLabel(groupParam) : getStatusLabel(statusFilter!, "interpreter")}
            <button onClick={() => setSearchParams({})} className="ml-0.5 hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <Card>
          <CardContent className="p-3">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => d && setSelectedDate(d)}
              month={month}
              onMonthChange={setMonth}
              modifiers={{ hasAppt: (date) => datesWithAppts.has(format(date, "yyyy-MM-dd")) }}
              modifiersClassNames={{
                hasAppt: statusFilter && statusTileColors[statusFilter]
                  ? `${statusTileColors[statusFilter]} font-bold`
                  : "bg-primary/15 font-bold text-primary",
              }}
            />
          </CardContent>
        </Card>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            {groupParam
              ? <span>{getGroupLabel(groupParam)} Appointments</span>
              : statusFilter
              ? <span>{getStatusLabel(statusFilter, "interpreter")} Appointments</span>
              : format(selectedDate, "EEEE, MMMM d, yyyy")}
            <Badge variant="secondary">{displayAppointments.length} job{displayAppointments.length !== 1 ? "s" : ""}</Badge>
          </h2>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : displayAppointments.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {statusFilter ? `No ${statusFilter.replace(/_/g, " ")} appointments` : "No appointments on this day"}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {displayAppointments.map((appt: any) => {
                const cf = (appt.custom_fields as Record<string, any>) || {};
                const directionsUrl = getDirectionsUrl(appt.locations);
                const isSigned = cf.signature_captured;
                const hrs = hoursUntil(appt.scheduled_start);

                const canConfirm = ["interpreter_assigned", "interpreter_assigned_last_minute"].includes(appt.status);
                const canReject = ["interpreter_assigned", "interpreter_assigned_last_minute"].includes(appt.status);
                // Complete & Sign is only available after the interpreter has accepted the
                // assignment (confirmed or in-progress). New assignments must be Accepted/Rejected first.
                const canSign =
                  ["in_progress", "interpreter_confirmed"].includes(appt.status);
                const canClientNoShow = appt.status === "in_progress";
                const canRequestReassignment = appt.status === "interpreter_confirmed" && hrs >= 48;
                const showWithin48hNote = appt.status === "interpreter_confirmed" && hrs < 48;
                const canSelfReportNoShow = ["interpreter_confirmed", "in_progress"].includes(appt.status);

                const isNotesOpen = expandedNotes[appt.id] ?? false;

                return (
                  <Card key={appt.id} id={`appt-${appt.id}`} className={cn("border-l-4 scroll-mt-24", statusCardBorderColors[appt.status] || "", highlightApptId === appt.id && "ring-2 ring-primary")}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">{appt.title || "Appointment"}</h3>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{getStatusLabel(appt.status, "interpreter")}</Badge>
                        </div>
                      </div>

                      {appt.scheduled_start && (
                        <p className="text-sm flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {statusFilter
                            ? formatDateTimeInTz(appt.scheduled_start, agencyTz)
                            : formatDateTimeInTz(appt.scheduled_start, agencyTz, { timeOnly: true })}
                          {appt.scheduled_end && ` – ${formatDateTimeInTz(appt.scheduled_end, agencyTz, { timeOnly: true })}`}
                        </p>
                      )}

                      {appt.modality && (
                        <p className="text-sm flex items-center gap-1.5 text-muted-foreground">
                          <Globe className="h-3.5 w-3.5" />
                          {appt.modality === "on_site" ? "On-Site" : appt.modality === "opi" ? "OPI (Phone)" : appt.modality === "vri" ? "VRI (Video)" : appt.modality}
                        </p>
                      )}

                      {appt.customers?.name && (
                        <p className="text-sm flex items-center gap-1.5 text-muted-foreground">
                          <Building2 className="h-3.5 w-3.5" />{appt.customers.name}
                        </p>
                      )}

                      {cf.patient_name && (
                        <p className="text-sm flex items-center gap-1.5 text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5" />Patient/Client: {cf.patient_name}
                        </p>
                      )}

                      {cf.client_name && (
                        <p className="text-sm flex items-center gap-1.5 text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5" />Patient/Client: {cf.client_name}
                        </p>
                      )}

                      {cf.provider && (
                        <p className="text-sm flex items-center gap-1.5 text-muted-foreground">
                          <Building2 className="h-3.5 w-3.5" />Provider: {cf.provider}
                        </p>
                      )}

                      {appt.languages?.name && (
                        <p className="text-sm flex items-center gap-1.5 text-muted-foreground">
                          <Globe className="h-3.5 w-3.5" />{appt.languages.name}
                        </p>
                      )}

                      {appt.locations ? (
                        <p className="text-sm flex items-center gap-1.5 text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" />
                          {appt.locations.name}
                          {appt.locations.address_line1 && `, ${appt.locations.address_line1}`}
                          {appt.locations.city && `, ${appt.locations.city}`}
                          {appt.locations.state && `, ${appt.locations.state}`}
                          {appt.locations.zip_code && ` ${appt.locations.zip_code}`}
                        </p>
                      ) : (appt.modality === "opi" || appt.modality === "vri") && (
                        <p className="text-sm flex items-center gap-1.5 text-muted-foreground italic">
                          <MapPin className="h-3.5 w-3.5" />
                          {appt.modality === "opi" ? "Virtual (Phone)" : "Virtual (Video)"}
                        </p>
                      )}

                      {appt.description && (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium">Description:</span> {appt.description}
                        </p>
                      )}

                      {isSigned && (
                        <p className="text-xs text-accent flex items-center gap-1">
                          <PenLine className="h-3 w-3" />
                          Signed at {format(new Date(cf.signed_at), "h:mm a")}
                        </p>
                      )}

                      {/* ── Notes toggle ── */}
                      <button
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
                        onClick={() => setExpandedNotes((p) => ({ ...p, [appt.id]: !p[appt.id] }))}
                      >
                        <MessageSquare className="h-3 w-3" />
                        Notes
                        {isNotesOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>

                      {isNotesOpen && (
                        <div className="space-y-2 pl-1">
                          {/* Requester notes — read-only */}
                          {appt.requester_notes ? (
                            <div className="rounded-md bg-muted/50 p-2">
                              <p className="text-xs font-medium text-muted-foreground mb-0.5">Requester Notes</p>
                              <p className="text-sm">{appt.requester_notes}</p>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">No requester notes</p>
                          )}

                          {/* Interpreter notes — editable */}
                          <div>
                            <Label className="text-xs text-muted-foreground">Your Notes</Label>
                            <Textarea
                              className="mt-1 min-h-[48px] text-sm"
                              placeholder="Add notes for this appointment..."
                              value={editingNotes[appt.id] ?? appt.interpreter_notes ?? ""}
                              onChange={(e) => setEditingNotes((p) => ({ ...p, [appt.id]: e.target.value }))}
                            />
                            {(editingNotes[appt.id] !== undefined && editingNotes[appt.id] !== (appt.interpreter_notes ?? "")) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="mt-1"
                                disabled={savingNotes[appt.id]}
                                onClick={() => saveInterpreterNotes(appt.id, editingNotes[appt.id] ?? "")}
                              >
                                {savingNotes[appt.id] ? "Saving..." : "Save Notes"}
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ── 48h note ── */}
                      {showWithin48hNote && (
                        <p className="text-xs text-muted-foreground italic">
                          Contact agency for changes within 48 hours
                        </p>
                      )}

                      {/* ── Action buttons ── */}
                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        {canConfirm && (
                          <Button size="sm" variant="default" onClick={() => confirmJob.mutate(appt.id)} disabled={confirmJob.isPending}>
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                            Accept
                          </Button>
                        )}
                        {canReject && (
                          <Button size="sm" variant="destructive" onClick={() => setRejectingApptId(appt.id)}>
                            <XCircle className="mr-1.5 h-3.5 w-3.5" />
                            Reject
                          </Button>
                        )}
                        {canSign && (
                          <Button size="sm" variant="default" onClick={() => setSigningApptId(appt.id)}>
                            <PenLine className="mr-1.5 h-3.5 w-3.5" />
                            Complete & Sign
                          </Button>
                        )}
                        {canClientNoShow && (
                          <Button size="sm" variant="outline" onClick={() => setNoShowApptId(appt.id)}>
                            <UserX className="mr-1.5 h-3.5 w-3.5" />
                            No Show – Client
                          </Button>
                        )}
                        {canRequestReassignment && (
                          <Button size="sm" variant="outline" onClick={() => setReassignApptId(appt.id)}>
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                            Request Reassignment
                          </Button>
                        )}
                        {canSelfReportNoShow && (
                          <Button size="sm" variant="outline" className="text-destructive border-destructive/50 hover:bg-destructive/10" onClick={() => setSelfNoShowApptId(appt.id)}>
                            <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                            I Couldn't Attend
                          </Button>
                        )}
                        {directionsUrl && (
                          <Button size="sm" variant="outline" asChild>
                            <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
                              <Navigation className="mr-1.5 h-3.5 w-3.5" />
                              Directions
                            </a>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Complete dialog ── */}
      {signingAppt && (
        <CompleteAppointmentDialog
          appointment={signingAppt}
          open={!!signingApptId}
          onOpenChange={(open) => { if (!open) setSigningApptId(null); }}
        />
      )}

      {/* ── Reject dialog ── */}
      <AlertDialog open={!!rejectingApptId} onOpenChange={(open) => { if (!open) { setRejectingApptId(null); setRejectReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Assignment</AlertDialogTitle>
            <AlertDialogDescription>
              The agency will be notified and you will not be re-offered this appointment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-sm">Reason (optional)</Label>
            <Textarea
              placeholder="Why are you declining this assignment?"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="min-h-[60px]"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => rejectingApptId && rejectJob.mutate(rejectingApptId)}
            >
              Reject Assignment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Client No-Show dialog ── */}
      <AlertDialog open={!!noShowApptId} onOpenChange={(open) => { if (!open) setNoShowApptId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No Show – Client</AlertDialogTitle>
            <AlertDialogDescription>
              Mark this appointment as a client no-show? This will update the status and notify the agency.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => noShowApptId && noShowJob.mutate(noShowApptId)}>
              Confirm No Show
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Reassignment dialog ── */}
      <AlertDialog open={!!reassignApptId} onOpenChange={(open) => { if (!open) { setReassignApptId(null); setReassignReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Request Reassignment</AlertDialogTitle>
            <AlertDialogDescription>
              This appointment will be returned to the agency for reassignment. You will be removed from this appointment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-sm">Reason <span className="text-destructive">*</span></Label>
            <Textarea
              placeholder="Why do you need to be reassigned?"
              value={reassignReason}
              onChange={(e) => setReassignReason(e.target.value)}
              className="min-h-[60px]"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!reassignReason.trim()}
              onClick={() => reassignApptId && reassignJob.mutate(reassignApptId)}
            >
              Confirm Reassignment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Self No-Show dialog ── */}
      <AlertDialog open={!!selfNoShowApptId} onOpenChange={(open) => { if (!open) setSelfNoShowApptId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>I Couldn't Attend</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark you as a no-show for this appointment. The agency will be notified. This is a non-billable event. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => selfNoShowApptId && selfNoShowJob.mutate(selfNoShowApptId)}
            >
              Confirm No-Show
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
