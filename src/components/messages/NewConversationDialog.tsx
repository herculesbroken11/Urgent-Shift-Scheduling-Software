import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, MessageSquare } from "lucide-react";
import { useAgencyMembers, type AgencyMember } from "@/hooks/useAgencyMembers";
import { useCreateConversation } from "@/hooks/useMessages";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ROLE_LABELS: Record<string, string> = {
  agency_admin: "Admin",
  scheduler: "Scheduler",
  interpreter: "Interpreter",
  requester: "Requester",
};

const ROLE_COLORS: Record<string, string> = {
  agency_admin: "bg-primary/10 text-primary",
  scheduler: "bg-blue-500/10 text-blue-600",
  interpreter: "bg-emerald-500/10 text-emerald-600",
  requester: "bg-amber-500/10 text-amber-600",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConversationCreated: (conversationId: string) => void;
}

export function NewConversationDialog({ open, onOpenChange, onConversationCreated }: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: members = [], isLoading } = useAgencyMembers();
  const createConversation = useCreateConversation();

  const filtered = useMemo(() => {
    if (!search.trim()) return members;
    const q = search.toLowerCase();
    return members.filter((m) => {
      const name = `${m.first_name || ""} ${m.last_name || ""}`.toLowerCase();
      const email = (m.email || "").toLowerCase();
      const roles = m.roles.map((r) => ROLE_LABELS[r] || r).join(" ").toLowerCase();
      return name.includes(q) || email.includes(q) || roles.includes(q);
    });
  }, [members, search]);

  const toggleMember = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (selected.size === 0) return;
    setCreating(true);
    try {
      const convoId = await createConversation({
        subject: subject.trim() || undefined,
        participantIds: Array.from(selected),
      });
      if (convoId) {
        onConversationCreated(convoId);
        onOpenChange(false);
        setSearch("");
        setSelected(new Set());
        setSubject("");
      } else {
        toast.error("Failed to create conversation. Please make sure you're signed in and try again.");
      }
    } catch (err) {
      console.error("Create conversation error:", err);
      toast.error("Something went wrong creating the conversation.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            placeholder="Subject (optional)"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or role…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Array.from(selected).map((id) => {
                const m = members.find((x) => x.id === id);
                if (!m) return null;
                return (
                  <Badge
                    key={id}
                    variant="secondary"
                    className="cursor-pointer hover:bg-destructive/10"
                    onClick={() => toggleMember(id)}
                  >
                    {m.first_name || m.email || "User"} ×
                  </Badge>
                );
              })}
            </div>
          )}

          <ScrollArea className="h-56 border rounded-md">
            {isLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Loading team members…</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {search ? "No matching team members" : "No team members found"}
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((m) => {
                  const isSelected = selected.has(m.id);
                  const displayName = `${m.first_name || ""} ${m.last_name || ""}`.trim() || m.email || "Unknown";
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors",
                        isSelected && "bg-primary/5"
                      )}
                      onClick={() => toggleMember(m.id)}
                    >
                      <div className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}>
                        {(m.first_name?.[0] || m.email?.[0] || "?").toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{displayName}</p>
                        {m.email && <p className="text-xs text-muted-foreground truncate">{m.email}</p>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {m.roles.map((role) => (
                          <span
                            key={role}
                            className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", ROLE_COLORS[role] || "bg-muted text-muted-foreground")}
                          >
                            {ROLE_LABELS[role] || role}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          <Button
            className="w-full gap-2"
            onClick={handleCreate}
            disabled={selected.size === 0 || creating}
          >
            <MessageSquare className="h-4 w-4" />
            {creating ? "Creating…" : `Start Conversation${selected.size > 0 ? ` (${selected.size})` : ""}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
