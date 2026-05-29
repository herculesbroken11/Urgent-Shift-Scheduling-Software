import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Mail, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCustomers } from "@/hooks/useAgencyData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface InviteUserDialogProps {
  onSuccess: () => void;
  defaultRole?: string;
  trigger?: React.ReactNode;
}

const ROLE_OPTIONS = [
  { value: "interpreter", label: "Interpreter" },
  { value: "requester", label: "Requester" },
  { value: "scheduler", label: "Scheduler" },
];

export function InviteUserDialog({ onSuccess, defaultRole, trigger }: InviteUserDialogProps) {
  const { profile } = useAuth();
  const { data: customers = [] } = useCustomers();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: "", first_name: "", last_name: "", phone: "",
    role: defaultRole || "interpreter", customer_id: "",
  });

  const reset = () => setForm({
    email: "", first_name: "", last_name: "", phone: "",
    role: defaultRole || "interpreter", customer_id: "",
  });

  const handleSubmit = async (mode: "invite" | "create") => {
    if (!form.email) { toast.error("Email is required"); return; }
    setLoading(true);
    try {
      const body: Record<string, unknown> = { mode, ...form };
      if (form.role !== "requester") delete body.customer_id;
      if (!body.customer_id) delete body.customer_id;

      const { data, error } = await supabase.functions.invoke("invite-user", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.linked_existing) {
        toast.success(data.message || `${form.email} has been added to your agency`);
      } else {
        toast.success(
          mode === "invite"
            ? `Invitation sent to ${form.email}`
            : `Account created for ${form.first_name || form.email}`
        );
      }
      reset();
      setOpen(false);
      onSuccess();
    } catch (err: any) {
      const msg = err.message || "Failed to add user";
      if (msg.includes("already") || msg.includes("conflict")) {
        toast.error(msg);
      } else if (msg.includes("permission") || msg.includes("Forbidden")) {
        toast.error("You don't have permission to do this.");
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const formFields = (
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label>Role *</Label>
        <Select value={form.role} onValueChange={(v) => setForm(f => ({ ...f, role: v, customer_id: "" }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="inv_first_name">First name</Label>
          <Input id="inv_first_name" placeholder="Jane" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="inv_last_name">Last name</Label>
          <Input id="inv_last_name" placeholder="Doe" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="inv_email">Email *</Label>
        <Input id="inv_email" type="email" placeholder="user@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="inv_phone">Phone</Label>
        <Input id="inv_phone" type="tel" placeholder="+1 (555) 123-4567" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
      </div>

      {form.role === "requester" && (
        <div className="space-y-2">
          <Label>Customer Organization (optional)</Label>
          <Select value={form.customer_id} onValueChange={(v) => setForm(f => ({ ...f, customer_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Select customer..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {customers.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        {trigger || <Button><UserPlus className="mr-2 h-4 w-4" /> Invite User</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>Invite by email or create an account directly.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="invite" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="invite"><Mail className="mr-2 h-4 w-4" />Invite</TabsTrigger>
            <TabsTrigger value="create"><UserPlus className="mr-2 h-4 w-4" />Create</TabsTrigger>
          </TabsList>
          <TabsContent value="invite">
            <p className="text-sm text-muted-foreground mb-2">Send an email invitation. They'll sign up and auto-join your agency.</p>
            {formFields}
            <Button className="w-full mt-4" onClick={() => handleSubmit("invite")} disabled={loading}>
              <Send className="mr-2 h-4 w-4" /> {loading ? "Sending..." : "Send Invitation"}
            </Button>
          </TabsContent>
          <TabsContent value="create">
            <p className="text-sm text-muted-foreground mb-2">Create an account immediately. They'll receive a password reset email.</p>
            {formFields}
            <Button className="w-full mt-4" onClick={() => handleSubmit("create")} disabled={loading}>
              <UserPlus className="mr-2 h-4 w-4" /> {loading ? "Creating..." : "Create Account"}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
