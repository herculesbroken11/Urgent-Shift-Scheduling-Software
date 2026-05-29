import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export function useCustomerRequestorMutations() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  const upsertRequestor = useMutation({
    mutationFn: async (input: {
      customer_id: string; user_id: string;
      access_all_locations: boolean; is_active: boolean; location_ids: string[];
    }) => {
      const agencyId = profile!.agency_id!;
      const { data: cr, error: crErr } = await supabase
        .from("customer_requestors")
        .upsert({ customer_id: input.customer_id, user_id: input.user_id, agency_id: agencyId, access_all_locations: input.access_all_locations, is_active: input.is_active }, { onConflict: "customer_id,user_id" })
        .select().single();
      if (crErr) throw crErr;
      await supabase.from("requestor_locations").delete().eq("customer_requestor_id", cr.id);
      if (!input.access_all_locations && input.location_ids.length > 0) {
        const rows = input.location_ids.map((lid) => ({ customer_requestor_id: cr.id, location_id: lid }));
        const { error: locErr } = await supabase.from("requestor_locations").insert(rows);
        if (locErr) throw locErr;
      }
      return cr;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customer-requestors"] }); toast.success("Requestor updated"); },
    onError: (e: Error) => toast.error(`Error: ${e.message}`),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("customer_requestors").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customer-requestors"] }); toast.success("Status updated"); },
    onError: (e: Error) => toast.error(`Error: ${e.message}`),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customer_requestors").update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customer-requestors"] }); toast.success("Requestor removed"); },
    onError: (e: Error) => toast.error(`Error: ${e.message}`),
  });

  return { upsertRequestor, toggleActive, remove };
}
