import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAgencySettings } from "@/hooks/useAgencySettings";

import { WorkbookTemplateDownload } from "@/components/settings/WorkbookTemplateDownload";
import { ReminderSettings } from "@/components/settings/ReminderSettings";
import { BillingSetup } from "@/components/settings/BillingSetup";
import { InterpreterNotificationPrefs } from "@/components/settings/InterpreterNotificationPrefs";
import { QuickBooksConnectionCard } from "@/components/settings/QuickBooksConnectionCard";
import { JoinSettings } from "@/components/settings/JoinSettings";
import { JoinRequestsPanel } from "@/components/settings/JoinRequestsPanel";
import { DataIntegrityCheck } from "@/components/settings/DataIntegrityCheck";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, CalendarDays, Upload, UserPlus, Clock } from "lucide-react";
import { TimePicker } from "@/components/ui/time-picker";
import { DEFAULT_DISPATCH_HOURS, readDispatchHours } from "@/components/scheduleWizard/dispatch-utils";
import { InviteUserDialog } from "@/components/invitations/InviteUserDialog";
import { BulkInviteDialog } from "@/components/invitations/BulkInviteDialog";

function HolidayDatesEditor({ dates, onUpdate, isPending }: { dates: string[]; onUpdate: (d: string[]) => void; isPending: boolean }) {
  const [newDate, setNewDate] = useState("");
  const sorted = [...dates].sort();

  const addDate = () => {
    if (!newDate || dates.includes(newDate)) return;
    onUpdate([...dates, newDate]);
    setNewDate("");
  };

  const removeDate = (d: string) => onUpdate(dates.filter((x) => x !== d));

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />Agency Holiday Dates</Label>
      <p className="text-sm text-muted-foreground">
        Appointments on these dates may incur a holiday premium based on each billing bundle's holiday multiplier.
      </p>
      <div className="flex gap-2 items-center mt-2">
        <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-44" />
        <Button size="sm" variant="outline" onClick={addDate} disabled={isPending || !newDate}>
          <Plus className="h-3.5 w-3.5 mr-1" />Add
        </Button>
      </div>
      {sorted.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {sorted.map((d) => (
            <Badge key={d} variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              {new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              <button onClick={() => removeDate(d)} disabled={isPending} className="ml-0.5 rounded-full hover:bg-muted p-0.5">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      {sorted.length === 0 && <p className="text-xs text-muted-foreground">No holidays configured.</p>}
    </div>
  );
}

function DispatchHoursEditor({
  value,
  onUpdate,
  isPending,
}: {
  value: { start: string; end: string };
  onUpdate: (hours: { start: string; end: string }) => void;
  isPending: boolean;
}) {
  const [start, setStart] = useState(value.start);
  const [end, setEnd] = useState(value.end);

  const dirty = start !== value.start || end !== value.end;
  const valid = /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end) && start < end;

  const reset = () => {
    setStart(DEFAULT_DISPATCH_HOURS.start);
    setEnd(DEFAULT_DISPATCH_HOURS.end);
    onUpdate(DEFAULT_DISPATCH_HOURS);
  };

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <Clock className="h-4 w-4" />
        Dispatch Board Hours
      </Label>
      <p className="text-sm text-muted-foreground">
        Time window shown on the Schedule Wizard timeline grid. Appointments outside this range are still bookable but won't appear on the dispatch board view.
      </p>
      <div className="flex flex-wrap items-end gap-3 mt-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Start</Label>
          <div className="w-36">
            <TimePicker value={start} onChange={setStart} interval={30} disabled={isPending} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">End</Label>
          <div className="w-36">
            <TimePicker value={end} onChange={setEnd} interval={30} disabled={isPending} />
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => onUpdate({ start, end })}
          disabled={isPending || !dirty || !valid}
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={reset} disabled={isPending}>
          Reset to 8 AM – 6 PM
        </Button>
      </div>
      {!valid && (
        <p className="text-xs text-destructive">End time must be after start time.</p>
      )}
    </div>
  );
}



const COMMON_TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Anchorage", "Pacific/Honolulu", "America/Phoenix",
  "UTC", "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney",
];

export default function Settings() {
  const { profile, refreshProfile, isDemoMode, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState(profile?.first_name ?? "");
  const [lastName, setLastName] = useState(profile?.last_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const isAdmin = hasRole("agency_admin");
  const { settings, regionsEnabled, billingPeriodicity, updateSettings } = useAgencySettings();

  // Fetch agency timezone
  const { data: agencyData } = useQuery({
    queryKey: ["agency-timezone"],
    queryFn: async () => {
      if (!profile?.agency_id) return null;
      const { data } = await supabase
        .from("agencies")
        .select("timezone")
        .eq("id", profile.agency_id)
        .single();
      return data;
    },
    enabled: isAdmin && !!profile?.agency_id,
  });

  const updateTimezone = useMutation({
    mutationFn: async (tz: string) => {
      const { error } = await supabase
        .from("agencies")
        .update({ timezone: tz } as any)
        .eq("id", profile!.agency_id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agency timezone updated");
      queryClient.invalidateQueries({ queryKey: ["agency-timezone"] });
    },
    onError: () => toast.error("Failed to update timezone"),
  });

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    if (isDemoMode) {
      setSaving(false);
      toast.success("Profile updated (demo)");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ first_name: firstName, last_name: lastName, phone })
      .eq("id", profile.id);
    setSaving(false);
    if (error) {
      toast.error("Failed to save profile");
    } else {
      toast.success("Profile updated");
      await refreshProfile();
    }
  };

  const handlePasswordUpdate = async () => {
    if (!profile?.email) return;

    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      toast.error("New passwords do not match");
      return;
    }

    setUpdatingPassword(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: currentPassword,
    });

    if (signInError) {
      setUpdatingPassword(false);
      toast.error("Current password is incorrect");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setUpdatingPassword(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    toast.success("Password updated");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your profile and preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your personal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={profile?.email ?? ""} disabled className="bg-muted" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" />
          </div>
          <Separator />
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Change your account password securely.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input id="currentPassword" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">New password</Label>
            <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmNewPassword">Confirm new password</Label>
            <Input id="confirmNewPassword" type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <Separator />
          <Button onClick={handlePasswordUpdate} disabled={updatingPassword}>
            {updatingPassword ? "Updating..." : "Update Password"}
          </Button>
        </CardContent>
      </Card>

      {isAdmin && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Agency Settings</CardTitle>
              <CardDescription>Configure agency-wide features</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label>Enable Regions</Label>
                  <p className="text-sm text-muted-foreground">
                    Tag interpreters and locations with geographic regions to filter the Available Jobs board.
                  </p>
                </div>
                <Switch
                  checked={regionsEnabled}
                  onCheckedChange={(checked) => updateSettings.mutate({ regions_enabled: checked })}
                  disabled={updateSettings.isPending}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label>Enable Self-Claim</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow interpreters to claim open appointments from the Available Jobs board.
                    When disabled, all assignments are made by agency staff.
                  </p>
                </div>
                <Switch
                  checked={settings.enable_self_claim !== false}
                  onCheckedChange={(checked) => updateSettings.mutate({ enable_self_claim: checked })}
                  disabled={updateSettings.isPending}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Agency Timezone</Label>
                <p className="text-sm text-muted-foreground">
                  Default timezone for appointments and calendar sync across your agency.
                </p>
                <Select
                  value={(agencyData as any)?.timezone || "America/New_York"}
                  onValueChange={(value) => updateTimezone.mutate(value)}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Billing Periodicity</Label>
                <p className="text-sm text-muted-foreground">
                  Default billing cycle used when generating batch invoices.
                </p>
                <div className="mt-1 flex gap-2">
                  {(["weekly", "biweekly", "monthly"] as const).map((period) => (
                    <Button
                      key={period}
                      variant={billingPeriodicity === period ? "default" : "outline"}
                      size="sm"
                      className="capitalize"
                      onClick={() => updateSettings.mutate({ billing_periodicity: period })}
                      disabled={updateSettings.isPending}
                    >
                      {period}
                    </Button>
                  ))}
                </div>
              </div>

              <Separator />

              <HolidayDatesEditor
                dates={(settings.holiday_dates as string[]) ?? []}
                onUpdate={(dates) => updateSettings.mutate({ holiday_dates: dates })}
                isPending={updateSettings.isPending}
              />

              <Separator />

              <DispatchHoursEditor
                value={readDispatchHours(settings)}
                onUpdate={(hours) => updateSettings.mutate({ dispatch_hours: hours })}
                isPending={updateSettings.isPending}
              />
            </CardContent>
          </Card>

          <BillingSetup />
          <QuickBooksConnectionCard />
          <WorkbookTemplateDownload />
          <ReminderSettings />
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                User Management
              </CardTitle>
              <CardDescription>
                Invite or bulk-onboard interpreters, schedulers, and requesters
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <InviteUserDialog
                  onSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: ["agency-invitations"] });
                  }}
                />
                <BulkInviteDialog
                  onSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: ["agency-invitations"] });
                  }}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Use <strong>Invite User</strong> to add a single team member, or <strong>Bulk Invite</strong> to upload a CSV
                with columns: first_name, last_name, email, phone (and optional role column).
                Supports interpreter, scheduler, and requester roles.
              </p>
            </CardContent>
          </Card>

          <JoinSettings />
          <JoinRequestsPanel />
          <DataIntegrityCheck />
        </>
      )}

      {hasRole("interpreter") && (
        <InterpreterNotificationPrefs />
      )}
    </div>
  );
}
