import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { usePlatformDiagnostics } from "@/hooks/usePlatformData";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { RefreshCw, Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

const EDGE_FUNCTIONS = [
  "send-notification", "google-calendar-sync", "invite-user", "accept-invitation",
  "manage-join-request", "qbo-auth", "process-import", "auth-email-hook", "process-reminders", "platform-admin",
];

const ENV_VARS = [
  { name: "VITE_SUPABASE_URL", note: "Required for database connection", required: true },
  { name: "VITE_SUPABASE_PUBLISHABLE_KEY", note: "Required for database auth", required: true },
  { name: "VITE_GOOGLE_CALENDAR_CLIENT_ID", note: "Optional, needed for Google Calendar", required: false },
];

const SERVER_SECRETS = [
  { name: "RESEND_API_KEY", purpose: "Required for email delivery" },
  { name: "TWILIO_ACCOUNT_SID", purpose: "Required for SMS" },
  { name: "TWILIO_AUTH_TOKEN", purpose: "Required for SMS" },
  { name: "TWILIO_PHONE_NUMBER", purpose: "Required for SMS" },
  { name: "GOOGLE_CALENDAR_CLIENT_ID", purpose: "Required for Google Calendar sync" },
  { name: "GOOGLE_CALENDAR_CLIENT_SECRET", purpose: "Required for Google Calendar sync" },
  { name: "QBO_CLIENT_ID", purpose: "Required for QuickBooks integration" },
  { name: "QBO_CLIENT_SECRET", purpose: "Required for QuickBooks integration" },
  { name: "QBO_REDIRECT_URI", purpose: "Required for QuickBooks OAuth" },
  { name: "APP_BASE_URL", purpose: "Required for email links and OAuth redirects" },
];

type InfraStatus = "idle" | "loading" | "healthy" | "error";

export default function PlatformDiagnostics() {
  const { data, isLoading } = usePlatformDiagnostics();
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "imports";

  // Infrastructure state
  const [supabaseStatus, setSupabaseStatus] = useState<{ status: InfraStatus; time?: number; error?: string }>({ status: "idle" });
  const [edgeFnRows, setEdgeFnRows] = useState<{ name: string; status: string; time: number }[]>([]);
  const [edgeFnLoading, setEdgeFnLoading] = useState(false);
  const [envVarResults, setEnvVarResults] = useState<{ name: string; set: boolean; note: string }[]>([]);

  const switchTab = (tab: string) => {
    setSearchParams({ tab });
  };

  // Supabase check
  const checkSupabase = useCallback(async () => {
    setSupabaseStatus({ status: "loading" });
    try {
      const start = performance.now();
      const { error } = await supabase.from("agencies").select("id").limit(1);
      const ms = Math.round(performance.now() - start);
      if (error) throw error;
      setSupabaseStatus({ status: "healthy", time: ms });
    } catch (e: any) {
      setSupabaseStatus({ status: "error", error: e.message });
    }
  }, []);

  // Edge functions check
  const checkEdgeFunctions = useCallback(async () => {
    setEdgeFnLoading(true);
    const results: typeof edgeFnRows = [];
    for (const fn of EDGE_FUNCTIONS) {
      const start = performance.now();
      try {
        const { error } = await supabase.functions.invoke(fn, { body: {} });
        const ms = Math.round(performance.now() - start);
        if (error) {
          const errMsg = typeof error === "object" && error !== null
            ? (error as any).message || JSON.stringify(error)
            : String(error);
          const isNotFound =
            errMsg.includes("FunctionNotFound") ||
            errMsg.includes("Function not found") ||
            errMsg.includes("not found") ||
            errMsg.includes("404");
          results.push({ name: fn, status: isNotFound ? "Not Found" : "Deployed", time: ms });
        } else {
          results.push({ name: fn, status: "Deployed", time: ms });
        }
      } catch (e: any) {
        const ms = Math.round(performance.now() - start);
        const errMsg = e?.message || "";
        const isNotFound =
          errMsg.includes("FunctionNotFound") ||
          errMsg.includes("Function not found") ||
          errMsg.includes("not found") ||
          errMsg.includes("404");
        results.push({ name: fn, status: isNotFound ? "Not Found" : "Deployed", time: ms });
      }
    }
    setEdgeFnRows(results);
    setEdgeFnLoading(false);
  }, []);

  // Env vars check
  const checkEnvVars = useCallback(() => {
    setEnvVarResults(
      ENV_VARS.map((v) => ({
        name: v.name,
        set: !!(import.meta.env as any)[v.name],
        note: v.note,
      }))
    );
  }, []);

  // Auto-run infra checks when infrastructure tab is selected
  useEffect(() => {
    if (defaultTab === "infrastructure") {
      checkSupabase();
      checkEnvVars();
    }
  }, [defaultTab]);

  const infrastructureCount =
    (supabaseStatus.status !== "idle" ? 1 : 0) +
    edgeFnRows.length +
    envVarResults.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const d = data || {};
  const deployedCount = edgeFnRows.filter((r) => r.status === "Deployed").length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Platform Diagnostics</h1>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <HealthCard label="Failed Imports" count={(d.failed_imports || []).length} onClick={() => switchTab("imports")} />
        <HealthCard label="Failed QBO Syncs" count={(d.failed_syncs || []).length} onClick={() => switchTab("syncs")} />
        <HealthCard label="Failed Notifications" count={(d.failed_notifications || []).length} onClick={() => switchTab("notifications")} />
        <HealthCard label="Integrations" count={(d.integration_health || []).length} isCount onClick={() => switchTab("integrations")} />
        <HealthCard label="Infrastructure" count={infrastructureCount} isCount onClick={() => switchTab("infrastructure")} />
      </div>

      <Tabs value={defaultTab} onValueChange={switchTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="imports">Failed Imports ({(d.failed_imports || []).length})</TabsTrigger>
          <TabsTrigger value="syncs">Failed Syncs ({(d.failed_syncs || []).length})</TabsTrigger>
          <TabsTrigger value="notifications">Failed Notifications ({(d.failed_notifications || []).length})</TabsTrigger>
          <TabsTrigger value="integrations">Integration Health</TabsTrigger>
          <TabsTrigger value="infrastructure">Infrastructure</TabsTrigger>
        </TabsList>

        <TabsContent value="imports" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agency</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(d.failed_imports || []).map((i: any) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.agency_name}</TableCell>
                      <TableCell>{i.entity_type}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{i.filename}</TableCell>
                      <TableCell className="text-xs">{format(new Date(i.created_at), "MMM d, HH:mm")}</TableCell>
                    </TableRow>
                  ))}
                  {(d.failed_imports || []).length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No failed imports (last 30 days)</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="syncs" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agency</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(d.failed_syncs || []).map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.agency_name}</TableCell>
                      <TableCell>{s.entity_type}</TableCell>
                      <TableCell>{s.action}</TableCell>
                      <TableCell className="text-xs text-destructive max-w-[300px] truncate">{s.error_details}</TableCell>
                      <TableCell className="text-xs">{format(new Date(s.created_at), "MMM d, HH:mm")}</TableCell>
                    </TableRow>
                  ))}
                  {(d.failed_syncs || []).length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No failed syncs (last 30 days)</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agency</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(d.failed_notifications || []).map((n: any) => (
                    <TableRow key={n.id}>
                      <TableCell className="font-medium">{n.agency_name}</TableCell>
                      <TableCell><Badge variant="outline">{n.channel}</Badge></TableCell>
                      <TableCell className="text-sm">{n.recipient}</TableCell>
                      <TableCell className="text-xs text-destructive max-w-[300px] truncate">{n.error_message}</TableCell>
                      <TableCell className="text-xs">{format(new Date(n.created_at), "MMM d, HH:mm")}</TableCell>
                    </TableRow>
                  ))}
                  {(d.failed_notifications || []).length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No failed notifications (last 30 days)</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agency</TableHead>
                    <TableHead>QBO Status</TableHead>
                    <TableHead>Calendar Connections</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(d.integration_health || []).map((ih: any) => (
                    <TableRow key={ih.agency_id}>
                      <TableCell className="font-medium">{ih.agency_name}</TableCell>
                      <TableCell>
                        <Badge variant={ih.qbo_status === 'connected' ? 'default' : 'secondary'}>
                          {ih.qbo_status}
                        </Badge>
                      </TableCell>
                      <TableCell>{ih.gcal_connections}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="infrastructure" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Card A: Supabase Connection */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">Database Connection</CardTitle>
                {supabaseStatus.status === "healthy" && <Badge className="bg-green-600 text-white"><CheckCircle2 className="h-3 w-3 mr-1" />Connected</Badge>}
                {supabaseStatus.status === "error" && <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Error</Badge>}
                {supabaseStatus.status === "loading" && <Badge variant="outline"><Loader2 className="h-3 w-3 animate-spin mr-1" />Checking</Badge>}
                {supabaseStatus.status === "idle" && <Badge variant="outline">Not Checked</Badge>}
              </CardHeader>
              <CardContent className="space-y-2">
                {supabaseStatus.time !== undefined && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Response Time</span>
                    <span className="font-medium text-foreground">{supabaseStatus.time}ms</span>
                  </div>
                )}
                {supabaseStatus.error && <p className="text-sm text-destructive">{supabaseStatus.error}</p>}
              </CardContent>
              <CardContent className="pt-0">
                <Button size="sm" variant="outline" onClick={checkSupabase} disabled={supabaseStatus.status === "loading"}>
                  <RefreshCw className="h-4 w-4 mr-1" /> Check
                </Button>
              </CardContent>
            </Card>

            {/* Card C: Environment Variables */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Environment Variables</CardTitle>
              </CardHeader>
              <CardContent>
                {envVarResults.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Variable</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {envVarResults.map((v) => (
                        <TableRow key={v.name}>
                          <TableCell className="font-mono text-xs">{v.name}</TableCell>
                          <TableCell>
                            {v.set
                              ? <Badge className="bg-green-600 text-white">Set</Badge>
                              : <Badge variant="destructive">Missing</Badge>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{v.note}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">Switch to Infrastructure tab to check</p>
                )}
              </CardContent>
            </Card>

            {/* Card B: Edge Function Availability — full width */}
            <Card className="md:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base">Edge Function Availability</CardTitle>
                  {edgeFnRows.length > 0 && (
                    <p className="text-sm text-muted-foreground mt-1">{deployedCount}/{EDGE_FUNCTIONS.length} Deployed</p>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={checkEdgeFunctions} disabled={edgeFnLoading}>
                  {edgeFnLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                  Check All Functions
                </Button>
              </CardHeader>
              <CardContent>
                {edgeFnRows.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Function Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Response Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {edgeFnRows.map((r) => (
                        <TableRow key={r.name}>
                          <TableCell className="font-mono text-sm">{r.name}</TableCell>
                          <TableCell>
                            <Badge variant={r.status === "Deployed" ? "default" : "destructive"} className={r.status === "Deployed" ? "bg-green-600" : ""}>
                              {r.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{r.time}ms</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">Click "Check All Functions" to test edge function deployment</p>
                )}
              </CardContent>
            </Card>

            {/* Card D: Server Secrets Reference */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Server Secrets Reference</CardTitle>
                <CardDescription>
                  These secrets must be configured in the backend Edge Functions secrets. The frontend cannot verify if these are set — use the agency-level Integration Health page to test email/SMS/calendar delivery.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Secret Name</TableHead>
                      <TableHead>Purpose</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {SERVER_SECRETS.map((s) => (
                      <TableRow key={s.name}>
                        <TableCell className="font-mono text-sm">{s.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{s.purpose}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HealthCard({ label, count, isCount, onClick }: { label: string; count: number; isCount?: boolean; onClick?: () => void }) {
  return (
    <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={onClick}>
      <CardContent className="pt-4 pb-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${!isCount && count > 0 ? 'text-destructive' : 'text-foreground'}`}>{count}</p>
      </CardContent>
    </Card>
  );
}
