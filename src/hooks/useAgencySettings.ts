import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoData } from "@/contexts/DemoDataContext";
import { useAdaptedQuery, useAdaptedMutation } from "@/lib/data-adapter";
import { STATUS_LABELS } from "@/lib/status-labels";

export { STATUS_LABELS };

export const ALL_STATUSES = [
  "requested", "requested_last_minute",
  "interpreter_assigned", "interpreter_assigned_last_minute",
  "interpreter_confirmed", "reassignment_needed",
  "in_progress",
  "completed", "completed_last_minute",
  "cancelled", "late_cancel_no_show_client", "no_show_interpreter",
] as const;

export type AppointmentStatus = (typeof ALL_STATUSES)[number];

/** Hardcoded v3 role-based status visibility for dropdowns and filters */
const ROLE_VISIBLE_STATUSES: Record<string, readonly AppointmentStatus[]> = {
  agency_admin: ALL_STATUSES,
  scheduler: ALL_STATUSES,
  interpreter: [
    "interpreter_assigned", "interpreter_assigned_last_minute",
    "interpreter_confirmed", "reassignment_needed",
    "in_progress",
    "completed", "completed_last_minute",
    "cancelled", "late_cancel_no_show_client", "no_show_interpreter",
  ],
  requester: [
    "requested", "requested_last_minute",
    "interpreter_assigned", "interpreter_assigned_last_minute",
    "interpreter_confirmed",
    "in_progress",
    "completed", "completed_last_minute",
    "cancelled", "late_cancel_no_show_client",
  ],
};

export interface AgencySettings {
  regions_enabled?: boolean;
  billing_periodicity?: "weekly" | "biweekly" | "monthly";
  [key: string]: any;
}

export function useAgencySettings() {
  const { profile, isDemoMode, primaryRole } = useAuth();
  const { state } = useDemoData();

  const query = useAdaptedQuery<AgencySettings>({
    queryKey: ["agency-settings", profile?.agency_id],
    queryFn: async () => {
      if (!profile?.agency_id) return {} as AgencySettings;
      const { data, error } = await supabase
        .from("agencies").select("settings").eq("id", profile.agency_id).single();
      if (error) throw error;
      return (data?.settings as AgencySettings) ?? {};
    },
    demoFn: () => (state as any).agencySettings ?? {},
    enabled: !!profile?.agency_id,
  });

  const settings: AgencySettings = query.data ?? {};

  const updateSettings = useAdaptedMutation<Partial<AgencySettings>>({
    mutationFn: async (patch) => {
      const merged = { ...settings, ...patch };
      const { error } = await supabase
        .from("agencies").update({ settings: merged as any }).eq("id", profile!.agency_id!);
      if (error) throw error;
      return merged;
    },
    demoFn: (patch) => {
      const merged = { ...settings, ...patch };
      (state as any).agencySettings = merged;
      return merged;
    },
    invalidateKeys: [["agency-settings"]],
    successMessage: "Settings updated",
  });

  const getVisibleStatuses = (): AppointmentStatus[] => {
    if (!primaryRole) return [...ALL_STATUSES];
    return [...(ROLE_VISIBLE_STATUSES[primaryRole] ?? ALL_STATUSES)];
  };

  return {
    settings, regionsEnabled: settings.regions_enabled === true,
    selfClaimEnabled: settings.enable_self_claim !== false,
    billingPeriodicity: settings.billing_periodicity ?? "monthly",
    getVisibleStatuses, updateSettings,
    isLoading: query.isLoading,
  };
}
