import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoData } from "@/contexts/DemoDataContext";
import { DEMO_AGENCY_ID } from "@/contexts/DemoContext";
import { useAdaptedQuery, useAdaptedMutation } from "@/lib/data-adapter";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { format, addMinutes, differenceInMinutes } from "date-fns";
import { localToUtcIso } from "@/lib/agency-timezone";
import { useAgencyTimezone } from "./useAgencyTimezone";
import {
  assignInterpreterWithConflictCheck,
  checkInterpreterScheduleConflictsBatch,
  type AssignMode,
} from "@/lib/scheduling-rpc";

/** Optional interpreter assignment handled server-side after insert/update */
export type InterpreterAssignMeta = {
  assignInterpreterId?: string;
  assignMode?: AssignMode;
  assignOverrideReason?: string;
};

export type Customer = Tables<"customers">;
export type Location = Tables<"locations">;
export type Appointment = Tables<"appointments">;
export type Language = Tables<"languages">;
export type Profile = Tables<"profiles">;

/* ------------------------------------------------------------------ */
/*  Customers                                                          */
/* ------------------------------------------------------------------ */

export function useCustomers() {
  const { profile } = useAuth();
  const { state } = useDemoData();
  return useAdaptedQuery<Customer[]>({
    queryKey: ["customers", profile?.agency_id],
    queryFn: async () => {
      if (!profile?.agency_id) return [];
      const { data, error } = await supabase
        .from("customers").select("id, name, contact_name, contact_email, contact_phone, billing_email, notes, is_active, agency_id, created_at, updated_at").eq("agency_id", profile.agency_id).eq("is_import_staged", false).eq("is_deleted", false).order("name");
      if (error) throw error;
      return data as Customer[];
    },
    demoFn: () => state.customers as any[],
    enabled: !!profile?.agency_id,
    staleTime: 120_000, // customers change infrequently
  });
}

export function useCustomerMutations() {
  const { profile } = useAuth();
  const { addItem, updateItem, deleteItem, genId } = useDemoData();

  const create = useAdaptedMutation<Omit<TablesInsert<"customers">, "agency_id">>({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from("customers").insert({ ...input, agency_id: profile!.agency_id! }).select().single();
      if (error) throw error;
      return data;
    },
    demoFn: (input) => {
      const item = {
        id: genId("demo-cust"), agency_id: DEMO_AGENCY_ID, ...input,
        is_active: (input as any).is_active ?? true,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      addItem("customers", item);
      return item;
    },
    invalidateKeys: [["customers"]],
    successMessage: "Customer created",
  });

  const update = useAdaptedMutation<TablesUpdate<"customers"> & { id: string }>({
    mutationFn: async ({ id, ...input }) => {
      const { data, error } = await supabase.from("customers").update(input).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    demoFn: ({ id, ...input }) => { updateItem("customers", id, input); return { id, ...input }; },
    invalidateKeys: [["customers"]],
    successMessage: "Customer updated",
  });

  const remove = useAdaptedMutation<string>({
    mutationFn: async (id) => {
      const { error } = await supabase.from("customers").update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: profile?.id ?? null,
      }).eq("id", id);
      if (error) throw error;
    },
    demoFn: (id) => { deleteItem("customers", id); },
    invalidateKeys: [["customers"]],
    successMessage: "Customer archived",
  });

  return { create, update, remove };
}

/* ------------------------------------------------------------------ */
/*  Locations                                                          */
/* ------------------------------------------------------------------ */

export function useLocations(customerId?: string) {
  const { profile } = useAuth();
  const { state } = useDemoData();
  return useAdaptedQuery<Location[]>({
    queryKey: ["locations", profile?.agency_id, customerId],
    queryFn: async () => {
      if (!profile?.agency_id) return [];
      let q = supabase.from("locations").select("*").eq("agency_id", profile.agency_id).eq("is_import_staged", false).eq("is_deleted", false);
      if (customerId) q = q.eq("customer_id", customerId);
      const { data, error } = await q.order("name");
      if (error) throw error;
      return data as Location[];
    },
    demoFn: () => {
      const locs = state.locations as any[];
      return customerId ? locs.filter((l: any) => l.customer_id === customerId) : locs;
    },
    enabled: !!profile?.agency_id,
    staleTime: 120_000,
  });
}

export function useLocationMutations() {
  const { profile } = useAuth();
  const { addItem, genId } = useDemoData();

  const create = useAdaptedMutation<Omit<TablesInsert<"locations">, "agency_id">>({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from("locations").insert({ ...input, agency_id: profile!.agency_id! }).select().single();
      if (error) throw error;

      // If the creator is a restricted requester for this customer, auto-link the new
      // location so it shows up in their dropdowns. No-op for admins/schedulers or for
      // requesters with access_all_locations=true.
      try {
        if (data?.customer_id && profile?.id) {
          const { data: cr } = await supabase
            .from("customer_requestors")
            .select("id, access_all_locations")
            .eq("user_id", profile.id)
            .eq("customer_id", data.customer_id)
            .eq("is_active", true)
            .eq("is_deleted", false)
            .maybeSingle();
          if (cr && !cr.access_all_locations) {
            await supabase
              .from("requestor_locations")
              .insert({ customer_requestor_id: cr.id, location_id: data.id });
          }
        }
      } catch {
        // Non-fatal: location was created successfully even if auto-link fails.
      }
      return data;
    },
    demoFn: (input) => {
      const item = { id: genId("demo-loc"), agency_id: DEMO_AGENCY_ID, ...input, created_at: new Date().toISOString() };
      addItem("locations", item);
      return item;
    },
    invalidateKeys: [["locations"], ["requestor-locations"]],
    successMessage: "Location created",
  });

  const update = useAdaptedMutation<{ id: string } & Partial<TablesInsert<"locations">>>({
    mutationFn: async ({ id, ...input }) => {
      const { data, error } = await supabase.from("locations").update(input).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    demoFn: ({ id, ...input }) => input,
    invalidateKeys: [["locations"]],
    successMessage: "Location updated",
  });

  const remove = useAdaptedMutation<string>({
    mutationFn: async (id) => {
      const { error } = await supabase.from("locations").update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: profile?.id ?? null,
      }).eq("id", id);
      if (error) throw error;
    },
    demoFn: () => {},
    invalidateKeys: [["locations"]],
    successMessage: "Location archived",
  });

  const toggleActive = useAdaptedMutation<{ id: string; is_active: boolean }>({
    mutationFn: async ({ id, is_active }) => {
      const { error } = await supabase.from("locations").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    demoFn: () => {},
    invalidateKeys: [["locations"]],
    successMessage: "Location updated",
  });

  return { create, update, remove, toggleActive };
}

/* ------------------------------------------------------------------ */
/*  Languages                                                          */
/* ------------------------------------------------------------------ */

export function useLanguages() {
  const { state } = useDemoData();
  return useAdaptedQuery<Language[]>({
    queryKey: ["languages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("languages").select("*").order("name");
      if (error) throw error;
      return data as Language[];
    },
    demoFn: () => state.languages as any[],
    staleTime: 300_000, // languages rarely change
  });
}

/* ------------------------------------------------------------------ */
/*  Appointments                                                       */
/* ------------------------------------------------------------------ */

export function useAppointments(filters?: { date?: Date; status?: string; interpreterId?: string; customerId?: string }) {
  const { profile } = useAuth();
  const { state } = useDemoData();
  return useAdaptedQuery({
    queryKey: ["appointments", profile?.agency_id, filters?.date?.toISOString(), filters?.status, filters?.interpreterId, filters?.customerId],
    queryFn: async () => {
      if (!profile?.agency_id) return [];
      let q = supabase
        .from("appointments")
        .select("*, customers(name), locations(name, address_line1, city, state, zip_code), languages(name, code), interpreter:profiles!appointments_interpreter_id_fkey(first_name, last_name), requester:profiles!appointments_requester_id_fkey(first_name, last_name)")
        .eq("agency_id", profile.agency_id)
        .eq("is_import_staged", false).eq("is_deleted", false)
        .order("scheduled_start", { ascending: true });
      if (filters?.status && filters.status !== "all") {
        q = q.eq("status", filters.status as any);
      }
      // Server-side interpreter scoping: only fetch this interpreter's appointments
      if (filters?.interpreterId) {
        q = q.eq("interpreter_id", filters.interpreterId);
      }
      // Server-side customer scoping: only fetch this customer's appointments
      if (filters?.customerId) {
        q = q.eq("customer_id", filters.customerId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    demoFn: () => {
      let result = [...state.appointments];
      if (filters?.status && filters.status !== "all") {
        result = result.filter((a: any) => a.status === filters.status);
      }
      if (filters?.interpreterId) {
        result = result.filter((a: any) => a.interpreter_id === filters.interpreterId);
      }
      if (filters?.customerId) {
        result = result.filter((a: any) => a.customer_id === filters.customerId);
      }
      return result as any[];
    },
    enabled: !!profile?.agency_id,
  });
}

/* ------------------------------------------------------------------ */
/*  Appointment notifications (production only, no demo branching)     */
/* ------------------------------------------------------------------ */

/**
 * Build a meaningful label for an appointment, falling back through
 * title → language → formatted date → generic string.
 * Works with both raw appointment rows and joined query results.
 */
export function getAppointmentLabel(appt: any): string {
  if (appt?.title) return appt.title;
  // Joined language name (from .select("languages(name)"))
  const lang = appt?.languages?.name || appt?.language_name;
  // Joined customer name
  const customer = appt?.customers?.name || appt?.customer_name;
  if (lang && customer) return `${lang} – ${customer}`;
  if (lang) return `${lang} Interpreting`;
  if (customer) return customer;
  // Date fallback
  const start = appt?.scheduled_start;
  if (start) {
    try {
      return format(new Date(start), "MMM d, yyyy 'at' h:mm a");
    } catch {
      return start;
    }
  }
  return "Upcoming Assignment";
}

type BookingEventType = "created" | "updated" | "cancelled" | "unassigned";

export async function sendAppointmentNotifications(
  appointmentData: any,
  agencyId: string,
  eventType: BookingEventType,
  options?: { overrideInterpreterId?: string | null },
) {
  try {
    const label = getAppointmentLabel(appointmentData);
    const titles: Record<BookingEventType, string> = {
      created: "New Appointment Assigned",
      updated: "Appointment Updated",
      cancelled: "Appointment Cancelled",
      unassigned: "Removed from Appointment",
    };
    const interpreterMessages: Record<BookingEventType, string> = {
      created: `You have been assigned to appointment: ${label}`,
      updated: `Your appointment has been updated: ${label}`,
      cancelled: `An appointment has been cancelled: ${label}${appointmentData.cancellation_reason ? `. Reason: ${appointmentData.cancellation_reason}` : ""}`,
      unassigned: `You have been removed from appointment: ${label}`,
    };
    const notifTypes: Record<BookingEventType, string> = {
      created: "new_assignment",
      updated: "assignment",
      cancelled: "cancellation",
      unassigned: "assignment_removed",
    };
    const title = titles[eventType];
    const message = interpreterMessages[eventType];
    const notifType = notifTypes[eventType];

    // Notify interpreter (use override for unassignment, since the row no longer has interpreter_id)
    const interpreterId = options?.overrideInterpreterId ?? appointmentData.interpreter_id;
    if (interpreterId) {
      const { data: interpreterProfile } = await supabase
        .from("profiles").select("phone, first_name, last_name").eq("id", interpreterId).single();

      await supabase.functions.invoke("send-notification", {
        body: { channel: "in_app", target_user_id: interpreterId, title, message, type: notifType, related_entity_type: "appointment", related_entity_id: appointmentData.id },
      });
      if (interpreterProfile?.phone) {
        await supabase.functions.invoke("send-notification", {
          body: { channel: "sms", recipient: interpreterProfile.phone, title, message, related_entity_type: "appointment", related_entity_id: appointmentData.id },
        });
      }
    }

    // Notify requester (skip for unassignment — that's an internal staffing change)
    if (eventType !== "unassigned") {
      const requesterId = appointmentData.requester_id;
      if (requesterId && requesterId !== interpreterId) {
        const requesterMsg = eventType === "cancelled"
          ? `Your requested appointment has been cancelled: ${label}`
          : eventType === "created"
          ? `Your interpreter request has been confirmed: ${label}`
          : `Your appointment has been updated: ${label}`;

        await supabase.functions.invoke("send-notification", {
          body: { channel: "in_app", target_user_id: requesterId, title, message: requesterMsg, type: notifType, related_entity_type: "appointment", related_entity_id: appointmentData.id },
        });
      }
    }
  } catch (e) {
    console.error("Failed to send appointment notifications:", e);
  }
}

/**
 * Fire-and-forget Google Calendar sync on appointment lifecycle events.
 * Does NOT block appointment mutations if sync fails.
 */
export async function triggerCalendarSync(
  appointmentId: string,
  action: "sync" | "delete",
) {
  try {
    await supabase.functions.invoke("google-calendar-sync", {
      body: { action, appointment_id: appointmentId },
    });
  } catch (e) {
    console.warn("Calendar sync skipped (non-blocking):", e);
  }
}

export async function sendCompletionNotification(appointmentData: any, agencyId: string, completedByName: string) {
  try {
    const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("agency_id", agencyId).eq("role", "agency_admin");
    if (!adminRoles?.length) return;
    const title = "Appointment Completed";
    const message = `${completedByName} has completed appointment: ${getAppointmentLabel(appointmentData)}`;
    for (const admin of adminRoles) {
      if (admin.user_id === appointmentData.interpreter_id) continue;
      await supabase.functions.invoke("send-notification", {
        body: { channel: "in_app", target_user_id: admin.user_id, title, message, type: "success", related_entity_type: "appointment", related_entity_id: appointmentData.id },
      });
    }
  } catch (e) {
    console.error("Failed to send completion notifications:", e);
  }
}

/* ------------------------------------------------------------------ */
/*  Appointment mutations                                              */
/* ------------------------------------------------------------------ */

// Demo-specific strategies
function createDemoAppointment(
  input: any,
  { genId, enrichAppointment, addItem, userId }: any,
) {
  const raw = {
    id: genId("demo-appt"), agency_id: DEMO_AGENCY_ID, ...input,
    status: input.status || (input.interpreter_id ? "interpreter_assigned" : "requested"),
    requester_id: input.requester_id || userId || null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  const enriched = enrichAppointment(raw);
  addItem("appointments", enriched);
  return enriched;
}

function updateDemoAppointment(
  id: string, input: any,
  { enrichAppointment, updateItem }: any,
) {
  const enrichUpdates = enrichAppointment({ ...input });
  const merged = { ...input };
  if (input.customer_id !== undefined) merged.customers = enrichUpdates.customers;
  if (input.location_id !== undefined) merged.locations = enrichUpdates.locations;
  if (input.language_id !== undefined) merged.languages = enrichUpdates.languages;
  if (input.interpreter_id !== undefined) merged.interpreter = enrichUpdates.interpreter;
  updateItem("appointments", id, merged);
  return { id, ...merged };
}

export function useAppointmentMutations() {
  const { profile, user, isDemoMode } = useAuth();
  const qc = useQueryClient();
  const demoCtx = useDemoData();
  const agencyTz = useAgencyTimezone();

  const create = useAdaptedMutation<
    Omit<TablesInsert<"appointments">, "agency_id"> & InterpreterAssignMeta
  >({
    mutationFn: async (input) => {
      const {
        assignInterpreterId,
        assignMode = "offer",
        assignOverrideReason,
        ...row
      } = input;
      const insertRow: Record<string, unknown> = { ...row };
      if (assignInterpreterId) {
        delete insertRow.interpreter_id;
        delete insertRow.status;
        delete insertRow.assignment_method;
      }
      const { data, error } = await supabase
        .from("appointments")
        .insert({ ...insertRow, agency_id: profile!.agency_id! } as TablesInsert<"appointments">)
        .select()
        .single();
      if (error) throw error;
      if (assignInterpreterId && data?.id) {
        await assignInterpreterWithConflictCheck(
          data.id,
          assignInterpreterId,
          assignMode === "confirm" ? "confirm" : "offer",
          assignOverrideReason,
        );
        const { data: refreshed } = await supabase
          .from("appointments")
          .select()
          .eq("id", data.id)
          .single();
        return refreshed ?? data;
      }
      return data;
    },
    demoFn: (input) => createDemoAppointment(input, { ...demoCtx, userId: user?.id }),
    invalidateKeys: [["appointments"], ["paginated-appointments"], ["dashboard-grouped-counts"], ["dashboard-nonwindowed-counts"], ["dashboard-today-counts"], ["dashboard-recent-activity"]],
    successMessage: "Appointment created",
    onSuccess: (data: any) => {
      if (!isDemoMode && profile?.agency_id) {
        if (data?.interpreter_id || data?.requester_id) {
          sendAppointmentNotifications(data, profile.agency_id, "created");
        }
        if (data?.id) {
          triggerCalendarSync(data.id, "sync");
        }
      }
    },
  });

  const update = useAdaptedMutation<
    TablesUpdate<"appointments"> & { id: string } & InterpreterAssignMeta
  >({
    mutationFn: async ({ id, assignInterpreterId, assignMode = "offer", assignOverrideReason, ...input }) => {
      // Capture previous interpreter_id BEFORE update so we can detect unassignment
      let previousInterpreterId: string | null = null;
      try {
        const { data: prev } = await supabase
          .from("appointments").select("interpreter_id").eq("id", id).single();
        previousInterpreterId = prev?.interpreter_id ?? null;
      } catch {
        // Non-blocking — fall through to update
      }
      const payload: Record<string, unknown> = { ...input };
      if (assignInterpreterId) {
        delete payload.interpreter_id;
        delete payload.status;
        delete payload.assignment_method;
      }
      const { data, error } = await supabase
        .from("appointments")
        .update(payload as TablesUpdate<"appointments">)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      let result = data;
      if (assignInterpreterId) {
        await assignInterpreterWithConflictCheck(
          id,
          assignInterpreterId,
          assignMode === "confirm" ? "confirm" : "offer",
          assignOverrideReason,
        );
        const { data: refreshed } = await supabase
          .from("appointments")
          .select()
          .eq("id", id)
          .single();
        result = refreshed ?? data;
      }
      return { ...result, __previousInterpreterId: previousInterpreterId };
    },
    demoFn: ({ id, ...input }) => updateDemoAppointment(id, input, demoCtx),
    invalidateKeys: [["appointments"], ["paginated-appointments"], ["dashboard-grouped-counts"], ["dashboard-nonwindowed-counts"], ["dashboard-today-counts"], ["dashboard-recent-activity"]],
    successMessage: "Appointment updated",
    onSuccess: async (data: any) => {
      if (!isDemoMode && profile?.agency_id && data?.id) {
        const previousInterpreterId: string | null = data.__previousInterpreterId ?? null;
        // Re-fetch fresh row for notification payload to avoid stale concurrent state
        let freshData = data;
        try {
          const { data: refetched } = await supabase
            .from("appointments")
            .select("id, status, title, interpreter_id, requester_id, cancellation_reason, scheduled_start, languages(name), customers(name)")
            .eq("id", data.id)
            .single();
          if (refetched) freshData = { ...data, ...refetched };
        } catch {
          // Fall back to mutation return data
        }
        const isCancellation = freshData?.status === "cancelled";
        const newInterpreterId = freshData?.interpreter_id ?? null;
        const wasUnassigned = previousInterpreterId && previousInterpreterId !== newInterpreterId;

        // Notify the previously-assigned interpreter that they have been removed
        if (wasUnassigned && !isCancellation) {
          sendAppointmentNotifications(freshData, profile.agency_id, "unassigned", {
            overrideInterpreterId: previousInterpreterId,
          });
        }

        if (freshData?.interpreter_id || freshData?.requester_id) {
          sendAppointmentNotifications(freshData, profile.agency_id, isCancellation ? "cancelled" : "updated");
        }
        if (freshData?.id) {
          triggerCalendarSync(freshData.id, isCancellation ? "delete" : "sync");
        }
      }
    },
  });

  // Bulk create for recurring appointments
  const bulkCreate = useAdaptedMutation<{
    baseInput: any;
    dates: string[];
    startTime: string;
    endTime: string;
    assignMode?: AssignMode;
    assignOverrideReason?: string;
  }>({
    mutationFn: async ({ baseInput, dates, startTime, assignMode = "offer", assignOverrideReason }) => {
      if (!profile?.agency_id) throw new Error("No agency");
      const origStart = baseInput.scheduled_start ? new Date(baseInput.scheduled_start) : null;
      const origEnd = baseInput.scheduled_end ? new Date(baseInput.scheduled_end) : null;
      const durationMins = origStart && origEnd ? differenceInMinutes(origEnd, origStart) : 60;

      const interpreterId: string | undefined = baseInput.interpreter_id ?? undefined;
      const insertBase = { ...baseInput };
      delete insertBase.interpreter_id;
      delete insertBase.status;
      delete insertBase.assignment_method;

      const occurrences = dates.map((d) => {
        const startIso = localToUtcIso(d, startTime, agencyTz);
        if (!startIso) throw new Error(`Invalid start time for occurrence on ${d}`);
        return {
          start: startIso,
          end: addMinutes(new Date(startIso), durationMins).toISOString(),
        };
      });

      if (interpreterId) {
        const batch = await checkInterpreterScheduleConflictsBatch(interpreterId, occurrences);
        if (batch.has_conflict) {
          throw new Error(
            `Cannot create recurring series: interpreter has ${batch.conflicts.length} scheduling conflict(s). Choose another interpreter or adjust times.`,
          );
        }
      }

      const parentRow: any = {
        ...insertBase,
        agency_id: profile.agency_id,
        recurrence_rule: baseInput.recurrence_rule,
        scheduled_start: occurrences[0].start,
        scheduled_end: occurrences[0].end,
      };

      const { data: parent, error: parentError } = await supabase
        .from("appointments")
        .insert(parentRow)
        .select("id")
        .single();
      if (parentError) throw parentError;

      const children = dates.slice(1).map((d, idx) => ({
        ...insertBase,
        agency_id: profile.agency_id,
        parent_recurring_id: parent.id,
        recurrence_rule: null,
        scheduled_start: occurrences[idx + 1].start,
        scheduled_end: occurrences[idx + 1].end,
      }));

      let childIds: string[] = [];
      if (children.length > 0) {
        const { data: insertedChildren, error: childError } = await supabase
          .from("appointments")
          .insert(children)
          .select("id");
        if (childError) throw childError;
        childIds = (insertedChildren ?? []).map((c) => c.id);
      }

      if (interpreterId) {
        const rpcMode = assignMode === "confirm" ? "confirm" : "offer";
        for (const apptId of [parent.id, ...childIds]) {
          await assignInterpreterWithConflictCheck(
            apptId,
            interpreterId,
            rpcMode,
            assignOverrideReason,
          );
        }
      }

      return { count: dates.length, parentId: parent.id };
    },
    demoFn: ({ baseInput, dates, startTime }) => {
      const origStart = baseInput.scheduled_start ? new Date(baseInput.scheduled_start) : null;
      const origEnd = baseInput.scheduled_end ? new Date(baseInput.scheduled_end) : null;
      const durationMins = origStart && origEnd ? differenceInMinutes(origEnd, origStart) : 60;

      const parentId = demoCtx.genId("demo-appt");
      const parentStart = new Date(`${dates[0]}T${startTime}`);
      const parentEnriched = demoCtx.enrichAppointment({
        id: parentId, ...baseInput, agency_id: DEMO_AGENCY_ID,
        recurrence_rule: baseInput.recurrence_rule,
        scheduled_start: parentStart.toISOString(),
        scheduled_end: addMinutes(parentStart, durationMins).toISOString(),
        requester_id: user?.id || null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      demoCtx.addItem("appointments", parentEnriched);

      for (let i = 1; i < dates.length; i++) {
        const childStart = new Date(`${dates[i]}T${startTime}`);
        const childEnriched = demoCtx.enrichAppointment({
          id: demoCtx.genId("demo-appt"), ...baseInput, agency_id: DEMO_AGENCY_ID,
          parent_recurring_id: parentId, recurrence_rule: null,
          scheduled_start: childStart.toISOString(),
          scheduled_end: addMinutes(childStart, durationMins).toISOString(),
          requester_id: user?.id || null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        });
        demoCtx.addItem("appointments", childEnriched);
      }
      return { count: dates.length };
    },
    invalidateKeys: [["appointments"], ["paginated-appointments"], ["dashboard-grouped-counts"], ["dashboard-nonwindowed-counts"], ["dashboard-today-counts"], ["dashboard-recent-activity"]],
    successMessage: undefined,
    onSuccess: (data: any) => {
      // Custom toast with count
    },
  });

  // Bulk update series — with per-item error handling for concurrency safety
  const bulkUpdate = useAdaptedMutation<{
    parentId: string; updateData: any; scope: "future" | "all"; currentAppointmentDate?: string;
  }>({
    mutationFn: async ({ parentId, updateData, scope, currentAppointmentDate }) => {
      const { data: series, error } = await supabase
        .from("appointments").select("id, scheduled_start, updated_at").or(`id.eq.${parentId},parent_recurring_id.eq.${parentId}`);
      if (error) throw error;
      const toUpdate = series?.filter((s) => scope === "all" || !currentAppointmentDate || (s.scheduled_start && s.scheduled_start >= currentAppointmentDate)) || [];
      const { scheduled_start, scheduled_end, ...safeUpdate } = updateData;
      let succeeded = 0;
      let failed = 0;
      for (const item of toUpdate) {
        const { error: itemError } = await supabase
          .from("appointments")
          .update(safeUpdate)
          .eq("id", item.id)
          .eq("updated_at", item.updated_at); // Optimistic concurrency check
        if (itemError) {
          failed++;
        } else {
          succeeded++;
        }
      }
      if (failed > 0) {
        throw new Error(`Updated ${succeeded} of ${toUpdate.length} appointments. ${failed} were modified concurrently — please review and retry.`);
      }
    },
    demoFn: ({ parentId, updateData, scope, currentAppointmentDate }) => {
      const siblings = demoCtx.state.appointments.filter(
        (a: any) => a.id === parentId || a.parent_recurring_id === parentId
      );
      for (const s of siblings) {
        if (scope === "all" || (scope === "future" && (!currentAppointmentDate || s.scheduled_start >= currentAppointmentDate))) {
          demoCtx.updateItem("appointments", s.id, updateData);
        }
      }
    },
    invalidateKeys: [["appointments"], ["paginated-appointments"], ["dashboard-grouped-counts"], ["dashboard-nonwindowed-counts"], ["dashboard-today-counts"], ["dashboard-recent-activity"]],
    successMessage: "Series updated",
  });

  // Bulk delete series
  const bulkDelete = useAdaptedMutation<{
    parentId: string; scope: "this" | "future" | "all"; currentAppointmentDate?: string;
  }>({
    mutationFn: async ({ parentId, scope, currentAppointmentDate }) => {
      const { data: series, error } = await supabase
        .from("appointments").select("id, scheduled_start").or(`id.eq.${parentId},parent_recurring_id.eq.${parentId}`);
      if (error) throw error;
      const toDelete = series?.filter((s) => scope === "all" || !currentAppointmentDate || (s.scheduled_start && s.scheduled_start >= currentAppointmentDate)) || [];
      for (const item of toDelete) {
        await supabase.from("appointments").update({ status: "cancelled" as any, cancelled_at: new Date().toISOString() }).eq("id", item.id);
      }
    },
    demoFn: ({ parentId, scope, currentAppointmentDate }) => {
      const siblings = demoCtx.state.appointments.filter(
        (a: any) => a.id === parentId || a.parent_recurring_id === parentId
      );
      for (const s of siblings) {
        if (scope === "all" || (scope === "future" && (!currentAppointmentDate || s.scheduled_start >= currentAppointmentDate))) {
          demoCtx.updateItem("appointments", s.id, { status: "cancelled" });
        }
      }
    },
    invalidateKeys: [["appointments"], ["paginated-appointments"], ["dashboard-grouped-counts"], ["dashboard-nonwindowed-counts"], ["dashboard-today-counts"], ["dashboard-recent-activity"]],
    successMessage: "Series deleted",
  });

  return { create, update, bulkCreate, bulkUpdate, bulkDelete };
}

/* ------------------------------------------------------------------ */
/*  Agency interpreters                                                */
/* ------------------------------------------------------------------ */

export function useAgencyInterpreters(includeInactive = false) {
  const { profile } = useAuth();
  const { state } = useDemoData();
  return useAdaptedQuery({
    queryKey: ["agency-interpreters", profile?.agency_id, includeInactive],
    queryFn: async () => {
      if (!profile?.agency_id) return [];
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles").select("user_id").eq("agency_id", profile.agency_id).eq("role", "interpreter" as any);
      if (roleError) throw roleError;
      if (!roleData || roleData.length === 0) return [];
      const interpreterIds = roleData.map((r) => r.user_id);
      let q = supabase
        .from("profiles").select("id, first_name, last_name, email, phone, is_active, agency_id, admin_confirms").eq("agency_id", profile.agency_id).eq("is_import_staged", false).eq("is_deleted", false).in("id", interpreterIds);
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    demoFn: () => state.interpreters as any[],
    enabled: !!profile?.agency_id,
    staleTime: 60_000,
  });
}
