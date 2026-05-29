import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ActiveSupportSession {
  id: string;
  agency_id: string;
  agency_name: string;
  reason: string;
  started_at: string;
}

export function useSupportSession() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: activeSession, isLoading } = useQuery({
    queryKey: ['active-support-session', user?.id],
    queryFn: async (): Promise<ActiveSupportSession | null> => {
      if (!user) return null;
      const { data, error } = await (supabase as any)
        .from('support_sessions')
        .select('id, agency_id, reason, started_at, agencies!support_sessions_agency_id_fkey(name)')
        .eq('platform_user_id', user.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      return {
        id: data.id,
        agency_id: data.agency_id,
        agency_name: data.agencies?.name || 'Unknown',
        reason: data.reason,
        started_at: data.started_at,
      };
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['active-support-session'] });
  };

  return { activeSession: activeSession ?? null, isLoading, invalidate };
}
