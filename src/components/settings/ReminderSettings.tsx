import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useAgencySettings } from "@/hooks/useAgencySettings";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Mail, MessageSquare } from "lucide-react";

export function ReminderSettings() {
  const { settings, updateSettings } = useAgencySettings();

  const reminder = {
    enable_email_reminders: true,
    enable_sms_reminders: true,
    reminder_24h_enabled: true,
    reminder_2h_enabled: true,
    reminder_15m_enabled: false,
    default_reminder_channels: "both",
    ...(settings.reminder_settings as any || {}),
  };

  const update = (patch: Record<string, any>) => {
    updateSettings.mutate({
      reminder_settings: { ...reminder, ...patch },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Appointment Reminders
        </CardTitle>
        <CardDescription>
          Configure automated reminder notifications sent to interpreters before assignments.
          Individual interpreters can override these defaults in their profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Channels */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-foreground">Delivery Channels</h4>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label>Email Reminders</Label>
                <p className="text-xs text-muted-foreground">Send reminders via email</p>
              </div>
            </div>
            <Switch
              checked={reminder.enable_email_reminders}
              onCheckedChange={(v) => update({ enable_email_reminders: v })}
              disabled={updateSettings.isPending}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label>SMS Reminders</Label>
                <p className="text-xs text-muted-foreground">Send reminders via SMS</p>
              </div>
            </div>
            <Switch
              checked={reminder.enable_sms_reminders}
              onCheckedChange={(v) => update({ enable_sms_reminders: v })}
              disabled={updateSettings.isPending}
            />
          </div>
          <div className="space-y-2">
            <Label>Default Channel Preference</Label>
            <Select
              value={reminder.default_reminder_channels}
              onValueChange={(v) => update({ default_reminder_channels: v })}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email only</SelectItem>
                <SelectItem value="sms">SMS only</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator />

        {/* Timing */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-foreground">Reminder Timing</h4>
          <div className="flex items-center justify-between">
            <div>
              <Label>24 Hours Before</Label>
              <p className="text-xs text-muted-foreground">Send a reminder 24 hours before the appointment</p>
            </div>
            <Switch
              checked={reminder.reminder_24h_enabled}
              onCheckedChange={(v) => update({ reminder_24h_enabled: v })}
              disabled={updateSettings.isPending}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>2 Hours Before</Label>
              <p className="text-xs text-muted-foreground">Send a reminder 2 hours before the appointment</p>
            </div>
            <Switch
              checked={reminder.reminder_2h_enabled}
              onCheckedChange={(v) => update({ reminder_2h_enabled: v })}
              disabled={updateSettings.isPending}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>15 Minutes Before</Label>
              <p className="text-xs text-muted-foreground">Send a last-minute reminder 15 minutes before</p>
            </div>
            <Switch
              checked={reminder.reminder_15m_enabled}
              onCheckedChange={(v) => update({ reminder_15m_enabled: v })}
              disabled={updateSettings.isPending}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
