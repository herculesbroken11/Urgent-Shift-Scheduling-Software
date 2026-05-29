import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Database } from "@/integrations/supabase/types";

type PayRateInsert = Database["public"]["Tables"]["interpreter_pay_rates"]["Insert"];
type PayRateUpdate = Database["public"]["Tables"]["interpreter_pay_rates"]["Update"];

export interface InterpreterPayRate {
  id: string;
  agency_id: string;
  interpreter_id: string | null;
  name: string;
  pay_model: string;
  hourly_rate: number;
  minimum_hours: number;
  minimum_pay: number;
  overtime_rate: number;
  overtime_after_hours: number;
  travel_rate_per_mile: number;
  travel_time_rate: number;
  after_hours_multiplier: number;
  after_hours_start: string;
  after_hours_end: string;
  weekend_multiplier: number;
  holiday_multiplier: number;
  same_day_multiplier: number;
  cancellation_fee_percent: number;
  cancellation_window_hours: number;
  rounding_direction: string;
  rounding_interval_minutes: number;
  is_default: boolean;
  effective_start_date: string | null;
  effective_end_date: string | null;
  created_at: string;
  updated_at: string;
}

export function useInterpreterPayRates() {
  const { profile } = useAuth();
  return useQuery<InterpreterPayRate[]>({
    queryKey: ["interpreter_pay_rates", profile?.agency_id],
    queryFn: async () => {
      if (!profile?.agency_id) return [];
      const { data, error } = await supabase
        .from("interpreter_pay_rates")
        .select("*")
        .eq("agency_id", profile.agency_id)
        .order("name");
      if (error) throw error;
      return data as unknown as InterpreterPayRate[];
    },
    enabled: !!profile?.agency_id,
  });
}

export function useInterpreterPayRateMutations() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["interpreter_pay_rates"] });

  const create = useMutation({
    mutationFn: async (input: Partial<InterpreterPayRate>) => {
      const { data, error } = await supabase
        .from("interpreter_pay_rates")
        .insert({ ...input, agency_id: profile!.agency_id! } as PayRateInsert)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<InterpreterPayRate> & { id: string }) => {
      const { data, error } = await supabase
        .from("interpreter_pay_rates")
        .update(input as PayRateUpdate)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("interpreter_pay_rates")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
