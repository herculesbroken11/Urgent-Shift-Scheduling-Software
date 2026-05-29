import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import BulkSyncPanel from "./BulkSyncPanel";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Link2, Unlink, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  FileSpreadsheet, Cloud, Settings2, Loader2, ArrowRight,
} from "lucide-react";
import { useQboConnection, type QboConnection, type QboItemMapping } from "@/hooks/useQboConnection";
import { toast } from "sonner";

const LINE_ITEM_LABELS: Record<string, string> = {
  interpreting_base: "Interpreting Base Rate",
  travel_time: "Travel Time",
  mileage: "Mileage / Parking",
  after_hours_premium: "After-Hours Premium",
  weekend_premium: "Weekend Premium",
  holiday_premium: "Holiday Premium",
  same_day_premium: "Same-Day / Last-Minute Premium",
  rush_surcharge: "Rush / Emergency Surcharge",
  cancellation_fee: "Cancellation Fee",
  no_show_fee: "No-Show Fee",
  manual_adjustment: "Manual Adjustment",
};

const MODE_OPTIONS = [
  { value: "csv_only", label: "CSV Export Only", icon: FileSpreadsheet, desc: "Export billing data as CSV for manual QuickBooks import" },
  { value: "direct_sync", label: "QuickBooks Online Direct Sync", icon: Cloud, desc: "Automatically sync invoices and bills to QuickBooks Online" },
  { value: "both", label: "Both (CSV + Direct Sync)", icon: Settings2, desc: "Use both direct sync and CSV exports as needed" },
];

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
    connected: { variant: "default", icon: CheckCircle2 },
    disconnected: { variant: "secondary", icon: Unlink },
    expired: { variant: "destructive", icon: AlertTriangle },
    error: { variant: "destructive", icon: XCircle },
  };
  const c = config[status] || config.disconnected;
  return (
    <Badge variant={c.variant} className="gap-1">
      <c.icon className="h-3 w-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

export default function BillingIntegrations() {
  const {
    connection, isLoading, mappings, mappingsLoading,
    initiateOAuth, disconnect, updateSettings, updateMapping,
    validateMappings, fetchQboItems,
  } = useQboConnection();

  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<string>(connection?.integration_mode || "csv_only");

  useEffect(() => {
    if (connection?.integration_mode) setMode(connection.integration_mode);
  }, [connection?.integration_mode]);

  // Handle OAuth redirect params
  useEffect(() => {
    if (searchParams.get("qbo_connected") === "true") {
      toast.success("QuickBooks Online connected successfully!");
      searchParams.delete("qbo_connected");
      setSearchParams(searchParams, { replace: true });
    }
    if (searchParams.get("qbo_error")) {
      toast.error(`QuickBooks connection error: ${searchParams.get("qbo_error")}`);
      searchParams.delete("qbo_error");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams]);

  const isConnected = connection?.connection_status === "connected";
  const showDirectSync = mode === "direct_sync" || mode === "both";
  const showCsv = mode === "csv_only" || mode === "both";

  const handleModeChange = (newMode: string) => {
    setMode(newMode);
    if (connection) {
      updateSettings.mutate({ integration_mode: newMode as any });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Integration Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Integration Mode</CardTitle>
          <CardDescription>Choose how you want to handle QuickBooks billing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleModeChange(opt.value)}
                className={`rounded-lg border-2 p-4 text-left transition-all ${
                  mode === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <opt.icon className={`h-5 w-5 ${mode === opt.value ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="text-sm font-medium">{opt.label}</span>
                </div>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* CSV Export Info */}
      {showCsv && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">CSV Export</CardTitle>
            </div>
            <CardDescription>Export billing data as QuickBooks-compatible CSV</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <FileSpreadsheet className="h-4 w-4" />
              <AlertTitle>CSV Export Available</AlertTitle>
              <AlertDescription>
                Navigate to <strong>Billing Report → QuickBooks Export</strong> tab to generate monthly CSV exports
                compatible with QuickBooks Online import.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* QBO Direct Sync */}
      {showDirectSync && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cloud className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-lg">QuickBooks Online Connection</CardTitle>
                    <CardDescription>
                      {isConnected
                        ? `Connected to ${connection?.company_name || "QuickBooks"}`
                        : "Connect your QuickBooks Online account"}
                    </CardDescription>
                  </div>
                </div>
                <StatusBadge status={connection?.connection_status || "disconnected"} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isConnected ? (
                <div className="text-center py-6 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Connect to QuickBooks Online to automatically sync invoices and bills.
                  </p>
                  <Button
                    onClick={() => initiateOAuth.mutate()}
                    disabled={initiateOAuth.isPending}
                    size="lg"
                  >
                    {initiateOAuth.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4 mr-2" />
                    )}
                    Connect to QuickBooks
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    You'll be redirected to Intuit to authorize access. Uses sandbox mode for testing.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Company:</span>
                      <p className="font-medium">{connection.company_name}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Realm ID:</span>
                      <p className="font-mono text-xs">{connection.realm_id}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Last Synced:</span>
                      <p className="font-medium">
                        {connection.last_sync_at
                          ? new Date(connection.last_sync_at).toLocaleString()
                          : "Never"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Token Expires:</span>
                      <p className="font-medium">
                        {connection.token_expires_at
                          ? new Date(connection.token_expires_at).toLocaleString()
                          : "—"}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => initiateOAuth.mutate()}
                      disabled={initiateOAuth.isPending}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Reconnect
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => disconnect.mutate()}
                      disabled={disconnect.isPending}
                    >
                      <Unlink className="h-3 w-3 mr-1" />
                      Disconnect
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bulk Sync */}
          {isConnected && <BulkSyncPanel />}

          {/* Sync Settings */}
          {isConnected && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Sync Settings</CardTitle>
                  <CardDescription>Configure when and how appointments sync to QuickBooks</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="sync-completed" className="flex-1">
                      <div className="font-medium">Auto-sync on Completed</div>
                      <div className="text-xs text-muted-foreground">
                        Automatically sync when appointment status changes to "Completed"
                      </div>
                    </Label>
                    <Switch
                      id="sync-completed"
                      checked={connection.auto_sync_on_completed}
                      onCheckedChange={(v) => updateSettings.mutate({ auto_sync_on_completed: v })}
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <Label htmlFor="sync-validated" className="flex-1">
                      <div className="font-medium">Auto-sync on Completed</div>
                      <div className="text-xs text-muted-foreground">
                        Automatically sync when appointment status changes to "Completed"
                      </div>
                    </Label>
                    <Switch
                      id="sync-validated"
                      checked={connection.auto_sync_on_validated}
                      onCheckedChange={(v) => updateSettings.mutate({ auto_sync_on_validated: v })}
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <Label htmlFor="manual-approval" className="flex-1">
                      <div className="font-medium">Require Manual Approval</div>
                      <div className="text-xs text-muted-foreground">
                        Require admin review before sync runs (overrides auto-sync)
                      </div>
                    </Label>
                    <Switch
                      id="manual-approval"
                      checked={connection.require_manual_approval}
                      onCheckedChange={(v) => updateSettings.mutate({ require_manual_approval: v })}
                    />
                  </div>

                  <Separator />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Customer Naming Rule</Label>
                      <Input
                        value={connection.default_customer_naming}
                        onChange={(e) => updateSettings.mutate({ default_customer_naming: e.target.value })}
                        placeholder="{customer_name}"
                      />
                      <p className="text-xs text-muted-foreground">
                        Template: {"{customer_name}"}, {"{customer_id}"}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Vendor Naming Rule</Label>
                      <Input
                        value={connection.default_vendor_naming}
                        onChange={(e) => updateSettings.mutate({ default_vendor_naming: e.target.value })}
                        placeholder="{first_name} {last_name}"
                      />
                      <p className="text-xs text-muted-foreground">
                        Template: {"{first_name}"}, {"{last_name}"}, {"{email}"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Item Mappings */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">Line Item Mappings</CardTitle>
                      <CardDescription>
                        Map billing line item types to QuickBooks service items and accounts
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchQboItems.mutate()}
                        disabled={fetchQboItems.isPending}
                      >
                        {fetchQboItems.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                        Fetch QBO Items
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => validateMappings.mutate()}
                        disabled={validateMappings.isPending}
                      >
                        {validateMappings.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                        Validate
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Validation Results */}
                  {validateMappings.data && (
                    <Alert variant={(validateMappings.data as any).valid ? "default" : "destructive"}>
                      {(validateMappings.data as any).valid ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <AlertTriangle className="h-4 w-4" />
                      )}
                      <AlertTitle>
                        {(validateMappings.data as any).valid ? "Mappings Valid" : "Mapping Issues Found"}
                      </AlertTitle>
                      <AlertDescription className="space-y-1">
                        <p className="text-sm">
                          {(validateMappings.data as any).mapping_count} active mappings,{" "}
                          {(validateMappings.data as any).has_item_ids} with QBO Item IDs,{" "}
                          {(validateMappings.data as any).missing_item_ids} missing IDs
                        </p>
                        {(validateMappings.data as any).warnings?.map((w: string, i: number) => (
                          <p key={i} className="text-xs text-destructive">{w}</p>
                        ))}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Fetched QBO Items */}
                  {fetchQboItems.data && (
                    <Alert>
                      <Settings2 className="h-4 w-4" />
                      <AlertTitle>Available QBO Items</AlertTitle>
                      <AlertDescription className="text-xs max-h-32 overflow-y-auto">
                        {((fetchQboItems.data as any).items || []).map((item: any) => (
                          <span key={item.Id} className="inline-block mr-2 mb-1 bg-muted px-2 py-0.5 rounded text-xs">
                            {item.Name} (ID: {item.Id})
                          </span>
                        ))}
                        {(fetchQboItems.data as any).error && (
                          <p className="text-destructive">{(fetchQboItems.data as any).error}</p>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}

                  {mappingsLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Line Item Type</TableHead>
                          <TableHead>QBO Service Item</TableHead>
                          <TableHead>Item ID</TableHead>
                          <TableHead>Income Account</TableHead>
                          <TableHead>Expense Account</TableHead>
                          <TableHead className="w-16">Active</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mappings.map((m) => (
                          <MappingRow key={m.id} mapping={m} onUpdate={updateMapping.mutate} />
                        ))}
                        {mappings.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                              Connect QuickBooks to configure line item mappings
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

function MappingRow({ mapping, onUpdate }: { mapping: QboItemMapping; onUpdate: (m: any) => void }) {
  const hasId = !!mapping.qbo_service_item_id;
  return (
    <TableRow className={!hasId && mapping.qbo_service_item_name ? "bg-destructive/5" : ""}>
      <TableCell className="font-medium text-sm">
        {LINE_ITEM_LABELS[mapping.line_item_type] || mapping.line_item_type}
      </TableCell>
      <TableCell>
        <Input
          className="h-8 text-xs"
          value={mapping.qbo_service_item_name || ""}
          onChange={(e) => onUpdate({ id: mapping.id, qbo_service_item_name: e.target.value })}
          placeholder="Service item name"
        />
      </TableCell>
      <TableCell>
        <Input
          className={`h-8 text-xs font-mono ${!hasId ? "border-destructive/50" : ""}`}
          value={mapping.qbo_service_item_id || ""}
          onChange={(e) => onUpdate({ id: mapping.id, qbo_service_item_id: e.target.value })}
          placeholder="QBO ID"
        />
      </TableCell>
      <TableCell>
        <Input
          className="h-8 text-xs"
          value={mapping.qbo_income_account_name || ""}
          onChange={(e) => onUpdate({ id: mapping.id, qbo_income_account_name: e.target.value })}
          placeholder="Income account"
        />
      </TableCell>
      <TableCell>
        <Input
          className="h-8 text-xs"
          value={mapping.qbo_expense_account_name || ""}
          onChange={(e) => onUpdate({ id: mapping.id, qbo_expense_account_name: e.target.value })}
          placeholder="Expense account"
        />
      </TableCell>
      <TableCell>
        <Switch
          checked={mapping.is_active}
          onCheckedChange={(v) => onUpdate({ id: mapping.id, is_active: v })}
        />
      </TableCell>
    </TableRow>
  );
}
