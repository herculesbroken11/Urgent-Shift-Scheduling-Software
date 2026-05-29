/**
 * Patient continuity history lookup for ScheduleAssist scoring.
 *
 * Finds prior COMPLETED appointments for the same patient (matched by
 * customer_id + case-insensitive trimmed patient_client_name) so the scoring
 * engine can prioritize interpreters who have worked with this patient before.
 *
 * Strictly agency-scoped. Excludes soft-deleted rows.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PatientAppointment {
  interpreter_id: string;
  patient_client_name: string | null;
  customer_id: string | null;
  scheduled_start: string | null;
  status: string;
}

interface Args {
  agencyId: string | undefined;
  customerId: string | null | undefined;
  patientName: string | null | undefined;
}

export function usePatientHistory({ agencyId, customerId, patientName }: Args) {
  const normalized = (patientName ?? "").trim().toLowerCase();

  return useQuery<PatientAppointment[]>({
    queryKey: ["patient-history", agencyId, customerId, normalized],
    queryFn: async () => {
      if (!agencyId || !customerId || !normalized) return [];

      // We can't push a LOWER(TRIM(...)) comparison through PostgREST cleanly,
      // so we scope tightly by customer + agency + completed status (small set)
      // and filter the patient-name match client-side.
      const { data, error } = await supabase
        .from("appointments")
        .select("interpreter_id, patient_client_name, customer_id, scheduled_start, status")
        .eq("agency_id", agencyId)
        .eq("customer_id", customerId)
        .eq("is_deleted", false)
        .in("status", ["completed", "completed_last_minute"])
        .not("interpreter_id", "is", null)
        .not("patient_client_name", "is", null)
        .order("scheduled_start", { ascending: false })
        .limit(200);

      if (error) throw error;

      return (data ?? []).filter(
        (r) => (r.patient_client_name ?? "").trim().toLowerCase() === normalized,
      ) as PatientAppointment[];
    },
    enabled: !!agencyId && !!customerId && normalized.length > 0,
    staleTime: 60_000,
  });
}
