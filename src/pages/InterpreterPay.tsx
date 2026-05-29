import { useState } from "react";
import { useAgencyInterpreters } from "@/hooks/useAgencyData";
import { useInterpreterPayRates, useInterpreterPayRateMutations, type InterpreterPayRate } from "@/hooks/useInterpreterPayRates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, DollarSign, Copy, Search, Users } from "lucide-react";
import { toast } from "sonner";

// IMPORTANT: Do not define components inside render scope.
// This causes remounting and input focus loss.
function PayField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

interface PayFormState {
  name: string;
  interpreter_id: string;
  pay_model: string;
  hourly_rate: string;
  minimum_hours: string;
  minimum_pay: string;
  overtime_rate: string;
  overtime_after_hours: string;
  travel_rate_per_mile: string;
  travel_time_rate: string;
  after_hours_multiplier: string;
  after_hours_start: string;
  after_hours_end: string;
  weekend_multiplier: string;
  holiday_multiplier: string;
  same_day_multiplier: string;
  cancellation_fee_percent: string;
  cancellation_window_hours: string;
  rounding_direction: string;
  rounding_interval_minutes: string;
  is_default: boolean;
  effective_start_date: string;
  effective_end_date: string;
}

const emptyForm: PayFormState = {
  name: "", interpreter_id: "", pay_model: "hourly",
  hourly_rate: "35", minimum_hours: "2", minimum_pay: "0",
  overtime_rate: "0", overtime_after_hours: "8",
  travel_rate_per_mile: "0.655", travel_time_rate: "0",
  after_hours_multiplier: "1.5", after_hours_start: "18:00", after_hours_end: "08:00",
  weekend_multiplier: "1.5", holiday_multiplier: "1", same_day_multiplier: "1",
  cancellation_fee_percent: "100", cancellation_window_hours: "24",
  rounding_direction: "up", rounding_interval_minutes: "15",
  is_default: false, effective_start_date: "", effective_end_date: "",
};

function rateToForm(r: any): PayFormState {
  return {
    name: r.name ?? "", interpreter_id: r.interpreter_id ?? "",
    pay_model: r.pay_model ?? "hourly",
    hourly_rate: String(r.hourly_rate ?? 35), minimum_hours: String(r.minimum_hours ?? 2),
    minimum_pay: String(r.minimum_pay ?? 0), overtime_rate: String(r.overtime_rate ?? 0),
    overtime_after_hours: String(r.overtime_after_hours ?? 8),
    travel_rate_per_mile: String(r.travel_rate_per_mile ?? 0.655),
    travel_time_rate: String(r.travel_time_rate ?? 0),
    after_hours_multiplier: String(r.after_hours_multiplier ?? 1.5),
    after_hours_start: (r.after_hours_start ?? "18:00").substring(0, 5),
    after_hours_end: (r.after_hours_end ?? "08:00").substring(0, 5),
    weekend_multiplier: String(r.weekend_multiplier ?? 1.5),
    holiday_multiplier: String(r.holiday_multiplier ?? 1),
    same_day_multiplier: String(r.same_day_multiplier ?? 1),
    cancellation_fee_percent: String(r.cancellation_fee_percent ?? 100),
    cancellation_window_hours: String(r.cancellation_window_hours ?? 24),
    rounding_direction: r.rounding_direction ?? "up",
    rounding_interval_minutes: String(r.rounding_interval_minutes ?? 15),
    is_default: r.is_default ?? false,
    effective_start_date: r.effective_start_date ?? "",
    effective_end_date: r.effective_end_date ?? "",
  };
}

export default function InterpreterPay() {
  const { data: interpreters = [] } = useAgencyInterpreters();
  const { data: payRates = [], isLoading } = useInterpreterPayRates();
  const { create, update, remove } = useInterpreterPayRateMutations();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<PayFormState>(emptyForm);
  const [search, setSearch] = useState("");

  const defaultRates = payRates.filter((r: any) => !r.interpreter_id);
  const interpreterOverrides = payRates.filter((r: any) => !!r.interpreter_id);
  const hasDefault = defaultRates.some((r: any) => r.is_default);
  const standardRate = defaultRates.find((r: any) => r.is_default) || defaultRates[0];

  const interpreterName = (id: string | null) => {
    if (!id) return "All (Default)";
    const i = interpreters.find((x: any) => x.id === id);
    return i ? `${i.first_name} ${i.last_name}` : id;
  };

  const openCreate = (forInterpreter = false) => {
    setEditId(null);
    setForm({ ...emptyForm, is_default: !forInterpreter && !hasDefault });
    setOpen(true);
  };

  const openCopyFromStandard = (interpreterId?: string) => {
    if (!standardRate) { toast.error("Create a default pay rate first."); return; }
    setEditId(null);
    const copied = rateToForm(standardRate);
    copied.is_default = false;
    copied.interpreter_id = interpreterId ?? "";
    copied.name = interpreterId
      ? `${interpreterName(interpreterId)} Custom Pay`
      : "";
    setForm(copied);
    setOpen(true);
  };

  const openEdit = (rate: any) => { setEditId(rate.id); setForm(rateToForm(rate)); setOpen(true); };

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    const payload: any = {
      name: form.name, interpreter_id: form.interpreter_id || null,
      pay_model: form.pay_model,
      hourly_rate: parseFloat(form.hourly_rate) || 0,
      minimum_hours: parseFloat(form.minimum_hours) || 2,
      minimum_pay: parseFloat(form.minimum_pay) || 0,
      overtime_rate: parseFloat(form.overtime_rate) || 0,
      overtime_after_hours: parseFloat(form.overtime_after_hours) || 8,
      travel_rate_per_mile: parseFloat(form.travel_rate_per_mile) || 0,
      travel_time_rate: parseFloat(form.travel_time_rate) || 0,
      after_hours_multiplier: Math.max(1, parseFloat(form.after_hours_multiplier) || 1),
      after_hours_start: form.after_hours_start || "18:00",
      after_hours_end: form.after_hours_end || "08:00",
      weekend_multiplier: Math.max(1, parseFloat(form.weekend_multiplier) || 1),
      holiday_multiplier: Math.max(1, parseFloat(form.holiday_multiplier) || 1),
      same_day_multiplier: Math.max(1, parseFloat(form.same_day_multiplier) || 1),
      cancellation_fee_percent: parseFloat(form.cancellation_fee_percent) || 100,
      cancellation_window_hours: parseFloat(form.cancellation_window_hours) || 24,
      rounding_direction: form.rounding_direction,
      rounding_interval_minutes: parseInt(form.rounding_interval_minutes) || 15,
      is_default: form.is_default,
      effective_start_date: form.effective_start_date || null,
      effective_end_date: form.effective_end_date || null,
    };
    if (editId) {
      update.mutate({ id: editId, ...payload }, {
        onSuccess: () => { setOpen(false); toast.success("Pay rate updated"); },
      });
    } else {
      create.mutate(payload, {
        onSuccess: () => { setOpen(false); toast.success("Pay rate created"); },
      });
    }
  };

  // Interpreter assignment view
  const filteredInterpreters = interpreters.filter((i: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${i.first_name} ${i.last_name}`.toLowerCase().includes(q) || i.email?.toLowerCase().includes(q);
  });

  const getInterpreterRate = (interpreterId: string) => {
    const todayStr = new Date().toISOString().split("T")[0];
    const specific = payRates.find((r: any) => {
      if (r.interpreter_id !== interpreterId) return false;
      if (r.effective_start_date && r.effective_start_date > todayStr) return false;
      if (r.effective_end_date && r.effective_end_date < todayStr) return false;
      return true;
    });
    return specific || standardRate || null;
  };

  const Field = PayField;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Interpreter Pay</h1>
        <p className="text-sm text-muted-foreground">Manage interpreter pay rates and packages</p>
      </div>

      <Tabs defaultValue="assignment">
        <TabsList>
          <TabsTrigger value="assignment">
            <Users className="mr-1 h-4 w-4" />Assignment ({filteredInterpreters.length})
          </TabsTrigger>
          <TabsTrigger value="defaults">Standard Package</TabsTrigger>
          <TabsTrigger value="overrides">Custom Packages ({interpreterOverrides.length})</TabsTrigger>
        </TabsList>

        {/* ASSIGNMENT TAB */}
        <TabsContent value="assignment" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search interpreters..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
            </div>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Interpreter</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pay Package</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="w-32 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInterpreters.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No interpreters found</TableCell></TableRow>
                  ) : filteredInterpreters.map((interp: any) => {
                    const rate = getInterpreterRate(interp.id);
                    const isCustom = rate?.interpreter_id === interp.id;
                    return (
                      <TableRow key={interp.id}>
                        <TableCell className="font-medium">{interp.first_name} {interp.last_name}</TableCell>
                        <TableCell>
                          <Badge variant={interp.is_active !== false ? "default" : "secondary"} className="text-xs">
                            {interp.is_active !== false ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>{rate?.name ?? "No package"}</TableCell>
                        <TableCell>
                          <Badge variant={isCustom ? "outline" : "secondary"} className="text-xs">
                            {isCustom ? "Custom" : "Standard"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {rate ? `$${Number(rate.hourly_rate).toFixed(2)}/hr` : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            {isCustom && rate ? (
                              <Button variant="outline" size="sm" onClick={() => openEdit(rate)}>
                                <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                              </Button>
                            ) : (
                              <Button variant="outline" size="sm" onClick={() => openCopyFromStandard(interp.id)}>
                                <Plus className="h-3.5 w-3.5 mr-1" />Custom
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* STANDARD PACKAGE TAB */}
        <TabsContent value="defaults" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => openCreate(false)}><Plus className="mr-1 h-4 w-4" />New Default Rate</Button>
          </div>
          {defaultRates.length === 0 ? (
            <Card><CardContent className="py-12 text-center">
              <div className="flex flex-col items-center gap-2">
                <DollarSign className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm font-medium text-foreground">No default pay rates yet</p>
                <p className="text-xs text-muted-foreground max-w-xs">Create a default pay rate to define base compensation for all interpreters.</p>
                <Button size="sm" className="mt-2" onClick={() => openCreate(false)}><Plus className="mr-1 h-3.5 w-3.5" />Create First Rate</Button>
              </div>
            </CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Min Hours</TableHead>
                      <TableHead className="text-right">Rounding</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {defaultRates.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          {r.name}
                          {r.is_default && <Badge variant="secondary" className="ml-2">Default</Badge>}
                        </TableCell>
                        <TableCell><Badge variant="outline">{r.pay_model}</Badge></TableCell>
                        <TableCell className="text-right">${Number(r.hourly_rate).toFixed(2)}/hr</TableCell>
                        <TableCell className="text-right">{r.minimum_hours}h</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{r.rounding_direction} {r.rounding_interval_minutes}min</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => remove.mutate(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* CUSTOM PACKAGES TAB */}
        <TabsContent value="overrides" className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => openCopyFromStandard()}>
              <Copy className="mr-1 h-4 w-4" />Copy from Standard
            </Button>
            <Button size="sm" onClick={() => openCreate(true)}><Plus className="mr-1 h-4 w-4" />New Custom Package</Button>
          </div>
          {interpreterOverrides.length === 0 ? (
            <Card><CardContent className="py-12 text-center">
              <div className="flex flex-col items-center gap-2">
                <Users className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm font-medium text-foreground">No interpreter-specific packages</p>
                <p className="text-xs text-muted-foreground max-w-xs">Create custom pay packages for individual interpreters who need different rates.</p>
              </div>
            </CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Interpreter</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {interpreterOverrides.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{interpreterName(r.interpreter_id)}</TableCell>
                        <TableCell className="text-right">${Number(r.hourly_rate).toFixed(2)}/hr</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => remove.mutate(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* PAY RATE EDITOR DIALOG */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit" : "New"} Pay Package</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Package Name">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Standard Interpreter Pay" />
              </Field>
              <Field label="Interpreter (blank = agency default)">
                <Select value={form.interpreter_id || "__all__"} onValueChange={(v) => setForm({ ...form, interpreter_id: v === "__all__" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="All Interpreters" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Interpreters</SelectItem>
                    {interpreters.map((i: any) => (
                      <SelectItem key={i.id} value={i.id}>{i.first_name} {i.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} />
              <Label>Default pay rate</Label>
            </div>

            <Separator />
            <p className="text-sm font-medium text-muted-foreground">Core Pay</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Hourly Rate ($)">
                <Input type="number" step="0.01" value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} />
              </Field>
              <Field label="Min Hours">
                <Input type="number" step="0.25" value={form.minimum_hours} onChange={(e) => setForm({ ...form, minimum_hours: e.target.value })} />
              </Field>
              <Field label="Min Pay ($)">
                <Input type="number" step="0.01" value={form.minimum_pay} onChange={(e) => setForm({ ...form, minimum_pay: e.target.value })} />
              </Field>
              <Field label="OT After (hrs)">
                <Input type="number" value={form.overtime_after_hours} onChange={(e) => setForm({ ...form, overtime_after_hours: e.target.value })} />
              </Field>
            </div>

            <Separator />
            <p className="text-sm font-medium text-muted-foreground">Rounding</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Direction">
                <Select value={form.rounding_direction} onValueChange={(v) => setForm({ ...form, rounding_direction: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="up">Round Up</SelectItem>
                    <SelectItem value="down">Round Down</SelectItem>
                    <SelectItem value="nearest">Round Nearest</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Interval (minutes)">
                <Input type="number" min="1" value={form.rounding_interval_minutes} onChange={(e) => setForm({ ...form, rounding_interval_minutes: e.target.value })} />
              </Field>
            </div>

            <Separator />
            <p className="text-sm font-medium text-muted-foreground">Premiums</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="After-Hours Mult.">
                <Input type="number" step="0.1" min="1" value={form.after_hours_multiplier} onChange={(e) => setForm({ ...form, after_hours_multiplier: e.target.value })} />
              </Field>
              <Field label="Weekend Mult.">
                <Input type="number" step="0.1" min="1" value={form.weekend_multiplier} onChange={(e) => setForm({ ...form, weekend_multiplier: e.target.value })} />
              </Field>
              <Field label="Holiday Mult.">
                <Input type="number" step="0.1" min="1" value={form.holiday_multiplier} onChange={(e) => setForm({ ...form, holiday_multiplier: e.target.value })} />
              </Field>
              <Field label="Same-Day Mult.">
                <Input type="number" step="0.1" min="1" value={form.same_day_multiplier} onChange={(e) => setForm({ ...form, same_day_multiplier: e.target.value })} />
              </Field>
            </div>

            <Separator />
            <p className="text-sm font-medium text-muted-foreground">After-Hours Window</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start"><Input type="time" value={form.after_hours_start} onChange={(e) => setForm({ ...form, after_hours_start: e.target.value })} /></Field>
              <Field label="End"><Input type="time" value={form.after_hours_end} onChange={(e) => setForm({ ...form, after_hours_end: e.target.value })} /></Field>
            </div>

            <Separator />
            <p className="text-sm font-medium text-muted-foreground">Travel</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="$/mile"><Input type="number" step="0.001" value={form.travel_rate_per_mile} onChange={(e) => setForm({ ...form, travel_rate_per_mile: e.target.value })} /></Field>
              <Field label="Travel Time $/hr"><Input type="number" step="0.01" value={form.travel_time_rate} onChange={(e) => setForm({ ...form, travel_time_rate: e.target.value })} /></Field>
            </div>

            <Separator />
            <p className="text-sm font-medium text-muted-foreground">Cancellation</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Window (hrs)"><Input type="number" min="0" value={form.cancellation_window_hours} onChange={(e) => setForm({ ...form, cancellation_window_hours: e.target.value })} /></Field>
              <Field label="Fee %"><Input type="number" min="0" max="100" value={form.cancellation_fee_percent} onChange={(e) => setForm({ ...form, cancellation_fee_percent: e.target.value })} /></Field>
            </div>

            <Separator />
            <p className="text-sm font-medium text-muted-foreground">Effective Dates</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start"><Input type="date" value={form.effective_start_date} onChange={(e) => setForm({ ...form, effective_start_date: e.target.value })} /></Field>
              <Field label="End"><Input type="date" value={form.effective_end_date} onChange={(e) => setForm({ ...form, effective_end_date: e.target.value })} /></Field>
            </div>

            <Separator />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>
                {editId ? "Update" : "Create"} Package
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
