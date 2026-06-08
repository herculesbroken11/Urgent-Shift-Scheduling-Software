/**
 * Server-side scheduling RPC helpers (CP7 remediation).
 * Assignment and conflict checks must go through these functions in production.
 */
import { supabase } from "@/integrations/supabase/client";

export type AssignMode = "offer" | "confirm" | "self_claim";

export interface ScheduleConflict {
  appointment_id: string;
  scheduled_start: string;
  scheduled_end: string;
  status?: string;
  occurrence_index?: number;
}

export interface ConflictCheckResult {
  has_conflict: boolean;
  conflicts: ScheduleConflict[];
}

export function isInterpreterScheduleConflictError(error: unknown): boolean {
  const msg = (error as { message?: string })?.message ?? "";
  return msg.includes("interpreter_schedule_conflict");
}

export async function checkInterpreterScheduleConflicts(
  interpreterId: string,
  scheduledStart: string,
  scheduledEnd: string,
  excludeAppointmentId?: string,
): Promise<ConflictCheckResult> {
  const { data, error } = await supabase.rpc("check_interpreter_schedule_conflicts", {
    _interpreter_id: interpreterId,
    _scheduled_start: scheduledStart,
    _scheduled_end: scheduledEnd,
    _exclude_appointment_id: excludeAppointmentId ?? null,
  });
  if (error) throw error;
  const result = data as ConflictCheckResult;
  return {
    has_conflict: !!result?.has_conflict,
    conflicts: (result?.conflicts as ScheduleConflict[]) ?? [],
  };
}

export async function checkInterpreterScheduleConflictsBatch(
  interpreterId: string,
  occurrences: Array<{ start: string; end: string }>,
  excludeAppointmentId?: string,
): Promise<ConflictCheckResult> {
  const { data, error } = await supabase.rpc("check_interpreter_schedule_conflicts_batch", {
    _interpreter_id: interpreterId,
    _occurrences: occurrences,
    _exclude_appointment_id: excludeAppointmentId ?? null,
  });
  if (error) throw error;
  const result = data as ConflictCheckResult;
  return {
    has_conflict: !!result?.has_conflict,
    conflicts: (result?.conflicts as ScheduleConflict[]) ?? [],
  };
}

export async function assignInterpreterWithConflictCheck(
  appointmentId: string,
  interpreterId: string,
  mode: AssignMode,
  overrideReason?: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("assign_interpreter_with_conflict_check", {
    _appointment_id: appointmentId,
    _interpreter_id: interpreterId,
    _override_reason: overrideReason ?? null,
    _mode: mode,
  });
  if (error) throw error;
  const payload = data as { appointment?: Record<string, unknown> };
  return payload?.appointment ?? (data as Record<string, unknown>);
}
