import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Mail, MessageSquare } from "lucide-react";
import { useInterpreterNotifPrefs } from "@/hooks/useInterpreterNotifPrefs";

export function InterpreterNotificationPrefs() {
  const { prefs, updatePrefs, isLoading } = useInterpreterNotifPrefs();

  const update = (patch: Record<string, any>) => {
    updatePrefs.mutate(patch);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Notification Preferences
        </CardTitle>
        <CardDescription>
          Choose how and when you receive appointment reminders. Your preferences override agency defaults.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-foreground">Channels</h4>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label>Email Notifications</Label>
                <p className="text-xs text-muted-foreground">Receive reminders via email</p>
              </div>
            </div>
            <Switch
              checked={prefs.enable_email_notifications}
              onCheckedChange={(v) => update({ enable_email_notifications: v })}
              disabled={updatePrefs.isPending || isLoading}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label>SMS Notifications</Label>
                <p className="text-xs text-muted-foreground">Receive reminders via SMS</p>
              </div>
            </div>
            <Switch
              checked={prefs.enable_sms_notifications}
              onCheckedChange={(v) => update({ enable_sms_notifications: v })}
              disabled={updatePrefs.isPending || isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label>Preferred Channel</Label>
            <Select
              value={prefs.preferred_notification_channel}
              onValueChange={(v) => update({ preferred_notification_channel: v })}
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

        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-foreground">Reminder Timing</h4>
          <div className="flex items-center justify-between">
            <div>
              <Label>24 Hours Before</Label>
              <p className="text-xs text-muted-foreground">Receive a reminder 24 hours before</p>
            </div>
            <Switch
              checked={prefs.reminder_24h_enabled}
              onCheckedChange={(v) => update({ reminder_24h_enabled: v })}
              disabled={updatePrefs.isPending || isLoading}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>2 Hours Before</Label>
              <p className="text-xs text-muted-foreground">Receive a reminder 2 hours before</p>
            </div>
            <Switch
              checked={prefs.reminder_2h_enabled}
              onCheckedChange={(v) => update({ reminder_2h_enabled: v })}
              disabled={updatePrefs.isPending || isLoading}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>15 Minutes Before</Label>
              <p className="text-xs text-muted-foreground">Last-minute reminder</p>
            </div>
            <Switch
              checked={prefs.reminder_15m_enabled}
              onCheckedChange={(v) => update({ reminder_15m_enabled: v })}
              disabled={updatePrefs.isPending || isLoading}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
