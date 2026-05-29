import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoData } from "@/contexts/DemoDataContext";
import { useAdaptedQuery, useAdaptedMutation } from "@/lib/data-adapter";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

export interface Notification {
  id: string; user_id: string; agency_id: string; title: string; message: string;
  type: string; related_entity_type: string | null; related_entity_id: string | null;
  is_read: boolean; read_at: string | null; created_at: string;
}

const INTERPRETER_NOTIFICATION_TYPES = new Set([
  "assignment", "assignment_alert", "new_assignment",
  "cancellation", "cancellation_alert", "appointment_cancelled",
  "new_message",
]);

export function useNotifications() {
  const { user, isDemoMode, hasRole } = useAuth();
  const { state, updateItem } = useDemoData();
  const queryClient = useQueryClient();

  const isInterpreter = hasRole("interpreter") && !hasRole("agency_admin") && !hasRole("scheduler");

  const { data: notifications = [], ...query } = useAdaptedQuery<Notification[]>({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications").select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data as Notification[];
    },
    demoFn: () => state.notifications as Notification[],
    enabled: !!user,
  });

  const filteredNotifications = isInterpreter
    ? notifications.filter((n) =>
        INTERPRETER_NOTIFICATION_TYPES.has(n.type) ||
        n.title.toLowerCase().includes("assign") ||
        n.title.toLowerCase().includes("cancel")
      )
    : notifications;

  const unreadCount = filteredNotifications.filter((n) => !n.is_read).length;

  // Realtime subscription with toast popups (production only)
  const seenNotifIdsRef = useRef(new Set<string>());

  // Seed seen IDs from initial fetch
  useEffect(() => {
    if (notifications.length > 0) {
      notifications.forEach((n) => seenNotifIdsRef.current.add(n.id));
    }
  }, [notifications]);

  useEffect(() => {
    if (!user || isDemoMode) return;
    const channel = supabase
      .channel("notifications-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          const newNotif = payload.new;
          // Show toast popup for new message notifications
          if (newNotif && !seenNotifIdsRef.current.has(newNotif.id)) {
            seenNotifIdsRef.current.add(newNotif.id);
            if (newNotif.type === "new_message") {
              toast.info(newNotif.title, { description: newNotif.message, duration: 5000 });
            }
          }
          queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
        }
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient, isDemoMode]);

  const markAsRead = useAdaptedMutation<string>({
    mutationFn: async (notificationId) => {
      const { error } = await supabase
        .from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", notificationId);
      if (error) throw error;
    },
    demoFn: (notificationId) => {
      updateItem("notifications", notificationId, { is_read: true, read_at: new Date().toISOString() });
    },
    invalidateKeys: [["notifications", user?.id]],
  });

  const markAllAsRead = useAdaptedMutation<void>({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications").update({ is_read: true, read_at: new Date().toISOString() })
        .eq("user_id", user!.id).eq("is_read", false);
      if (error) throw error;
    },
    demoFn: () => {
      state.notifications.forEach((n: any) => {
        if (!n.is_read) updateItem("notifications", n.id, { is_read: true, read_at: new Date().toISOString() });
      });
    },
    invalidateKeys: [["notifications", user?.id]],
  });

  return { notifications: filteredNotifications, unreadCount, markAsRead, markAllAsRead, ...query };
}
