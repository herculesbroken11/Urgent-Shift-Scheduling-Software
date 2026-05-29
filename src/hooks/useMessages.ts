import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Conversation {
  id: string;
  agency_id: string;
  appointment_id: string | null;
  subject: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_message?: string;
  last_message_at?: string;
  unread_count?: number;
  participants?: { user_id: string; first_name: string; last_name: string }[];
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  is_deleted?: boolean;
  deleted_at?: string | null;
  sender?: { first_name: string; last_name: string };
}

export function useConversations() {
  const { profile, user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    if (!profile?.agency_id || !user?.id) return;
    setLoading(true);

    const { data: convos, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("agency_id", profile.agency_id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch conversations:", error);
      setLoading(false);
      return;
    }

    if (!convos?.length) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const convoIds = convos.map((c: any) => c.id);

    const [{ data: participants }, { data: allMessages }, { data: myParticipation }] = await Promise.all([
      supabase
        .from("conversation_participants")
        .select("conversation_id, user_id, profiles!inner(first_name, last_name)")
        .in("conversation_id", convoIds) as any,
      supabase
        .from("messages")
        .select("conversation_id, body, created_at, sender_id, is_deleted")
        .in("conversation_id", convoIds)
        .order("created_at", { ascending: false }) as any,
      supabase
        .from("conversation_participants")
        .select("conversation_id, last_read_at, is_hidden")
        .eq("user_id", user.id)
        .in("conversation_id", convoIds) as any,
    ]);

    // Build set of conversations the current user has hidden
    const hiddenSet = new Set<string>();
    for (const p of (myParticipation || [])) {
      if (p.is_hidden) hiddenSet.add(p.conversation_id);
    }

    // Build lookup maps
    const partMap = new Map<string, any[]>();
    for (const p of (participants || [])) {
      const arr = partMap.get(p.conversation_id) || [];
      arr.push({ user_id: p.user_id, first_name: p.profiles?.first_name, last_name: p.profiles?.last_name });
      partMap.set(p.conversation_id, arr);
    }

    // Last message per conversation (skip soft-deleted) + accurate unread counts
    const lastMsgMap = new Map<string, any>();
    const unreadCountMap = new Map<string, number>();
    for (const m of (allMessages || [])) {
      if (m.is_deleted) continue;
      if (!lastMsgMap.has(m.conversation_id)) {
        lastMsgMap.set(m.conversation_id, m);
      }
    }

    const readMap = new Map<string, string | null>();
    for (const p of (myParticipation || [])) {
      readMap.set(p.conversation_id, p.last_read_at);
    }

    // Count actual unread messages (after last_read_at, not from current user, not deleted)
    for (const m of (allMessages || [])) {
      if (m.is_deleted) continue;
      const lastRead = readMap.get(m.conversation_id);
      if (m.sender_id !== user.id && (!lastRead || new Date(m.created_at) > new Date(lastRead))) {
        unreadCountMap.set(m.conversation_id, (unreadCountMap.get(m.conversation_id) || 0) + 1);
      }
    }

    const enriched = convos
      .filter((c: any) => !hiddenSet.has(c.id))
      .map((c: any) => {
        const lastMsg = lastMsgMap.get(c.id);
        return {
          ...c,
          last_message: lastMsg?.body,
          last_message_at: lastMsg?.created_at,
          unread_count: unreadCountMap.get(c.id) || 0,
          participants: partMap.get(c.id) || [],
        };
      });

    setConversations(enriched);
    setLoading(false);
  }, [profile?.agency_id, user?.id]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return { conversations, loading, refetch: fetchConversations };
}

export function useConversationMessages(conversationId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  // Track seen message IDs to prevent realtime duplicates
  const seenIdsRef = useRef(new Set<string>());

  const fetchMessages = useCallback(async () => {
    if (!conversationId) { setMessages([]); seenIdsRef.current.clear(); return; }
    setLoading(true);

    const { data, error } = await supabase
      .from("messages")
      .select("*, sender:profiles!messages_sender_id_fkey(first_name, last_name)")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }) as any;

    if (error) {
      console.error("Failed to fetch messages:", error);
    } else {
      const msgs = data || [];
      seenIdsRef.current = new Set(msgs.map((m: Message) => m.id));
      setMessages(msgs);
    }
    setLoading(false);

    // Mark as read
    if (user?.id) {
      await supabase
        .from("conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id);
    }
  }, [conversationId, user?.id]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Realtime subscription with deduplication
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload: any) => {
        const newId = payload.new?.id;
        // Skip if already seen (prevents duplicates)
        if (!newId || seenIdsRef.current.has(newId)) return;
        seenIdsRef.current.add(newId);

        // Fetch the new message with sender info
        supabase
          .from("messages")
          .select("*, sender:profiles!messages_sender_id_fkey(first_name, last_name)")
          .eq("id", newId)
          .single()
          .then(({ data }: any) => {
            if (data) {
              setMessages((prev) => {
                // Double-check dedup in state
                if (prev.some((m) => m.id === data.id)) return prev;
                return [...prev, data];
              });
            }
          });

        // Update last_read_at for current user
        if (user?.id) {
          supabase
            .from("conversation_participants")
            .update({ last_read_at: new Date().toISOString() })
            .eq("conversation_id", conversationId)
            .eq("user_id", user.id);
        }
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload: any) => {
        const updated = payload.new;
        if (!updated?.id) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === updated.id
              ? { ...m, is_deleted: updated.is_deleted, deleted_at: updated.deleted_at, body: updated.body }
              : m,
          ),
        );
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user?.id]);

  return { messages, loading, refetch: fetchMessages };
}

/**
 * Returns read receipt info: for each message sent by the current user,
 * whether all other participants have read it (based on last_read_at).
 */
export function useReadReceipts(conversationId: string | null) {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<Map<string, { readByAll: boolean; readByCount: number; totalOthers: number }>>(new Map());

  const fetchReceipts = useCallback(async () => {
    if (!conversationId || !user?.id) { setReceipts(new Map()); return; }

    const [{ data: participants }, { data: msgs }] = await Promise.all([
      supabase
        .from("conversation_participants")
        .select("user_id, last_read_at")
        .eq("conversation_id", conversationId),
      supabase
        .from("messages")
        .select("id, created_at, sender_id")
        .eq("conversation_id", conversationId)
        .eq("sender_id", user.id)
        .order("created_at", { ascending: true }),
    ]);

    if (!participants || !msgs) return;

    const others = (participants || []).filter((p) => p.user_id !== user.id);
    const receiptMap = new Map<string, { readByAll: boolean; readByCount: number; totalOthers: number }>();

    for (const msg of msgs) {
      const readByCount = others.filter(
        (p) => p.last_read_at && new Date(p.last_read_at) >= new Date(msg.created_at)
      ).length;
      receiptMap.set(msg.id, {
        readByAll: readByCount === others.length && others.length > 0,
        readByCount,
        totalOthers: others.length,
      });
    }

    setReceipts(receiptMap);
  }, [conversationId, user?.id]);

  useEffect(() => { fetchReceipts(); }, [fetchReceipts]);

  // Refresh when conversation changes (via realtime updates)
  useEffect(() => {
    if (!conversationId) return;
    const interval = setInterval(fetchReceipts, 10000); // poll every 10s for read updates
    return () => clearInterval(interval);
  }, [conversationId, fetchReceipts]);

  return receipts;
}

export function useSendMessage() {
  const { user, profile } = useAuth();

  return async (conversationId: string, body: string) => {
    if (!user?.id || !body.trim()) return null;

    const { data, error } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: user.id, body: body.trim() })
      .select()
      .single();

    if (error) {
      console.error("Failed to send message:", error);
      return null;
    }

    // Update conversation updated_at
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    // Create in-app notifications for other participants (fire-and-forget)
    if (profile?.agency_id) {
      createMessageNotifications(conversationId, user.id, profile.agency_id, body.trim()).catch(
        (err) => console.error("Failed to create message notifications:", err)
      );
    }

    return data;
  };
}

/**
 * Creates one in-app notification per recipient (excluding sender and platform owners).
 * Uses the existing notifications table, same as booking notifications.
 */
async function createMessageNotifications(
  conversationId: string,
  senderId: string,
  agencyId: string,
  bodyPreview: string
) {
  // Get participants excluding sender
  const { data: participants, error: partErr } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .neq("user_id", senderId);

  if (partErr || !participants?.length) return;

  // Exclude platform owners
  const { data: platformRoles } = await supabase
    .from("platform_roles" as any)
    .select("user_id")
    .eq("role", "platform_owner");

  const platformIds = new Set((platformRoles || []).map((r: any) => r.user_id));
  const recipientIds = participants
    .map((p) => p.user_id)
    .filter((uid) => !platformIds.has(uid));

  if (!recipientIds.length) return;

  // Get sender name for notification title
  const { data: senderProfile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", senderId)
    .single();

  const senderName = senderProfile
    ? `${senderProfile.first_name || ""} ${senderProfile.last_name || ""}`.trim() || "Someone"
    : "Someone";

  const preview = bodyPreview.length > 80 ? bodyPreview.slice(0, 77) + "…" : bodyPreview;

  const notifications = recipientIds.map((uid) => ({
    user_id: uid,
    agency_id: agencyId,
    title: `New message from ${senderName}`,
    message: preview,
    type: "new_message",
    related_entity_type: "conversation",
    related_entity_id: conversationId,
  }));

  const { error: insertErr } = await supabase.from("notifications").insert(notifications);
  if (insertErr) console.error("Message notification insert failed:", insertErr);
}

export function useCreateConversation() {
  const { user, profile } = useAuth();
  const inflightRef = useRef<Map<string, Promise<string | null>>>(new Map());

  return async (params: {
    subject?: string;
    appointmentId?: string;
    participantIds: string[];
  }): Promise<string | null> => {
    if (!user?.id || !profile?.agency_id) {
      console.error("useCreateConversation: missing user or agency_id", { userId: user?.id, agencyId: profile?.agency_id });
      return null;
    }

    // Dedupe: if an appointment thread creation is already in-flight, return its promise
    const dedupeKey = params.appointmentId || `dm-${Date.now()}`;
    if (params.appointmentId && inflightRef.current.has(dedupeKey)) {
      return inflightRef.current.get(dedupeKey)!;
    }

    const doCreate = async (): Promise<string | null> => {
      // Check if appointment thread already exists
      if (params.appointmentId) {
        const { data: existing } = await supabase
          .from("conversations")
          .select("id")
          .eq("agency_id", profile.agency_id)
          .eq("appointment_id", params.appointmentId)
          .limit(1)
          .single();
        if (existing) return existing.id;
      }

      const { data: convo, error } = await supabase
        .from("conversations")
        .insert({
          agency_id: profile.agency_id,
          appointment_id: params.appointmentId || null,
          subject: params.subject || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) {
        // If unique constraint violation, re-fetch the existing thread
        if (error.code === "23505" && params.appointmentId) {
          const { data: existing } = await supabase
            .from("conversations")
            .select("id")
            .eq("agency_id", profile.agency_id)
            .eq("appointment_id", params.appointmentId)
            .limit(1)
            .single();
          if (existing) return existing.id;
        }
        console.error("Failed to create conversation:", error);
        return null;
      }

      // Add participants (including the creator)
      const allParticipants = [...new Set([user.id, ...params.participantIds])];
      const { error: partError } = await supabase
        .from("conversation_participants")
        .insert(allParticipants.map((uid) => ({
          conversation_id: convo.id,
          user_id: uid,
        })));

      if (partError) {
        console.error("Failed to add participants:", partError);
      }

      return convo.id;
    };

    const promise = doCreate();
    if (params.appointmentId) {
      inflightRef.current.set(dedupeKey, promise);
      promise.finally(() => inflightRef.current.delete(dedupeKey));
    }
    return promise;
  };
}

/**
 * Hide a conversation from the current user's list (per-user soft hide).
 * Other participants are unaffected. New messages will un-hide it automatically
 * (caller can choose to clear the flag on incoming messages if desired).
 */
export function useHideConversation() {
  const { user } = useAuth();
  return async (conversationId: string): Promise<boolean> => {
    if (!user?.id) return false;
    const { error } = await supabase
      .from("conversation_participants")
      .update({ is_hidden: true, hidden_at: new Date().toISOString() } as any)
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id);
    if (error) {
      console.error("Failed to hide conversation:", error);
      return false;
    }
    return true;
  };
}

/**
 * Soft-delete a message the current user sent. Body is preserved in DB but the
 * UI shows "Message deleted" to all participants.
 */
export function useDeleteMessage() {
  const { user } = useAuth();
  return async (messageId: string): Promise<boolean> => {
    if (!user?.id) return false;
    const { error } = await supabase
      .from("messages")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
      } as any)
      .eq("id", messageId)
      .eq("sender_id", user.id);
    if (error) {
      console.error("Failed to delete message:", error);
      return false;
    }
    return true;
  };
}
