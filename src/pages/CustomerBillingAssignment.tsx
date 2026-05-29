import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useCustomers } from "@/hooks/useAgencyData";
import { useBillingRates, useBillingRateMutations } from "@/hooks/useBillingData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, DollarSign, Plus, Pencil, AlertTriangle, Eye, Copy, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

// IMPORTANT: Do not define components inside render scope.
// This causes remounting and input focus loss.
function BillingField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// Inline bundle editor form state
interface BundleFormState {
  name: string;
  billing_model: string;
  hourly_rate: string;
  minimum_hours: string;
  after_hours_multiplier: string;
  weekend_multiplier: string;
  holiday_multiplier: string;
  same_day_multiplier: string;
  cancellation_fee_percent: string;
  cancellation_window_hours: string;
  rounding_direction: string;
  rounding_interval_minutes: string;
  stack_premiums: boolean;
}

const emptyBundleForm: BundleFormState = {
  name: "", billing_model: "hourly", hourly_rate: "75", minimum_hours: "2",
  after_hours_multiplier: "1.5", weekend_multiplier: "1.5", holiday_multiplier: "1",
  same_day_multiplier: "1", cancellation_fee_percent: "100", cancellation_window_hours: "24",
  rounding_direction: "up", rounding_interval_minutes: "15", stack_premiums: true,
};

function rateToBundleForm(r: any): BundleFormState {
  return {
    name: r.name ?? "",
    billing_model: r.billing_model ?? "hourly",
    hourly_rate: String(r.hourly_rate ?? 75),
    minimum_hours: String(r.minimum_hours ?? 2),
    after_hours_multiplier: String(r.after_hours_multiplier ?? 1.5),
    weekend_multiplier: String(r.weekend_multiplier ?? 1.5),
    holiday_multiplier: String(r.holiday_multiplier ?? 1),
    same_day_multiplier: String(r.same_day_multiplier ?? 1),
    cancellation_fee_percent: String(r.cancellation_fee_percent ?? 100),
    cancellation_window_hours: String(r.cancellation_window_hours ?? 24),
    rounding_direction: r.rounding_direction ?? "up",
    rounding_interval_minutes: String(r.rounding_interval_minutes ?? 15),
    stack_premiums: r.stack_premiums !== false,
  };
}

export default function CustomerBillingAssignment() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: customers = [], isLoading } = useCustomers();
  const { data: rates = [] } = useBillingRates();
  const { create, update } = useBillingRateMutations();
  const [search, setSearch] = useState("");
  const [orphanDialogOpen, setOrphanDialogOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTarget, setEditorTarget] = useState<{ customerId: string; customerName: string; rateId: string | null } | null>(null);
  const [bundleForm, setBundleForm] = useState<BundleFormState>(emptyBundleForm);
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [bulkBundleId, setBulkBundleId] = useState<string>("__default__");

  const todayStr = new Date().toISOString().split("T")[0];

  const defaultRate = rates.find((r: any) => r.is_default && !r.customer_id);
  const customerRates = rates.filter((r: any) => !!r.customer_id);
  const orphanRates = rates.filter((r: any) => !r.customer_id && !r.is_default);

  const customerRateMap = useMemo(() => {
    const map = new Map<string, any>();
    customerRates.forEach((r: any) => {
      if (r.effective_start_date && r.effective_start_date > todayStr) return;
      if (r.effective_end_date && r.effective_end_date < todayStr) return;
      if (!map.has(r.customer_id)) map.set(r.customer_id, r);
    });
    return map;
  }, [customerRates, todayStr]);

  // Available bundles for reassignment dropdown
  const assignableBundles = useMemo(() => {
    const bundles: { id: string; name: string; label: string }[] = [];
    if (defaultRate) bundles.push({ id: "__default__", name: defaultRate.name, label: `${defaultRate.name} (Agency Default)` });
    // Customer-specific bundles not linked to the current customer could also be shown, but
    // typically assignment is done by creating a new custom bundle
    return bundles;
  }, [defaultRate]);

  const filtered = customers.filter((c: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.contact_name?.toLowerCase().includes(q);
  });

  const openEditor = (customerId: string, customerName: string, existingRate: any | null) => {
    setEditorTarget({ customerId, customerName, rateId: existingRate?.id || null });
    if (existingRate) {
      setBundleForm(rateToBundleForm(existingRate));
    } else {
      const base = defaultRate ? rateToBundleForm(defaultRate) : emptyBundleForm;
      setBundleForm({ ...base, name: `${customerName} Custom` });
    }
    setEditorOpen(true);
  };

  const handleSaveBundle = () => {
    if (!bundleForm.name.trim()) { toast.error("Bundle name is required"); return; }
    if (!editorTarget) return;

    const payload: any = {
      name: bundleForm.name,
      customer_id: editorTarget.customerId,
      billing_model: bundleForm.billing_model,
      hourly_rate: parseFloat(bundleForm.hourly_rate) || 0,
      minimum_hours: parseFloat(bundleForm.minimum_hours) || 0,
      after_hours_multiplier: Math.max(1, parseFloat(bundleForm.after_hours_multiplier) || 1),
      weekend_multiplier: Math.max(1, parseFloat(bundleForm.weekend_multiplier) || 1),
      holiday_multiplier: Math.max(1, parseFloat(bundleForm.holiday_multiplier) || 1),
      same_day_multiplier: Math.max(1, parseFloat(bundleForm.same_day_multiplier) || 1),
      cancellation_fee_percent: parseFloat(bundleForm.cancellation_fee_percent) || 0,
      cancellation_window_hours: parseFloat(bundleForm.cancellation_window_hours) || 24,
      rounding_direction: bundleForm.rounding_direction,
      rounding_interval_minutes: parseInt(bundleForm.rounding_interval_minutes) || 15,
      stack_premiums: bundleForm.stack_premiums,
      is_default: false,
    };

    if (editorTarget.rateId) {
      update.mutate({ id: editorTarget.rateId, ...payload }, {
        onSuccess: () => { setEditorOpen(false); toast.success("Bundle updated"); },
      });
    } else {
      create.mutate(payload, {
        onSuccess: () => { setEditorOpen(false); toast.success("Custom bundle created"); },
      });
    }
  };

  const handleRevertToDefault = (customerId: string) => {
    const existing = customerRateMap.get(customerId);
    if (existing) {
      update.mutate({ id: existing.id, customer_id: null, is_default: false }, {
        onSuccess: () => toast.success("Reverted to agency default"),
      });
    }
  };

  const Field = BillingField;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            Customer Billing Assignment
          </h1>
          <p className="text-sm text-muted-foreground">
            View and manage billing bundle assignments for all customers
          </p>
        </div>
        <div className="flex gap-2">
          {orphanRates.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setOrphanDialogOpen(true)}>
              <AlertTriangle className="h-4 w-4 mr-1 text-warning" />
              {orphanRates.length} Unlinked
            </Button>
          )}
        </div>
      </div>

      {!defaultRate && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          No agency default billing bundle configured. Go to{" "}
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => navigate("/billing-rates")}>
            Billing Rates
          </Button>{" "}
          to create one.
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <span className="text-xs text-muted-foreground ml-2">{filtered.length} of {customers.length} customers</span>
        {selectedCustomers.size > 0 && (
          <div className="flex items-center gap-2 ml-auto border rounded-lg px-3 py-1.5 bg-muted/50">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{selectedCustomers.size} selected</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!defaultRate) return;
                // Bulk revert: for each selected customer with a custom rate, revert to default
                selectedCustomers.forEach((custId) => {
                  const existing = customerRateMap.get(custId);
                  if (existing) {
                    update.mutate({ id: existing.id, customer_id: null, is_default: false });
                  }
                });
                setSelectedCustomers(new Set());
                toast.success(`Reverted ${selectedCustomers.size} customers to default`);
              }}
            >
              Revert to Default
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedCustomers(new Set())}>Clear</Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selectedCustomers.size === filtered.length && filtered.length > 0}
                    onCheckedChange={(checked) => {
                      if (checked) setSelectedCustomers(new Set(filtered.map((c: any) => c.id)));
                      else setSelectedCustomers(new Set());
                    }}
                  />
                </TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Billing Bundle</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="w-48 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No customers found</TableCell></TableRow>
              ) : filtered.map((c: any) => {
                const customRate = customerRateMap.get(c.id);
                const effectiveRate = customRate || defaultRate;
                const isCustom = !!customRate;

                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedCustomers.has(c.id)}
                        onCheckedChange={(checked) => {
                          const next = new Set(selectedCustomers);
                          if (checked) next.add(c.id); else next.delete(c.id);
                          setSelectedCustomers(next);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <button className="font-medium text-primary hover:underline text-left" onClick={() => navigate(`/customers/${c.id}`)}>
                        {c.name}
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.is_active !== false ? "default" : "secondary"} className="text-xs">
                        {c.is_active !== false ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{effectiveRate?.name ?? "None"}</TableCell>
                    <TableCell>
                      <Badge variant={isCustom ? "outline" : "secondary"} className={`text-xs ${isCustom ? "border-primary/50 text-primary" : ""}`}>
                        {isCustom ? "Custom" : "Standard"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {effectiveRate
                        ? effectiveRate.billing_model === "hourly"
                          ? `$${Number(effectiveRate.hourly_rate).toFixed(2)}/hr`
                          : `$${Number(effectiveRate.base_rate ?? 0).toFixed(2)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="outline" size="sm" onClick={() => openEditor(c.id, c.name, customRate)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          {isCustom ? "Edit" : "Customize"}
                        </Button>
                        {isCustom && (
                          <Button variant="ghost" size="sm" onClick={() => handleRevertToDefault(c.id)} title="Revert to agency default">
                            ↩
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

      {/* Inline Bundle Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editorTarget?.rateId ? "Edit" : "Create"} Bundle — {editorTarget?.customerName}</DialogTitle>
            <DialogDescription>
              {editorTarget?.rateId ? "Update this customer's billing bundle." : "Create a custom billing bundle for this customer."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Bundle Name">
              <Input value={bundleForm.name} onChange={(e) => setBundleForm({ ...bundleForm, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Billing Model">
                <Select value={bundleForm.billing_model} onValueChange={(v) => setBundleForm({ ...bundleForm, billing_model: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="per_appointment">Per Appointment</SelectItem>
                    <SelectItem value="flat">Flat</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Hourly Rate ($)">
                <Input type="number" step="0.01" value={bundleForm.hourly_rate} onChange={(e) => setBundleForm({ ...bundleForm, hourly_rate: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Min Hours">
                <Input type="number" step="0.5" value={bundleForm.minimum_hours} onChange={(e) => setBundleForm({ ...bundleForm, minimum_hours: e.target.value })} />
              </Field>
              <Field label="Rounding">
                <Select value={bundleForm.rounding_direction} onValueChange={(v) => setBundleForm({ ...bundleForm, rounding_direction: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="up">Up</SelectItem>
                    <SelectItem value="down">Down</SelectItem>
                    <SelectItem value="nearest">Nearest</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Round Interval (min)">
                <Input type="number" value={bundleForm.rounding_interval_minutes} onChange={(e) => setBundleForm({ ...bundleForm, rounding_interval_minutes: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="After-Hours Multiplier">
                <Input type="number" step="0.1" value={bundleForm.after_hours_multiplier} onChange={(e) => setBundleForm({ ...bundleForm, after_hours_multiplier: e.target.value })} />
              </Field>
              <Field label="Weekend Multiplier">
                <Input type="number" step="0.1" value={bundleForm.weekend_multiplier} onChange={(e) => setBundleForm({ ...bundleForm, weekend_multiplier: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Holiday Multiplier">
                <Input type="number" step="0.1" value={bundleForm.holiday_multiplier} onChange={(e) => setBundleForm({ ...bundleForm, holiday_multiplier: e.target.value })} />
              </Field>
              <Field label="Same-Day Multiplier">
                <Input type="number" step="0.1" value={bundleForm.same_day_multiplier} onChange={(e) => setBundleForm({ ...bundleForm, same_day_multiplier: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cancel Fee %">
                <Input type="number" value={bundleForm.cancellation_fee_percent} onChange={(e) => setBundleForm({ ...bundleForm, cancellation_fee_percent: e.target.value })} />
              </Field>
              <Field label="Cancel Window (hrs)">
                <Input type="number" value={bundleForm.cancellation_window_hours} onChange={(e) => setBundleForm({ ...bundleForm, cancellation_window_hours: e.target.value })} />
              </Field>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="stack-premiums"
                checked={bundleForm.stack_premiums}
                onChange={(e) => setBundleForm({ ...bundleForm, stack_premiums: e.target.checked })}
                className="rounded border-input"
              />
              <Label htmlFor="stack-premiums" className="text-sm">Stack all premiums (otherwise use highest only)</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveBundle} disabled={create.isPending || update.isPending}>
                {editorTarget?.rateId ? "Update Bundle" : "Create Bundle"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Orphan Bundles Dialog */}
      <Dialog open={orphanDialogOpen} onOpenChange={setOrphanDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Unlinked Billing Bundles
            </DialogTitle>
            <DialogDescription>
              These bundles are not linked to any customer and are not the agency default.
              They may be from import artifacts. Review and either delete or link them to a customer.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto space-y-2">
            {orphanRates.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between p-2 border rounded text-sm">
                <div>
                  <span className="font-medium">{r.name}</span>
                  <span className="text-muted-foreground ml-2">
                    ${Number(r.hourly_rate ?? r.base_rate ?? 0).toFixed(2)}
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate("/billing-rates")}>
                  <Eye className="h-3.5 w-3.5 mr-1" />Manage
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
