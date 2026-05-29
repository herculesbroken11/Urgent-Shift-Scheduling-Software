import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface InterpreterNotifPrefs {
  enable_email_notifications: boolean;
  enable_sms_notifications: boolean;
  reminder_24h_enabled: boolean;
  reminder_2h_enabled: boolean;
  reminder_15m_enabled: boolean;
  preferred_notification_channel: string;
}

const DEFAULTS: InterpreterNotifPrefs = {
  enable_email_notifications: true,
  enable_sms_notifications: true,
  reminder_24h_enabled: true,
  reminder_2h_enabled: true,
  reminder_15m_enabled: true,
  preferred_notification_channel: "both",
};

export function useInterpreterNotifPrefs() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const userId = profile?.id;
  const agencyId = profile?.agency_id;

  const query = useQuery({
    queryKey: ["interpreter-notif-prefs", userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("interpreter_notification_prefs")
        .select("*")
        .eq("user_id", userId)
        .eq("agency_id", agencyId)
        .maybeSingle();
      if (error) throw error;
      return data as (InterpreterNotifPrefs & { id: string }) | null;
    },
    enabled: !!userId && !!agencyId,
  });

  const prefs: InterpreterNotifPrefs = { ...DEFAULTS, ...(query.data ?? {}) };

  const updatePrefs = useMutation({
    mutationFn: async (patch: Partial<InterpreterNotifPrefs>) => {
      const merged = { ...prefs, ...patch };
      if (query.data?.id) {
        // Update existing row
        const { error } = await (supabase as any)
          .from("interpreter_notification_prefs")
          .update(merged)
          .eq("id", query.data.id);
        if (error) throw error;
      } else {
        // Insert new row
        const { error } = await (supabase as any)
          .from("interpreter_notification_prefs")
          .insert({ user_id: userId, agency_id: agencyId, ...merged });
        if (error) throw error;
      }
      return merged;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["interpreter-notif-prefs", userId] });
    },
  });

  return { prefs, updatePrefs, isLoading: query.isLoading };
}
