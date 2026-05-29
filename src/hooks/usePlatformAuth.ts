import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function usePlatformAuth() {
  const { user } = useAuth();

  const { data: isPlatformOwner = false, isLoading } = useQuery({
    queryKey: ['platform-role', user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await (supabase as any)
        .from('platform_roles')
        .select('id')
        .eq('user_id', user.id)
        .eq('role', 'platform_owner')
        .maybeSingle();
      return !!data && !error;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  return { isPlatformOwner, isLoading };
}
