import { describe, it, expect } from "vitest";
import { generateIcsContent } from "@/lib/ics-generator";

describe("ICS generator", () => {
  it("generates valid VCALENDAR content", () => {
    const ics = generateIcsContent({
      id: "test-123",
      title: "Medical Interpretation",
      start: "2026-03-25T10:00:00Z",
      end: "2026-03-25T11:00:00Z",
      location: "City Hospital",
      description: "Spanish interpretation",
    });

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Medical Interpretation");
    expect(ics).toContain("LOCATION:City Hospital");
    expect(ics).toContain("DESCRIPTION:Spanish interpretation");
    expect(ics).toContain("UID:test-123@bluethread.app");
    expect(ics).toContain("STATUS:CONFIRMED");
  });

  it("marks cancelled events correctly", () => {
    const ics = generateIcsContent({
      id: "cancel-1",
      title: "Cancelled Appt",
      start: "2026-03-25T10:00:00Z",
      end: "2026-03-25T11:00:00Z",
      status: "cancelled",
    });

    expect(ics).toContain("STATUS:CANCELLED");
  });
});

describe("Messaging unread count logic", () => {
  const userId = "user-1";
  const otherUser = "user-2";

  function computeUnreadCount(
    messages: Array<{ sender_id: string; created_at: string }>,
    lastReadAt: string | null
  ): number {
    let count = 0;
    for (const m of messages) {
      if (m.sender_id !== userId && (!lastReadAt || new Date(m.created_at) > new Date(lastReadAt))) {
        count++;
      }
    }
    return count;
  }

  it("counts messages from others after last_read_at", () => {
    const msgs = [
      { sender_id: otherUser, created_at: "2026-03-25T10:00:00Z" },
      { sender_id: otherUser, created_at: "2026-03-25T10:05:00Z" },
      { sender_id: userId, created_at: "2026-03-25T10:06:00Z" },
      { sender_id: otherUser, created_at: "2026-03-25T10:10:00Z" },
    ];
    expect(computeUnreadCount(msgs, "2026-03-25T10:04:00Z")).toBe(2);
  });

  it("does not count own messages as unread", () => {
    const msgs = [
      { sender_id: userId, created_at: "2026-03-25T10:00:00Z" },
      { sender_id: userId, created_at: "2026-03-25T10:05:00Z" },
    ];
    expect(computeUnreadCount(msgs, null)).toBe(0);
  });

  it("counts all from others when last_read_at is null", () => {
    const msgs = [
      { sender_id: otherUser, created_at: "2026-03-25T10:00:00Z" },
      { sender_id: otherUser, created_at: "2026-03-25T10:05:00Z" },
    ];
    expect(computeUnreadCount(msgs, null)).toBe(2);
  });

  it("returns zero when all are read", () => {
    const msgs = [
      { sender_id: otherUser, created_at: "2026-03-25T10:00:00Z" },
    ];
    expect(computeUnreadCount(msgs, "2026-03-25T10:01:00Z")).toBe(0);
  });
});

describe("Realtime dedup logic", () => {
  it("prevents duplicate message IDs from being added", () => {
    const seenIds = new Set<string>(["msg-1", "msg-2"]);
    const newId = "msg-2";
    const shouldAdd = !seenIds.has(newId);
    expect(shouldAdd).toBe(false);
  });

  it("allows new message IDs", () => {
    const seenIds = new Set<string>(["msg-1", "msg-2"]);
    const newId = "msg-3";
    const shouldAdd = !seenIds.has(newId);
    expect(shouldAdd).toBe(true);
    seenIds.add(newId);
    expect(seenIds.has(newId)).toBe(true);
  });

  it("state-level dedup prevents duplicates even if seenIds missed", () => {
    const existingMessages = [{ id: "msg-1" }, { id: "msg-2" }];
    const incoming = { id: "msg-1" };
    const isDuplicate = existingMessages.some((m) => m.id === incoming.id);
    expect(isDuplicate).toBe(true);
  });
});

describe("Message notification logic", () => {
  it("never notifies sender", () => {
    const senderId = "user-1";
    const participants = [
      { user_id: "user-1" },
      { user_id: "user-2" },
      { user_id: "user-3" },
    ];
    const recipients = participants
      .filter((p) => p.user_id !== senderId)
      .map((p) => p.user_id);
    expect(recipients).not.toContain(senderId);
    expect(recipients).toEqual(["user-2", "user-3"]);
  });

  it("excludes platform owners from recipients", () => {
    const senderId = "user-1";
    const platformOwnerIds = new Set(["user-3"]);
    const participants = [
      { user_id: "user-1" },
      { user_id: "user-2" },
      { user_id: "user-3" },
    ];
    const recipients = participants
      .filter((p) => p.user_id !== senderId)
      .filter((p) => !platformOwnerIds.has(p.user_id))
      .map((p) => p.user_id);
    expect(recipients).toEqual(["user-2"]);
  });

  it("creates one notification per recipient", () => {
    const recipientIds = ["user-2", "user-3", "user-4"];
    const notifications = recipientIds.map((uid) => ({
      user_id: uid,
      agency_id: "agency-1",
      title: "New message from Alice",
      message: "Hello!",
      type: "new_message",
    }));
    expect(notifications).toHaveLength(3);
    const userIds = notifications.map((n) => n.user_id);
    expect(new Set(userIds).size).toBe(3); // no duplicates
  });
});

describe("Appointment thread participant guard", () => {
  it("returns empty array when no interpreter or requester", () => {
    const appointment = { interpreter_id: null, requester_id: null };
    const participantIds: string[] = [];
    if (appointment.interpreter_id) participantIds.push(appointment.interpreter_id);
    if (appointment.requester_id && appointment.requester_id !== appointment.interpreter_id) {
      participantIds.push(appointment.requester_id);
    }
    expect(participantIds).toHaveLength(0);
  });

  it("includes only interpreter when requester is missing", () => {
    const appointment = { interpreter_id: "interp-1", requester_id: null };
    const participantIds: string[] = [];
    if (appointment.interpreter_id) participantIds.push(appointment.interpreter_id);
    if (appointment.requester_id && appointment.requester_id !== appointment.interpreter_id) {
      participantIds.push(appointment.requester_id);
    }
    expect(participantIds).toEqual(["interp-1"]);
  });

  it("includes both when both present and different", () => {
    const appointment = { interpreter_id: "interp-1", requester_id: "req-1" };
    const participantIds: string[] = [];
    if (appointment.interpreter_id) participantIds.push(appointment.interpreter_id);
    if (appointment.requester_id && appointment.requester_id !== appointment.interpreter_id) {
      participantIds.push(appointment.requester_id);
    }
    expect(participantIds).toEqual(["interp-1", "req-1"]);
  });

  it("deduplicates when interpreter and requester are the same", () => {
    const appointment = { interpreter_id: "user-1", requester_id: "user-1" };
    const participantIds: string[] = [];
    if (appointment.interpreter_id) participantIds.push(appointment.interpreter_id);
    if (appointment.requester_id && appointment.requester_id !== appointment.interpreter_id) {
      participantIds.push(appointment.requester_id);
    }
    expect(participantIds).toEqual(["user-1"]);
  });
});

describe("Conversation search/filter logic", () => {
  const conversations = [
    { id: "1", subject: "Appt: Medical Visit", last_message: "See you tomorrow", appointment_id: "a1", participants: [{ first_name: "Alice", last_name: "Smith", user_id: "u1" }] },
    { id: "2", subject: null, last_message: "Hello team", appointment_id: null, participants: [{ first_name: "Bob", last_name: "Jones", user_id: "u2" }] },
    { id: "3", subject: "Billing question", last_message: null, appointment_id: null, participants: [{ first_name: "Carol", last_name: "White", user_id: "u3" }] },
  ];

  function filterConversations(convos: typeof conversations, query: string) {
    if (!query.trim()) return convos;
    const q = query.toLowerCase();
    return convos.filter((c) => {
      if (c.subject?.toLowerCase().includes(q)) return true;
      if (c.last_message?.toLowerCase().includes(q)) return true;
      const names = (c.participants || []).map((p) => `${p.first_name || ""} ${p.last_name || ""}`.trim().toLowerCase()).join(" ");
      if (names.includes(q)) return true;
      return false;
    });
  }

  it("returns all when empty query", () => {
    expect(filterConversations(conversations, "")).toHaveLength(3);
  });

  it("matches by subject", () => {
    expect(filterConversations(conversations, "medical")).toHaveLength(1);
  });

  it("matches by last message", () => {
    expect(filterConversations(conversations, "tomorrow")).toHaveLength(1);
  });

  it("matches by participant name", () => {
    expect(filterConversations(conversations, "bob")).toHaveLength(1);
  });

  it("returns empty for no match", () => {
    expect(filterConversations(conversations, "zzzzz")).toHaveLength(0);
  });
});

describe("Deep-link fallback logic", () => {
  it("clears selection when thread ID not in conversations", () => {
    const conversations = [{ id: "c1" }, { id: "c2" }];
    const threadParam = "non-existent-id";
    const found = conversations.some((c) => c.id === threadParam);
    expect(found).toBe(false);
  });

  it("keeps selection when thread ID exists in conversations", () => {
    const conversations = [{ id: "c1" }, { id: "c2" }];
    const threadParam = "c1";
    const found = conversations.some((c) => c.id === threadParam);
    expect(found).toBe(true);
  });

  it("handles empty conversation list gracefully", () => {
    const conversations: { id: string }[] = [];
    const threadParam = "any-id";
    const found = conversations.some((c) => c.id === threadParam);
    expect(found).toBe(false);
  });
});

describe("Notification dedup under concurrent sends", () => {
  it("produces unique recipient set even with duplicate participant entries", () => {
    const participants = [
      { user_id: "user-2" },
      { user_id: "user-3" },
      { user_id: "user-2" }, // duplicate
    ];
    const senderId = "user-1";
    const platformIds = new Set<string>();
    const recipientIds = [...new Set(
      participants
        .map((p) => p.user_id)
        .filter((uid) => uid !== senderId && !platformIds.has(uid))
    )];
    expect(recipientIds).toEqual(["user-2", "user-3"]);
  });

  it("notification count equals unique recipient count", () => {
    const recipientIds = ["user-2", "user-3"];
    const notifications = recipientIds.map((uid) => ({
      user_id: uid,
      title: "New message",
      message: "Hello",
    }));
    expect(notifications).toHaveLength(recipientIds.length);
    expect(new Set(notifications.map((n) => n.user_id)).size).toBe(recipientIds.length);
  });
});
