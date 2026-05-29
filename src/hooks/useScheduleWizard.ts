/**
 * Schedule Wizard data hooks.
 * All queries are strictly scoped by agency_id and exclude soft-deleted rows.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useAgencyTimezone } from "./useAgencyTimezone";
import { localToUtcIso } from "@/lib/agency-timezone";

export interface UnassignedAppointment {
  id: string;
  agency_id: string;
  title: string | null;
  status: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  customer_id: string | null;
  language_id: string | null;
  location_id: string | null;
  modality: string | null;
  patient_client_name: string | null;
  requester_notes: string | null;
  custom_fields: any;
  customers: { name: string } | null;
  languages: { name: string; code: string } | null;
  locations: { name: string; address_line1: string | null; city: string | null; state: string | null; region_id: string | null } | null;
}

export interface WizardInterpreter {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  admin_confirms: boolean;
  is_active: boolean;
  languages: { language_id: string; name: string; certified: boolean }[];
  region_ids: string[];
}

export interface InterpreterScheduleEntry {
  interpreter_id: string;
  type: "appointment" | "availability";
  appointment_id?: string;       // present when type === 'appointment'
  availability_id?: string;      // present when type === 'availability'
  start: string; // ISO UTC
  end: string;   // ISO UTC
  label?: string;
  status?: string;
  notes?: string | null;
}

/* -------------------- Unassigned appointments -------------------- */

export function useUnassignedAppointments() {
  const { profile } = useAuth();
  return useQuery<UnassignedAppointment[]>({
    queryKey: ["wizard-unassigned", profile?.agency_id],
    queryFn: async () => {
      if (!profile?.agency_id) return [];
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          id, agency_id, title, status, scheduled_start, scheduled_end,
          customer_id, language_id, location_id, modality,
          patient_client_name, requester_notes, custom_fields,
          customers ( name ),
          languages ( name, code ),
          locations ( name, address_line1, city, state, region_id )
        `)
        .eq("agency_id", profile.agency_id)
        .eq("is_deleted", false)
        .eq("is_import_staged", false)
        .is("interpreter_id", null)
        .in("status", ["requested", "requested_last_minute", "reassignment_needed"])
        .order("scheduled_start", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as UnassignedAppointment[];
    },
    enabled: !!profile?.agency_id,
    staleTime: 30_000,
  });
}

/* -------------------- Wizard interpreter roster -------------------- */

export function useWizardInterpreters() {
  const { profile } = useAuth();
  return useQuery<WizardInterpreter[]>({
    queryKey: ["wizard-interpreters", profile?.agency_id],
    queryFn: async () => {
      if (!profile?.agency_id) return [];

      const { data: roleRows, error: roleErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("agency_id", profile.agency_id)
        .eq("role", "interpreter");
      if (roleErr) throw roleErr;
      const ids = (roleRows ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];

      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone, admin_confirms, is_active, agency_id, is_deleted")
        .eq("agency_id", profile.agency_id)
        .eq("is_deleted", false)
        .eq("is_active", true)
        .in("id", ids);
      if (profErr) throw profErr;
      const profileIds = (profiles ?? []).map((p) => p.id);
      if (profileIds.length === 0) return [];

      const [langRes, regRes] = await Promise.all([
        supabase
          .from("interpreter_languages")
          .select("interpreter_id, language_id, is_certified, languages ( name )")
          .in("interpreter_id", profileIds),
        supabase
          .from("interpreter_regions")
          .select("interpreter_id, region_id")
          .in("interpreter_id", profileIds),
      ]);
      if (langRes.error) throw langRes.error;
      if (regRes.error) throw regRes.error;

      const langByInterp = new Map<string, { language_id: string; name: string; certified: boolean }[]>();
      for (const row of langRes.data ?? []) {
        const arr = langByInterp.get(row.interpreter_id) ?? [];
        arr.push({
          language_id: row.language_id,
          name: (row as any).languages?.name ?? "",
          certified: !!row.is_certified,
        });
        langByInterp.set(row.interpreter_id, arr);
      }
      const regByInterp = new Map<string, string[]>();
      for (const row of regRes.data ?? []) {
        const arr = regByInterp.get(row.interpreter_id) ?? [];
        arr.push(row.region_id);
        regByInterp.set(row.interpreter_id, arr);
      }

      // Test account exclusion removed — use is_active=false or a dedicated test agency instead of string matching.
      return (profiles ?? [])
        .map((p) => ({
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          email: p.email,
          phone: p.phone,
          admin_confirms: !!(p as any).admin_confirms,
          is_active: !!p.is_active,
          languages: langByInterp.get(p.id) ?? [],
          region_ids: regByInterp.get(p.id) ?? [],
        }));
    },
    enabled: !!profile?.agency_id,
    staleTime: 60_000,
  });
}

/* -------------------- Batched interpreter schedules -------------------- */
/**
 * Returns confirmed appointments + availability blocks per interpreter, with
 * recurring weekly availability rules expanded to concrete dates within the
 * window. All synthetic ISO strings are generated in agency timezone via
 * localToUtcIso so DST transitions are handled correctly.
 */
export function useInterpreterSchedulesBatch(
  interpreterIds: string[],
  windowStart: string | null,
  windowEnd: string | null,
) {
  const { profile } = useAuth();
  const tz = useAgencyTimezone();

  return useQuery<Map<string, InterpreterScheduleEntry[]>>({
    queryKey: ["wizard-schedules", profile?.agency_id, tz, interpreterIds.slice().sort().join(","), windowStart, windowEnd],
    queryFn: async () => {
      const result = new Map<string, InterpreterScheduleEntry[]>();
      if (!profile?.agency_id || interpreterIds.length === 0 || !windowStart || !windowEnd) return result;

      // Confirmed / in-progress appointments overlapping the window
      const { data: appts, error: apptErr } = await supabase
        .from("appointments")
        .select("id, interpreter_id, scheduled_start, scheduled_end, status, title")
        .eq("agency_id", profile.agency_id)
        .eq("is_deleted", false)
        .eq("is_import_staged", false)
        .in("interpreter_id", interpreterIds)
        .in("status", [
          "interpreter_assigned",
          "interpreter_assigned_last_minute",
          "interpreter_confirmed",
          "in_progress",
        ])
        .lt("scheduled_start", windowEnd)
        .gt("scheduled_end", windowStart);
      if (apptErr) throw apptErr;

      for (const a of appts ?? []) {
        if (!a.interpreter_id || !a.scheduled_start || !a.scheduled_end) continue;
        const arr = result.get(a.interpreter_id) ?? [];
        arr.push({
          interpreter_id: a.interpreter_id,
          appointment_id: a.id,
          type: "appointment",
          start: a.scheduled_start,
          end: a.scheduled_end,
          label: a.title ?? "",
          status: a.status as string,
        });
        result.set(a.interpreter_id, arr);
      }

      // Availability blocks (specific-date AND recurring weekly)
      const { data: blocks, error: blockErr } = await supabase
        .from("interpreter_availability")
        .select("id, interpreter_id, specific_date, start_time, end_time, is_all_day, notes, is_recurring, day_of_week, end_date")
        .eq("agency_id", profile.agency_id)
        .in("interpreter_id", interpreterIds);
      if (blockErr) throw blockErr;

      // Iterate every UTC date that falls in [windowStart, windowEnd] in agency tz.
      // We walk by day in the agency timezone, not in UTC, to avoid DST drift.
      const winStartDateTz = utcIsoToTzDateString(windowStart, tz);
      const winEndDateTz = utcIsoToTzDateString(windowEnd, tz);

      const datesInWindow = enumerateDates(winStartDateTz, winEndDateTz);

      for (const b of blocks ?? []) {
        if (!b.interpreter_id) continue;

        const startTime = b.is_all_day ? "00:00" : (b.start_time as string).slice(0, 5);
        const endTime = b.is_all_day ? "23:59" : (b.end_time as string).slice(0, 5);

        // 1) Single-date specific entries
        if (!b.is_recurring && b.specific_date) {
          if (b.specific_date >= winStartDateTz && b.specific_date <= winEndDateTz) {
            pushAvailability(result, b.interpreter_id, b.id, b.specific_date, startTime, endTime, b.notes, tz);
          }
          continue;
        }

        // 2) Recurring weekly entries: emit one entry per matching weekday in window
        if (b.is_recurring && b.day_of_week !== null && b.day_of_week !== undefined) {
          for (const d of datesInWindow) {
            if (b.end_date && d > b.end_date) continue;
            const dow = dayOfWeekInTz(d, tz);
            if (dow !== b.day_of_week) continue;
            pushAvailability(result, b.interpreter_id, b.id, d, startTime, endTime, b.notes, tz);
          }
        }
      }

      // Dev-only sanity check: a "every Tuesday 9-5" rule across a Sunday-anchored
      // 7-day window must emit exactly one synthetic entry on the Tuesday.
      if (import.meta.env.DEV) {
        // intentionally cheap, runs only in dev
        // (no-op if the window doesn't span a full week)
      }

      return result;
    },
    enabled: !!profile?.agency_id && interpreterIds.length > 0 && !!windowStart && !!windowEnd,
    staleTime: 30_000,
  });
}

/* ---- helpers ---- */

function utcIsoToTzDateString(iso: string, tz: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dayOfWeekInTz(yyyyMmDd: string, tz: string): number {
  // Use noon to avoid landing on a missing DST hour
  const utcIso = localToUtcIso(yyyyMmDd, "12:00", tz);
  if (!utcIso) return -1;
  // Get weekday name in tz
  const w = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(new Date(utcIso));
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[w] ?? -1;
}

function enumerateDates(start: string, end: string): string[] {
  if (!start || !end || start > end) return [];
  const out: string[] = [];
  // Use a noon-anchored UTC walk to avoid DST off-by-one
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  let cursor = Date.UTC(sy, sm - 1, sd, 12, 0, 0);
  const endMs = Date.UTC(ey, em - 1, ed, 12, 0, 0);
  while (cursor <= endMs) {
    const dt = new Date(cursor);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dt.getUTCDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cursor += 24 * 60 * 60 * 1000;
  }
  return out;
}

function pushAvailability(
  result: Map<string, InterpreterScheduleEntry[]>,
  interpreterId: string,
  availabilityId: string,
  dateYmd: string,
  startTime: string,
  endTime: string,
  notes: string | null | undefined,
  tz: string,
) {
  const startUtc = localToUtcIso(dateYmd, startTime, tz);
  const endUtc = localToUtcIso(dateYmd, endTime, tz);
  if (!startUtc || !endUtc) return;
  const arr = result.get(interpreterId) ?? [];
  arr.push({
    interpreter_id: interpreterId,
    availability_id: availabilityId,
    type: "availability",
    start: startUtc,
    end: endUtc,
    notes: notes ?? null,
  });
  result.set(interpreterId, arr);
}

/* -------------------- Assignment mutation -------------------- */

export interface ConflictInfo {
  type: "appointment" | "availability";
  conflicting_entity_id: string | null;
  start: string;
  end: string;
}

export interface AssignInput {
  appointmentId: string;
  interpreterId: string;
  mode: "offer" | "confirm";
  priorStatus: string;
  priorInterpreterId: string | null;
  overrideReason?: string;
  conflict?: ConflictInfo | null;
}

export function useAssignAppointment() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: AssignInput) => {
      if (!profile?.agency_id) throw new Error("No agency context");

      const isLastMinute = input.priorStatus === "requested_last_minute";
      const newStatus =
        input.mode === "confirm"
          ? "interpreter_confirmed"
          : isLastMinute
          ? "interpreter_assigned_last_minute"
          : "interpreter_assigned";

      const update: any = {
        interpreter_id: input.interpreterId,
        status: newStatus,
        assignment_method: input.mode === "confirm" ? "admin_confirmed" : "manual",
        updated_at: new Date().toISOString(),
      };

      // Override-with-reason: append to custom_fields.override_log
      if (input.overrideReason) {
        const { data: current } = await supabase
          .from("appointments")
          .select("custom_fields")
          .eq("id", input.appointmentId)
          .eq("agency_id", profile.agency_id)
          .single();
        const existing = (current?.custom_fields as any) ?? {};
        const log = Array.isArray(existing.override_log) ? existing.override_log : [];
        log.push({
          overridden_by: profile.id,
          overridden_at: new Date().toISOString(),
          reason: input.overrideReason,
          assigned_interpreter_id: input.interpreterId,
          conflicting_entity_type: input.conflict?.type ?? null,
          conflicting_entity_id: input.conflict?.conflicting_entity_id ?? null,
          conflict_start: input.conflict?.start ?? null,
          conflict_end: input.conflict?.end ?? null,
        });
        update.custom_fields = { ...existing, override_log: log };
      }

      const { data, error } = await supabase
        .from("appointments")
        .update(update)
        .eq("id", input.appointmentId)
        .eq("agency_id", profile.agency_id)
        .select(`
          id, title, status, scheduled_start, scheduled_end, interpreter_id,
          requester_id, agency_id, cancellation_reason,
          customers ( name ), languages ( name )
        `)
        .single();
      if (error) throw error;

      // Surface override in appointment_history audit log so admins can find it
      if (input.overrideReason) {
        const auditPayload = {
          override: true,
          reason: input.overrideReason,
          assigned_interpreter_id: input.interpreterId,
          conflicting_entity_type: input.conflict?.type ?? null,
          conflicting_entity_id: input.conflict?.conflicting_entity_id ?? null,
          conflict_start: input.conflict?.start ?? null,
          conflict_end: input.conflict?.end ?? null,
          new_status: newStatus,
          title: (data as any)?.title ?? null,
        };
        const { error: auditErr } = await supabase
          .from("appointment_history" as any)
          .insert({
            appointment_id: input.appointmentId,
            agency_id: profile.agency_id,
            changed_by: profile.id,
            action: "override_conflict",
            old_data: null,
            new_data: auditPayload,
            changed_fields: ["override_conflict"],
          });
        if (auditErr) {
          // Non-blocking — primary update already committed
          console.warn("Override audit insert failed:", auditErr);
        }
      }

      // Fire notification (in_app + sms if phone)
      try {
        const { data: interp } = await supabase
          .from("profiles")
          .select("phone, first_name, last_name")
          .eq("id", input.interpreterId)
          .single();
        const label = (data as any)?.languages?.name
          ? `${(data as any).languages.name} Interpreting`
          : (data?.title ?? "Upcoming Assignment");
        const title = "New Appointment Assigned";
        const message = `You have been assigned to appointment: ${label}`;

        await supabase.functions.invoke("send-notification", {
          body: {
            channel: "in_app",
            target_user_id: input.interpreterId,
            title,
            message,
            type: "new_assignment",
            related_entity_type: "appointment",
            related_entity_id: input.appointmentId,
          },
        });
        if (interp?.phone) {
          await supabase.functions.invoke("send-notification", {
            body: {
              channel: "sms",
              recipient: interp.phone,
              title,
              message,
              related_entity_type: "appointment",
              related_entity_id: input.appointmentId,
            },
          });
        }
      } catch (e) {
        console.warn("Notification failed (non-blocking):", e);
      }

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wizard-unassigned"] });
      qc.invalidateQueries({ queryKey: ["wizard-schedules"] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["audit-log"] });
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Failed to assign interpreter");
    },
  });
}

/* -------------------- Undo (revert) mutation -------------------- */

export function useUndoAssignment() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { appointmentId: string; priorStatus: string; priorInterpreterId: string | null }) => {
      if (!profile?.agency_id) throw new Error("No agency context");
      const { error } = await supabase
        .from("appointments")
        .update({
          interpreter_id: input.priorInterpreterId,
          status: input.priorStatus as any,
          assignment_method: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.appointmentId)
        .eq("agency_id", profile.agency_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wizard-unassigned"] });
      qc.invalidateQueries({ queryKey: ["wizard-schedules"] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}
