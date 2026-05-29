import { useState, useRef, useEffect, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Send, ArrowLeft, Calendar, Users, Plus, Search, Check, CheckCheck, MoreVertical, EyeOff, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { format, formatDistanceToNow, isToday, isYesterday, differenceInDays, startOfDay } from "date-fns";
import { demoMessages } from "@/lib/demo-data";
import { cn } from "@/lib/utils";
import {
  useConversations,
  useConversationMessages,
  useSendMessage,
  useReadReceipts,
  useHideConversation,
  useDeleteMessage,
} from "@/hooks/useMessages";
import { NewConversationDialog } from "@/components/messages/NewConversationDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export default function Messages() {
  const { isDemoMode, user } = useAuth();
  const [searchParams] = useSearchParams();
  const threadParam = searchParams.get("thread");
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(threadParam);
  const [invalidThreadCleared, setInvalidThreadCleared] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [newConvoOpen, setNewConvoOpen] = useState(false);
  const [threadSearch, setThreadSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Hide-conversation + delete-message state
  const [hideTargetId, setHideTargetId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const { conversations, loading: convosLoading, refetch: refetchConvos } = useConversations();
  const { messages, loading: msgsLoading } = useConversationMessages(selectedConvoId);
  const readReceipts = useReadReceipts(selectedConvoId);
  const sendMessage = useSendMessage();
  const hideConversation = useHideConversation();
  const deleteMessage = useDeleteMessage();

  const selectedConvo = conversations.find((c) => c.id === selectedConvoId);

  // Filter conversations by search
  const filteredConversations = useMemo(() => {
    if (!threadSearch.trim()) return conversations;
    const q = threadSearch.toLowerCase();
    return conversations.filter((c) => {
      if (c.subject?.toLowerCase().includes(q)) return true;
      if (c.last_message?.toLowerCase().includes(q)) return true;
      const participantNames = (c.participants || [])
        .map((p) => `${p.first_name || ""} ${p.last_name || ""}`.trim().toLowerCase())
        .join(" ");
      if (participantNames.includes(q)) return true;
      return false;
    });
  }, [conversations, threadSearch]);

  // Group conversations into date buckets based on last activity
  type Bucket = "today" | "week" | "earlier" | "no_activity";
  const groupedConversations = useMemo(() => {
    const groups: Record<Bucket, typeof filteredConversations> = {
      today: [],
      week: [],
      earlier: [],
      no_activity: [],
    };
    const now = new Date();
    for (const c of filteredConversations) {
      const ts = c.last_message_at || c.updated_at;
      if (!ts) {
        groups.no_activity.push(c);
        continue;
      }
      const d = new Date(ts);
      if (isToday(d)) groups.today.push(c);
      else if (differenceInDays(startOfDay(now), startOfDay(d)) < 7) groups.week.push(c);
      else groups.earlier.push(c);
    }
    return groups;
  }, [filteredConversations]);

  const bucketMeta: { key: Bucket; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "earlier", label: "Earlier" },
    { key: "no_activity", label: "No Activity" },
  ];

  const handleHideConvo = async () => {
    if (!hideTargetId) return;
    const ok = await hideConversation(hideTargetId);
    if (ok) {
      toast.success("Conversation hidden");
      if (selectedConvoId === hideTargetId) setSelectedConvoId(null);
      refetchConvos();
    } else {
      toast.error("Could not hide conversation");
    }
    setHideTargetId(null);
  };

  const handleDeleteMsg = async () => {
    if (!deleteTargetId) return;
    const ok = await deleteMessage(deleteTargetId);
    if (ok) toast.success("Message deleted");
    else toast.error("Could not delete message");
    setDeleteTargetId(null);
  };

  // Deep-link fallback: clear invalid/inaccessible thread IDs once conversations load
  useEffect(() => {
    if (!convosLoading && selectedConvoId && conversations.length >= 0) {
      const found = conversations.some((c) => c.id === selectedConvoId);
      if (!found) {
        setSelectedConvoId(null);
        if (threadParam) setInvalidThreadCleared(true);
      }
    }
  }, [convosLoading, conversations, selectedConvoId, threadParam]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Refetch conversation list when messages change (to update unread counts)
  useEffect(() => {
    if (selectedConvoId && messages.length > 0) {
      refetchConvos();
    }
  }, [messages.length, selectedConvoId]);

  const handleSend = async () => {
    if (!selectedConvoId || !messageInput.trim()) return;
    await sendMessage(selectedConvoId, messageInput);
    setMessageInput("");
    refetchConvos();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleConversationCreated = (convoId: string) => {
    setSelectedConvoId(convoId);
    refetchConvos();
  };

  // Demo mode — show static placeholder
  if (isDemoMode) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
            <p className="text-muted-foreground">Send and receive messages within your agency</p>
          </div>
        </div>
        <div className="space-y-2">
          {demoMessages.map((msg) => (
            <Card key={msg.id} className="transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                      {msg.sender.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{msg.sender}</span>
                        {msg.unread && <Badge variant="default" className="text-[10px] px-1.5 py-0">New</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{msg.preview}</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(msg.time), "MMM d, h:mm a")}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Derived data for thread view
  const otherParticipants = (selectedConvo?.participants || []).filter(
    (p) => p.user_id !== user?.id
  );
  const threadTitle = selectedConvo?.subject
    || otherParticipants.map((p) => `${p.first_name || ""} ${p.last_name || ""}`.trim()).filter(Boolean).join(", ")
    || "Conversation";

  // Thread list JSX (inlined, not a nested component)
  const threadListContent = (
    <div className="space-y-1">
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search conversations…"
          value={threadSearch}
          onChange={(e) => setThreadSearch(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>

      {convosLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredConversations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <h3 className="text-base font-semibold text-foreground mb-1">
              {threadSearch ? "No matching conversations" : "No conversations yet"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              {threadSearch
                ? "Try a different search term."
                : 'Use "Start New Message" above to begin a conversation.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        (() => {
          const renderConvoCard = (convo: typeof filteredConversations[number]) => {
            const others = (convo.participants || []).filter((p) => p.user_id !== user?.id);
            const otherNames = others
              .map((p) => `${p.first_name || ""} ${p.last_name || ""}`.trim())
              .filter(Boolean);
            const displayName = convo.subject?.trim()
              || (otherNames.length > 0 ? otherNames.join(", ") : null)
              || (convo.appointment_id ? "Appointment thread" : "New conversation");
            const showParticipantSubtitle = !!convo.subject?.trim() && otherNames.length > 0;
            const initials = otherNames.length > 0
              ? otherNames[0].split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
              : null;
            const unread = convo.unread_count ?? 0;

            return (
              <Card
                key={convo.id}
                className={cn(
                  "transition-shadow hover:shadow-md cursor-pointer",
                  selectedConvoId === convo.id && "ring-2 ring-primary",
                  unread > 0 && "border-primary/30"
                )}
                onClick={() => setSelectedConvoId(convo.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
                        {initials ? initials : (convo.appointment_id ? <Calendar className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={cn("text-sm truncate", unread > 0 ? "font-semibold" : "font-medium")}>
                            {displayName}
                          </span>
                          {unread > 0 && (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0 shrink-0">
                              {unread > 9 ? "9+" : unread}
                            </Badge>
                          )}
                        </div>
                        {showParticipantSubtitle && (
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            With {otherNames.join(", ")}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {convo.appointment_id && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium shrink-0">
                              Appointment
                            </span>
                          )}
                          <p className={cn("text-xs truncate", unread > 0 ? "text-foreground/70 font-medium" : "text-muted-foreground")}>
                            {convo.last_message || "No messages yet"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {convo.last_message_at && (
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(convo.last_message_at), { addSuffix: true })}
                        </span>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 -mr-1"
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Conversation actions"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onClick={() => setHideTargetId(convo.id)}>
                            <EyeOff className="mr-2 h-3.5 w-3.5" />
                            Hide conversation
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          };

          return (
            <div className="space-y-3">
              {bucketMeta.map(({ key, label }) => {
                const items = groupedConversations[key];
                if (!items || items.length === 0) return null;
                const isCollapsed = collapsed[key] ?? false;
                return (
                  <div key={key} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setCollapsed((p) => ({ ...p, [key]: !isCollapsed }))}
                      className="flex w-full items-center gap-1.5 px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      <span>{label}</span>
                      <span className="text-muted-foreground/60 normal-case font-normal">({items.length})</span>
                    </button>
                    {!isCollapsed && (
                      <div className="space-y-1">
                        {items.map(renderConvoCard)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()
      )}
    </div>
  );

  // Thread view JSX (inlined, not a nested component)
  const threadViewContent = (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      <div className="flex items-center gap-3 pb-3 border-b">
        <Button variant="ghost" size="icon" className="md:hidden shrink-0" onClick={() => setSelectedConvoId(null)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm truncate">{threadTitle}</h3>
          <p className="text-xs text-muted-foreground truncate">
            {otherParticipants.length > 0
              ? `With ${otherParticipants
                  .map((p) => `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Team member")
                  .join(", ")}`
              : "No other participants"}
            {selectedConvo?.appointment_id && " · Appointment thread"}
          </p>
        </div>
      </div>

      <ScrollArea className="flex-1 py-4">
        {msgsLoading ? (
          <div className="text-center text-sm text-muted-foreground py-8 space-y-2">
            <Skeleton className="h-4 w-48 mx-auto" />
            <Skeleton className="h-4 w-32 mx-auto" />
            <Skeleton className="h-4 w-40 mx-auto" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            No messages yet. Start the conversation!
          </div>
        ) : (
          <div className="space-y-3 px-1">
            {messages.map((msg, idx) => {
              const isMe = msg.sender_id === user?.id;
              const senderName = msg.sender
                ? `${msg.sender.first_name || ""} ${msg.sender.last_name || ""}`.trim()
                : "Unknown";
              const receipt = isMe ? readReceipts.get(msg.id) : null;
              const initials = senderName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

              // Group: show avatar only for first message in a consecutive run from same sender
              const prevMsg = idx > 0 ? messages[idx - 1] : null;
              const showAvatar = !isMe && (!prevMsg || prevMsg.sender_id !== msg.sender_id);

              return (
                <div key={msg.id} className={cn("flex gap-2", isMe ? "justify-end" : "justify-start")}>
                  {/* Avatar for other users */}
                  {!isMe && (
                    <div className="w-7 shrink-0">
                      {showAvatar && (
                        <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-semibold">
                          {initials}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="max-w-[75%] group">
                    <div className={cn(
                      "px-3 py-2 shadow-sm relative",
                      msg.is_deleted
                        ? "bg-muted/50 text-muted-foreground italic rounded-2xl"
                        : isMe
                          ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md"
                          : "bg-muted rounded-2xl rounded-bl-md"
                    )}>
                      {!isMe && showAvatar && !msg.is_deleted && (
                        <p className="text-[11px] font-semibold mb-0.5 opacity-80">{senderName}</p>
                      )}
                      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                        {msg.is_deleted ? "Message deleted" : msg.body}
                      </p>
                    </div>
                    {/* Timestamp + read receipt + delete */}
                    <div className={cn("flex items-center gap-1 mt-0.5 px-1", isMe ? "justify-end" : "justify-start")}>
                      <span className={cn("text-[10px]", isMe ? "text-muted-foreground/70" : "text-muted-foreground/60")}>
                        {format(new Date(msg.created_at), "h:mm a")}
                      </span>
                      {isMe && !msg.is_deleted && receipt && (
                        receipt.readByAll ? (
                          <CheckCheck className="h-3 w-3 text-primary" />
                        ) : (
                          <Check className="h-3 w-3 text-muted-foreground/50" />
                        )
                      )}
                      {isMe && !msg.is_deleted && (
                        <button
                          type="button"
                          onClick={() => setDeleteTargetId(msg.id)}
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-muted-foreground/60 hover:text-destructive"
                          aria-label="Delete message"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      <div className="pt-3 border-t">
        <div className="flex gap-2">
          <Input
            placeholder="Type a message…"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1"
          />
          <Button size="icon" onClick={handleSend} disabled={!messageInput.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
          <p className="text-muted-foreground">Send and receive messages within your agency</p>
        </div>
        <Button className="gap-2" onClick={() => setNewConvoOpen(true)}>
          <Plus className="h-4 w-4" />
          Start New Message
        </Button>
      </div>

      {/* Mobile: show one at a time */}
      <div className="md:hidden">
        {selectedConvoId ? threadViewContent : threadListContent}
      </div>

      {/* Desktop: side by side */}
      <div className="hidden md:grid md:grid-cols-[340px_1fr] gap-6">
        <div className="space-y-1 max-h-[calc(100vh-12rem)] overflow-auto">
          {threadListContent}
        </div>
        <div>
          {selectedConvoId ? (
            threadViewContent
          ) : (
            <Card>
              <CardContent className="py-16 text-center">
                <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
                <h3 className="text-base font-medium mb-1">
                  {invalidThreadCleared ? "Conversation not found" : "Select a conversation"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {invalidThreadCleared
                    ? "The linked thread is no longer available or you don't have access."
                    : 'Choose a thread from the left, or use "Start New Message" above.'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <NewConversationDialog
        open={newConvoOpen}
        onOpenChange={setNewConvoOpen}
        onConversationCreated={handleConversationCreated}
      />

      <AlertDialog open={!!hideTargetId} onOpenChange={(o) => !o && setHideTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hide this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              The conversation will be removed from your messages list. Other participants will still see it. If anyone replies, you'll need to find them through a new conversation to see the thread again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleHideConvo}>Hide</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTargetId} onOpenChange={(o) => !o && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              The message will be replaced with "Message deleted" for everyone in the conversation. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMsg}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
