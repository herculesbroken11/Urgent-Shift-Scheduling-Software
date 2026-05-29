import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AddInterpreterDialogProps {
  onSuccess: () => void;
}

export function AddInterpreterDialog({ onSuccess }: AddInterpreterDialogProps) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", first_name: "", last_name: "", phone: "" });

  const reset = () => setForm({ email: "", first_name: "", last_name: "", phone: "" });

  const handleSubmit = async (mode: "invite" | "create") => {
    if (!form.email) {
      toast.error("Email is required");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { mode, role: "interpreter", ...form },
      });
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
      const msg = err.message || "Failed to add interpreter";
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
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="first_name">First name</Label>
          <Input id="first_name" placeholder="Jane" value={form.first_name} onChange={(e) => setForm(f => ({ ...f, first_name: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="last_name">Last name</Label>
          <Input id="last_name" placeholder="Doe" value={form.last_name} onChange={(e) => setForm(f => ({ ...f, last_name: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email *</Label>
        <Input id="email" type="email" placeholder="interpreter@example.com" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" type="tel" placeholder="+1 (555) 123-4567" value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} />
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button><UserPlus className="mr-2 h-4 w-4" /> Add Interpreter</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Interpreter</DialogTitle>
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
