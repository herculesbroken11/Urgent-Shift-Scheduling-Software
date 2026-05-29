import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { usePlatformAgencyDetail, usePlatformAction } from "@/hooks/usePlatformData";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Calendar, Users, Building2, Headphones, DollarSign, Save, CheckCircle2, Plus, History, AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function PlatformAgencyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, isLoading } = usePlatformAgencyDetail(id || "");
  const action = usePlatformAction();
  const [supportDialogOpen, setSupportDialogOpen] = useState(false);
  const [supportReason, setSupportReason] = useState("");
  const activeTab = searchParams.get("tab") || "settings";
  const activeFilter = searchParams.get("filter") || "";

  // Appointments tab state
  const [appointments, setAppointments] = useState<any[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsLoaded, setAppointmentsLoaded] = useState<string | null>(null);

  // Customers tab state
  const [customers, setCustomers] = useState<any[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersLoaded, setCustomersLoaded] = useState(false);

  // Billing config state
  const [billingConfig, setBillingConfig] = useState<any>(null);
  const [billingLoaded, setBillingLoaded] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [usageSummary, setUsageSummary] = useState<any>(null);
  const [allConfigs, setAllConfigs] = useState<any[]>([]);
  const [showNewVersion, setShowNewVersion] = useState(false);

  const defaultBillingConfig = {
    billing_model: "per_appointment",
    per_appointment_fee: 0.50,
    monthly_base_fee: 100,
    included_appointments: 0,
    overage_rate: 0,
    usage_billing_trigger: "completed",
    plan_name: "",
    setup_fee: 100,
    min_monthly_fee: 100,
    max_monthly_fee: 0,
    notes: "",
    is_active: true,
    effective_start_date: new Date().toISOString().slice(0, 10),
    effective_end_date: "",
  };

  const loadBillingConfig = useCallback(async () => {
    if (!id) return;
    setBillingError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      // Parallel fetch: current config + usage + all versions
      const [configRes, usageRes, listRes] = await Promise.all([
        supabase.functions.invoke("platform-admin", {
          body: { action: "billing_config.get", agency_id: id },
        }),
        supabase.functions.invoke("platform-admin", {
          body: { action: "platform_usage.summary", agency_id: id },
        }),
        supabase.functions.invoke("platform-admin", {
          body: { action: "billing_config.list", agency_id: id },
        }),
      ]);

      clearTimeout(timeout);

      setBillingConfig(configRes.data?.config || { ...defaultBillingConfig });
      setUsageSummary(usageRes.data);
      setAllConfigs(listRes.data?.configs || []);
      setBillingLoaded(true);
    } catch (err: any) {
      clearTimeout(timeout);
      setBillingError(err.name === "AbortError" ? "Request timed out. Please try again." : (err.message || "Failed to load billing config"));
      setBillingConfig({ ...defaultBillingConfig });
      setBillingLoaded(true);
    }
  }, [id]);

  const loadAppointments = useCallback(async (filter?: string) => {
    if (!id) return;
    setAppointmentsLoading(true);
    try {
      const { data: result } = await supabase.functions.invoke("platform-admin", {
        body: { action: "agency.appointments", agency_id: id, filter: filter || null },
      });
      setAppointments(result?.appointments || []);
      setAppointmentsLoaded(filter || "all");
    } catch {
      setAppointments([]);
    } finally {
      setAppointmentsLoading(false);
    }
  }, [id]);

  const loadCustomers = useCallback(async () => {
    if (!id) return;
    setCustomersLoading(true);
    try {
      const { data: result } = await supabase.functions.invoke("platform-admin", {
        body: { action: "agency.customers", agency_id: id },
      });
      setCustomers(result?.customers || []);
      setCustomersLoaded(true);
    } catch {
      setCustomers([]);
    } finally {
      setCustomersLoading(false);
    }
  }, [id]);

  // Auto-load tab data based on URL params
  useEffect(() => {
    if (activeTab === "appointments" && appointmentsLoaded !== (activeFilter || "all")) {
      loadAppointments(activeFilter || undefined);
    }
    if (activeTab === "customers" && !customersLoaded) {
      loadCustomers();
    }
    if (activeTab === "billing" && !billingLoaded) {
      loadBillingConfig();
    }
  }, [activeTab, activeFilter]);

  const setTab = (tab: string) => {
    const newParams: Record<string, string> = { tab };
    setSearchParams(newParams);
  };

  const [billingSaving, setBillingSaving] = useState(false);

  const saveBillingConfig = async () => {
    if (!id || !billingConfig) return;
    setBillingSaving(true);
    try {
      const payload: any = {
        action: "billing_config.upsert",
        agency_id: id,
        ...billingConfig,
        effective_end_date: billingConfig.effective_end_date || null,
      };
      if (billingConfig.id) payload.config_id = billingConfig.id;

      const { data: result } = await supabase.functions.invoke("platform-admin", { body: payload });
      if (result?.error) throw new Error(result.error);
      toast.success("Billing configuration saved successfully");
      await loadBillingConfig();
    } catch (err: any) {
      toast.error(err.message || "Failed to save billing configuration");
    } finally {
      setBillingSaving(false);
    }
  };

  const createNewVersion = () => {
    setShowNewVersion(false);
    setBillingConfig({
      ...defaultBillingConfig,
      ...billingConfig,
      id: undefined, // force insert
      effective_start_date: new Date().toISOString().slice(0, 10),
      effective_end_date: "",
    });
  };

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const { agency, users, stats, support_sessions } = data;
  if (!agency) return <p className="text-muted-foreground">Agency not found</p>;

  const handleUpdateField = (field: string, value: any) => {
    action.mutate({ action: 'agency.update', agency_id: id, [field]: value });
  };

  const startSupportSession = () => {
    if (!supportReason.trim()) return;
    action.mutate({ action: 'support.start', agency_id: id, reason: supportReason });
    setSupportDialogOpen(false);
    setSupportReason("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/platform/agencies")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{agency.name}</h1>
          <p className="text-sm text-muted-foreground">{agency.slug} · {agency.timezone}</p>
        </div>
        <Badge variant="secondary" className="ml-auto capitalize">{agency.agency_status.replace('_', ' ')}</Badge>
      </div>

      {/* Pending approval banner */}
      {agency.agency_status === "pending_approval" && (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30">
          <CardContent className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                This agency is pending approval.
              </span>
            </div>
            <Button
              size="sm"
              onClick={() => {
                action.mutate({ action: 'agency.update', agency_id: id, agency_status: 'active' });
              }}
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Approve Agency
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Total Appts", value: stats?.total_appointments || 0, icon: Calendar, tab: "appointments" },
          { label: "This Month", value: stats?.this_month || 0, icon: Calendar, tab: "appointments", filter: "this_month" },
          { label: "Completed", value: stats?.completed || 0, icon: Calendar, tab: "appointments", filter: "completed" },
          { label: "Customers", value: stats?.customers || 0, icon: Building2, tab: "customers" },
          { label: "Interpreters", value: stats?.interpreters || 0, icon: Users, tab: "users" },
        ].map((s) => (
          <Card key={s.label} className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => {
              const params: Record<string, string> = { tab: s.tab };
              if (s.filter) params.filter = s.filter;
              setSearchParams(params);
            }}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-xl font-bold text-foreground">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="appointments">
            <Calendar className="h-3.5 w-3.5 mr-1" /> Appointments
          </TabsTrigger>
          <TabsTrigger value="customers">
            <Building2 className="h-3.5 w-3.5 mr-1" /> Customers
          </TabsTrigger>
          <TabsTrigger value="billing">
            <DollarSign className="h-3.5 w-3.5 mr-1" /> Platform Billing
          </TabsTrigger>
          <TabsTrigger value="users">Users ({(users as any[])?.length || 0})</TabsTrigger>
          <TabsTrigger value="support">Support Sessions</TabsTrigger>
        </TabsList>

        {/* Settings tab */}
        <TabsContent value="settings" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Agency Configuration</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground">Status</label>
                <Select value={agency.agency_status} onValueChange={(v) => handleUpdateField('agency_status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['active', 'pending_approval', 'trial', 'suspended', 'cancelled', 'archived'].map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Plan Type</label>
                <Select value={agency.plan_type} onValueChange={(v) => handleUpdateField('plan_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['trial', 'standard', 'premium', 'enterprise', 'custom'].map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Billing Model</label>
                <Select value={agency.billing_model} onValueChange={(v) => handleUpdateField('billing_model', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['per_appointment', 'flat_monthly', 'tiered', 'custom'].map((s) => (
                      <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Payment Terms</label>
                <Select value={agency.payment_terms} onValueChange={(v) => handleUpdateField('payment_terms', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['due_on_receipt', 'net_15', 'net_30', 'net_45', 'net_60'].map((s) => (
                      <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Contract Start</label>
                <Input type="date" value={agency.contract_start_date || ""} onChange={(e) => handleUpdateField('contract_start_date', e.target.value || null)} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Contract End</label>
                <Input type="date" value={agency.contract_end_date || ""} onChange={(e) => handleUpdateField('contract_end_date', e.target.value || null)} />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-foreground">Platform Notes</label>
                <Textarea value={agency.platform_notes || ""} onChange={(e) => handleUpdateField('platform_notes', e.target.value)} placeholder="Internal notes about this agency..." rows={3} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appointments tab */}
        <TabsContent value="appointments" className="mt-4 space-y-4">
          {activeFilter && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="capitalize">
                {activeFilter === "this_month" ? "This Month" : activeFilter === "completed" ? "Completed" : activeFilter}
              </Badge>
              <Button variant="ghost" size="sm" onClick={() => setSearchParams({ tab: "appointments" })}>
                Clear filter
              </Button>
            </div>
          )}
          {appointmentsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Interpreter</TableHead>
                      <TableHead>Language</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appointments.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.title || a.patient_client_name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{a.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {a.scheduled_start ? format(new Date(a.scheduled_start), "MMM d, yyyy HH:mm") : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{a.customer?.name || "—"}</TableCell>
                        <TableCell className="text-sm">
                          {a.interpreter ? `${a.interpreter.first_name} ${a.interpreter.last_name}` : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{a.language?.name || "—"}</TableCell>
                      </TableRow>
                    ))}
                    {appointments.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                          No appointments found{activeFilter ? ` for filter "${activeFilter}"` : ""}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Customers tab */}
        <TabsContent value="customers" className="mt-4">
          {customersLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-sm">{c.contact_name || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.contact_email || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={c.is_active ? "default" : "secondary"}>
                            {c.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(c.created_at), "MMM d, yyyy")}
                        </TableCell>
                      </TableRow>
                    ))}
                    {customers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No customers found</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>


        <TabsContent value="billing" className="space-y-4 mt-4">
          {!billingLoaded ? (
            <div className="flex items-center justify-center h-32">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : billingError ? (
            <Card>
              <CardContent className="py-8 text-center space-y-3">
                <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
                <p className="text-sm text-destructive">{billingError}</p>
                <Button variant="outline" onClick={loadBillingConfig}>Retry</Button>
              </CardContent>
            </Card>
          ) : billingConfig ? (
            <>
              {/* Status banner */}
              <div className={`flex items-center gap-2 p-3 rounded-lg border ${billingConfig.is_active !== false ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950' : 'border-muted bg-muted/30'}`}>
                <CheckCircle2 className={`h-4 w-4 ${billingConfig.is_active !== false ? 'text-green-600' : 'text-muted-foreground'}`} />
                <span className="text-sm font-medium">
                  {billingConfig.id ? 'Billing configured' : 'New billing configuration'} — {billingConfig.is_active !== false ? 'Active' : 'Inactive'}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <Label htmlFor="billing-active" className="text-xs text-muted-foreground">Active</Label>
                  <Switch id="billing-active" checked={billingConfig.is_active !== false}
                    onCheckedChange={(v) => setBillingConfig({ ...billingConfig, is_active: v })} />
                </div>
              </div>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <DollarSign className="h-4 w-4" /> Platform Billing Configuration
                      </CardTitle>
                      <CardDescription>Define the commercial terms for this agency</CardDescription>
                    </div>
                    {billingConfig.id && (
                      <Button variant="outline" size="sm" onClick={createNewVersion}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> New Version
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Effective dates */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3">Effective Period</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Effective Start Date</Label>
                        <Input type="date" value={billingConfig.effective_start_date || ""}
                          onChange={(e) => setBillingConfig({ ...billingConfig, effective_start_date: e.target.value })} />
                      </div>
                      <div>
                        <Label>Effective End Date</Label>
                        <Input type="date" value={billingConfig.effective_end_date || ""}
                          onChange={(e) => setBillingConfig({ ...billingConfig, effective_end_date: e.target.value })} />
                        <p className="text-xs text-muted-foreground mt-1">Leave empty for ongoing / current terms</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Plan identity */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3">Plan Identity</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Plan Name</Label>
                        <Input value={billingConfig.plan_name || ""} placeholder="e.g. Standard, Enterprise, Custom"
                          onChange={(e) => setBillingConfig({ ...billingConfig, plan_name: e.target.value })} />
                      </div>
                      <div>
                        <Label>Billing Model</Label>
                        <Select value={billingConfig.billing_model || "per_appointment"}
                          onValueChange={(v) => setBillingConfig({ ...billingConfig, billing_model: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["per_appointment", "flat_monthly", "tiered", "custom"].map(m => (
                              <SelectItem key={m} value={m} className="capitalize">{m.replace(/_/g, " ")}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Fees & pricing */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3">Fees & Pricing</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label>One-Time Setup Fee ($)</Label>
                        <Input type="number" step="0.01" min="0"
                          value={billingConfig.setup_fee ?? 0}
                          onChange={(e) => setBillingConfig({ ...billingConfig, setup_fee: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <div>
                        <Label>Monthly Base Fee ($)</Label>
                        <Input type="number" step="0.01" min="0"
                          value={billingConfig.monthly_base_fee ?? 0}
                          onChange={(e) => setBillingConfig({ ...billingConfig, monthly_base_fee: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <div>
                        <Label>Per-Appointment Fee ($)</Label>
                        <Input type="number" step="0.01" min="0"
                          value={billingConfig.per_appointment_fee ?? 0}
                          onChange={(e) => setBillingConfig({ ...billingConfig, per_appointment_fee: parseFloat(e.target.value) || 0 })} />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Usage & overages */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3">Usage & Overages</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label>Usage Billing Trigger</Label>
                        <Select value={billingConfig.usage_billing_trigger || "completed"}
                          onValueChange={(v) => setBillingConfig({ ...billingConfig, usage_billing_trigger: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="booked">Booked (scheduled/confirmed/offered)</SelectItem>
                            <SelectItem value="completed">Completed (completed/validated/billed)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Included Appointments</Label>
                        <Input type="number" min="0"
                          value={billingConfig.included_appointments ?? 0}
                          onChange={(e) => setBillingConfig({ ...billingConfig, included_appointments: parseInt(e.target.value) || 0 })} />
                      </div>
                      <div>
                        <Label>Overage Rate ($)</Label>
                        <Input type="number" step="0.01" min="0"
                          value={billingConfig.overage_rate ?? 0}
                          onChange={(e) => setBillingConfig({ ...billingConfig, overage_rate: parseFloat(e.target.value) || 0 })} />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Caps & minimums */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3">Monthly Caps & Minimums</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Minimum Monthly Fee ($)</Label>
                        <Input type="number" step="0.01" min="0"
                          value={billingConfig.min_monthly_fee ?? 0}
                          onChange={(e) => setBillingConfig({ ...billingConfig, min_monthly_fee: parseFloat(e.target.value) || 0 })} />
                        <p className="text-xs text-muted-foreground mt-1">0 = no minimum</p>
                      </div>
                      <div>
                        <Label>Maximum Monthly Fee / Cap ($)</Label>
                        <Input type="number" step="0.01" min="0"
                          value={billingConfig.max_monthly_fee ?? 0}
                          onChange={(e) => setBillingConfig({ ...billingConfig, max_monthly_fee: parseFloat(e.target.value) || 0 })} />
                        <p className="text-xs text-muted-foreground mt-1">0 = no cap</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Contract & Payment — read-only summary */}
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-foreground">Contract & Payment Terms</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground italic">Managed in Settings</span>
                        <Button variant="outline" size="sm" onClick={() => {
                          const settingsTab = document.querySelector('[data-state][value="settings"]') as HTMLElement;
                          if (settingsTab) settingsTab.click();
                        }}>
                          Edit in Settings →
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">Contract Start</Label>
                        <p className="text-sm font-medium text-foreground mt-1">
                          {agency.contract_start_date ? format(new Date(agency.contract_start_date + 'T00:00:00'), 'MMM d, yyyy') : '—'}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Contract End</Label>
                        <p className="text-sm font-medium text-foreground mt-1">
                          {agency.contract_end_date ? format(new Date(agency.contract_end_date + 'T00:00:00'), 'MMM d, yyyy') : '—'}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Payment Terms</Label>
                        <p className="text-sm font-medium text-foreground mt-1 capitalize">
                          {(agency.payment_terms || 'due_on_receipt').replace(/_/g, ' ')}
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Notes */}
                  <div>
                    <Label>Notes / Special Deal Terms</Label>
                    <Textarea value={billingConfig.notes || ""} rows={3} placeholder="Any custom pricing agreements, discounts, or special terms..."
                      onChange={(e) => setBillingConfig({ ...billingConfig, notes: e.target.value })} />
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={saveBillingConfig} disabled={billingSaving} size="lg">
                      {billingSaving ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent mr-2" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" /> Save Billing Configuration
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Usage summary */}
              {usageSummary && (
                <Card>
                  <CardHeader><CardTitle className="text-lg">Current Month Usage Summary</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: "Trigger", value: usageSummary.trigger_type === "booked" ? "Booked" : "Completed" },
                        { label: "Usage Count", value: usageSummary.total_appointments },
                        { label: "Included", value: usageSummary.included_appointments },
                        { label: "Overage", value: usageSummary.overage_count },
                      ].map(s => (
                        <div key={s.label} className="text-center p-3 rounded-md bg-muted/50">
                          <p className="text-xs text-muted-foreground">{s.label}</p>
                          <p className="text-lg font-bold text-foreground">{s.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 p-4 rounded-md border border-border">
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Monthly Base Fee</span><span className="font-medium">${Number(usageSummary.monthly_base_fee || 0).toFixed(2)}</span></div>
                      <div className="flex justify-between text-sm mt-1"><span className="text-muted-foreground">Per-Appointment Fees</span><span className="font-medium">${Number(usageSummary.total_fees || 0).toFixed(2)}</span></div>
                      <div className="flex justify-between text-sm mt-1"><span className="text-muted-foreground">Overage Cost</span><span className="font-medium">${Number(usageSummary.overage_cost || 0).toFixed(2)}</span></div>
                      {usageSummary.min_applied && (
                        <div className="flex justify-between text-sm mt-1 text-amber-600"><span>↑ Minimum fee applied</span><span className="font-medium">${Number(usageSummary.min_monthly_fee || 0).toFixed(2)}</span></div>
                      )}
                      {usageSummary.cap_applied && (
                        <div className="flex justify-between text-sm mt-1 text-amber-600"><span>↓ Maximum cap applied</span><span className="font-medium">${Number(usageSummary.max_monthly_fee || 0).toFixed(2)}</span></div>
                      )}
                      <div className="flex justify-between text-sm mt-2 pt-2 border-t border-border font-bold"><span>Grand Total</span><span>${Number(usageSummary.grand_total || 0).toFixed(2)}</span></div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Version history */}
              {allConfigs.length > 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <History className="h-4 w-4" /> Billing Config Version History
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Plan</TableHead>
                          <TableHead>Effective From</TableHead>
                          <TableHead>Effective To</TableHead>
                          <TableHead>Base Fee</TableHead>
                          <TableHead>Per Appt</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allConfigs.map((c: any) => {
                          const isCurrent = c.id === billingConfig?.id;
                          return (
                            <TableRow key={c.id} className={isCurrent ? "bg-primary/5" : ""}>
                              <TableCell className="font-medium">{c.plan_name || "—"}</TableCell>
                              <TableCell className="text-sm">{c.effective_start_date ? format(new Date(c.effective_start_date + 'T00:00:00'), 'MMM d, yyyy') : '—'}</TableCell>
                              <TableCell className="text-sm">{c.effective_end_date ? format(new Date(c.effective_end_date + 'T00:00:00'), 'MMM d, yyyy') : 'Ongoing'}</TableCell>
                              <TableCell className="text-sm">${Number(c.monthly_base_fee || 0).toFixed(2)}</TableCell>
                              <TableCell className="text-sm">${Number(c.per_appointment_fee || 0).toFixed(2)}</TableCell>
                              <TableCell>
                                <Badge variant={c.is_active ? (isCurrent ? "default" : "secondary") : "outline"}>
                                  {isCurrent ? "Current" : c.is_active ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {!isCurrent && (
                                  <Button variant="ghost" size="sm" onClick={() => setBillingConfig(c)}>
                                    Edit
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </>
          ) : null}
        </TabsContent>

        {/* Users tab */}
        <TabsContent value="users" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(users as any[] || []).map((u: any) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.first_name} {u.last_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {(u.roles as string[] || []).map((r: string) => (
                            <Badge key={r} variant="outline" className="text-xs capitalize">{r.replace('_', ' ')}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.is_active ? "default" : "secondary"}>
                          {u.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(u.created_at), "MMM d, yyyy")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Support tab */}
        <TabsContent value="support" className="mt-4 space-y-4">
          <Button onClick={() => setSupportDialogOpen(true)}>
            <Headphones className="h-4 w-4 mr-2" /> Start Support Session
          </Button>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operator</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Ended</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(support_sessions as any[] || []).map((ss: any) => (
                    <TableRow key={ss.id}>
                      <TableCell className="font-medium">{ss.actor_name}</TableCell>
                      <TableCell>{ss.reason}</TableCell>
                      <TableCell className="text-xs">{format(new Date(ss.started_at), "MMM d, yyyy HH:mm")}</TableCell>
                      <TableCell className="text-xs">
                        {ss.ended_at ? format(new Date(ss.ended_at), "MMM d, yyyy HH:mm") : (
                          <Badge variant="default">Active</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!support_sessions || (support_sessions as any[]).length === 0) && (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No support sessions</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Dialog open={supportDialogOpen} onOpenChange={setSupportDialogOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Start Support Session</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Starting a support session for <strong>{agency.name}</strong>. All actions will be logged.
                </p>
                <Textarea value={supportReason} onChange={(e) => setSupportReason(e.target.value)}
                  placeholder="Reason for support session (required)..." rows={3} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSupportDialogOpen(false)}>Cancel</Button>
                <Button onClick={startSupportSession} disabled={!supportReason.trim()}>Start Session</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
