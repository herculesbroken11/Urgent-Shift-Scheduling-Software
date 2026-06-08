import { useState, useEffect, useCallback, useMemo } from "react";
import { useAdaptedQuery } from "@/lib/data-adapter";
import { useAgencySettings } from "@/hooks/useAgencySettings";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TimePicker } from "@/components/ui/time-picker";
import { useCustomers, useLocations, useLanguages, useAppointmentMutations, useAgencyInterpreters } from "@/hooks/useAgencyData";
import { format, addMinutes, differenceInMinutes, parseISO, isWithinInterval, getDay } from "date-fns";
import { CompleteAppointmentDialog } from "./CompleteAppointmentDialog";
import { RecurrencePicker, generateOccurrenceDates, type RecurrenceRule } from "./RecurrencePicker";
import { EditSeriesDialog, type SeriesEditChoice } from "./EditSeriesDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PenLine, AlertTriangle, RefreshCw, CalendarPlus, MessageSquare, Info } from "lucide-react";
import { ResendToInterpreterDialog } from "./ResendToInterpreterDialog";
import { AppointmentAuditLog } from "./AppointmentAuditLog";
import { downloadIcsFile, type IcsEventInput } from "@/lib/ics-generator";
import { useCreateConversation } from "@/hooks/useMessages";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoData } from "@/contexts/DemoDataContext";
import { useAgencyTimezone } from "@/hooks/useAgencyTimezone";
import { utcToLocalParts, localToUtcIso } from "@/lib/agency-timezone";
import {
  assignInterpreterWithConflictCheck,
  checkInterpreterScheduleConflicts,
  isInterpreterScheduleConflictError,
} from "@/lib/scheduling-rpc";
import type { InterpreterAssignMeta } from "@/hooks/useAgencyData";

import { toast } from "sonner";

interface InitialValues {
  title?: string;
  description?: string;
  customer_id?: string;
  location_id?: string;
  language_id?: string;
  interpreter_id?: string;
  notes?: string;
  include_mileage?: boolean;
  include_travel?: boolean;
  start_date?: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues?: InitialValues;
  editingAppointment?: any;
}

// These are now timezone-aware: see utcToLocalParts / localToUtcIso
// Keep for non-timezone local calculations only
function combineDatetime(date: string, time: string): Date | null {
  if (!date || !time) return null;
  return new Date(`${date}T${time}`);
}

function formatDuration(mins: number): string {
  if (mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

function parseDuration(val: string): number | null {
  const colonMatch = val.match(/^(\d+):(\d{1,2})$/);
  if (colonMatch) return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2]);
  const num = parseFloat(val);
  if (!isNaN(num) && num > 0) return Math.round(num * 60);
  return null;
}

const emptyForm = {
  title: "",
  description: "",
  customer_id: "",
  location_id: "",
  language_id: "",
  interpreter_id: "",
  start_date: "",
  start_time: "",
  end_date: "",
  end_time: "",
  duration: "",
  actual_start_date: "",
  actual_start_time: "",
  actual_end_date: "",
  actual_end_time: "",
  notes: "",
  requester_notes: "",
  interpreter_notes: "",
  agency_notes: "",
  client_name: "",
  modality: "on_site" as string,
  include_mileage: false,
  include_travel: false,
  status: "requested" as string,
};

type FormState = typeof emptyForm;

const ALL_STATUSES = [
  { value: "requested", label: "Requested" },
  { value: "requested_last_minute", label: "Requested (Last-Minute)" },
  { value: "interpreter_assigned", label: "Interpreter Assigned" },
  { value: "interpreter_assigned_last_minute", label: "Assigned (Last-Minute)" },
  { value: "interpreter_confirmed", label: "Interpreter Confirmed" },
  { value: "reassignment_needed", label: "Reassignment Needed" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "completed_last_minute", label: "Completed (Last-Minute)" },
  { value: "cancelled", label: "Cancelled" },
  { value: "late_cancel_no_show_client", label: "Late Cancel / No-Show (Client)" },
  { value: "no_show_interpreter", label: "No-Show (Interpreter)" },
];

const MODALITIES = [
  { value: "on_site", label: "On-Site" },
  { value: "opi", label: "OPI (Phone)" },
  { value: "vri", label: "VRI (Video)" },
];

const defaultRecurrenceRule: RecurrenceRule = {
  frequency: "weekly",
  weekDays: [],
  endType: "occurrences",
  occurrences: 10,
};

export function AppointmentFormDialog({ open, onOpenChange, initialValues, editingAppointment }: Props) {
  const { data: customers = [] } = useCustomers();
  const { data: languages = [] } = useLanguages();
  const { data: interpreters = [] } = useAgencyInterpreters(true); // include inactive for existing assignments
  const { create, update, bulkCreate, bulkUpdate, bulkDelete } = useAppointmentMutations();
  const { isDemoMode, profile, user, hasRole } = useAuth();
  const { getVisibleStatuses, selfClaimEnabled } = useAgencySettings();
  const agencyTz = useAgencyTimezone();
  const navigate = useNavigate();
  const createConversation = useCreateConversation();

  const STATUSES = useMemo(() => {
    const visible = new Set(getVisibleStatuses());
    return ALL_STATUSES.filter((s) => visible.has(s.value as any));
  }, [getVisibleStatuses]);
  const { state: demoState } = useDemoData();

  const [customerId, setCustomerId] = useState("");
  const { data: locations = [] } = useLocations(customerId || undefined);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  const [threadCreating, setThreadCreating] = useState(false);
  const [conflictAcknowledged, setConflictAcknowledged] = useState(false);
  const [assignOverrideReason, setAssignOverrideReason] = useState("");
  const [scheduleConflictPending, setScheduleConflictPending] = useState(false);

  // Recurrence state
  const [recurrenceEnabled, setRecurrenceEnabled] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule>(defaultRecurrenceRule);
  const [seriesDialogOpen, setSeriesDialogOpen] = useState(false);
  const [seriesDialogMode, setSeriesDialogMode] = useState<"edit" | "delete">("edit");
  const [pendingSubmitData, setPendingSubmitData] = useState<any>(null);

  const isEditing = !!editingAppointment;
  const isPartOfSeries = isEditing && editingAppointment?.parent_recurring_id;
  const isSeriesParent = isEditing && !editingAppointment?.parent_recurring_id && editingAppointment?.recurrence_rule;
  const isRecurring = isPartOfSeries || isSeriesParent;

  const isAdmin = hasRole("agency_admin");
  const isScheduler = hasRole("scheduler");
  const isInterpreter = hasRole("interpreter") && !isAdmin && !isScheduler;
  const isRequester = hasRole("requester") && !isAdmin && !isScheduler && !isInterpreter;
  const isAdminOrScheduler = isAdmin || isScheduler;
  const isReadOnly = isEditing && isInterpreter;
  // Admin/scheduler editing an existing appointment: lock most fields.
  // Only Interpreter, Agency Notes, Mileage, Travel Pay remain editable.
  const isAdminEditLocked = isEditing && isAdminOrScheduler;
  // Combined lock for fields that should be disabled for both interpreters (always) and admins (when editing existing)
  const fieldLocked = isReadOnly || isAdminEditLocked;

  // Track original location_id for change detection
  const originalLocationId = editingAppointment?.location_id ?? null;

  // Admin Confirms: check selected interpreter
  const selectedInterpreter = useMemo(() => {
    if (!form.interpreter_id) return null;
    return (interpreters as any[]).find((i: any) => i.id === form.interpreter_id) ?? null;
  }, [form.interpreter_id, interpreters]);

  const isAdminConfirms = selectedInterpreter?.admin_confirms === true;

  // Fetch interpreter blocked times when one is selected
  const { data: interpreterBlocks = [] } = useAdaptedQuery<any[]>({
    queryKey: ["interpreter-blocks", form.interpreter_id],
    queryFn: async () => {
      if (!form.interpreter_id) return [];
      const { data, error } = await supabase
        .from("interpreter_availability")
        .select("*")
        .eq("interpreter_id", form.interpreter_id);
      if (error) throw error;
      return data;
    },
    demoFn: () => demoState.availability?.filter((s: any) => s.interpreter_id === form.interpreter_id) || [],
    enabled: !!form.interpreter_id,
  });

  // Check for conflicts
  const conflictWarning = useMemo(() => {
    if (!form.interpreter_id || !form.start_date || !form.start_time) return null;
    const apptStart = combineDatetime(form.start_date, form.start_time);
    const apptEnd = combineDatetime(form.end_date || form.start_date, form.end_time || form.start_time);
    if (!apptStart) return null;
    const effectiveEnd = apptEnd && apptEnd > apptStart ? apptEnd : addMinutes(apptStart, 60);

    for (const block of interpreterBlocks as any[]) {
      if (block.is_recurring && block.day_of_week != null) {
        const apptDay = getDay(apptStart);
        if (apptDay === block.day_of_week) {
          if (block.is_all_day) return `Interpreter is unavailable every ${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][block.day_of_week]} (all day)${block.notes ? ` — ${block.notes}` : ""}`;
          const blockStart = block.start_time?.slice(0, 5);
          const blockEnd = block.end_time?.slice(0, 5);
          const apptStartTime = format(apptStart, "HH:mm");
          const apptEndTime = format(effectiveEnd, "HH:mm");
          if (apptStartTime < blockEnd && apptEndTime > blockStart) {
            return `Interpreter is unavailable every ${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][block.day_of_week]} ${blockStart}–${blockEnd}${block.notes ? ` — ${block.notes}` : ""}`;
          }
        }
      } else if (!block.is_recurring && block.specific_date && block.end_date) {
        const rangeStart = new Date(block.specific_date + "T00:00:00");
        const rangeEnd = new Date(block.end_date + "T23:59:59");
        if (apptStart <= rangeEnd && effectiveEnd >= rangeStart) {
          if (block.is_all_day) return `Interpreter is unavailable ${block.specific_date} to ${block.end_date}${block.notes ? ` — ${block.notes}` : ""}`;
          const blockStart = block.start_time?.slice(0, 5);
          const blockEnd = block.end_time?.slice(0, 5);
          const apptStartTime = format(apptStart, "HH:mm");
          const apptEndTime = format(effectiveEnd, "HH:mm");
          if (apptStartTime < blockEnd && apptEndTime > blockStart) {
            return `Interpreter is unavailable ${block.specific_date} to ${block.end_date} ${blockStart}–${blockEnd}${block.notes ? ` — ${block.notes}` : ""}`;
          }
        }
      } else if (!block.is_recurring && block.specific_date && !block.end_date) {
        const blockDate = block.specific_date;
        const apptDate = format(apptStart, "yyyy-MM-dd");
        if (apptDate === blockDate) {
          if (block.is_all_day) return `Interpreter is unavailable on ${blockDate}${block.notes ? ` — ${block.notes}` : ""}`;
          const blockStart = block.start_time?.slice(0, 5);
          const blockEnd = block.end_time?.slice(0, 5);
          const apptStartTime = format(apptStart, "HH:mm");
          const apptEndTime = format(effectiveEnd, "HH:mm");
          if (apptStartTime < blockEnd && apptEndTime > blockStart) {
            return `Interpreter is unavailable on ${blockDate} ${blockStart}–${blockEnd}${block.notes ? ` — ${block.notes}` : ""}`;
          }
        }
      }
    }
    return null;
  }, [form.interpreter_id, form.start_date, form.start_time, form.end_date, form.end_time, interpreterBlocks]);

  useEffect(() => {
    setConflictAcknowledged(false);
  }, [conflictWarning]);

  const calcDuration = useCallback((sd: string, st: string, ed: string, et: string) => {
    const s = combineDatetime(sd, st);
    const e = combineDatetime(ed, et);
    if (!s || !e) return "";
    const m = differenceInMinutes(e, s);
    return m > 0 ? formatDuration(m) : "";
  }, []);

  const calcEnd = useCallback((sd: string, st: string, mins: number) => {
    const s = combineDatetime(sd, st);
    if (!s) return { end_date: "", end_time: "" };
    const e = addMinutes(s, mins);
    return { end_date: format(e, "yyyy-MM-dd"), end_time: format(e, "HH:mm") };
  }, []);

  const onStartChange = (newDate: string, newTime: string) => {
    setForm((f) => {
      const sd = newDate, st = newTime;
      if (!sd || !st) return { ...f, start_date: sd, start_time: st };
      if (!f.end_time) {
        const s = combineDatetime(sd, st)!;
        const e = addMinutes(s, 60);
        return { ...f, start_date: sd, start_time: st, end_date: format(e, "yyyy-MM-dd"), end_time: format(e, "HH:mm"), duration: "1:00" };
      }
      let ed = f.end_date || sd;
      const s = combineDatetime(sd, st)!;
      let e = combineDatetime(ed, f.end_time);
      if (e && e <= s && ed === sd) {
        const next = addMinutes(s, 60);
        return { ...f, start_date: sd, start_time: st, end_date: format(next, "yyyy-MM-dd"), end_time: format(next, "HH:mm"), duration: "1:00" };
      }
      const dur = e && e > s ? formatDuration(differenceInMinutes(e, s)) : f.duration;
      return { ...f, start_date: sd, start_time: st, duration: dur };
    });
  };

  const onEndTimeChange = (et: string) => {
    setForm((f) => {
      if (!f.start_date || !f.start_time || !et) return { ...f, end_time: et };
      let ed = f.end_date || f.start_date;
      const s = combineDatetime(f.start_date, f.start_time)!;
      let e = combineDatetime(ed, et);
      if (e && e <= s && ed === f.start_date) {
        const nextDay = format(addMinutes(s, 24 * 60), "yyyy-MM-dd");
        ed = nextDay;
        e = combineDatetime(ed, et);
      }
      const dur = e && e > s ? formatDuration(differenceInMinutes(e, s)) : "";
      return { ...f, end_time: et, end_date: ed, duration: dur };
    });
  };

  const onEndDateChange = (ed: string) => {
    setForm((f) => {
      const dur = calcDuration(f.start_date, f.start_time, ed, f.end_time);
      return { ...f, end_date: ed, duration: dur };
    });
  };

  const onDurationChange = (val: string) => {
    setForm((f) => {
      const mins = parseDuration(val);
      if (mins && f.start_date && f.start_time) {
        const { end_date, end_time } = calcEnd(f.start_date, f.start_time, mins);
        return { ...f, duration: val, end_date, end_time };
      }
      return { ...f, duration: val };
    });
  };

  useEffect(() => {
    if (!open) return;
    if (editingAppointment) {
      const cf = editingAppointment.custom_fields as any;
      const startParts = utcToLocalParts(editingAppointment.scheduled_start, agencyTz);
      const endParts = utcToLocalParts(editingAppointment.scheduled_end, agencyTz);
      const sd = startParts.date;
      const st = startParts.time;
      const ed = endParts.date;
      const et = endParts.time;
      const actualStartParts = editingAppointment.actual_start
        ? utcToLocalParts(editingAppointment.actual_start, agencyTz)
        : { date: "", time: "" };
      const actualEndParts = editingAppointment.actual_end
        ? utcToLocalParts(editingAppointment.actual_end, agencyTz)
        : { date: "", time: "" };
      setForm({
        title: editingAppointment.title ?? "",
        description: editingAppointment.description ?? "",
        customer_id: editingAppointment.customer_id ?? "",
        location_id: editingAppointment.location_id ?? "",
        language_id: editingAppointment.language_id ?? "",
        interpreter_id: editingAppointment.interpreter_id ?? "",
        start_date: sd, start_time: st, end_date: ed, end_time: et,
        duration: calcDuration(sd, st, ed, et),
        actual_start_date: actualStartParts.date ?? "",
        actual_start_time: actualStartParts.time ?? "",
        actual_end_date: actualEndParts.date ?? "",
        actual_end_time: actualEndParts.time ?? "",
        notes: editingAppointment.notes ?? "",
        requester_notes: editingAppointment.requester_notes ?? "",
        interpreter_notes: editingAppointment.interpreter_notes ?? "",
        agency_notes: editingAppointment.agency_notes ?? "",
        client_name: cf?.client_name ?? "",
        modality: editingAppointment.modality ?? "on_site",
        include_mileage: cf?.include_mileage ?? false,
        include_travel: cf?.include_travel ?? false,
        status: editingAppointment.status ?? "requested",
      });
      setCustomerId(editingAppointment.customer_id ?? "");
      // Load recurrence rule if series parent
      if (editingAppointment.recurrence_rule) {
        setRecurrenceEnabled(true);
        setRecurrenceRule(editingAppointment.recurrence_rule as RecurrenceRule);
      } else {
        setRecurrenceEnabled(false);
        setRecurrenceRule(defaultRecurrenceRule);
      }
    } else if (initialValues) {
      const sd = initialValues.start_date ?? "";
      const st = initialValues.start_time ?? "";
      const ed = initialValues.end_date ?? sd;
      const et = initialValues.end_time ?? "";
      let duration = "";
      if (sd && st && ed && et) {
        const s = combineDatetime(sd, st);
        const e = combineDatetime(ed, et);
        if (s && e && e > s) duration = formatDuration(differenceInMinutes(e, s));
      }
      setForm({
        ...emptyForm,
        title: initialValues.title ?? "",
        description: initialValues.description ?? "",
        customer_id: initialValues.customer_id ?? "",
        location_id: initialValues.location_id ?? "",
        language_id: initialValues.language_id ?? "",
        interpreter_id: initialValues.interpreter_id ?? "",
        notes: initialValues.notes ?? "",
        include_mileage: initialValues.include_mileage ?? false,
        include_travel: initialValues.include_travel ?? false,
        start_date: sd,
        start_time: st,
        end_date: ed,
        end_time: et,
        duration,
      });
      setCustomerId(initialValues.customer_id ?? "");
      setRecurrenceEnabled(false);
      setRecurrenceRule(defaultRecurrenceRule);
    } else {
      setForm(emptyForm);
      setCustomerId("");
      setRecurrenceEnabled(false);
      setRecurrenceRule(defaultRecurrenceRule);
    }
  }, [open, editingAppointment, initialValues]);

  useEffect(() => {
    if (customerId !== form.customer_id) {
      setForm((f) => ({ ...f, location_id: "" }));
    }
  }, [customerId]);

  const NONE = "__none__";
  const set = (k: string, v: string) => {
    const clean = v === NONE ? "" : v;
    setForm((f) => ({ ...f, [k]: clean }));
    if (k === "customer_id") setCustomerId(clean);
  };
  const sv = (v: string) => v || NONE;

  const isRemote = form.modality === "opi" || form.modality === "vri";

  /** Check if current appointment is on the last-minute track */
  const isLastMinuteTrack = () => {
    const currentStatus = editingAppointment?.status || form.status;
    if (["requested_last_minute", "interpreter_assigned_last_minute", "completed_last_minute"].includes(currentStatus)) return true;
    const cf = (editingAppointment?.custom_fields as Record<string, any>) || {};
    return cf.is_last_minute === true;
  };

  /** Determine the correct status when an interpreter is selected */
  const getAssignedStatus = () => {
    if (isAdminConfirms && isAdminOrScheduler) return "interpreter_confirmed";
    return isLastMinuteTrack() ? "interpreter_assigned_last_minute" : "interpreter_assigned";
  };

  /** Determine the correct unassigned status */
  const getUnassignedStatus = () => {
    return isLastMinuteTrack() ? "requested_last_minute" : "requested";
  };

  const getAssignmentMethod = () => {
    if (isAdminConfirms && isAdminOrScheduler) return "admin_confirmed";
    return undefined; // let DB default
  };

  const buildInput = () => {
    const input: any = {
      title: form.title || null,
      description: form.description || null,
      notes: form.notes || null,
      modality: form.modality || "on_site",
    };
    if (form.customer_id) input.customer_id = form.customer_id;
    if (form.location_id) input.location_id = form.location_id;
    if (form.language_id) input.language_id = form.language_id;
    if (form.interpreter_id) input.interpreter_id = form.interpreter_id;
    const startIso = localToUtcIso(form.start_date, form.start_time, agencyTz);
    const endIso = localToUtcIso(form.end_date, form.end_time, agencyTz);
    if (startIso) input.scheduled_start = startIso;
    if (endIso) input.scheduled_end = endIso;
    input.custom_fields = {
      client_name: form.client_name || null,
      include_mileage: isRemote ? false : form.include_mileage,
      include_travel: isRemote ? false : form.include_travel,
    };

    // Three-tier notes: only include the tier the current user can edit
    // Requester writes requester_notes only
    // Interpreter writes interpreter_notes only (and only if assigned)
    // Admin/scheduler writes agency_notes only — never authors other tiers
    if (isRequester) {
      input.requester_notes = form.requester_notes || null;
    } else if (isInterpreter) {
      input.interpreter_notes = form.interpreter_notes || null;
    } else if (isAdminOrScheduler) {
      input.agency_notes = form.agency_notes || null;
    }

    // Admin/Scheduler override of interpreter-recorded actual times.
    // Only included when editing — empty fields clear the value (set null).
    if (isAdminOrScheduler && isEditing) {
      const hasActualStart = !!form.actual_start_date && !!form.actual_start_time;
      const hasActualEnd = !!form.actual_end_date && !!form.actual_end_time;
      input.actual_start = hasActualStart
        ? localToUtcIso(form.actual_start_date, form.actual_start_time, agencyTz)
        : null;
      input.actual_end = hasActualEnd
        ? localToUtcIso(form.actual_end_date, form.actual_end_time, agencyTz)
        : null;
    }

    return input;
  };

  /** Send location change notifications after successful save */
  const sendLocationChangeNotifications = async (appointmentData: any) => {
    if (!profile?.agency_id) return;
    try {
      const newLoc = locations.find((l) => l.id === form.location_id);
      const locName = newLoc?.name || "Updated location";
      const apptTitle = form.title || appointmentData?.title || "Appointment";
      const message = `Location changed for appointment: ${apptTitle} — new location: ${locName}`;

      // Notify assigned interpreter
      if (form.interpreter_id) {
        await supabase.functions.invoke("send-notification", {
          body: {
            channel: "in_app",
            target_user_id: form.interpreter_id,
            title: "Location Changed",
            message,
            type: "location_changed",
            related_entity_type: "appointment",
            related_entity_id: appointmentData?.id || editingAppointment?.id,
          },
        });
      }

      // Notify admins and schedulers
      const { data: adminSchedulerRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("agency_id", profile.agency_id!)
        .in("role", ["agency_admin", "scheduler"] as any[]);

      if (adminSchedulerRoles?.length) {
        for (const role of adminSchedulerRoles) {
          if (role.user_id === user?.id) continue; // don't notify self
          await supabase.functions.invoke("send-notification", {
            body: {
              channel: "in_app",
              target_user_id: role.user_id,
              title: "Location Changed",
              message,
              type: "location_changed",
              related_entity_type: "appointment",
              related_entity_id: appointmentData?.id || editingAppointment?.id,
            },
          });
        }
      }

      toast.success("Location update notification sent");
    } catch (e) {
      console.error("Failed to send location change notifications:", e);
    }
  };

  const buildAssignMeta = (): InterpreterAssignMeta | undefined => {
    if (!form.interpreter_id) return undefined;
    if (isEditing && form.interpreter_id === editingAppointment?.interpreter_id) return undefined;
    return {
      assignInterpreterId: form.interpreter_id,
      assignMode: isAdminConfirms && isAdminOrScheduler ? "confirm" : "offer",
      assignOverrideReason: assignOverrideReason.trim() || undefined,
    };
  };

  const stripInterpreterFromInput = (input: Record<string, unknown>) => {
    delete input.interpreter_id;
    delete input.status;
    delete input.assignment_method;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = buildInput();

    if (input.scheduled_start && input.scheduled_end) {
      if (new Date(input.scheduled_end) <= new Date(input.scheduled_start)) {
        toast.error("End time must be after start time.");
        return;
      }
    }

    const assignMeta = buildAssignMeta();
    if (assignMeta?.assignInterpreterId && input.scheduled_start && input.scheduled_end && !isDemoMode) {
      try {
        const check = await checkInterpreterScheduleConflicts(
          assignMeta.assignInterpreterId,
          input.scheduled_start,
          input.scheduled_end,
          isEditing ? editingAppointment?.id : undefined,
        );
        if (check.has_conflict) {
          setScheduleConflictPending(true);
          if (!assignMeta.assignOverrideReason || assignMeta.assignOverrideReason.length < 3) {
            toast.error("Interpreter has a scheduling conflict. Enter an override reason (min 3 characters) to continue.");
            return;
          }
        } else {
          setScheduleConflictPending(false);
        }
      } catch (err) {
        console.warn("Conflict pre-check failed:", err);
      }
    }

    if (isEditing) {
      // If it's part of a series, show series edit dialog
      if (isRecurring) {
        input.status = form.status;
        if (!form.interpreter_id && editingAppointment.interpreter_id) {
          input.status = getUnassignedStatus();
          input.interpreter_id = null;
        }
        if (assignMeta) stripInterpreterFromInput(input);
        else if (form.interpreter_id && !editingAppointment.interpreter_id) {
          input.status = getAssignedStatus();
          const method = getAssignmentMethod();
          if (method) input.assignment_method = method;
        }
        setPendingSubmitData({ ...input, ...assignMeta });
        setSeriesDialogMode("edit");
        setSeriesDialogOpen(true);
        return;
      }

      input.status = form.status;
      if (!form.interpreter_id && editingAppointment.interpreter_id) {
        input.status = getUnassignedStatus();
        input.interpreter_id = null;
      } else if (assignMeta) {
        stripInterpreterFromInput(input);
      } else if (form.interpreter_id && !editingAppointment.interpreter_id) {
        input.status = getAssignedStatus();
        const method = getAssignmentMethod();
        if (method) input.assignment_method = method;
      }

      const locationChanged = isEditing && form.location_id !== (originalLocationId || "") && form.location_id !== "";

      try {
        await update.mutateAsync({ id: editingAppointment.id, ...input, ...assignMeta });
        if (locationChanged && !isDemoMode) {
          const { data } = await supabase.from("appointments").select().eq("id", editingAppointment.id).single();
          if (data) sendLocationChangeNotifications(data);
        }
        setAssignOverrideReason("");
        setScheduleConflictPending(false);
        onOpenChange(false);
      } catch (err) {
        if (isInterpreterScheduleConflictError(err)) {
          setScheduleConflictPending(true);
        }
      }
    } else {
      // New appointment — check if recurring
      if (recurrenceEnabled && form.start_date) {
        const dates = generateOccurrenceDates(form.start_date, recurrenceRule);
        if (dates.length < 2) {
          toast.error("Recurrence must generate at least 2 occurrences.");
          return;
        }
        if (assignMeta) stripInterpreterFromInput(input);
        else if (form.interpreter_id) {
          input.status = getAssignedStatus();
          const method = getAssignmentMethod();
          if (method) input.assignment_method = method;
        }
        input.recurrence_rule = recurrenceRule;
        try {
          await bulkCreate.mutateAsync({
            baseInput: input,
            dates,
            startTime: form.start_time,
            endTime: form.end_time,
            assignMode: assignMeta?.assignMode,
            assignOverrideReason: assignMeta?.assignOverrideReason,
          });
          onOpenChange(false);
          setForm(emptyForm);
          setCustomerId("");
          setRecurrenceEnabled(false);
          setRecurrenceRule(defaultRecurrenceRule);
          setAssignOverrideReason("");
          setScheduleConflictPending(false);
        } catch (err) {
          if (isInterpreterScheduleConflictError(err)) {
            setScheduleConflictPending(true);
          }
        }
      } else {
        if (assignMeta) stripInterpreterFromInput(input);
        else if (form.interpreter_id) {
          input.status = getAssignedStatus();
          const method = getAssignmentMethod();
          if (method) input.assignment_method = method;
        }
        try {
          await create.mutateAsync({ ...input, ...assignMeta });
          onOpenChange(false);
          setForm(emptyForm);
          setCustomerId("");
          setAssignOverrideReason("");
          setScheduleConflictPending(false);
        } catch (err) {
          if (isInterpreterScheduleConflictError(err)) {
            setScheduleConflictPending(true);
          }
        }
      }
    }
  };

  const handleSeriesChoice = (choice: SeriesEditChoice) => {
    setSeriesDialogOpen(false);
    if (!choice || !pendingSubmitData) return;

    const parentId = editingAppointment.parent_recurring_id || editingAppointment.id;

    if (seriesDialogMode === "edit") {
      const {
        assignInterpreterId,
        assignMode,
        assignOverrideReason: seriesOverride,
        ...seriesUpdateData
      } = pendingSubmitData ?? {};
      const seriesAssignMeta: InterpreterAssignMeta | undefined = assignInterpreterId
        ? { assignInterpreterId, assignMode, assignOverrideReason: seriesOverride }
        : undefined;

      if (choice === "this") {
        update.mutate(
          { id: editingAppointment.id, ...seriesUpdateData, ...seriesAssignMeta },
          { onSuccess: () => onOpenChange(false) },
        );
      } else if (choice === "future" || choice === "all") {
        bulkUpdate.mutate(
          {
            parentId,
            updateData: seriesUpdateData,
            scope: choice,
            currentAppointmentDate: editingAppointment.scheduled_start,
          },
          {
            onSuccess: async () => {
              if (seriesAssignMeta?.assignInterpreterId) {
                const { data: series } = await supabase
                  .from("appointments")
                  .select("id, scheduled_start")
                  .or(`id.eq.${parentId},parent_recurring_id.eq.${parentId}`);
                const toAssign = (series ?? []).filter((s) =>
                  choice === "all"
                  || !editingAppointment.scheduled_start
                  || (s.scheduled_start && s.scheduled_start >= editingAppointment.scheduled_start),
                );
                for (const row of toAssign) {
                  await assignInterpreterWithConflictCheck(
                    row.id,
                    seriesAssignMeta.assignInterpreterId!,
                    seriesAssignMeta.assignMode === "confirm" ? "confirm" : "offer",
                    seriesAssignMeta.assignOverrideReason,
                  );
                }
              }
              onOpenChange(false);
            },
          },
        );
      }
    } else if (seriesDialogMode === "delete") {
      bulkDelete.mutate(
        {
          parentId,
          scope: choice,
          currentAppointmentDate: editingAppointment.scheduled_start,
        },
        { onSuccess: () => onOpenChange(false) }
      );
    }
    setPendingSubmitData(null);
  };

  const handleDeleteSeries = () => {
    setSeriesDialogMode("delete");
    setSeriesDialogOpen(true);
  };

  const dialogTitle = isEditing ? "Edit Appointment" : initialValues ? "Duplicate Appointment" : "New Appointment";
  const isPending = isEditing ? update.isPending : (recurrenceEnabled ? bulkCreate.isPending : create.isPending);

  // Parse interpreter_notes_history for display
  const notesHistory: Array<{ interpreter_name: string; notes: string; timestamp: string }> = useMemo(() => {
    const hist = editingAppointment?.interpreter_notes_history;
    if (!hist || !Array.isArray(hist)) return [];
    return hist;
  }, [editingAppointment?.interpreter_notes_history]);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Patient/Client Name</Label>
            <Input value={form.client_name} onChange={(e) => set("client_name", e.target.value)} placeholder="Patient/Client name" disabled={fieldLocked} />
          </div>

          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Medical Interpretation" disabled={fieldLocked} />
          </div>

          {/* Modality & Status row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Modality *</Label>
              <Select value={sv(form.modality)} onValueChange={(v) => set("modality", v)} disabled={fieldLocked}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODALITIES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isEditing && isAdminOrScheduler && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={sv(form.status)} onValueChange={(v) => set("status", v)} disabled={fieldLocked}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Start Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date *</Label>
              <Input type="date" value={form.start_date} onChange={(e) => onStartChange(e.target.value, form.start_time)} required disabled={fieldLocked} />
            </div>
            <div className="space-y-2">
              <Label>Start Time *</Label>
              <TimePicker value={form.start_time} onChange={(v) => onStartChange(form.start_date, v)} required disabled={fieldLocked} />
            </div>
          </div>

          {/* End Date & Time + Duration */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input type="date" value={form.end_date} onChange={(e) => onEndDateChange(e.target.value)} disabled={fieldLocked} />
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <TimePicker value={form.end_time} onChange={(v) => onEndTimeChange(v)} disabled={fieldLocked} />
            </div>
            <div className="space-y-2">
              <Label>Duration (h:mm)</Label>
              <Input value={form.duration} onChange={(e) => onDurationChange(e.target.value)} placeholder="1:00" disabled={fieldLocked} />
            </div>
          </div>

          {/* Actual Times — Admin/Scheduler override (in_progress / completed only) */}
          {isEditing && isAdminOrScheduler && ["in_progress", "completed", "completed_last_minute"].includes(form.status) && (
            <div className="rounded-lg border border-dashed p-3 space-y-3 bg-muted/20">
              <div className="flex items-start gap-2">
                <PenLine className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Actual Times (Admin Override)</p>
                  <p className="text-xs text-muted-foreground">
                    Correct interpreter-recorded actuals. Clearing both date and time of a field removes the value. Changes are recorded in the audit log.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Actual Start Date</Label>
                  <Input type="date" value={form.actual_start_date} onChange={(e) => set("actual_start_date", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Actual Start Time</Label>
                  <TimePicker value={form.actual_start_time} onChange={(v) => set("actual_start_time", v)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Actual End Date</Label>
                  <Input type="date" value={form.actual_end_date} onChange={(e) => set("actual_end_date", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Actual End Time</Label>
                  <TimePicker value={form.actual_end_time} onChange={(v) => set("actual_end_time", v)} />
                </div>
              </div>
            </div>
          )}

          {/* Recurrence Picker — only for new appointments or series parents */}
          {!isEditing && (
            <RecurrencePicker
              enabled={recurrenceEnabled}
              onEnabledChange={setRecurrenceEnabled}
              rule={recurrenceRule}
              onRuleChange={setRecurrenceRule}
              startDate={form.start_date}
              startTime={form.start_time}
              disabled={isReadOnly}
            />
          )}

          {/* Series indicator for editing */}
          {isEditing && isRecurring && (
            <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <span className="text-primary">🔄</span>
                This appointment is part of a recurring series.
              </p>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDeleteSeries}
              >
                Delete Series…
              </Button>
            </div>
          )}

          {/* Customer & Location */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select value={sv(form.customer_id)} onValueChange={(v) => set("customer_id", v)} disabled={fieldLocked}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None —</SelectItem>
                  {customers.filter((c) => c.is_active || c.id === form.customer_id).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{!c.is_active ? " (inactive)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={sv(form.location_id)} onValueChange={(v) => set("location_id", v)} disabled={!form.customer_id || isRemote || fieldLocked}>
                <SelectTrigger><SelectValue placeholder={isRemote ? "N/A for remote" : form.customer_id ? "Select location" : "Select customer first"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None —</SelectItem>
                  {locations.filter((l) => l.is_active || l.id === form.location_id).map((l) => {
                    const addr = [l.address_line1, l.city, l.state, l.zip_code].filter(Boolean).join(", ");
                    return <SelectItem key={l.id} value={l.id}>{l.name}{addr ? ` — ${addr}` : ""}{!l.is_active ? " (inactive)" : ""}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Language & Interpreter */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Language *</Label>
              <Select value={sv(form.language_id)} onValueChange={(v) => set("language_id", v)} disabled={fieldLocked}>
                <SelectTrigger><SelectValue placeholder="Select language" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None —</SelectItem>
                  {languages.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Interpreter</Label>
              <Select value={sv(form.interpreter_id)} onValueChange={(v) => set("interpreter_id", v)} disabled={isReadOnly}>
                <SelectTrigger><SelectValue placeholder="Leave unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Unassigned —</SelectItem>
                  {interpreters.filter((i: any) => i.is_active || i.id === form.interpreter_id).map((i: any) => (
                    <SelectItem key={i.id} value={i.id}>{i.first_name} {i.last_name}{!i.is_active ? " (inactive)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Admin Confirms indicator */}
              {isAdminConfirms && isAdminOrScheduler && form.interpreter_id && (
                <div className="flex items-center gap-1.5 mt-1">
                  <Info className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs text-primary">
                    Admin Confirms — will skip interpreter accept step
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Conflict warning */}
          {scheduleConflictPending && form.interpreter_id && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="space-y-2">
                <p className="font-medium">Interpreter has an overlapping appointment at this time.</p>
                <Textarea
                  placeholder="Override reason (required, min 3 characters)"
                  value={assignOverrideReason}
                  onChange={(e) => setAssignOverrideReason(e.target.value)}
                  rows={2}
                />
              </AlertDescription>
            </Alert>
          )}

          {conflictWarning && (
            <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                <p className="font-medium mb-2">⚠️ {conflictWarning}</p>
                {!conflictAcknowledged ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setConflictAcknowledged(true)}
                  >
                    I understand — assign anyway
                  </Button>
                ) : (
                  <p className="text-xs italic">Conflict acknowledged — you may proceed.</p>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Appointment details..." disabled={fieldLocked} />
          </div>

          {/* ═══ THREE-TIER NOTES ═══ */}

          {/* Section 1: Requester Notes — visible to ALL roles */}
          <Card className="border">
            <CardHeader className="py-3 px-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Requester Notes</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">Visible to interpreter &amp; agency</p>
            </CardHeader>
            <CardContent className="px-4 pb-3 pt-0">
              {isRequester ? (
                <Textarea
                  value={form.requester_notes}
                  onChange={(e) => setForm((f) => ({ ...f, requester_notes: e.target.value }))}
                  placeholder="Add notes for the interpreter and agency..."
                  className="min-h-[60px]"
                />
              ) : (
                <div className="rounded-md bg-muted/50 p-3 text-sm min-h-[40px]">
                  {form.requester_notes || <span className="text-muted-foreground italic">No requester notes</span>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 2: Interpreter Notes — hidden from requester */}
          {/* Interpreters only see/edit their OWN notes (when they are the assigned interpreter) */}
          {/* Admin/scheduler can see all interpreter notes + history */}
          {!isRequester && (
            <Card className="border">
              <CardHeader className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Interpreter Notes</CardTitle>
                </div>
                <p className="text-xs text-muted-foreground">Visible to agency only — not shown to requester</p>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0 space-y-2">
                {isInterpreter && form.interpreter_id === user?.id ? (
                  <Textarea
                    value={form.interpreter_notes}
                    onChange={(e) => setForm((f) => ({ ...f, interpreter_notes: e.target.value }))}
                    placeholder="Add your notes..."
                    className="min-h-[60px]"
                  />
                ) : isInterpreter ? (
                  /* Interpreter viewing appointment not assigned to them — hide notes content */
                  <div className="rounded-md bg-muted/50 p-3 text-sm min-h-[40px]">
                    <span className="text-muted-foreground italic">Notes are only visible when you are the assigned interpreter</span>
                  </div>
                ) : (
                  /* Admin/scheduler can see current interpreter notes */
                  <div className="rounded-md bg-muted/50 p-3 text-sm min-h-[40px]">
                    {form.interpreter_notes || <span className="text-muted-foreground italic">No interpreter notes</span>}
                  </div>
                )}

                {/* Prior Interpreter Notes History — admin/scheduler only */}
                {isAdminOrScheduler && notesHistory.length > 0 && (
                  <Accordion type="single" collapsible>
                    <AccordionItem value="history" className="border-none">
                      <AccordionTrigger className="py-2 text-xs text-muted-foreground hover:no-underline">
                        Prior Interpreter Notes ({notesHistory.length})
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2">
                          {notesHistory.map((entry, idx) => (
                            <div key={idx} className="rounded-md bg-muted/30 p-2 text-xs">
                              <div className="font-medium text-muted-foreground mb-1">
                                {entry.interpreter_name} — {entry.timestamp ? format(new Date(entry.timestamp), "MMM d, yyyy h:mm a") : "Unknown date"}
                              </div>
                              <p>{entry.notes}</p>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}
              </CardContent>
            </Card>
          )}

          {/* Section 3: Agency Notes — admin/scheduler only */}
          {isAdminOrScheduler && (
            <Card className="border">
              <CardHeader className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Agency Notes</CardTitle>
                </div>
                <p className="text-xs text-muted-foreground">Internal — not visible to requester or interpreter</p>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0">
                <Textarea
                  value={form.agency_notes}
                  onChange={(e) => setForm((f) => ({ ...f, agency_notes: e.target.value }))}
                  placeholder="Internal agency notes..."
                  className="min-h-[60px]"
                />
              </CardContent>
            </Card>
          )}

          {/* Mileage & Travel toggles — hidden for remote modalities */}
          {!isRemote && (
            <div className="flex items-center gap-6 rounded-lg border p-4 bg-muted/30">
              <div className="flex items-center gap-2">
                <Switch checked={form.include_mileage} onCheckedChange={(v) => setForm((f) => ({ ...f, include_mileage: v }))} disabled={isReadOnly} />
                <Label className="cursor-pointer">Mileage</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.include_travel} onCheckedChange={(v) => setForm((f) => ({ ...f, include_travel: v }))} disabled={isReadOnly} />
                <Label className="cursor-pointer">Travel Pay</Label>
              </div>
            </div>
          )}

          {/* Audit Log — admin/scheduler only, edit mode only, not in demo mode */}
          {isEditing && isAdminOrScheduler && editingAppointment?.id && !isDemoMode && (profile?.agency_id || editingAppointment?.agency_id) && (
            <AppointmentAuditLog
              appointmentId={editingAppointment.id}
              agencyId={editingAppointment.agency_id || profile!.agency_id!}
              appointment={editingAppointment}
            />
          )}

          <div className="flex flex-wrap justify-end gap-2">
            {isEditing && editingAppointment?.status !== "completed" && editingAppointment?.status !== "completed_last_minute" && editingAppointment?.status !== "cancelled" && editingAppointment?.status !== "late_cancel_no_show_client" && editingAppointment?.status !== "no_show_interpreter" && (
              <Button
                type="button"
                variant="secondary"
                className="gap-1.5 mr-auto"
                onClick={() => setCompleteOpen(true)}
              >
                <PenLine className="h-4 w-4" />
                Complete &amp; Sign
              </Button>
            )}
            {isEditing && !isReadOnly && ["requested", "requested_last_minute", "late_cancel_no_show_client", "no_show_interpreter", "cancelled", "reassignment_needed"].includes(editingAppointment?.status) && (
              <Button
                type="button"
                variant="outline"
                className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => setResendOpen(true)}
              >
                <RefreshCw className="h-4 w-4" />
                Resend
              </Button>
            )}
            {isEditing && editingAppointment?.scheduled_start && (
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  const loc = editingAppointment.locations;
                  const locStr = loc ? `${loc.name || ""}${loc.address_line1 ? `, ${loc.address_line1}` : ""}${loc.city ? `, ${loc.city}` : ""}` : undefined;
                  downloadIcsFile({
                    id: editingAppointment.id,
                    title: editingAppointment.title || "Interpreting Appointment",
                    description: editingAppointment.description || undefined,
                    start: editingAppointment.scheduled_start,
                    end: editingAppointment.scheduled_end || editingAppointment.scheduled_start,
                    location: locStr,
                    status: editingAppointment.status,
                  });
                }}
              >
                <CalendarPlus className="h-4 w-4" />
                Add to Calendar
              </Button>
            )}
            {isEditing && editingAppointment?.id && !isDemoMode && (
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                disabled={threadCreating}
                onClick={async () => {
                  if (threadCreating) return;
                  const customerId = editingAppointment.customer_id;
                  if (!customerId) {
                    toast.info("Assign a customer to this appointment to start a thread.");
                    return;
                  }
                  setThreadCreating(true);
                  try {
                    // Fetch all active requesters within the customer org
                    const { data: requesters } = await supabase
                      .from("customer_requestors")
                      .select("user_id")
                      .eq("customer_id", customerId)
                      .eq("is_active", true)
                      .eq("is_deleted", false);
                    const participantIds = Array.from(
                      new Set((requesters || []).map((r: any) => r.user_id).filter(Boolean))
                    );
                    if (participantIds.length === 0) {
                      toast.info("No requesters found for this customer organization.");
                      setThreadCreating(false);
                      return;
                    }
                    // Build subject: Client • Date • Time (agency tz)
                    const customerName = editingAppointment.customers?.name || "Client";
                    let dateTimeStr = "";
                    if (editingAppointment.scheduled_start) {
                      try {
                        const d = new Date(editingAppointment.scheduled_start);
                        const dateFmt = new Intl.DateTimeFormat("en-US", {
                          timeZone: agencyTz, month: "short", day: "numeric", year: "numeric",
                        }).format(d);
                        const timeFmt = new Intl.DateTimeFormat("en-US", {
                          timeZone: agencyTz, hour: "numeric", minute: "2-digit",
                        }).format(d);
                        dateTimeStr = ` • ${dateFmt} • ${timeFmt}`;
                      } catch {}
                    }
                    const subject = `${customerName}${dateTimeStr}`;
                    const convoId = await createConversation({
                      appointmentId: editingAppointment.id,
                      subject,
                      participantIds,
                    });
                    if (convoId) {
                      // Sync subject + participants on existing threads (createConversation returns existing)
                      await supabase
                        .from("conversations")
                        .update({ subject, updated_at: new Date().toISOString() })
                        .eq("id", convoId);

                      // Get current participants
                      const { data: existingParts } = await supabase
                        .from("conversation_participants")
                        .select("user_id")
                        .eq("conversation_id", convoId);
                      const existingIds = new Set((existingParts || []).map((p: any) => p.user_id));
                      const toAdd = participantIds.filter((id) => !existingIds.has(id));
                      if (toAdd.length > 0) {
                        await supabase
                          .from("conversation_participants")
                          .insert(toAdd.map((uid) => ({ conversation_id: convoId, user_id: uid })));
                      }

                      navigate(`/messages?thread=${convoId}`);
                      onOpenChange(false);
                    } else {
                      toast.error("Could not open message thread. Please try again.");
                    }
                  } finally {
                    setThreadCreating(false);
                  }
                }}
              >
                <MessageSquare className="h-4 w-4" />
                {threadCreating ? "Opening…" : "Message Thread"}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              type="submit"
              disabled={
                isPending
                || (!!conflictWarning && !conflictAcknowledged)
                || (scheduleConflictPending && assignOverrideReason.trim().length < 3)
              }
            >
              {isPending ? "Saving…" : recurrenceEnabled && !isEditing
                ? `Create ${form.start_date ? generateOccurrenceDates(form.start_date, recurrenceRule).length : ""} Appointments`
                : isEditing ? "Save Changes" : "Create Appointment"}
            </Button>
          </div>
        </form>

      </DialogContent>
    </Dialog>

    {/* Series Edit/Delete Dialog */}
    <EditSeriesDialog
      open={seriesDialogOpen}
      onChoice={handleSeriesChoice}
      mode={seriesDialogMode}
    />

    {/* Complete with Signature Dialog */}
    {editingAppointment && (
      <CompleteAppointmentDialog
        appointment={editingAppointment}
        open={completeOpen}
        onOpenChange={(o) => {
          setCompleteOpen(o);
          if (!o) onOpenChange(false);
        }}
      />
    )}

    {/* Resend to Interpreter Dialog */}
    {editingAppointment && (
      <ResendToInterpreterDialog
        appointment={editingAppointment}
        open={resendOpen}
        onOpenChange={setResendOpen}
        onSuccess={() => onOpenChange(false)}
      />
    )}
  </>
  );
}
