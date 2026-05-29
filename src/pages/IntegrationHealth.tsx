import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAgencySettings } from "@/hooks/useAgencySettings";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity, CheckCircle, XCircle, AlertTriangle, Loader2, RefreshCw,
  Mail, MessageSquare, Calendar, FileText, Clock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type CheckStatus = "healthy" | "warning" | "error" | "not_configured" | "idle" | "loading";

interface CheckResult {
  status: CheckStatus;
  details: Record<string, string | boolean | number | null>;
  error?: string;
  checkedAt?: Date;
}

const statusBadge = (s: CheckStatus) => {
  switch (s) {
    case "healthy": return <Badge className="bg-green-600 text-white">Healthy</Badge>;
    case "warning": return <Badge className="bg-yellow-500 text-white">Warning</Badge>;
    case "error": return <Badge variant="destructive">Error</Badge>;
    case "not_configured": return <Badge variant="secondary">Not Configured</Badge>;
    case "loading": return <Badge variant="outline"><Loader2 className="h-3 w-3 animate-spin mr-1" />Checking</Badge>;
    default: return <Badge variant="outline">Not Checked</Badge>;
  }
};

const DetailRow = ({ label, value }: { label: string; value: any }) => (
  <div className="flex justify-between text-sm py-1 border-b border-border/50 last:border-0">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium text-foreground text-right max-w-[60%] break-all">
      {value === true ? "Yes" : value === false ? "No" : value === null || value === undefined ? "—" : String(value)}
    </span>
  </div>
);

const TimeAgo = ({ date }: { date?: Date }) =>
  date ? <span className="text-xs text-muted-foreground">Checked {formatDistanceToNow(date, { addSuffix: true })}</span> : null;

export default function IntegrationHealth() {
  const { profile } = useAuth();
  const { settings } = useAgencySettings();

  const [emailCheck, setEmailCheck] = useState<CheckResult>({ status: "idle", details: {} });
  const [smsCheck, setSmsCheck] = useState<CheckResult>({ status: "idle", details: {} });
  const [gcalCheck, setGcalCheck] = useState<CheckResult>({ status: "idle", details: {} });
  const [qboCheck, setQboCheck] = useState<CheckResult>({ status: "idle", details: {} });
  const [reminderCheck, setReminderCheck] = useState<CheckResult>({ status: "idle", details: {} });

  // Email
  const checkEmail = useCallback(async () => {
    setEmailCheck({ status: "loading", details: {} });
    try {
      const { data, error } = await supabase.functions.invoke("send-notification", {
        body: {
          channel: "email",
          recipient: profile!.email,
          subject: "BlueThread Integration Test",
          message: `This is an automated integration test from BlueThread Solutions. If you received this email, your Resend email integration is working correctly. Timestamp: ${new Date().toISOString()}`,
          type: "integration_test",
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const { data: logEntry } = await supabase.from("notification_log").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
      setEmailCheck({
        status: "healthy",
        details: { "Status": "Sent", "Recipient": profile!.email ?? "—", "Message ID": data?.message_id ?? "—", "Log Entry": logEntry?.id ?? "—" },
        checkedAt: new Date(),
      });
    } catch (e: any) {
      const msg = e.message || "Unknown error";
      setEmailCheck({
        status: msg.toLowerCase().includes("not configured") ? "not_configured" : "error",
        details: { "Recipient": profile?.email ?? "—" },
        error: msg,
        checkedAt: new Date(),
      });
    }
  }, [profile]);

  // SMS
  const checkSms = useCallback(async () => {
    if (!profile?.phone) {
      setSmsCheck({ status: "warning", details: {}, error: "Add your phone number in Settings before testing SMS", checkedAt: new Date() });
      return;
    }
    setSmsCheck({ status: "loading", details: {} });
    try {
      const { data, error } = await supabase.functions.invoke("send-notification", {
        body: {
          channel: "sms",
          recipient: profile.phone,
          message: `BlueThread integration test. SMS delivery confirmed. Timestamp: ${new Date().toISOString()}`,
          type: "integration_test",
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const { data: logEntry } = await supabase.from("notification_log").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
      setSmsCheck({
        status: "healthy",
        details: { "Status": "Sent", "Recipient": profile.phone, "Message SID": data?.message_id ?? "—", "Log Entry": logEntry?.id ?? "—" },
        checkedAt: new Date(),
      });
    } catch (e: any) {
      const msg = e.message || "Unknown error";
      setSmsCheck({
        status: msg.toLowerCase().includes("not configured") ? "not_configured" : "error",
        details: { "Recipient": profile?.phone ?? "—" },
        error: msg,
        checkedAt: new Date(),
      });
    }
  }, [profile]);

  // Google Calendar
  const checkGcal = useCallback(async () => {
    setGcalCheck({ status: "loading", details: {} });
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-sync", { body: { action: "status" } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const conn = data?.connection;
      const serverConfigured = data?.server_configured ?? false;
      if (!serverConfigured) {
        setGcalCheck({ status: "not_configured", details: { "Server Configured": false }, checkedAt: new Date() });
        return;
      }
      if (!conn) {
        setGcalCheck({ status: "warning", details: { "Server Configured": true, "Connection": "Not Connected" }, checkedAt: new Date() });
        return;
      }
      setGcalCheck({
        status: conn.sync_enabled ? "healthy" : "warning",
        details: {
          "Server Configured": true,
          "Connected Email": conn.google_email ?? "—",
          "Calendar ID": conn.calendar_id ?? "—",
          "Sync Enabled": conn.sync_enabled ?? false,
          "Last Sync": conn.last_synced_at ? formatDistanceToNow(new Date(conn.last_synced_at), { addSuffix: true }) : "Never",
          "Last Sync Status": conn.last_sync_status ?? "—",
          "Last Sync Error": conn.last_sync_error ?? "None",
          "Timezone": conn.timezone ?? "—",
        },
        checkedAt: new Date(),
      });
    } catch (e: any) {
      const msg = e?.message || "Unknown error";
      const isConnectionIssue = msg.includes("Failed to send") || msg.includes("FetchError") || msg.includes("NetworkError");
      setGcalCheck({
        status: "not_configured",
        details: {
          "Server Configured": false,
          "Connection": "Unavailable",
        },
        error: isConnectionIssue
          ? "Google Calendar sync is not set up. The server integration needs to be configured before you can connect. Contact your platform administrator."
          : msg,
        checkedAt: new Date(),
      });
    }
  }, []);

  // QBO
  const checkQbo = useCallback(async () => {
    setQboCheck({ status: "loading", details: {} });
    try {
      const { data, error } = await supabase.from("qbo_connections").select("*").eq("agency_id", profile!.agency_id!).maybeSingle();
      if (error) throw error;
      if (!data) {
        setQboCheck({ status: "not_configured", details: { "Connection": "Not Set Up" }, checkedAt: new Date() });
        return;
      }
      const expired = data.token_expires_at ? new Date(data.token_expires_at) < new Date() : false;
      const connStatus = (data as any).connection_status ?? "unknown";
      setQboCheck({
        status: expired ? "warning" : connStatus === "connected" ? "healthy" : "warning",
        details: {
          "Status": connStatus,
          "Company Name": (data as any).company_name ?? "—",
          "Token Expires": data.token_expires_at ? `${new Date(data.token_expires_at).toLocaleString()}${expired ? " (EXPIRED)" : ""}` : "—",
          "Last Sync": (data as any).last_sync_at ? formatDistanceToNow(new Date((data as any).last_sync_at), { addSuffix: true }) : "Never",
          "Integration Mode": (data as any).integration_mode ?? "—",
        },
        checkedAt: new Date(),
      });
    } catch (e: any) {
      setQboCheck({ status: "error", details: {}, error: e.message, checkedAt: new Date() });
    }
  }, [profile]);

  const testQboApi = useCallback(async () => {
    setQboCheck((p) => ({ ...p, status: "loading" }));
    try {
      const { data, error } = await supabase.functions.invoke("qbo-auth", { body: { action: "status" } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const conn = data?.connection;
      setQboCheck((p) => ({
        ...p,
        status: conn?.connection_status === "connected" ? "healthy" : "warning",
        details: {
          ...p.details,
          "API Test": "Passed",
          "Company": conn?.company_name ?? "—",
          "Token Valid": conn?.token_expires_at
            ? new Date(conn.token_expires_at) > new Date() ? "Yes" : "Expired"
            : "Unknown",
        },
        checkedAt: new Date(),
      }));
    } catch (e: any) {
      setQboCheck((p) => ({ ...p, status: "error", error: e.message, checkedAt: new Date() }));
    }
  }, []);

  // Reminders
  const checkReminders = useCallback(() => {
    const s = settings ?? {};
    const details: Record<string, any> = {
      "24h Reminder": s.reminder_24h_enabled ?? false,
      "2h Reminder": s.reminder_2h_enabled ?? false,
      "15m Reminder": s.reminder_15m_enabled ?? false,
      "Email Channel": s.enable_email_reminders ?? false,
      "SMS Channel": s.enable_sms_reminders ?? false,
      "Default Channels": s.default_reminder_channels ?? "—",
    };
    const anyEnabled = s.reminder_24h_enabled || s.reminder_2h_enabled || s.reminder_15m_enabled;
    setReminderCheck({ status: anyEnabled ? "healthy" : "warning", details, checkedAt: new Date() });
  }, [settings]);

  // Auto-run non-destructive checks on mount
  useEffect(() => {
    if (!profile?.agency_id) return;
    checkGcal();
    checkQbo();
    checkReminders();
  }, [profile?.agency_id]);

  const runAllSafe = () => {
    checkGcal();
    checkQbo();
    checkReminders();
  };

  const allChecks = [emailCheck, smsCheck, gcalCheck, qboCheck, reminderCheck];
  const counted = allChecks.filter((c) => c.status !== "idle" && c.status !== "loading");
  const healthy = counted.filter((c) => c.status === "healthy").length;
  const warnings = counted.filter((c) => c.status === "warning" || c.status === "not_configured").length;
  const errors = counted.filter((c) => c.status === "error").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Activity className="h-6 w-6" /> Integration Health
          </h1>
          <p className="text-muted-foreground text-sm">Test and verify your external service connections</p>
        </div>
        <Button onClick={runAllSafe} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-1" /> Check All
        </Button>
      </div>

      {/* Summary Bar */}
      <div className="flex flex-wrap gap-3">
        <Badge variant="outline" className="text-sm px-3 py-1">{counted.length} Checked</Badge>
        {healthy > 0 && <Badge className="bg-green-600 text-white text-sm px-3 py-1"><CheckCircle className="h-3 w-3 mr-1" />{healthy} Healthy</Badge>}
        {warnings > 0 && <Badge className="bg-yellow-500 text-white text-sm px-3 py-1"><AlertTriangle className="h-3 w-3 mr-1" />{warnings} Warning</Badge>}
        {errors > 0 && <Badge variant="destructive" className="text-sm px-3 py-1"><XCircle className="h-3 w-3 mr-1" />{errors} Error</Badge>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Email */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2"><Mail className="h-5 w-5 text-muted-foreground" /><CardTitle className="text-base">Email (Resend)</CardTitle></div>
            {statusBadge(emailCheck.status)}
          </CardHeader>
          <CardContent className="space-y-1">
            {Object.entries(emailCheck.details).map(([k, v]) => <DetailRow key={k} label={k} value={v} />)}
            {emailCheck.error && <p className="text-sm text-destructive mt-1">{emailCheck.error}</p>}
            <TimeAgo date={emailCheck.checkedAt} />
          </CardContent>
          <CardFooter>
            <Button size="sm" onClick={checkEmail} disabled={emailCheck.status === "loading"}>
              {emailCheck.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Mail className="h-4 w-4 mr-1" />}
              Send Test Email
            </Button>
          </CardFooter>
        </Card>

        {/* SMS */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-muted-foreground" /><CardTitle className="text-base">SMS (Twilio)</CardTitle></div>
            {statusBadge(smsCheck.status)}
          </CardHeader>
          <CardContent className="space-y-1">
            {Object.entries(smsCheck.details).map(([k, v]) => <DetailRow key={k} label={k} value={v} />)}
            {smsCheck.error && <p className="text-sm text-destructive mt-1">{smsCheck.error}</p>}
            <TimeAgo date={smsCheck.checkedAt} />
          </CardContent>
          <CardFooter>
            <Button size="sm" onClick={checkSms} disabled={smsCheck.status === "loading" || !profile?.phone}>
              {smsCheck.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <MessageSquare className="h-4 w-4 mr-1" />}
              Send Test SMS
            </Button>
            {!profile?.phone && <p className="text-xs text-muted-foreground ml-2">Add phone in Settings first</p>}
          </CardFooter>
        </Card>

        {/* Google Calendar */}
        <IntegrationCard icon={Calendar} title="Google Calendar Sync" check={gcalCheck} onRecheck={checkGcal} />

        {/* QBO */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2"><FileText className="h-5 w-5 text-muted-foreground" /><CardTitle className="text-base">QuickBooks Online</CardTitle></div>
            {statusBadge(qboCheck.status)}
          </CardHeader>
          <CardContent className="space-y-1">
            {Object.entries(qboCheck.details).map(([k, v]) => <DetailRow key={k} label={k} value={v} />)}
            {qboCheck.error && <p className="text-sm text-destructive mt-1">{qboCheck.error}</p>}
            <TimeAgo date={qboCheck.checkedAt} />
          </CardContent>
          <CardFooter className="gap-2">
            <Button size="sm" variant="outline" onClick={checkQbo} disabled={qboCheck.status === "loading"}>
              <RefreshCw className="h-4 w-4 mr-1" /> Recheck
            </Button>
            {qboCheck.status === "healthy" && (
              <Button size="sm" onClick={testQboApi}>
                <FileText className="h-4 w-4 mr-1" /> Test API
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* Reminders */}
        <IntegrationCard icon={Clock} title="Appointment Reminders" check={reminderCheck} onRecheck={checkReminders}
          note="Reminders are processed every 5 minutes by the server. This checks configuration only." />
      </div>
    </div>
  );
}

function IntegrationCard({ icon: Icon, title, check, onRecheck, note }: {
  icon: React.ElementType; title: string; check: CheckResult; onRecheck: () => void; note?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2"><Icon className="h-5 w-5 text-muted-foreground" /><CardTitle className="text-base">{title}</CardTitle></div>
        {statusBadge(check.status)}
      </CardHeader>
      <CardContent className="space-y-1">
        {Object.entries(check.details).map(([k, v]) => <DetailRow key={k} label={k} value={v} />)}
        {check.error && <p className="text-sm text-destructive mt-1">{check.error}</p>}
        {note && <p className="text-xs text-muted-foreground mt-2 italic">{note}</p>}
        <TimeAgo date={check.checkedAt} />
      </CardContent>
      <CardFooter>
        <Button size="sm" variant="outline" onClick={onRecheck} disabled={check.status === "loading"}>
          {check.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Recheck
        </Button>
      </CardFooter>
    </Card>
  );
}
