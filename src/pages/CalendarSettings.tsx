import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  CalendarSync, CheckCircle2, Loader2, Link2, Unlink,
  RefreshCw, Clock, AlertTriangle, Globe, Info, ChevronDown, CalendarOff
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

const COMMON_TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Anchorage", "Pacific/Honolulu", "America/Phoenix",
  "America/Indiana/Indianapolis", "America/Detroit",
  "America/Boise", "America/Kentucky/Louisville",
  "US/Eastern", "US/Central", "US/Mountain", "US/Pacific",
  "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney",
  "UTC",
];

export default function CalendarSettings() {
  const { profile, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const isAdmin = hasRole("agency_admin");

  // Fetch connection status (only when authenticated)
  const { data: statusData, isLoading } = useQuery({
    queryKey: ["gcal-status", profile?.id],
    enabled: !!profile?.id,
    retry: false,
    queryFn: async () => {
      // Ensure we have a valid session before invoking
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) {
        return { server_configured: false, client_id: null, connection: null };
      }
      try {
        const { data, error } = await supabase.functions.invoke("google-calendar-sync", {
          body: { action: "status" },
        });
        if (error) {
          console.warn("Calendar status fetch failed:", error);
          return { server_configured: false, client_id: null, connection: null };
        }
        return data as {
          server_configured: boolean;
          client_id: string | null;
          connection: any | null;
        };
      } catch (e) {
        console.warn("Calendar status fetch threw:", e);
        return { server_configured: false, client_id: null, connection: null };
      }
    },
  });

  const connection = statusData?.connection;
  const serverConfigured = statusData?.server_configured ?? false;

  // ─── OAuth Connect Flow ───
  const handleConnect = () => {
    if (!serverConfigured) {
      toast.error("Google Calendar integration is not configured yet.");
      return;
    }
    toast.info("Starting Google Calendar authorization...");
    setConnecting(true);

    const redirectUri = `${window.location.origin}/calendar-settings`;
    const clientId = statusData?.client_id;

    if (!clientId) {
      toast.error("Google Calendar client ID not available. Contact your administrator.");
      setConnecting(false);
      return;
    }

    const scope = "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email";
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scope);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", "gcal_connect");

    window.location.href = authUrl.toString();
  };

  // Handle OAuth callback (code in URL)
  const urlParams = new URLSearchParams(window.location.search);
  const authCode = urlParams.get("code");
  const authState = urlParams.get("state");

  if (authCode && authState === "gcal_connect" && !connecting) {
    (async () => {
      setConnecting(true);
      try {
        const redirectUri = `${window.location.origin}/calendar-settings`;
        const { data, error } = await supabase.functions.invoke("google-calendar-sync", {
          body: {
            action: "oauth-callback",
            code: authCode,
            redirect_uri: redirectUri,
            timezone: "America/Los_Angeles",
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success("Google Calendar connected successfully!");
        queryClient.invalidateQueries({ queryKey: ["gcal-status"] });
        window.history.replaceState({}, "", window.location.pathname);
      } catch (e: any) {
        toast.error(e.message || "Failed to connect Google Calendar");
      } finally {
        setConnecting(false);
      }
    })();
  }

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke("google-calendar-sync", {
        body: { action: "disconnect" },
      });
      if (error) throw error;
      toast.success("Google Calendar disconnected");
      queryClient.invalidateQueries({ queryKey: ["gcal-status"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  };

  const handleBulkSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-sync", {
        body: { action: "bulk-sync" },
      });
      if (error) throw error;
      toast.success(`Synced ${data.synced} appointments. ${data.errors > 0 ? `${data.errors} errors.` : ""}`);
      queryClient.invalidateQueries({ queryKey: ["gcal-status"] });
    } catch (e: any) {
      toast.error(e.message || "Bulk sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleUpdateSettings = async (updates: Record<string, any>) => {
    try {
      const { error } = await supabase.functions.invoke("google-calendar-sync", {
        body: { action: "update-settings", ...updates },
      });
      if (error) throw error;
      toast.success("Settings updated");
      queryClient.invalidateQueries({ queryKey: ["gcal-status"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to update settings");
    }
  };

  const getSyncStatusBadge = () => {
    if (!connection) return null;
    const status = connection.last_sync_status;
    switch (status) {
      case "ok":
        return <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Synced</Badge>;
      case "error":
      case "auth_error":
        return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Error</Badge>;
      case "connected":
        return <Badge variant="secondary" className="gap-1"><Link2 className="h-3 w-3" /> Connected</Badge>;
      default:
        return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Never synced</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─── Not-configured state (role-aware) ───
  const renderNotConfiguredState = () => {
    if (serverConfigured) return null;

    if (isAdmin) {
      return (
        <div className="rounded-lg border border-border bg-muted/30 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/10 p-2 mt-0.5">
              <Info className="h-4 w-4 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Google Calendar Setup Required</p>
              <p className="text-sm text-muted-foreground">
                To enable calendar sync for your team, Google OAuth credentials need to be added to your backend configuration.
              </p>
            </div>
          </div>

          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
                <ChevronDown className="h-3.5 w-3.5" />
                View setup steps
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="rounded-md border border-border bg-background p-4 text-sm space-y-3">
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>
                    Go to the{" "}
                    <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">
                      Google Cloud Console
                    </a>{" "}
                    and create an OAuth 2.0 Client ID
                  </li>
                  <li>
                    Set the authorized redirect URI to:<br />
                    <code className="mt-1 inline-block rounded bg-muted px-2 py-0.5 text-xs font-mono">
                      {window.location.origin}/calendar-settings
                    </code>
                  </li>
                  <li>Enable the <strong>Google Calendar API</strong> in your Google Cloud project</li>
                  <li>
                    Add the following secrets to your backend configuration:
                    <ul className="mt-1.5 ml-4 list-disc space-y-1">
                      <li><code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">GOOGLE_CALENDAR_CLIENT_ID</code></li>
                      <li><code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">GOOGLE_CALENDAR_CLIENT_SECRET</code></li>
                    </ul>
                  </li>
                  <li>Refresh this page to verify the connection is available</li>
                </ol>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      );
    }

    // Non-admin users
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-muted p-2 mt-0.5">
            <CalendarOff className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Calendar integration is not yet enabled</p>
            <p className="text-sm text-muted-foreground">
              Your organization administrator needs to configure Google Calendar integration before it can be used. Please contact your admin for assistance.
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Calendar Integration</h1>
        <p className="text-muted-foreground">Connect and sync with Google Calendar</p>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarSync className="h-5 w-5" /> Google Calendar
          </CardTitle>
          <CardDescription>
            {connection
              ? `Connected as ${connection.google_email || "Google account"}`
              : serverConfigured
                ? "Connect your Google Calendar to sync appointments automatically"
                : "Calendar sync keeps your appointments in sync with Google Calendar"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderNotConfiguredState()}

          {connection ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{connection.google_email || "Connected"}</p>
                    <p className="text-xs text-muted-foreground">
                      Calendar: {connection.calendar_id || "primary"}
                    </p>
                  </div>
                </div>
                {getSyncStatusBadge()}
              </div>

              {connection.last_sync_error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3">
                  <p className="text-xs font-medium text-destructive">Last sync error</p>
                  <p className="text-xs text-muted-foreground mt-1">{connection.last_sync_error}</p>
                </div>
              )}

              {connection.last_synced_at && (
                <p className="text-xs text-muted-foreground">
                  Last synced {formatDistanceToNow(new Date(connection.last_synced_at), { addSuffix: true })}
                </p>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleBulkSync} disabled={syncing}>
                  {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Sync All Upcoming
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
                  {disconnecting ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Unlink className="mr-2 h-3 w-3" />}
                  Disconnect
                </Button>
              </div>
            </div>
          ) : serverConfigured ? (
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
              Connect Google Calendar
            </Button>
          ) : (
            /* Button disabled with tooltip when not configured */
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-block">
                    <Button disabled className="pointer-events-none">
                      <Link2 className="mr-2 h-4 w-4" />
                      Connect Google Calendar
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isAdmin ? "Complete the setup steps above first" : "Calendar integration is not yet enabled by your administrator"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>

      {/* Timezone & Sync Settings (only when connected) */}
      {connection && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" /> Sync Settings
            </CardTitle>
            <CardDescription>Configure timezone and sync behavior</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select
                value={connection.timezone || "America/New_York"}
                onValueChange={(value) => handleUpdateSettings({ timezone: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used for calendar event times. Overrides agency timezone for your synced events.
              </p>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Auto-sync enabled</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically sync appointment changes to Google Calendar
                </p>
              </div>
              <Switch
                checked={connection.sync_enabled}
                onCheckedChange={(checked) => handleUpdateSettings({ sync_enabled: checked })}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
