import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdaptedQuery } from "@/lib/data-adapter";

export interface CustomerRequestor {
  id: string; customer_id: string; user_id: string; agency_id: string;
  access_all_locations: boolean; is_active: boolean;
  created_at: string; updated_at: string;
  profile?: { first_name: string | null; last_name: string | null; email: string | null; phone: string | null; is_active: boolean };
  locations?: { location_id: string }[];
}

export function useCustomerRequestors(customerId?: string) {
  const { profile } = useAuth();
  return useAdaptedQuery<CustomerRequestor[]>({
    queryKey: ["customer-requestors", customerId],
    queryFn: async () => {
      if (!customerId || !profile?.agency_id) return [];
      const { data, error } = await supabase
        .from("customer_requestors")
        .select("*, profile:profiles!customer_requestors_user_id_fkey(first_name, last_name, email, phone, is_active), locations:requestor_locations(location_id)")
        .eq("customer_id", customerId).eq("agency_id", profile.agency_id).eq("is_deleted", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CustomerRequestor[];
    },
    demoFn: () => [],
    enabled: !!customerId && !!profile?.agency_id,
  });
}

// Mutations don't use demo mode — re-export as-is
export { useCustomerRequestorMutations } from "@/hooks/useCustomerRequestorMutations";

export function useRequestorLocations(customerId?: string) {
  const { profile } = useAuth();
  return useAdaptedQuery<any[] | null>({
    queryKey: ["requestor-locations", customerId, profile?.id],
    queryFn: async () => {
      if (!customerId || !profile?.id) return null;
      const { data: cr } = await supabase
        .from("customer_requestors")
        .select("id, access_all_locations, is_active, locations:requestor_locations(location_id)")
        .eq("customer_id", customerId).eq("user_id", profile.id).single();
      if (!cr || !cr.is_active) return null;
      if (cr.access_all_locations) {
        const { data: locs } = await supabase.from("locations").select("*").eq("customer_id", customerId).eq("is_import_staged", false).eq("is_deleted", false).order("name");
        return locs ?? [];
      }
      const locIds = (cr.locations as any[])?.map((l: any) => l.location_id) ?? [];
      if (locIds.length === 0) return [];
      const { data: locs } = await supabase.from("locations").select("*").in("id", locIds).order("name");
      return locs ?? [];
    },
    demoFn: () => null,
    enabled: !!customerId && !!profile?.id,
  });
}
