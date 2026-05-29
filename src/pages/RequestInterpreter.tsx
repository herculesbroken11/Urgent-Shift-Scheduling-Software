import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TimePicker } from "@/components/ui/time-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLanguages, useLocations, useLocationMutations, useCustomers } from "@/hooks/useAgencyData";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { useRequestorLocations } from "@/hooks/useCustomerRequestors";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Send, Plus, MapPin, CalendarIcon } from "lucide-react";
import { format, addMinutes, differenceInMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAppointmentMutations } from "@/hooks/useAgencyData";
import { useAgencyTimezone } from "@/hooks/useAgencyTimezone";
import { localToUtcIso } from "@/lib/agency-timezone";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { resolveRate, type BillingRateRecord } from "@/lib/billing-engine";
import { useBillingRates } from "@/hooks/useBillingData";

const MODALITIES = [
  { value: "on_site", label: "On-Site" },
  { value: "opi", label: "OPI (Phone)" },
  { value: "vri", label: "VRI (Video)" },
];

function combineDatetime(date: string, time: string): Date | null {
  if (!date || !time) return null;
  return new Date(`${date}T${time}`);
}

function formatDuration(mins: number): string {
  if (mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

function parseDuration(val: string): number | null {
  const colonMatch = val.match(/^(\d+):(\d{1,2})$/);
  if (colonMatch) return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2]);
  const num = parseFloat(val);
  if (!isNaN(num) && num > 0) return Math.round(num * 60);
  return null;
}

export default function RequestInterpreter() {
  const { profile, isDemoMode, hasRole } = useAuth();
  const navigate = useNavigate();
  const { data: languages = [] } = useLanguages();
  const { data: customers = [] } = useCustomers();
  const { create } = useAppointmentMutations();
  const locationMutations = useLocationMutations();
  const agencyTz = useAgencyTimezone();
  const { data: billingRates = [] } = useBillingRates();

  // Get the customer linked to this requestor
  const [customerRequestor, setCustomerRequestor] = useState<any>(null);
  const [customerRequestorLoading, setCustomerRequestorLoading] = useState(true);

  useEffect(() => {
    async function loadRequestorCustomer() {
      if (isDemoMode) {
        if (profile?.customer_id) {
          setCustomerRequestor({ customer_id: profile.customer_id, access_all_locations: true, is_active: true });
        }
        setCustomerRequestorLoading(false);
        return;
      }
      if (!profile?.id) {
        setCustomerRequestorLoading(false);
        return;
      }
      try {
        const { data } = await supabase
          .from("customer_requestors")
          .select("id, customer_id, access_all_locations, is_active, locations:requestor_locations(location_id)")
          .eq("user_id", profile.id)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        setCustomerRequestor(data);
      } catch (err) {
        console.error("Failed to load requestor customer:", err);
      }
      setCustomerRequestorLoading(false);
    }
    loadRequestorCustomer();
  }, [profile?.id, isDemoMode]);

  // Load locations based on access
  const { data: accessibleLocations } = useRequestorLocations(customerRequestor?.customer_id);
  const { data: allLocations = [] } = useLocations(customerRequestor?.customer_id);

  const availableLocations = useMemo(() => {
    if (accessibleLocations) return accessibleLocations;
    return allLocations;
  }, [accessibleLocations, allLocations]);

  const [searchParams] = useSearchParams();

  const [form, setForm] = useState(() => {
    const sd = searchParams.get("date") ?? "";
    const st = searchParams.get("start") ?? "";
    const ed = searchParams.get("end_date") ?? sd;
    const et = searchParams.get("end") ?? "";
    let duration = "";
    if (sd && st && ed && et) {
      const s = combineDatetime(sd, st);
      const e = combineDatetime(ed, et);
      if (s && e && e > s) duration = formatDuration(differenceInMinutes(e, s));
    }
    return {
      language_id: "",
      modality: "on_site",
      start_date: sd,
      start_time: st,
      end_date: ed,
      end_time: et,
      duration,
      description: "",
      requester_notes: "",
      client_name: "",
      client_dob: "",
      mrn: "",
      provider: "",
      location_id: "",
    };
  });

  // New location modal
  const [newLocOpen, setNewLocOpen] = useState(false);
  const [newLocForm, setNewLocForm] = useState({ name: "", address_line1: "", city: "", state: "", zip_code: "" });
  const [locPopoverOpen, setLocPopoverOpen] = useState(false);
  const [locSearch, setLocSearch] = useState("");
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const isRemote = form.modality === "opi" || form.modality === "vri";

  const selectedLocation = availableLocations.find((l: any) => l.id === form.location_id);

  const filteredLocations = useMemo(() => {
    if (!locSearch) return availableLocations;
    const q = locSearch.toLowerCase();
    return availableLocations.filter((l: any) =>
      l.name?.toLowerCase().includes(q) ||
      l.address_line1?.toLowerCase().includes(q) ||
      l.city?.toLowerCase().includes(q)
    );
  }, [availableLocations, locSearch]);

  const formatLocLabel = (l: any) => {
    const addr = [l.address_line1, l.city].filter(Boolean).join(", ");
    return addr ? `${l.name} - ${addr}` : l.name;
  };

  // --- Date/Time logic ---
  const calcDuration = useCallback((sd: string, st: string, ed: string, et: string) => {
    const s = combineDatetime(sd, st);
    const e = combineDatetime(ed, et);
    if (!s || !e) return "";
    const m = differenceInMinutes(e, s);
    return m > 0 ? formatDuration(m) : "";
  }, []);

  const calcEnd = useCallback((sd: string, st: string, mins: number) => {
    const s = combineDatetime(sd, st);
    if (!s) return { end_date: "", end_time: "" };
    const e = addMinutes(s, mins);
    return { end_date: format(e, "yyyy-MM-dd"), end_time: format(e, "HH:mm") };
  }, []);

  const onStartChange = (newDate: string, newTime: string) => {
    setForm((f) => {
      const sd = newDate, st = newTime;
      if (!sd || !st) return { ...f, start_date: sd, start_time: st };
      if (!f.end_time) {
        const s = combineDatetime(sd, st)!;
        const e = addMinutes(s, 60);
        return { ...f, start_date: sd, start_time: st, end_date: format(e, "yyyy-MM-dd"), end_time: format(e, "HH:mm"), duration: "1:00" };
      }
      let ed = f.end_date || sd;
      const s = combineDatetime(sd, st)!;
      let e = combineDatetime(ed, f.end_time);
      if (e && e <= s && ed === sd) {
        const next = addMinutes(s, 60);
        return { ...f, start_date: sd, start_time: st, end_date: format(next, "yyyy-MM-dd"), end_time: format(next, "HH:mm"), duration: "1:00" };
      }
      const dur = e && e > s ? formatDuration(differenceInMinutes(e, s)) : f.duration;
      return { ...f, start_date: sd, start_time: st, duration: dur };
    });
  };

  const onEndTimeChange = (et: string) => {
    setForm((f) => {
      if (!f.start_date || !f.start_time || !et) return { ...f, end_time: et };
      let ed = f.end_date || f.start_date;
      const s = combineDatetime(f.start_date, f.start_time)!;
      let e = combineDatetime(ed, et);
      if (e && e <= s && ed === f.start_date) {
        const nextDay = format(addMinutes(s, 24 * 60), "yyyy-MM-dd");
        ed = nextDay;
        e = combineDatetime(ed, et);
      }
      const dur = e && e > s ? formatDuration(differenceInMinutes(e, s)) : "";
      return { ...f, end_time: et, end_date: ed, duration: dur };
    });
  };

  const onEndDateChange = (ed: string) => {
    setForm((f) => {
      const dur = calcDuration(f.start_date, f.start_time, ed, f.end_time);
      return { ...f, end_date: ed, duration: dur };
    });
  };

  const onDurationChange = (val: string) => {
    setForm((f) => {
      const mins = parseDuration(val);
      if (mins && f.start_date && f.start_time) {
        const { end_date, end_time } = calcEnd(f.start_date, f.start_time, mins);
        return { ...f, duration: val, end_date, end_time };
      }
      return { ...f, duration: val };
    });
  };

  const handleAddNewLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerRequestor?.customer_id && !isDemoMode) {
      toast.error("Error: No customer linked");
      return;
    }
    try {
      const customerId = customerRequestor?.customer_id;
      if (isDemoMode || !customerId) {
        set("location_id", "");
        setNewLocOpen(false);
        return;
      }
      locationMutations.create.mutate(
        { customer_id: customerId, name: newLocForm.name, address_line1: newLocForm.address_line1 || null, city: newLocForm.city || null, state: newLocForm.state || null, zip_code: newLocForm.zip_code || null },
        {
          onSuccess: (data: any) => {
            set("location_id", data.id);
            setNewLocOpen(false);
            setNewLocForm({ name: "", address_line1: "", city: "", state: "", zip_code: "" });
            toast.success("Location added");
          },
        }
      );
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
  };

  const canSubmit = !!form.language_id && !!form.start_date && !!form.start_time && (isRemote || !!form.location_id) && !!form.client_dob && !!form.provider.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Determine if this is a last-minute request
    const utcStart = localToUtcIso(form.start_date, form.start_time, agencyTz);
    const utcEnd = localToUtcIso(form.end_date, form.end_time, agencyTz);

    let isLastMinute = false;
    if (utcStart) {
      const hoursUntilStart = (new Date(utcStart).getTime() - Date.now()) / 3_600_000;
      let threshold = 24; // default
      try {
        const rate = resolveRate(billingRates as BillingRateRecord[], customerRequestor?.customer_id || null);
        threshold = rate.same_day_threshold_hours ?? 24;
      } catch {
        // No rate found — use default 24h threshold
      }
      if (hoursUntilStart <= threshold) {
        isLastMinute = true;
      }
    }

    const input: any = {
      description: form.description || null,
      notes: form.requester_notes || null, // backward compat
      requester_notes: form.requester_notes || null,
      requester_id: profile?.id,
      status: (isLastMinute ? "requested_last_minute" : "requested") as any,
      modality: form.modality || "on_site",
      location_id: form.location_id || null,
      customer_id: customerRequestor?.customer_id || null,
      custom_fields: {
        client_name: form.client_name || null,
        client_dob: form.client_dob || null,
        mrn: form.mrn || null,
        provider: form.provider || null,
        ...(isLastMinute ? { is_last_minute: true } : {}),
      },
    };
    if (form.language_id) input.language_id = form.language_id;
    if (utcStart) input.scheduled_start = utcStart;
    if (utcEnd) input.scheduled_end = utcEnd;

    create.mutate(input, {
      onSuccess: () => navigate("/my-requests"),
    });
  };

  // Check if the requester's linked customer is inactive
  const linkedCustomer = customerRequestor?.customer_id
    ? customers.find((c: any) => c.id === customerRequestor.customer_id)
    : null;
  const customerInactive = linkedCustomer && linkedCustomer.is_active === false;

  if (customerInactive) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Request an Interpreter</h1>
          <p className="text-muted-foreground">Fill out the form below to submit your request</p>
        </div>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Organization Inactive</AlertTitle>
          <AlertDescription>
            Your organization ({linkedCustomer.name}) is currently inactive. You cannot submit new interpreter requests at this time.
            Please contact your administrator for assistance.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Request an Interpreter</h1>
        <p className="text-muted-foreground">Fill out the form below to submit your request</p>
      </div>

      <Card>
        <CardHeader>
          <CardDescription>Fields marked with * are required</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* === Appointment Details === */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Appointment Details</h3>
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Language Needed <span className="text-destructive">*</span></Label>
                  <Select value={form.language_id} onValueChange={(v) => set("language_id", v)} required>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select language" /></SelectTrigger>
                    <SelectContent>
                      {languages.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Modality <span className="text-destructive">*</span></Label>
                  <Select value={form.modality} onValueChange={(v) => set("modality", v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MODALITIES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Date <span className="text-destructive">*</span></Label>
                  <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("h-8 w-full justify-start text-left text-sm font-normal px-2", !form.start_date && "text-muted-foreground")}>
                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{form.start_date ? format(new Date(form.start_date + "T00:00"), "M/d/yyyy") : "Pick date"}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={form.start_date ? new Date(form.start_date + "T00:00") : undefined}
                        onSelect={(date) => {
                          if (date) {
                            onStartChange(format(date, "yyyy-MM-dd"), form.start_time);
                          }
                          setDatePopoverOpen(false);
                        }}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Start Time <span className="text-destructive">*</span></Label>
                  <TimePicker value={form.start_time} onChange={(v) => onStartChange(form.start_date, v)} required className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">End Time <span className="text-destructive">*</span></Label>
                  <TimePicker value={form.end_time} onChange={(v) => onEndTimeChange(v)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Duration</Label>
                  <Input className="h-8 text-sm" value={form.duration} onChange={(e) => onDurationChange(e.target.value)} placeholder="1:00" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description</Label>
                <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Additional details..." className="min-h-[60px]" />
              </div>
            </div>

            <Separator />

            {/* === Location === */}
            {!isRemote && (
              <>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Location <span className="text-destructive">*</span></h3>
                  <Popover open={locPopoverOpen} onOpenChange={setLocPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between h-9 text-sm font-normal">
                        {selectedLocation ? (
                          <span className="truncate">{formatLocLabel(selectedLocation)}</span>
                        ) : (
                          <span className="text-muted-foreground">Select a location...</span>
                        )}
                        <MapPin className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Search locations..."
                          value={locSearch}
                          onValueChange={setLocSearch}
                        />
                        <CommandList>
                          <CommandEmpty>No locations found.</CommandEmpty>
                          <CommandGroup>
                            {filteredLocations.map((loc: any) => (
                              <CommandItem
                                key={loc.id}
                                value={loc.id}
                                onSelect={() => {
                                  set("location_id", loc.id);
                                  setLocPopoverOpen(false);
                                  setLocSearch("");
                                }}
                              >
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium">{formatLocLabel(loc)}</span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                          <CommandGroup>
                            <CommandItem
                              onSelect={() => {
                                setLocPopoverOpen(false);
                                setNewLocOpen(true);
                              }}
                              className="text-primary"
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Add New Location
                            </CommandItem>
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <Separator />
              </>
            )}

            {/* === Client Information === */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Customer Information</h3>
              <div className="space-y-1">
                <Label>Patient/Client Name <span className="text-destructive">*</span></Label>
                <Input value={form.client_name} onChange={(e) => set("client_name", e.target.value)} placeholder="Full name of the patient/client" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Date of Birth <span className="text-destructive">*</span></Label>
                  <Input type="date" required value={form.client_dob} onChange={(e) => set("client_dob", e.target.value)} />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>Reference Number/MRN</Label>
                  <Input value={form.mrn} onChange={(e) => set("mrn", e.target.value)} placeholder="If applicable" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Provider <span className="text-destructive">*</span></Label>
                <Input required value={form.provider} onChange={(e) => set("provider", e.target.value)} placeholder="e.g. Dr. Smith, Attorney Johnson" />
              </div>

              {/* Requester Notes */}
              <div className="space-y-1">
                <Label>Notes for Interpreter & Agency</Label>
                <Textarea
                  value={form.requester_notes}
                  onChange={(e) => set("requester_notes", e.target.value)}
                  placeholder="Any special requirements or preferences..."
                  className="min-h-[60px]"
                />
                <p className="text-xs text-muted-foreground">Visible to the assigned interpreter and agency staff</p>
              </div>
            </div>

            {/* Submit */}
            {!isRemote && !form.location_id && form.language_id && form.start_date && form.start_time && (
              <p className="text-sm text-destructive">Please select a location for on-site appointments.</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate("/my-requests")}>Cancel</Button>
              <Button type="submit" disabled={!canSubmit || create.isPending}>
                <Send className="mr-2 h-4 w-4" /> Submit Request
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Add New Location Modal */}
      <Dialog open={newLocOpen} onOpenChange={setNewLocOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Location</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddNewLocation} className="space-y-4">
            <div className="space-y-2">
              <Label>Location Name *</Label>
              <Input required value={newLocForm.name} onChange={(e) => setNewLocForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Main Office, Home" />
            </div>
            <div className="space-y-2">
              <Label>Street Address</Label>
              <Input value={newLocForm.address_line1} onChange={(e) => setNewLocForm((f) => ({ ...f, address_line1: e.target.value }))} placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2"><Label>City</Label><Input value={newLocForm.city} onChange={(e) => setNewLocForm((f) => ({ ...f, city: e.target.value }))} /></div>
              <div className="space-y-2"><Label>State</Label><Input value={newLocForm.state} onChange={(e) => setNewLocForm((f) => ({ ...f, state: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Zip</Label><Input value={newLocForm.zip_code} onChange={(e) => setNewLocForm((f) => ({ ...f, zip_code: e.target.value }))} /></div>
            </div>
            <p className="text-xs text-muted-foreground">This location will be saved to your organization's permanent location list.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setNewLocOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={locationMutations.create.isPending}>Add Location</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}