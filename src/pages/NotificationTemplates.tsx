import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoData } from "@/contexts/DemoDataContext";
import { DEMO_AGENCY_ID } from "@/contexts/DemoContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Edit, Mail, MessageSquare, Bell } from "lucide-react";

const eventTypes = [
  { value: "appointment_created", label: "Appointment Created" },
  { value: "appointment_confirmed", label: "Appointment Confirmed" },
  { value: "appointment_cancelled", label: "Appointment Cancelled" },
  { value: "appointment_reminder", label: "Appointment Reminder" },
  { value: "job_available", label: "Job Available" },
  { value: "invoice_created", label: "Invoice Created" },
];

const channelIcons: Record<string, React.ElementType> = { email: Mail, sms: MessageSquare, in_app: Bell };

interface TemplateForm {
  name: string;
  event_type: string;
  channel: string;
  subject: string;
  body_template: string;
  is_active: boolean;
}

const emptyForm: TemplateForm = { name: "", event_type: "appointment_created", channel: "email", subject: "", body_template: "", is_active: true };

export default function NotificationTemplates() {
  const { profile, isDemoMode } = useAuth();
  const { state, addItem, updateItem, genId } = useDemoData();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyForm);

  const { data: templates = [] } = useQuery({
    queryKey: ["notification-templates", isDemoMode ? state.notificationTemplates : null],
    queryFn: async () => {
      if (isDemoMode) return state.notificationTemplates;
      const { data, error } = await supabase.from("notification_templates").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isDemoMode) {
        if (editing) {
          updateItem("notificationTemplates", editing, form);
        } else {
          addItem("notificationTemplates", {
            id: genId("demo-tmpl"),
            agency_id: DEMO_AGENCY_ID,
            ...form,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        return;
      }
      if (editing) {
        const { error } = await supabase.from("notification_templates").update(form).eq("id", editing);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("notification_templates").insert({ ...form, agency_id: profile!.agency_id! });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      if (!isDemoMode) queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
      toast.success(editing ? "Template updated" : "Template created");
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (t: any) => {
    setEditing(t.id);
    setForm({ name: t.name, event_type: t.event_type, channel: t.channel, subject: t.subject || "", body_template: t.body_template, is_active: t.is_active });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notification Templates</h1>
          <p className="text-muted-foreground">Manage SMS, email, and in-app notification templates</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm(emptyForm); } }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New Template</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Template</DialogTitle></DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Appointment Confirmation Email" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Event Type</Label>
                  <Select value={form.event_type} onValueChange={(v) => setForm({ ...form, event_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {eventTypes.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Channel</Label>
                  <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="in_app">In-App</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.channel === "email" && (
                <div className="grid gap-2">
                  <Label>Subject</Label>
                  <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Your appointment has been confirmed" />
                </div>
              )}
              <div className="grid gap-2">
                <Label>Body Template</Label>
                <Textarea
                  value={form.body_template}
                  onChange={(e) => setForm({ ...form, body_template: e.target.value })}
                  placeholder="Hello {{interpreter_name}}, your appointment on {{date}} at {{time}} has been confirmed."
                  rows={5}
                />
                <p className="text-xs text-muted-foreground">
                  Available variables: {"{{interpreter_name}}"}, {"{{customer_name}}"}, {"{{date}}"}, {"{{time}}"}, {"{{location}}"}, {"{{language}}"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>Active</Label>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setOpen(false); setEditing(null); setForm(emptyForm); }}>Cancel</Button>
                <Button onClick={() => saveMutation.mutate()} disabled={!form.name || !form.body_template || saveMutation.isPending}>
                  {editing ? "Update" : "Create"} Template
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <Bell className="h-10 w-10 text-muted-foreground/40" />
                      <p className="text-sm font-medium text-foreground">No templates yet</p>
                      <p className="text-xs text-muted-foreground max-w-xs">
                        Create notification templates to automate emails, SMS, and in-app messages for key events.
                      </p>
                      <Button size="sm" className="mt-2" onClick={() => setOpen(true)}>
                        <Plus className="mr-1 h-3.5 w-3.5" />Create First Template
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                templates.map((t: any) => {
                  const ChannelIcon = channelIcons[t.channel] || Mail;
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell>{eventTypes.find((e) => e.value === t.event_type)?.label || t.event_type}</TableCell>
                      <TableCell><Badge variant="outline" className="gap-1"><ChannelIcon className="h-3 w-3" />{t.channel}</Badge></TableCell>
                      <TableCell><Badge variant={t.is_active ? "default" : "secondary"}>{t.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                      <TableCell><Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Edit className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}