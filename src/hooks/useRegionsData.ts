import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdaptedQuery, useAdaptedMutation } from "@/lib/data-adapter";
import { toast } from "sonner";

export function useRegions() {
  const { profile } = useAuth();
  return useAdaptedQuery<any[]>({
    queryKey: ["regions", profile?.agency_id],
    queryFn: async () => {
      if (!profile?.agency_id) return [];
      const { data, error } = await supabase.from("regions").select("*").eq("agency_id", profile.agency_id).eq("is_deleted", false).order("name");
      if (error) throw error;
      return data;
    },
    demoFn: () => [],
    enabled: !!profile?.agency_id,
  });
}

export function useRegionMutations() {
  const { profile } = useAuth();

  const create = useAdaptedMutation<{ name: string; description?: string }>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.from("regions").insert({ ...input, agency_id: profile!.agency_id! }).select().single();
      if (error) throw error;
      return data;
    },
    demoFn: (input) => input,
    invalidateKeys: [["regions"]],
    successMessage: "Region created",
  });

  const update = useAdaptedMutation<{ id: string; name?: string; description?: string }>({
    mutationFn: async ({ id, ...input }) => {
      const { data, error } = await supabase.from("regions").update(input).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    demoFn: ({ id, ...input }) => input,
    invalidateKeys: [["regions"]],
    successMessage: "Region updated",
  });

  const remove = useAdaptedMutation<string>({
    mutationFn: async (id) => {
      const { error } = await supabase.from("regions").update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      } as any).eq("id", id);
      if (error) throw error;
    },
    demoFn: () => {},
    invalidateKeys: [["regions"]],
    successMessage: "Region archived",
  });

  return { create, update, remove };
}

export function useInterpreterRegions(interpreterId?: string) {
  return useAdaptedQuery<any[]>({
    queryKey: ["interpreter-regions", interpreterId],
    queryFn: async () => {
      if (!interpreterId) return [];
      const { data, error } = await supabase.from("interpreter_regions").select("*, regions(id, name)").eq("interpreter_id", interpreterId);
      if (error) throw error;
      return data;
    },
    demoFn: () => [],
    enabled: !!interpreterId,
  });
}

export function useAllInterpreterRegions() {
  const { profile } = useAuth();
  return useAdaptedQuery<any[]>({
    queryKey: ["all-interpreter-regions", profile?.agency_id],
    queryFn: async () => {
      if (!profile?.agency_id) return [];
      const { data, error } = await supabase.from("interpreter_regions").select("*, regions(id, name)");
      if (error) throw error;
      return data;
    },
    demoFn: () => [],
    enabled: !!profile?.agency_id,
  });
}

export function useInterpreterRegionMutations() {
  const assign = useAdaptedMutation<{ interpreterId: string; regionId: string }>({
    mutationFn: async ({ interpreterId, regionId }) => {
      const { error } = await supabase.from("interpreter_regions").insert({ interpreter_id: interpreterId, region_id: regionId });
      if (error) throw error;
    },
    demoFn: () => {},
    invalidateKeys: [["interpreter-regions"], ["all-interpreter-regions"], ["region-counts"]],
  });

  const unassign = useAdaptedMutation<{ interpreterId: string; regionId: string }>({
    mutationFn: async ({ interpreterId, regionId }) => {
      const { error } = await supabase.from("interpreter_regions").delete().eq("interpreter_id", interpreterId).eq("region_id", regionId);
      if (error) throw error;
    },
    demoFn: () => {},
    invalidateKeys: [["interpreter-regions"], ["all-interpreter-regions"], ["region-counts"]],
  });

  return { assign, unassign };
}

export function useRegionCounts() {
  const { profile } = useAuth();
  return useAdaptedQuery<{ interpreters: Record<string, number>; locations: Record<string, number> }>({
    queryKey: ["region-counts", profile?.agency_id],
    queryFn: async () => {
      if (!profile?.agency_id) return { interpreters: {}, locations: {} };
      const [irResult, locResult] = await Promise.all([
        supabase.from("interpreter_regions").select("region_id"),
        supabase.from("locations").select("region_id").eq("agency_id", profile.agency_id).eq("is_import_staged", false).eq("is_deleted", false).not("region_id", "is", null),
      ]);
      const interpreters: Record<string, number> = {};
      (irResult.data ?? []).forEach((r) => { interpreters[r.region_id] = (interpreters[r.region_id] || 0) + 1; });
      const locations: Record<string, number> = {};
      (locResult.data ?? []).forEach((r) => { if (r.region_id) locations[r.region_id] = (locations[r.region_id] || 0) + 1; });
      return { interpreters, locations };
    },
    demoFn: () => ({ interpreters: {}, locations: {} }),
    enabled: !!profile?.agency_id,
  });
}
