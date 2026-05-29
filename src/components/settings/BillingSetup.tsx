import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Pencil, Trash2, DollarSign, AlertCircle, Copy, Info } from "lucide-react";
import { useBillingRates, useBillingRateMutations, type BillingRate } from "@/hooks/useBillingData";
import { useCustomers } from "@/hooks/useAgencyData";
import { toast } from "sonner";

const BILLING_MODELS = [
  { value: "hourly", label: "Hourly" },
  { value: "per_appointment", label: "Per Appointment" },
  { value: "flat", label: "Flat Rate" },
  { value: "tiered", label: "Tiered" },
];

interface RateFormState {
  name: string;
  customer_id: string;
  billing_model: string;
  base_rate: string;
  hourly_rate: string;
  minimum_hours: string;
  minimum_charge: string;
  monthly_minimum: string;
  travel_rate_per_mile: string;
  travel_time_rate: string;
  after_hours_multiplier: string;
  weekend_multiplier: string;
  overtime_multiplier: string;
  overtime_after_hours: string;
  cancellation_window_hours: string;
  cancellation_fee_percent: string;
  is_default: boolean;
  effective_start_date: string;
  effective_end_date: string;
  tier_config: string;
  // Bundle fields
  same_day_threshold_hours: string;
  same_day_fee: string;
  same_day_multiplier: string;
  after_hours_start: string;
  after_hours_end: string;
  holiday_multiplier: string;
  // Advanced billing fields
  rounding_direction: string;
  rounding_interval_minutes: string;
  stack_premiums: boolean;
  apply_lastminute_to_travel: boolean;
  ignore_requested_duration: boolean;
}

const emptyForm: RateFormState = {
  name: "",
  customer_id: "",
  billing_model: "hourly",
  base_rate: "0",
  hourly_rate: "50",
  minimum_hours: "1",
  minimum_charge: "0",
  monthly_minimum: "0",
  travel_rate_per_mile: "0.655",
  travel_time_rate: "0",
  after_hours_multiplier: "1.5",
  weekend_multiplier: "1.5",
  overtime_multiplier: "1.5",
  overtime_after_hours: "8",
  cancellation_window_hours: "24",
  cancellation_fee_percent: "100",
  is_default: false,
  effective_start_date: "",
  effective_end_date: "",
  tier_config: "[]",
  same_day_threshold_hours: "24",
  same_day_fee: "0",
  same_day_multiplier: "1",
  after_hours_start: "18:00",
  after_hours_end: "08:00",
  holiday_multiplier: "1",
  rounding_direction: "up",
  rounding_interval_minutes: "15",
  stack_premiums: true,
  apply_lastminute_to_travel: false,
  ignore_requested_duration: false,
};

function rateToForm(rate: any): RateFormState {
  return {
    name: rate.name ?? "",
    customer_id: rate.customer_id ?? "",
    billing_model: rate.billing_model ?? "hourly",
    base_rate: String(rate.base_rate ?? 0),
    hourly_rate: String(rate.hourly_rate ?? 50),
    minimum_hours: String(rate.minimum_hours ?? 1),
    minimum_charge: String(rate.minimum_charge ?? 0),
    monthly_minimum: String(rate.monthly_minimum ?? 0),
    travel_rate_per_mile: String(rate.travel_rate_per_mile ?? 0.655),
    travel_time_rate: String(rate.travel_time_rate ?? 0),
    after_hours_multiplier: String(rate.after_hours_multiplier ?? 1.5),
    weekend_multiplier: String(rate.weekend_multiplier ?? 1.5),
    overtime_multiplier: String(rate.overtime_multiplier ?? 1.5),
    overtime_after_hours: String(rate.overtime_after_hours ?? 8),
    cancellation_window_hours: String(rate.cancellation_window_hours ?? 24),
    cancellation_fee_percent: String(rate.cancellation_fee_percent ?? 100),
    is_default: rate.is_default ?? false,
    effective_start_date: rate.effective_start_date ?? "",
    effective_end_date: rate.effective_end_date ?? "",
    tier_config: JSON.stringify(rate.tier_config ?? []),
    same_day_threshold_hours: String(rate.same_day_threshold_hours ?? 24),
    same_day_fee: String(rate.same_day_fee ?? 0),
    same_day_multiplier: String(rate.same_day_multiplier ?? 1),
    after_hours_start: (rate.after_hours_start ?? "18:00").substring(0, 5),
    after_hours_end: (rate.after_hours_end ?? "08:00").substring(0, 5),
    holiday_multiplier: String(rate.holiday_multiplier ?? 1),
    rounding_direction: rate.rounding_direction ?? "up",
    rounding_interval_minutes: String(rate.rounding_interval_minutes ?? 15),
    stack_premiums: rate.stack_premiums !== false,
    apply_lastminute_to_travel: rate.apply_lastminute_to_travel ?? false,
    ignore_requested_duration: rate.ignore_requested_duration ?? false,
  };
}

function HelpTip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3.5 w-3.5 text-muted-foreground inline ml-1 cursor-help" />
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// IMPORTANT: Do not define components inside render scope.
// This causes remounting and input focus loss.
// BillingField and HelpTip are defined at module level to ensure stable component identity.
function BillingField({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">
        {label}
        {help && <HelpTip text={help} />}
      </Label>
      {children}
    </div>
  );
}

export function BillingSetup() {
  const { data: rates = [], isLoading } = useBillingRates();
  const { data: customers = [] } = useCustomers();
  const { create, update, remove } = useBillingRateMutations();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<RateFormState>(emptyForm);

  const defaultRates = rates.filter((r: any) => !r.customer_id);
  const customerOverrides = rates.filter((r: any) => !!r.customer_id);
  const hasDefault = defaultRates.some((r: any) => r.is_default);
  const standardRate = defaultRates.find((r: any) => r.is_default) || defaultRates[0];

  const openCreate = (forCustomer = false) => {
    setEditId(null);
    setForm({ ...emptyForm, is_default: !forCustomer && !hasDefault });
    setOpen(true);
  };

  const openCreateFromStandard = (customerId?: string) => {
    if (!standardRate) {
      toast.error("No standard rate to copy from. Create a default rate first.");
      return;
    }
    setEditId(null);
    const copied = rateToForm(standardRate);
    copied.is_default = false;
    copied.customer_id = customerId ?? "";
    copied.name = customerId
      ? `${customers.find(c => c.id === customerId)?.name ?? "Customer"} Custom Rate`
      : "";
    setForm(copied);
    setOpen(true);
  };

  const openEdit = (rate: any) => {
    setEditId(rate.id);
    setForm(rateToForm(rate));
    setOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }

    let tierConfig: any[] = [];
    try {
      tierConfig = JSON.parse(form.tier_config);
    } catch {
      tierConfig = [];
    }

    const payload: any = {
      name: form.name,
      customer_id: form.customer_id || null,
      billing_model: form.billing_model,
      base_rate: parseFloat(form.base_rate) || 0,
      hourly_rate: parseFloat(form.hourly_rate) || 0,
      minimum_hours: parseFloat(form.minimum_hours) || 1,
      minimum_charge: parseFloat(form.minimum_charge) || 0,
      monthly_minimum: parseFloat(form.monthly_minimum) || 0,
      travel_rate_per_mile: parseFloat(form.travel_rate_per_mile) || 0,
      travel_time_rate: parseFloat(form.travel_time_rate) || 0,
      after_hours_multiplier: Math.max(1, parseFloat(form.after_hours_multiplier) || 1),
      weekend_multiplier: Math.max(1, parseFloat(form.weekend_multiplier) || 1),
      overtime_multiplier: Math.max(1, parseFloat(form.overtime_multiplier) || 1.5),
      overtime_after_hours: parseFloat(form.overtime_after_hours) || 8,
      cancellation_window_hours: Math.max(0, parseInt(form.cancellation_window_hours) || 24),
      cancellation_fee_percent: Math.max(0, parseFloat(form.cancellation_fee_percent) || 100),
      is_default: form.is_default,
      effective_start_date: form.effective_start_date || null,
      effective_end_date: form.effective_end_date || null,
      tier_config: tierConfig,
      // New bundle fields
      same_day_threshold_hours: Math.max(0, parseInt(form.same_day_threshold_hours) || 24),
      same_day_fee: Math.max(0, parseFloat(form.same_day_fee) || 0),
      same_day_multiplier: Math.max(1, parseFloat(form.same_day_multiplier) || 1),
      after_hours_start: form.after_hours_start || "18:00",
      after_hours_end: form.after_hours_end || "08:00",
      holiday_multiplier: Math.max(1, parseFloat(form.holiday_multiplier) || 1),
      // Advanced billing fields
      rounding_direction: form.rounding_direction || "up",
      rounding_interval_minutes: Math.max(0, parseInt(form.rounding_interval_minutes) || 15),
      stack_premiums: form.stack_premiums,
      apply_lastminute_to_travel: form.apply_lastminute_to_travel,
      ignore_requested_duration: form.ignore_requested_duration,
    };

    if (editId) {
      update.mutate({ id: editId, ...payload }, { onSuccess: () => setOpen(false) });
    } else {
      create.mutate(payload, { onSuccess: () => setOpen(false) });
    }
  };

  const Field = BillingField;

  const customerName = (id: string | null) =>
    customers.find((c) => c.id === id)?.name ?? "All (Default)";

  const modelLabel = (m: string) =>
    BILLING_MODELS.find((b) => b.value === m)?.label ?? m;

  const RateRow = ({ rate }: { rate: any }) => (
    <TableRow>
      <TableCell className="font-medium">
        {rate.name}
        {rate.is_default && <Badge variant="secondary" className="ml-2">Default</Badge>}
      </TableCell>
      <TableCell>{customerName(rate.customer_id)}</TableCell>
      <TableCell>
        <Badge variant="outline">{modelLabel(rate.billing_model ?? "hourly")}</Badge>
      </TableCell>
      <TableCell className="text-right">
        {rate.billing_model === "hourly"
          ? `$${Number(rate.hourly_rate).toFixed(2)}/hr`
          : `$${Number(rate.base_rate ?? 0).toFixed(2)}`}
      </TableCell>
      <TableCell className="text-right">
        {rate.effective_start_date
          ? `${rate.effective_start_date}${rate.effective_end_date ? ` → ${rate.effective_end_date}` : " →"}`
          : "Always"}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => openEdit(rate)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => remove.mutate(rate.id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Billing Rate Engine
        </CardTitle>
        <CardDescription>
          Configure default and customer-specific billing bundles. The engine resolves rates
          hierarchically: customer override → agency default.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasDefault && !isLoading && (
          <div className="flex items-start gap-2 p-3 mb-4 rounded-md bg-warning/10 border border-warning/20 text-sm">
            <Info className="h-4 w-4 shrink-0 text-warning mt-0.5" />
            <div>
              <p className="font-medium text-foreground">No default billing rate yet</p>
              <p className="text-muted-foreground mt-0.5">
                Create a billing rate and mark it as "Default" to enable automatic invoice calculations.
                Click <strong>Add Rate Bundle</strong> below to get started.
              </p>
            </div>
          </div>
        )}

        <Tabs defaultValue="defaults">
          <TabsList className="mb-4">
            <TabsTrigger value="defaults">Standard Bundle</TabsTrigger>
            <TabsTrigger value="overrides">Customer Bundles ({customerOverrides.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="defaults">
            <div className="flex justify-end mb-3">
              <Button size="sm" onClick={() => openCreate(false)}>
                <Plus className="mr-1 h-4 w-4" />New Default Rate
              </Button>
            </div>
            {defaultRates.length === 0 ? (
              <p className="text-center py-6 text-muted-foreground text-sm">
                No default rates yet. Create one to enable billing.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Effective</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {defaultRates.map((r: any) => <RateRow key={r.id} rate={r} />)}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="overrides">
            <div className="flex justify-end mb-3 gap-2">
              <Button size="sm" variant="outline" onClick={() => openCreateFromStandard()}>
                <Copy className="mr-1 h-4 w-4" />Copy from Standard
              </Button>
              <Button size="sm" onClick={() => openCreate(true)}>
                <Plus className="mr-1 h-4 w-4" />New Customer Bundle
              </Button>
            </div>
            {customerOverrides.length === 0 ? (
              <p className="text-center py-6 text-muted-foreground text-sm">
                No customer-specific bundles. Add one to customize billing for a customer.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Effective</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerOverrides.map((r: any) => <RateRow key={r.id} rate={r} />)}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>

        {/* ── Rate Editor Dialog ──────────────────────────────────── */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Edit" : "New"} Billing Bundle</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              {/* Row 1: Name + Model */}
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Bundle Name">
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Standard Hourly" />
                </Field>
                <Field label="Billing Model">
                  <Select value={form.billing_model} onValueChange={(v) => setForm({ ...form, billing_model: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BILLING_MODELS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {/* Customer + Default toggle */}
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Customer (blank = agency-wide)">
                  <Select value={form.customer_id || "__all__"} onValueChange={(v) => setForm({ ...form, customer_id: v === "__all__" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="All Customers" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Customers</SelectItem>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex items-end gap-2 pb-1">
                  <Switch checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} />
                  <Label>Default rate</Label>
                </div>
              </div>

              <Separator />

              {/* ── SECTION: Base Rates ── */}
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Base Rates</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(form.billing_model !== "hourly") && (
                  <Field label="Base Rate ($)">
                    <Input type="number" step="0.01" value={form.base_rate} onChange={(e) => setForm({ ...form, base_rate: e.target.value })} />
                  </Field>
                )}
                {(form.billing_model === "hourly" || form.billing_model === "tiered") && (
                  <Field label="Hourly Rate ($)">
                    <Input type="number" step="0.01" value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} />
                  </Field>
                )}
                <Field label="Min Hours" help="Minimum billable hours per appointment">
                  <Input type="number" step="0.25" value={form.minimum_hours} onChange={(e) => setForm({ ...form, minimum_hours: e.target.value })} />
                </Field>
                <Field label="Min Charge ($)">
                  <Input type="number" step="0.01" value={form.minimum_charge} onChange={(e) => setForm({ ...form, minimum_charge: e.target.value })} />
                </Field>
                <Field label="Monthly Min ($)">
                  <Input type="number" step="0.01" value={form.monthly_minimum} onChange={(e) => setForm({ ...form, monthly_minimum: e.target.value })} />
                </Field>
              </div>

              <Separator />

              {/* ── SECTION: Last-Minute & Cancellation ── */}
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last-Minute &amp; Cancellation</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label="Last-Minute Booking Window (hours)" help="Requests submitted within this many hours of the appointment start time are automatically flagged as Last Minute and billed at the last-minute rate.">
                  <Input type="number" min="0" value={form.same_day_threshold_hours} onChange={(e) => setForm({ ...form, same_day_threshold_hours: e.target.value })} />
                </Field>
                <Field label="Last-Minute Rate Multiplier" help="Multiplier applied to the base rate for last-minute appointments. Set to 1 for no premium.">
                  <Input type="number" step="0.1" min="1" value={form.same_day_multiplier} onChange={(e) => setForm({ ...form, same_day_multiplier: e.target.value })} />
                </Field>
                <Field label="Last-Minute Flat Fee ($)" help="Flat fee added to last-minute appointments on top of the multiplier.">
                  <Input type="number" step="0.01" min="0" value={form.same_day_fee} onChange={(e) => setForm({ ...form, same_day_fee: e.target.value })} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Field label="Cancellation Window (hours)" help="Cancellations within this many hours of appointment start are billed at full scheduled duration as a late cancellation.">
                  <Input type="number" min="0" value={form.cancellation_window_hours} onChange={(e) => setForm({ ...form, cancellation_window_hours: e.target.value })} />
                </Field>
                <Field label="Cancellation Fee %" help="Applied to standard cancellations outside the late cancel window. Set to 0 for no charge on standard cancellations. Late cancellations are always billed at full scheduled duration regardless of this setting.">
                  <Input type="number" min="0" max="100" value={form.cancellation_fee_percent} onChange={(e) => setForm({ ...form, cancellation_fee_percent: e.target.value })} />
                </Field>
              </div>
              <Alert className="mt-3">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Late cancellations and client no-shows are always billed at the full scheduled duration per the appointment's billing rate. This is configured per customer via billing bundles.
                </AlertDescription>
              </Alert>

              <Separator />

              {/* ── SECTION: Premiums ── */}
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Premiums</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label="After-Hours Start" help="After-hours window start (e.g. 18:00). Supports overnight windows.">
                  <Input type="time" value={form.after_hours_start} onChange={(e) => setForm({ ...form, after_hours_start: e.target.value })} />
                </Field>
                <Field label="After-Hours End" help="After-hours window end (e.g. 08:00)">
                  <Input type="time" value={form.after_hours_end} onChange={(e) => setForm({ ...form, after_hours_end: e.target.value })} />
                </Field>
                <Field label="After-Hours Multiplier" help="Premium multiplier for after-hours appointments">
                  <Input type="number" step="0.1" min="1" value={form.after_hours_multiplier} onChange={(e) => setForm({ ...form, after_hours_multiplier: e.target.value })} />
                </Field>
                <Field label="Weekend Multiplier" help="Premium multiplier for Saturday/Sunday appointments">
                  <Input type="number" step="0.1" min="1" value={form.weekend_multiplier} onChange={(e) => setForm({ ...form, weekend_multiplier: e.target.value })} />
                </Field>
                <Field label="Holiday Multiplier" help="Premium multiplier for appointments on agency holiday dates">
                  <Input type="number" step="0.1" min="1" value={form.holiday_multiplier} onChange={(e) => setForm({ ...form, holiday_multiplier: e.target.value })} />
                </Field>
              </div>

              <Separator />

              {/* ── SECTION: Travel ── */}
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Travel</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Travel $/mile">
                  <Input type="number" step="0.001" value={form.travel_rate_per_mile} onChange={(e) => setForm({ ...form, travel_rate_per_mile: e.target.value })} />
                </Field>
                <Field label="Travel Time $/hr">
                  <Input type="number" step="0.01" value={form.travel_time_rate} onChange={(e) => setForm({ ...form, travel_time_rate: e.target.value })} />
                </Field>
              </div>

              <Separator />

              {/* ── SECTION: Overtime ── */}
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overtime</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="OT Multiplier">
                  <Input type="number" step="0.1" min="1" value={form.overtime_multiplier} onChange={(e) => setForm({ ...form, overtime_multiplier: e.target.value })} />
                </Field>
                <Field label="OT After (hrs)">
                  <Input type="number" value={form.overtime_after_hours} onChange={(e) => setForm({ ...form, overtime_after_hours: e.target.value })} />
                </Field>
              </div>

              <Separator />

              {/* ── SECTION: Advanced ── */}
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Advanced</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Field label="Rounding" help="How to round billable hours to the nearest interval">
                  <Select value={form.rounding_direction} onValueChange={(v) => setForm({ ...form, rounding_direction: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="up">Round Up</SelectItem>
                      <SelectItem value="down">Round Down</SelectItem>
                      <SelectItem value="nearest">Round Nearest</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Interval (min)" help="Rounding interval in minutes (e.g. 15 = round to nearest 15 min)">
                  <Input type="number" min="1" value={form.rounding_interval_minutes} onChange={(e) => setForm({ ...form, rounding_interval_minutes: e.target.value })} />
                </Field>
              </div>
              <div className="space-y-3 mt-2">
                <div className="flex items-center gap-2">
                  <Switch checked={form.stack_premiums} onCheckedChange={(v) => setForm({ ...form, stack_premiums: v })} />
                  <Label className="text-sm">Stack premiums (after-hours + weekend + holiday add up; off = highest only)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.apply_lastminute_to_travel} onCheckedChange={(v) => setForm({ ...form, apply_lastminute_to_travel: v })} />
                  <Label className="text-sm">Apply last-minute surcharge to travel charges</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.ignore_requested_duration} onCheckedChange={(v) => setForm({ ...form, ignore_requested_duration: v })} />
                  <Label className="text-sm">Ignore requested duration (use actual times only for billing)</Label>
                </div>
              </div>

              <Separator />

              {/* ── Effective dates ── */}
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Effective Dates</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start Date">
                  <Input type="date" value={form.effective_start_date} onChange={(e) => setForm({ ...form, effective_start_date: e.target.value })} />
                </Field>
                <Field label="End Date">
                  <Input type="date" value={form.effective_end_date} onChange={(e) => setForm({ ...form, effective_end_date: e.target.value })} />
                </Field>
              </div>

              {form.billing_model === "tiered" && (
                <>
                  <Separator />
                  <Field label="Tier Config (JSON)">
                    <Input value={form.tier_config} onChange={(e) => setForm({ ...form, tier_config: e.target.value })} placeholder='[{"min_appointments":1,"max_appointments":10,"rate":50}]' />
                  </Field>
                </>
              )}

              <Separator />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>
                  {editId ? "Update" : "Create"} Bundle
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
