import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useAgencyStatus() {
  const { profile, isDemoMode } = useAuth();

  const { data: agencyStatus, isLoading } = useQuery({
    queryKey: ["agency-status", profile?.agency_id],
    queryFn: async () => {
      if (!profile?.agency_id) return null;
      const { data, error } = await supabase
        .from("agencies")
        .select("agency_status")
        .eq("id", profile.agency_id)
        .single();
      if (error) return null;
      return data?.agency_status as string | null;
    },
    enabled: !!profile?.agency_id && !isDemoMode,
    staleTime: 2 * 60 * 1000,
  });

  return {
    agencyStatus: isDemoMode ? "active" : agencyStatus,
    isLoading: isDemoMode ? false : isLoading,
    isPendingApproval: agencyStatus === "pending_approval",
  };
}
