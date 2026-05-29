import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { useCustomers, useLocations, useLocationMutations } from "@/hooks/useAgencyData";
import { useCustomerRequestors, useCustomerRequestorMutations, CustomerRequestor } from "@/hooks/useCustomerRequestors";
import { useBillingRates, useBillingRateMutations } from "@/hooks/useBillingData";
import { useRegions } from "@/hooks/useRegionsData";
import { useAgencySettings } from "@/hooks/useAgencySettings";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Search, Pencil, Trash2, MapPin, Users, Eye, EyeOff, UserPlus, Shield, DollarSign, Copy, RotateCcw, Archive } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LocationFormData {
  name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip_code: string;
  phone: string;
  navigation_instructions: string;
  region_id: string;
}

const emptyLocationForm: LocationFormData = {
  name: "", address_line1: "", address_line2: "", city: "", state: "",
  zip_code: "", phone: "", navigation_instructions: "", region_id: "",
};

export default function CustomerDetail() {
  const { id: customerId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, hasRole } = useAuth();
  const { data: customers = [] } = useCustomers();
  const { data: locations = [], isLoading: locsLoading } = useLocations(customerId);
  const locationMutations = useLocationMutations();
  const { data: requestors = [], isLoading: reqLoading } = useCustomerRequestors(customerId);
  const requestorMutations = useCustomerRequestorMutations();
  const { data: billingRates = [] } = useBillingRates();
  const billingMutations = useBillingRateMutations();
  const { regionsEnabled } = useAgencySettings();
  const { data: regions = [] } = useRegions();

  const isAdmin = hasRole("agency_admin");
  const customer = customers.find((c: any) => c.id === customerId);

  // Billing: find currently-effective customer-specific rate and the standard/default rate
  const todayStr = new Date().toISOString().split("T")[0];
  const effectiveCustomerRates = billingRates.filter((r: any) => {
    if (r.customer_id !== customerId) return false;
    if (r.effective_start_date && r.effective_start_date > todayStr) return false;
    if (r.effective_end_date && r.effective_end_date < todayStr) return false;
    return true;
  });
  const customerRate = effectiveCustomerRates[0] ?? null;
  const standardRate = billingRates.find((r: any) => {
    if (r.customer_id) return false;
    if (r.effective_start_date && r.effective_start_date > todayStr) return false;
    if (r.effective_end_date && r.effective_end_date < todayStr) return false;
    return r.is_default;
  }) || billingRates.find((r: any) => !r.customer_id);
  const effectiveRate = customerRate || standardRate;
  const isCustomBundle = !!customerRate;

  // Location state
  const [locSearch, setLocSearch] = useState("");
  const [locOpen, setLocOpen] = useState(false);
  const [locEditId, setLocEditId] = useState<string | null>(null);
  const [locForm, setLocForm] = useState<LocationFormData>(emptyLocationForm);

  // Requestor state
  const [reqSearch, setReqSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", first_name: "", last_name: "" });
  const [editReqOpen, setEditReqOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<CustomerRequestor | null>(null);
  const [reqAccessAll, setReqAccessAll] = useState(false);
  const [reqLocationIds, setReqLocationIds] = useState<string[]>([]);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [removeReqTarget, setRemoveReqTarget] = useState<string | null>(null);

  const filteredLocs = useMemo(() => {
    if (!locSearch) return locations;
    const q = locSearch.toLowerCase();
    return locations.filter((l: any) =>
      l.name?.toLowerCase().includes(q) ||
      l.address_line1?.toLowerCase().includes(q) ||
      l.city?.toLowerCase().includes(q)
    );
  }, [locations, locSearch]);

  const filteredReqs = useMemo(() => {
    if (!reqSearch) return requestors;
    const q = reqSearch.toLowerCase();
    return requestors.filter((r) =>
      r.profile?.first_name?.toLowerCase().includes(q) ||
      r.profile?.last_name?.toLowerCase().includes(q) ||
      r.profile?.email?.toLowerCase().includes(q)
    );
  }, [requestors, reqSearch]);

  const setL = (k: keyof LocationFormData, v: string) => setLocForm((f) => ({ ...f, [k]: v }));

  const formatAddress = (l: any) => {
    const parts = [l.address_line1, l.city, l.state, l.zip_code].filter(Boolean);
    return parts.join(", ");
  };

  // -- Location handlers --
  const openAddLocation = () => { setLocEditId(null); setLocForm(emptyLocationForm); setLocOpen(true); };
  const openEditLocation = (loc: any) => {
    setLocEditId(loc.id);
    setLocForm({
      name: loc.name ?? "", address_line1: loc.address_line1 ?? "",
      address_line2: loc.address_line2 ?? "", city: loc.city ?? "",
      state: loc.state ?? "", zip_code: loc.zip_code ?? "",
      phone: loc.phone ?? "", navigation_instructions: loc.navigation_instructions ?? "",
      region_id: loc.region_id ?? "",
    });
    setLocOpen(true);
  };

  const handleLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { region_id, ...rest } = locForm;
    const payload = { ...rest, region_id: region_id || null };
    if (locEditId) {
      locationMutations.update.mutate({ id: locEditId, ...payload }, { onSuccess: () => setLocOpen(false) });
    } else {
      locationMutations.create.mutate({ customer_id: customerId!, ...payload }, { onSuccess: () => setLocOpen(false) });
    }
  };

  const [deleteLocTarget, setDeleteLocTarget] = useState<string | null>(null);
  const [resetBundleOpen, setResetBundleOpen] = useState(false);

  // Get impact data for location archive target
  const { data: locArchiveImpact } = useQuery({
    queryKey: ["location-archive-impact", deleteLocTarget],
    queryFn: async () => {
      if (!deleteLocTarget) return { appointments: 0 };
      const { count, error } = await supabase
        .from("appointments").select("id", { count: "exact", head: true })
        .eq("location_id", deleteLocTarget).eq("is_deleted", false)
        .in("status", ["requested", "requested_last_minute", "interpreter_assigned", "interpreter_assigned_last_minute", "interpreter_confirmed", "reassignment_needed", "in_progress"] as any[]);
      if (error) throw error;
      return { appointments: count ?? 0 };
    },
    enabled: !!deleteLocTarget,
  });

  const handleDeleteLocation = () => {
    if (deleteLocTarget) {
      locationMutations.remove.mutate(deleteLocTarget);
      setDeleteLocTarget(null);
    }
  };

  // -- Requestor handlers --
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.agency_id || !customerId) return;
    try {
      const { error } = await supabase.from("invitations").insert({
        agency_id: profile.agency_id,
        email: inviteForm.email,
        first_name: inviteForm.first_name || null,
        last_name: inviteForm.last_name || null,
        role: "requester" as any,
        invited_by: profile.id,
      });
      if (error) throw error;
      toast.success(`Invitation sent to ${inviteForm.email}`);
      setInviteOpen(false);
      setInviteForm({ email: "", first_name: "", last_name: "" });
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
  };

  const openEditRequestor = (req: CustomerRequestor) => {
    setEditingReq(req);
    setReqAccessAll(req.access_all_locations);
    setReqLocationIds(req.locations?.map((l) => l.location_id) ?? []);
    setEditReqOpen(true);
  };

  const handleSaveRequestorAccess = () => {
    if (!editingReq || !customerId) return;
    requestorMutations.upsertRequestor.mutate({
      customer_id: customerId,
      user_id: editingReq.user_id,
      access_all_locations: reqAccessAll,
      is_active: editingReq.is_active,
      location_ids: reqAccessAll ? [] : reqLocationIds,
    }, { onSuccess: () => setEditReqOpen(false) });
  };

  const toggleLocId = (id: string) => {
    setReqLocationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // -- Billing handlers --
  const handleCreateCustomBundle = () => {
    if (!standardRate) {
      toast.error("No standard rate to copy from. Create a default rate first in Billing Rates.");
      return;
    }
    // Copy standard rate values, set customer_id, and create directly
    const payload: any = {
      name: `${customer?.name ?? "Customer"} Custom Rate`,
      customer_id: customerId,
      billing_model: standardRate.billing_model,
      base_rate: standardRate.base_rate,
      hourly_rate: standardRate.hourly_rate,
      minimum_hours: standardRate.minimum_hours,
      minimum_charge: standardRate.minimum_charge,
      monthly_minimum: standardRate.monthly_minimum,
      travel_rate_per_mile: standardRate.travel_rate_per_mile,
      travel_time_rate: standardRate.travel_time_rate,
      after_hours_multiplier: standardRate.after_hours_multiplier,
      weekend_multiplier: standardRate.weekend_multiplier,
      overtime_multiplier: standardRate.overtime_multiplier,
      overtime_after_hours: standardRate.overtime_after_hours,
      cancellation_window_hours: standardRate.cancellation_window_hours,
      cancellation_fee_percent: standardRate.cancellation_fee_percent,
      is_default: false,
      tier_config: standardRate.tier_config ?? [],
      same_day_threshold_hours: standardRate.same_day_threshold_hours ?? 24,
      same_day_fee: standardRate.same_day_fee ?? 0,
      same_day_multiplier: standardRate.same_day_multiplier ?? 1,
      after_hours_start: standardRate.after_hours_start ?? "18:00",
      after_hours_end: standardRate.after_hours_end ?? "08:00",
      holiday_multiplier: standardRate.holiday_multiplier ?? 1,
    };
    billingMutations.create.mutate(payload, {
      onSuccess: () => toast.success(`Custom bundle created for ${customer?.name}. Edit it in Billing Rates or here.`),
    });
  };

  const handleResetToStandard = () => {
    if (!customerRate) return;
    billingMutations.remove.mutate(customerRate.id);
    setResetBundleOpen(false);
  };

  if (!customer) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/customers")}><ArrowLeft className="mr-2 h-4 w-4" />Back to Customers</Button>
        <p className="text-muted-foreground">Customer not found.</p>
      </div>
    );
  }

  const RateSummaryRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/customers")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{customer.name}</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
            {customer.contact_name && <span>Contact: {customer.contact_name}</span>}
            {customer.billing_email && <span>Billing: {customer.billing_email}</span>}
            {customer.contact_phone && <span>Phone: {customer.contact_phone}</span>}
          </div>
        </div>
        <Badge variant={customer.is_active !== false ? "default" : "secondary"}>
          {customer.is_active !== false ? "Active" : "Inactive"}
        </Badge>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="locations">
        <TabsList>
          <TabsTrigger value="locations" className="gap-1.5">
            <MapPin className="h-4 w-4" />Locations ({locations.length})
          </TabsTrigger>
          <TabsTrigger value="requestors" className="gap-1.5">
            <Users className="h-4 w-4" />Requestors ({requestors.length})
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="billing" className="gap-1.5">
              <DollarSign className="h-4 w-4" />Billing
            </TabsTrigger>
          )}
        </TabsList>

        {/* === LOCATIONS TAB === */}
        <TabsContent value="locations" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search locations..." value={locSearch} onChange={(e) => setLocSearch(e.target.value)} className="max-w-xs" />
            </div>
            <Button onClick={openAddLocation}><Plus className="mr-2 h-4 w-4" />Add Location</Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Instructions</TableHead>
                    {regionsEnabled && <TableHead>Region</TableHead>}
                    <TableHead>Status</TableHead>
                    <TableHead className="w-28 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {locsLoading ? (
                    <TableRow><TableCell colSpan={regionsEnabled ? 7 : 6} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm text-muted-foreground">Loading locations...</p>
                      </div>
                    </TableCell></TableRow>
                  ) : filteredLocs.length === 0 ? (
                    <TableRow><TableCell colSpan={regionsEnabled ? 7 : 6} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <MapPin className="h-10 w-10 text-muted-foreground/40" />
                        <p className="text-sm font-medium text-foreground">{locSearch ? "No locations match your search" : "No locations yet"}</p>
                        <p className="text-xs text-muted-foreground max-w-xs">
                          {locSearch ? "Try a different search term." : "Add locations where this customer's appointments take place."}
                        </p>
                        {!locSearch && <Button size="sm" className="mt-2" onClick={openAddLocation}><Plus className="mr-1 h-3.5 w-3.5" />Add First Location</Button>}
                      </div>
                    </TableCell></TableRow>
                  ) : filteredLocs.map((l: any) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatAddress(l)}</TableCell>
                      <TableCell className="text-sm">{l.phone}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{l.navigation_instructions}</TableCell>
                      {regionsEnabled && (
                        <TableCell className="text-sm">
                          {regions.find((r: any) => r.id === l.region_id)?.name ?? "—"}
                        </TableCell>
                      )}
                      <TableCell>
                        <Switch
                          checked={l.is_active !== false}
                          onCheckedChange={(checked) => locationMutations.toggleActive.mutate({ id: l.id, is_active: checked })}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditLocation(l)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteLocTarget(l.id)}>
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === REQUESTORS TAB === */}
        <TabsContent value="requestors" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search requestors..." value={reqSearch} onChange={(e) => setReqSearch(e.target.value)} className="max-w-xs" />
            </div>
            <Button onClick={() => setInviteOpen(true)}><UserPlus className="mr-2 h-4 w-4" />Invite Requestor</Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email / Username</TableHead>
                    <TableHead>Password</TableHead>
                    <TableHead>Location Access</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reqLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm text-muted-foreground">Loading requestors...</p>
                      </div>
                    </TableCell></TableRow>
                  ) : filteredReqs.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="h-10 w-10 text-muted-foreground/40" />
                        <p className="text-sm font-medium text-foreground">{reqSearch ? "No requestors match your search" : "No requestors linked yet"}</p>
                        <p className="text-xs text-muted-foreground max-w-xs">
                          {reqSearch ? "Try a different search term." : "Invite requestors so they can submit interpreter requests for this customer."}
                        </p>
                        {!reqSearch && <Button size="sm" className="mt-2" onClick={() => setInviteOpen(true)}><UserPlus className="mr-1 h-3.5 w-3.5" />Invite First Requestor</Button>}
                      </div>
                    </TableCell></TableRow>
                  ) : filteredReqs.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">
                        {req.profile?.first_name} {req.profile?.last_name}
                      </TableCell>
                      <TableCell className="text-sm">{req.profile?.email}</TableCell>
                      <TableCell className="text-sm font-mono">
                        <span className="flex items-center gap-1">
                          {showPasswords[req.id] ? "••••••••" : "••••••••"}
                          <Button
                            variant="ghost" size="icon" className="h-6 w-6"
                            onClick={() => setShowPasswords((p) => ({ ...p, [req.id]: !p[req.id] }))}
                          >
                            {showPasswords[req.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </Button>
                        </span>
                      </TableCell>
                      <TableCell>
                        {req.access_all_locations ? (
                          <Badge variant="outline" className="gap-1"><Shield className="h-3 w-3" />All Locations</Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {req.locations?.length ?? 0} location(s)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={req.is_active}
                          onCheckedChange={(checked) => requestorMutations.toggleActive.mutate({ id: req.id, is_active: checked })}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditRequestor(req)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                            onClick={() => setRemoveReqTarget(req.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === BILLING TAB === */}
        {isAdmin && (
          <TabsContent value="billing" className="space-y-4">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Billing Bundle</h3>
                    <p className="text-sm text-muted-foreground">
                      {isCustomBundle
                        ? `This customer uses a custom bundle: "${customerRate.name}"`
                        : "This customer uses the agency standard bundle"}
                    </p>
                  </div>
                  <Badge variant={isCustomBundle ? "outline" : "secondary"} className={isCustomBundle ? "border-primary/50 text-primary" : ""}>
                    {isCustomBundle ? "Custom" : "Standard"}
                  </Badge>
                </div>

                {effectiveRate && (
                  <div className="border rounded-lg p-4 space-y-1">
                    <p className="text-sm font-medium mb-2">{effectiveRate.name}</p>
                    <RateSummaryRow label="Billing Model" value={effectiveRate.billing_model === "hourly" ? "Hourly" : effectiveRate.billing_model} />
                    {effectiveRate.billing_model === "hourly" && (
                      <RateSummaryRow label="Hourly Rate" value={`$${Number(effectiveRate.hourly_rate).toFixed(2)}/hr`} />
                    )}
                    {effectiveRate.billing_model !== "hourly" && (
                      <RateSummaryRow label="Base Rate" value={`$${Number(effectiveRate.base_rate ?? 0).toFixed(2)}`} />
                    )}
                    <RateSummaryRow label="Minimum Hours" value={`${effectiveRate.minimum_hours} hr`} />
                    <RateSummaryRow label="After-Hours Window" value={`${(effectiveRate.after_hours_start ?? "18:00").substring(0, 5)} – ${(effectiveRate.after_hours_end ?? "08:00").substring(0, 5)}`} />
                    <RateSummaryRow label="After-Hours Multiplier" value={`${effectiveRate.after_hours_multiplier}x`} />
                    <RateSummaryRow label="Weekend Multiplier" value={`${effectiveRate.weekend_multiplier}x`} />
                    <RateSummaryRow label="Holiday Multiplier" value={`${effectiveRate.holiday_multiplier ?? 1}x`} />
                    <RateSummaryRow label="Same-Day Threshold" value={`${effectiveRate.same_day_threshold_hours ?? 24} hrs`} />
                    {(effectiveRate.same_day_fee ?? 0) > 0 && (
                      <RateSummaryRow label="Same-Day Fee" value={`$${Number(effectiveRate.same_day_fee).toFixed(2)}`} />
                    )}
                    {(effectiveRate.same_day_multiplier ?? 1) > 1 && (
                      <RateSummaryRow label="Same-Day Multiplier" value={`${effectiveRate.same_day_multiplier}x`} />
                    )}
                    <RateSummaryRow label="Cancellation Window" value={`${effectiveRate.cancellation_window_hours} hrs`} />
                    <RateSummaryRow label="Cancellation Fee" value={`${effectiveRate.cancellation_fee_percent}%`} />
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  {!isCustomBundle && (
                    <Button size="sm" onClick={handleCreateCustomBundle}>
                      <Copy className="mr-1.5 h-4 w-4" />Create Custom Bundle
                    </Button>
                  )}
                  {isCustomBundle && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => navigate("/billing-rates")}>
                        <Pencil className="mr-1.5 h-4 w-4" />Edit Bundle
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => setResetBundleOpen(true)}>
                        <RotateCcw className="mr-1.5 h-4 w-4" />Reset to Standard
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* === Location Form Dialog === */}
      <Dialog open={locOpen} onOpenChange={setLocOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{locEditId ? "Edit Location" : "Add Location"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleLocationSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Location Name *</Label>
              <Input value={locForm.name} onChange={(e) => setL("name", e.target.value)} required placeholder="e.g. Main Office, Room 214" />
            </div>
            <div className="space-y-2">
              <Label>Address Line 1</Label>
              <Input value={locForm.address_line1} onChange={(e) => setL("address_line1", e.target.value)} placeholder="Street address" />
            </div>
            <div className="space-y-2">
              <Label>Address Line 2</Label>
              <Input value={locForm.address_line2} onChange={(e) => setL("address_line2", e.target.value)} placeholder="Suite, unit, etc." />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>City</Label><Input value={locForm.city} onChange={(e) => setL("city", e.target.value)} /></div>
              <div className="space-y-2"><Label>State</Label><Input value={locForm.state} onChange={(e) => setL("state", e.target.value)} /></div>
              <div className="space-y-2"><Label>Zip</Label><Input value={locForm.zip_code} onChange={(e) => setL("zip_code", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Phone</Label><Input value={locForm.phone} onChange={(e) => setL("phone", e.target.value)} /></div>
              <div className="space-y-2"><Label>Navigation Instructions</Label><Input value={locForm.navigation_instructions} onChange={(e) => setL("navigation_instructions", e.target.value)} /></div>
            </div>
            {regionsEnabled && (
              <div className="space-y-2">
                <Label>Region</Label>
                <Select value={locForm.region_id || "__none__"} onValueChange={(v) => setL("region_id", v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select region (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {regions.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLocOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={locationMutations.create.isPending || locationMutations.update.isPending}>
                {locEditId ? "Update" : "Add Location"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* === Invite Requestor Dialog === */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Requestor</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="space-y-2">
              <Label>Email Address *</Label>
              <Input type="email" required value={inviteForm.email} onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))} placeholder="user@example.com" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input value={inviteForm.first_name} onChange={(e) => setInviteForm((f) => ({ ...f, first_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input value={inviteForm.last_name} onChange={(e) => setInviteForm((f) => ({ ...f, last_name: e.target.value }))} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">An invitation email will be sent. The requestor will set their own password upon signup.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button type="submit">Send Invite</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* === Edit Requestor Access Dialog === */}
      <Dialog open={editReqOpen} onOpenChange={setEditReqOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Location Access</DialogTitle>
          </DialogHeader>
          {editingReq && (
            <div className="space-y-4">
              <div>
                <p className="font-medium">{editingReq.profile?.first_name} {editingReq.profile?.last_name}</p>
                <p className="text-sm text-muted-foreground">{editingReq.profile?.email}</p>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
                <Switch checked={reqAccessAll} onCheckedChange={setReqAccessAll} id="access-all" />
                <div>
                  <Label htmlFor="access-all" className="cursor-pointer font-medium">Access to All Locations</Label>
                  <p className="text-xs text-muted-foreground">Acts as a customer-level admin</p>
                </div>
              </div>

              {!reqAccessAll && (
                <div className="space-y-2">
                  <Label>Assign Specific Locations</Label>
                  <div className="max-h-48 overflow-y-auto space-y-1 border rounded-md p-2">
                    {locations.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2 text-center">No locations for this customer</p>
                    ) : locations.map((loc: any) => (
                      <label key={loc.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-accent/50 cursor-pointer">
                        <Checkbox
                          checked={reqLocationIds.includes(loc.id)}
                          onCheckedChange={() => toggleLocId(loc.id)}
                        />
                        <span className="text-sm">{loc.name}</span>
                        {loc.address_line1 && (
                          <span className="text-xs text-muted-foreground ml-auto truncate max-w-[150px]">
                            {loc.address_line1}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditReqOpen(false)}>Cancel</Button>
                <Button onClick={handleSaveRequestorAccess} disabled={requestorMutations.upsertRequestor.isPending}>
                  Save Access
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Archive Location Confirmation */}
      <AlertDialog open={!!deleteLocTarget} onOpenChange={(open) => !open && setDeleteLocTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Location</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive this location and remove it from active lists.
              Historical appointments referencing this location will be preserved.
              {locArchiveImpact && locArchiveImpact.appointments > 0 && (
                <span className="block mt-2 font-medium text-destructive">
                  ⚠️ This location has {locArchiveImpact.appointments} active appointment{locArchiveImpact.appointments !== 1 ? "s" : ""}.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteLocation} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Archive Location
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Bundle Confirmation */}
      <AlertDialog open={resetBundleOpen} onOpenChange={setResetBundleOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to Standard Bundle</AlertDialogTitle>
            <AlertDialogDescription>
              Remove custom bundle "{customerRate?.name}" for {customer?.name}? This customer will use the standard bundle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetToStandard} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Requestor Confirmation */}
      <AlertDialog open={!!removeReqTarget} onOpenChange={(open) => !open && setRemoveReqTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Requestor</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this requestor's link to this customer. They will no longer be able to submit requests for this organization.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (removeReqTarget) { requestorMutations.remove.mutate(removeReqTarget); setRemoveReqTarget(null); } }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
