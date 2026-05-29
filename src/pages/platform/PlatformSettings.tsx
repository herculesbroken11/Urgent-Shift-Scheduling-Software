import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Link2, Unlink, CheckCircle2, XCircle, AlertTriangle, Loader2,
  Cloud, FileText, Upload, RefreshCw, ChevronRight, Send, Ban, DollarSign, ShieldCheck,
  ListChecks, Zap,
} from "lucide-react";
import { usePlatformQbo, PlatformInvoice } from "@/hooks/usePlatformQbo";
import { format } from "date-fns";

const STATUS_CONFIG: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  draft: { variant: "secondary", label: "Draft" },
  issued: { variant: "outline", label: "Issued" },
  synced: { variant: "default", label: "Synced" },
  paid: { variant: "default", label: "Paid" },
  void: { variant: "destructive", label: "Void" },
};

const NEXT_ACTIONS: Record<string, { status: string; label: string; icon: any; variant: "default" | "secondary" | "destructive" | "outline" }[]> = {
  draft: [
    { status: "issued", label: "Issue", icon: Send, variant: "default" },
    { status: "void", label: "Void", icon: Ban, variant: "destructive" },
  ],
  issued: [
    { status: "paid", label: "Mark Paid", icon: DollarSign, variant: "default" },
    { status: "void", label: "Void", icon: Ban, variant: "destructive" },
  ],
  synced: [
    { status: "paid", label: "Mark Paid", icon: DollarSign, variant: "default" },
    { status: "void", label: "Void", icon: Ban, variant: "destructive" },
  ],
  paid: [
    { status: "void", label: "Void", icon: Ban, variant: "destructive" },
  ],
  void: [],
};

function ConnectionStatusBadge({ status }: { status: string }) {
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

function isOrphanInvoice(invoice: PlatformInvoice): string[] {
  const issues: string[] = [];
  if (!invoice.config_snapshot) issues.push("Missing config snapshot");
  if (!invoice.generation_details) issues.push("Missing generation details");
  if (!invoice.config_id) issues.push("Missing config ID");
  if (Number(invoice.total) === 0) issues.push("Zero total");
  if (!invoice.line_items || invoice.line_items.length === 0) issues.push("No line items");
  return issues;
}

function InvoiceDetailDialog({
  invoice,
  open,
  onOpenChange,
  isConnected,
  onSync,
  onStatusChange,
  onDelete,
  isSyncing,
  isUpdating,
  isDeleting,
}: {
  invoice: PlatformInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isConnected: boolean;
  onSync: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  isSyncing: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
}) {
  if (!invoice) return null;

  const config = invoice.config_snapshot;
  const gen = invoice.generation_details;
  const actions = NEXT_ACTIONS[invoice.status] || [];
  const statusCfg = STATUS_CONFIG[invoice.status] || STATUS_CONFIG.draft;
  const orphanIssues = isOrphanInvoice(invoice);
  const canDelete = ["draft", "void"].includes(invoice.status) && !invoice.qbo_invoice_id;
  const fmt = (n: number) => `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Invoice {invoice.invoice_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Orphan warning */}
          {orphanIssues.length > 0 && invoice.status !== "void" && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-destructive">Incomplete Invoice</p>
                <ul className="text-xs text-destructive/80 mt-1 list-disc list-inside">
                  {orphanIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Void or delete this invoice, then regenerate for this billing month.
                </p>
              </div>
            </div>
          )}

          {/* Header info */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <span className="text-muted-foreground">Agency</span>
            <span className="font-medium">{invoice.agencies?.name || "—"}</span>
            <span className="text-muted-foreground">Billing Month</span>
            <span className="font-medium">{invoice.billing_month}</span>
            <span className="text-muted-foreground">Status</span>
            <Badge variant={statusCfg.variant} className="w-fit">{statusCfg.label}</Badge>
            <span className="text-muted-foreground">Total</span>
            <span className="font-bold text-lg">{fmt(invoice.total)}</span>
            <span className="text-muted-foreground">Issued</span>
            <span>{invoice.issued_date || "—"}</span>
            <span className="text-muted-foreground">Due</span>
            <span>{invoice.due_date || "—"}</span>
            {invoice.qbo_invoice_id && (
              <>
                <span className="text-muted-foreground">QBO Invoice ID</span>
                <Badge variant="outline" className="w-fit gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {invoice.qbo_invoice_id}
                </Badge>
              </>
            )}
            {invoice.qbo_last_synced_at && (
              <>
                <span className="text-muted-foreground">Last Synced</span>
                <span className="text-xs">{new Date(invoice.qbo_last_synced_at).toLocaleString()}</span>
              </>
            )}
          </div>

          <Separator />

          {/* Config traceability */}
          {config && (
            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> Billing Config Used
              </h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
                <span className="text-muted-foreground">Config ID</span>
                <span className="font-mono">{config.config_id?.slice(0, 8)}…</span>
                <span className="text-muted-foreground">Model</span>
                <span className="capitalize">{(config.billing_model || "").replace(/_/g, " ")}</span>
                {config.plan_name && (
                  <>
                    <span className="text-muted-foreground">Plan</span>
                    <span>{config.plan_name}</span>
                  </>
                )}
                <span className="text-muted-foreground">Effective</span>
                <span>
                  {config.effective_start_date || "—"} → {config.effective_end_date || "Open-ended"}
                </span>
                <span className="text-muted-foreground">Base Fee</span>
                <span>{fmt(config.monthly_base_fee || 0)}</span>
                <span className="text-muted-foreground">Per Appointment</span>
                <span>{fmt(config.per_appointment_fee || 0)}</span>
                {config.included_appointments > 0 && (
                  <>
                    <span className="text-muted-foreground">Included</span>
                    <span>{config.included_appointments}/mo</span>
                    <span className="text-muted-foreground">Overage Rate</span>
                    <span>{fmt(config.overage_rate || 0)}</span>
                  </>
                )}
                {config.min_monthly_fee > 0 && (
                  <>
                    <span className="text-muted-foreground">Min Monthly</span>
                    <span>{fmt(config.min_monthly_fee)}</span>
                  </>
                )}
                {config.max_monthly_fee > 0 && (
                  <>
                    <span className="text-muted-foreground">Max Monthly</span>
                    <span>{fmt(config.max_monthly_fee)}</span>
                  </>
                )}
                <span className="text-muted-foreground">Trigger</span>
                <span className="capitalize">{config.usage_billing_trigger || "completed"}</span>
              </div>
            </div>
          )}

          {/* Generation details */}
          {gen && (
            <div className="rounded-md border border-border bg-muted/10 p-3 space-y-1">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Generation Details</h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
                <span className="text-muted-foreground">Usage Count</span>
                <span>{gen.usage_count}</span>
                <span className="text-muted-foreground">Raw Total</span>
                <span>{fmt(gen.raw_total || 0)}</span>
                {gen.cap_applied && (
                  <>
                    <span className="text-muted-foreground">Cap Applied</span>
                    <Badge variant="outline" className="text-xs w-fit capitalize">
                      {gen.cap_applied.replace(/_/g, " ")}
                    </Badge>
                  </>
                )}
                <span className="text-muted-foreground">Final Total</span>
                <span className="font-semibold">{fmt(gen.final_total || 0)}</span>
                <span className="text-muted-foreground">Generated</span>
                <span className="text-xs">{gen.generated_at ? new Date(gen.generated_at).toLocaleString() : "—"}</span>
              </div>
            </div>
          )}

          <Separator />

          {/* Line items */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Line Items</h4>
            {invoice.line_items && invoice.line_items.length > 0 ? (
              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoice.line_items.map((li: any) => (
                      <TableRow key={li.id}>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {(li.line_type || "").replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs max-w-56">{li.description}</TableCell>
                        <TableCell className="text-right text-xs">{li.quantity}</TableCell>
                        <TableCell className="text-right text-xs">{fmt(li.unit_price)}</TableCell>
                        <TableCell className="text-right font-medium text-xs">{fmt(li.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No line items</p>
            )}
          </div>

          <Separator />

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {actions.map((act) => (
              <Button
                key={act.status}
                variant={act.variant}
                size="sm"
                disabled={isUpdating}
                onClick={() => onStatusChange(invoice.id, act.status)}
              >
                {isUpdating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <act.icon className="h-3 w-3 mr-1" />}
                {act.label}
              </Button>
            ))}
            {isConnected && invoice.status !== "void" && (
              <Button
                variant="outline"
                size="sm"
                disabled={isSyncing}
                onClick={() => onSync(invoice.id)}
              >
                {isSyncing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                {invoice.qbo_invoice_id ? "Re-sync to QBO" : "Sync to QBO"}
              </Button>
            )}
            {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={isDeleting} className="text-destructive border-destructive/30 hover:bg-destructive/10">
                    {isDeleting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <XCircle className="h-3 w-3 mr-1" />}
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Invoice {invoice.invoice_number}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove this invoice and its line items. This cannot be undone.
                      You can regenerate invoices for this billing month afterward.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onDelete(invoice.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete Invoice
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface PreflightWarning {
  invoice_number: string;
  invoice_id: string;
  issues: string[];
}

interface BulkResult {
  processed: number;
  succeeded: number;
  failed: number;
  failures: { invoice_number: string; error: string }[];
  warnings?: PreflightWarning[];
  remaining_draft?: number;
  remaining_issued?: number;
  elapsed_ms?: number;
  message?: string;
  dry_run?: boolean;
  total?: number;
  eligible?: number;
  blocked?: number;
}

export default function PlatformSettings() {
  const {
    connection, isLoading, initiateOAuth, disconnect,
    invoices, invoicesLoading, generateInvoices, syncInvoice,
    syncLog, syncLogLoading,
    getInvoiceDetail, updateInvoiceStatus, deleteInvoice,
    bulkIssue, bulkSync,
  } = usePlatformQbo();

  const [billingMonth, setBillingMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [selectedInvoice, setSelectedInvoice] = useState<PlatformInvoice | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [bulkIssueConfirmOpen, setBulkIssueConfirmOpen] = useState(false);
  const [bulkSyncConfirmOpen, setBulkSyncConfirmOpen] = useState(false);
  const [bulkResultOpen, setBulkResultOpen] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const [bulkResultAction, setBulkResultAction] = useState<string>("");
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const [preflightResult, setPreflightResult] = useState<BulkResult | null>(null);
  const [preflightAction, setPreflightAction] = useState<string>("");

  const status = connection?.connection_status || "disconnected";
  const isConnected = status === "connected";

  const openInvoiceDetail = async (inv: PlatformInvoice) => {
    setSelectedInvoice(inv);
    setDetailOpen(true);
    // Load full detail with line items
    try {
      const detail = await getInvoiceDetail.mutateAsync(inv.id);
      setSelectedInvoice(detail);
    } catch {
      // Keep the list-level data
    }
  };

  const handleStatusChange = async (invoiceId: string, newStatus: string) => {
    await updateInvoiceStatus.mutateAsync({ invoice_id: invoiceId, new_status: newStatus });
    // Refresh detail
    try {
      const detail = await getInvoiceDetail.mutateAsync(invoiceId);
      setSelectedInvoice(detail);
    } catch {
      setDetailOpen(false);
    }
  };

  const handleSync = async (invoiceId: string) => {
    await syncInvoice.mutateAsync(invoiceId);
    try {
      const detail = await getInvoiceDetail.mutateAsync(invoiceId);
      setSelectedInvoice(detail);
    } catch {
      setDetailOpen(false);
    }
  };

  const draftCount = invoices.filter(i => i.billing_month === billingMonth && i.status === "draft").length;
  const issuedCount = invoices.filter(i => i.billing_month === billingMonth && i.status === "issued").length;

  const runDryRun = async (action: "issue" | "sync") => {
    try {
      const mutation = action === "issue" ? bulkIssue : bulkSync;
      const result = await mutation.mutateAsync({ billing_month: billingMonth, dry_run: true });
      setPreflightResult(result);
      setPreflightAction(action === "issue" ? "Issue" : "Sync");
      if (action === "issue") setBulkIssueConfirmOpen(true);
      else setBulkSyncConfirmOpen(true);
    } catch { /* handled */ }
  };

  const handleBulkIssue = async () => {
    setBulkIssueConfirmOpen(false);
    setPreflightResult(null);
    setBulkProgress(`Processing 0 of ${draftCount}…`);
    try {
      const result = await bulkIssue.mutateAsync({ billing_month: billingMonth });
      setBulkProgress(null);
      setBulkResult(result);
      setBulkResultAction("Issue");
      setBulkResultOpen(true);
    } catch {
      setBulkProgress(null);
    }
  };

  const handleBulkSync = async () => {
    setBulkSyncConfirmOpen(false);
    setPreflightResult(null);
    setBulkProgress(`Processing 0 of ${issuedCount}…`);
    try {
      const result = await bulkSync.mutateAsync({ billing_month: billingMonth });
      setBulkProgress(null);
      setBulkResult(result);
      setBulkResultAction("Sync");
      setBulkResultOpen(true);
    } catch {
      setBulkProgress(null);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Platform Settings</h1>

      {/* QuickBooks Connection Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Platform QuickBooks Online</CardTitle>
                <CardDescription>
                  {isConnected
                    ? `Connected to ${connection?.company_name || "QuickBooks"}`
                    : "BlueThread's own QuickBooks connection for invoicing agencies"}
                </CardDescription>
              </div>
            </div>
            {!isLoading && <ConnectionStatusBadge status={status} />}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {isConnected && (
                <>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Company:</span>
                      <p className="font-medium">{connection?.company_name}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Last Synced:</span>
                      <p className="font-medium">
                        {connection?.last_sync_at
                          ? new Date(connection.last_sync_at).toLocaleString()
                          : "Never"}
                      </p>
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              <div className="flex gap-2 flex-wrap">
                {!isConnected && (
                  <Button onClick={() => initiateOAuth.mutate()} disabled={initiateOAuth.isPending}>
                    {initiateOAuth.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
                    Connect Platform QuickBooks
                  </Button>
                )}
                {isConnected && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={disconnect.isPending}>
                        {disconnect.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Unlink className="h-3 w-3 mr-1" />}
                        Disconnect
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect Platform QuickBooks?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will clear stored tokens and stop platform invoice syncing.
                          Previously synced data in QuickBooks will not be affected.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => disconnect.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Disconnect
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Invoice Generation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Platform Invoice Generation</CardTitle>
          <CardDescription>Generate monthly invoices for all active agencies with billing config. Duplicates for the same agency + month are automatically prevented.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Billing Month</label>
              <Input
                type="month"
                value={billingMonth}
                onChange={(e) => setBillingMonth(e.target.value)}
                className="w-48"
              />
            </div>
            <Button
              onClick={() => generateInvoices.mutate(billingMonth)}
              disabled={generateInvoices.isPending}
            >
              {generateInvoices.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
              Generate Invoices
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5" /> Bulk Actions</CardTitle>
          <CardDescription>Issue or sync all invoices for the selected billing month in one click</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="outline" className="text-sm py-1 px-3">{billingMonth}</Badge>

            <Button
              variant="outline"
              disabled={bulkIssue.isPending || draftCount === 0}
              onClick={() => runDryRun("issue")}
            >
              {bulkIssue.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ListChecks className="h-4 w-4 mr-2" />}
              Issue All Drafts ({draftCount})
            </Button>

            <Button
              variant="outline"
              disabled={bulkSync.isPending || issuedCount === 0 || !isConnected}
              onClick={() => runDryRun("sync")}
            >
              {bulkSync.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Sync All Issued to QBO ({issuedCount})
            </Button>

            {!isConnected && issuedCount > 0 && (
              <span className="text-xs text-muted-foreground">Connect QuickBooks to enable sync</span>
            )}
          </div>

          {/* Progress indicator */}
          {bulkProgress && (
            <div className="flex items-center gap-2 mt-3 p-2 rounded-md border bg-muted/30">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium">{bulkProgress}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Issue Confirmation with Pre-flight */}
      <AlertDialog open={bulkIssueConfirmOpen} onOpenChange={(open) => { if (!open) { setBulkIssueConfirmOpen(false); setPreflightResult(null); } }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Issue All Draft Invoices?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will change {draftCount} draft invoice{draftCount !== 1 ? "s" : ""} for <strong>{billingMonth}</strong> to "Issued" status.
                  Each invoice will receive today's date as the issued date. Failures will not block remaining invoices.
                </p>
                {preflightResult && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Eligible: <strong>{preflightResult.eligible}</strong></span>
                      {(preflightResult.warnings?.length || 0) > 0 && (
                        <span className="flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 text-yellow-500" /> Warnings: <strong>{preflightResult.warnings?.length}</strong></span>
                      )}
                    </div>
                    {preflightResult.warnings && preflightResult.warnings.length > 0 && (
                      <div className="rounded-md border border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-950/20 max-h-32 overflow-y-auto">
                        {preflightResult.warnings.map((w, i) => (
                          <div key={i} className="flex items-start gap-2 p-2 text-xs border-b border-yellow-200/50 last:border-0">
                            <AlertTriangle className="h-3 w-3 text-yellow-500 mt-0.5 shrink-0" />
                            <div>
                              <span className="font-mono font-medium">{w.invoice_number}</span>
                              <p className="text-muted-foreground">{w.issues.join(", ")}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkIssue}>
              Issue {preflightResult?.eligible ?? draftCount} Invoice{(preflightResult?.eligible ?? draftCount) !== 1 ? "s" : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Sync Confirmation with Pre-flight */}
      <AlertDialog open={bulkSyncConfirmOpen} onOpenChange={(open) => { if (!open) { setBulkSyncConfirmOpen(false); setPreflightResult(null); } }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Sync All Issued Invoices to QuickBooks?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will sync {issuedCount} issued invoice{issuedCount !== 1 ? "s" : ""} for <strong>{billingMonth}</strong> to QuickBooks Online.
                  Each will be created as a QBO Invoice and marked "Synced". Failures will not block remaining invoices.
                </p>
                {preflightResult && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Eligible: <strong>{preflightResult.eligible}</strong></span>
                      {(preflightResult.blocked || 0) > 0 && (
                        <span className="flex items-center gap-1"><XCircle className="h-3.5 w-3.5 text-destructive" /> Blocked: <strong>{preflightResult.blocked}</strong></span>
                      )}
                    </div>
                    {preflightResult.warnings && preflightResult.warnings.length > 0 && (
                      <div className="rounded-md border border-destructive/20 bg-destructive/5 max-h-32 overflow-y-auto">
                        {preflightResult.warnings.map((w, i) => (
                          <div key={i} className="flex items-start gap-2 p-2 text-xs border-b border-destructive/10 last:border-0">
                            <XCircle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
                            <div>
                              <span className="font-mono font-medium">{w.invoice_number}</span>
                              <p className="text-muted-foreground">{w.issues.join(", ")}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkSync} disabled={(preflightResult?.eligible ?? issuedCount) === 0}>
              Sync {preflightResult?.eligible ?? issuedCount} Invoice{(preflightResult?.eligible ?? issuedCount) !== 1 ? "s" : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Result Dialog */}
      <Dialog open={bulkResultOpen} onOpenChange={setBulkResultOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {bulkResult && bulkResult.failed === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
              )}
              Bulk {bulkResultAction} Results
            </DialogTitle>
            <DialogDescription>Summary for {billingMonth}</DialogDescription>
          </DialogHeader>
          {bulkResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-md border p-3">
                  <p className="text-2xl font-bold">{bulkResult.processed}</p>
                  <p className="text-xs text-muted-foreground">Processed</p>
                </div>
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                  <p className="text-2xl font-bold text-primary">{bulkResult.succeeded}</p>
                  <p className="text-xs text-muted-foreground">Succeeded</p>
                </div>
                <div className={`rounded-md border p-3 ${bulkResult.failed > 0 ? "border-destructive/30 bg-destructive/5" : ""}`}>
                  <p className={`text-2xl font-bold ${bulkResult.failed > 0 ? "text-destructive" : ""}`}>{bulkResult.failed}</p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </div>

              {/* Remaining counts + elapsed time */}
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <div className="flex gap-3">
                  {bulkResult.remaining_draft !== undefined && (
                    <span>Still draft: <strong>{bulkResult.remaining_draft}</strong></span>
                  )}
                  {bulkResult.remaining_issued !== undefined && (
                    <span>Still issued: <strong>{bulkResult.remaining_issued}</strong></span>
                  )}
                </div>
                {bulkResult.elapsed_ms !== undefined && (
                  <span>{bulkResult.elapsed_ms}ms</span>
                )}
              </div>

              {bulkResult.message && (
                <p className="text-sm text-muted-foreground text-center">{bulkResult.message}</p>
              )}

              {/* Warnings */}
              {bulkResult.warnings && bulkResult.warnings.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">Pre-flight Warnings ({bulkResult.warnings.length})</h4>
                  <div className="rounded-md border border-yellow-200 dark:border-yellow-800 max-h-28 overflow-y-auto">
                    {bulkResult.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 text-xs border-b border-yellow-200/50 last:border-0">
                        <AlertTriangle className="h-3 w-3 text-yellow-500 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-mono font-medium">{w.invoice_number}</span>
                          <p className="text-muted-foreground">{w.issues.join(", ")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {bulkResult.failures.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-destructive">Failures ({bulkResult.failures.length})</h4>
                  <div className="rounded-md border border-destructive/20 max-h-32 overflow-y-auto">
                    {bulkResult.failures.map((f, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 text-xs border-b border-destructive/10 last:border-0">
                        <XCircle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
                        <div>
                          <span className="font-mono font-medium">{f.invoice_number}</span>
                          <p className="text-muted-foreground">{f.error}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setBulkResultOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoices List */}
      <Card>
        <CardHeader>
          <CardTitle>Platform Invoices</CardTitle>
          <CardDescription>Click an invoice to view details, line items, and manage status</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {invoicesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Agency</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>QBO</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => {
                  const sCfg = STATUS_CONFIG[inv.status] || STATUS_CONFIG.draft;
                  return (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openInvoiceDetail(inv)}
                    >
                      <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                      <TableCell>{inv.agencies?.name || "—"}</TableCell>
                      <TableCell>{inv.billing_month}</TableCell>
                      <TableCell className="text-right font-medium">
                        {Number(inv.total) === 0 && !inv.config_snapshot && inv.status !== "void" ? (
                          <span className="flex items-center justify-end gap-1 text-destructive">
                            <AlertTriangle className="h-3 w-3" />
                            $0.00
                          </span>
                        ) : `$${Number(inv.total).toFixed(2)}`}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge variant={sCfg.variant} className="capitalize text-xs">
                            {sCfg.label}
                          </Badge>
                          {!inv.config_snapshot && inv.status !== "void" && (
                            <span title="Orphan invoice — missing traceability"><AlertTriangle className="h-3 w-3 text-destructive" /></span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {inv.qbo_invoice_id ? (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <CheckCircle2 className="h-3 w-3" />
                            {inv.qbo_invoice_id}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {invoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No invoices generated yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Sync Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5" /> Platform QBO Sync Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {syncLogLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>QBO ID</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncLog.map((entry: any) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-sm">{new Date(entry.created_at).toLocaleString()}</TableCell>
                    <TableCell className="capitalize">{entry.entity_type}</TableCell>
                    <TableCell className="capitalize">{entry.action}</TableCell>
                    <TableCell>
                      <Badge variant={entry.status === "success" ? "default" : entry.status === "failed" ? "destructive" : "secondary"}>
                        {entry.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{entry.qbo_entity_id || "—"}</TableCell>
                    <TableCell className="text-sm text-destructive max-w-48 truncate">{entry.error_details || "—"}</TableCell>
                  </TableRow>
                ))}
                {syncLog.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No sync activity yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Invoice Detail Dialog */}
      <InvoiceDetailDialog
        invoice={selectedInvoice}
        open={detailOpen}
        onOpenChange={(open) => { if (!open) setDetailOpen(false); }}
        isConnected={isConnected}
        onSync={handleSync}
        onStatusChange={handleStatusChange}
        onDelete={async (id) => {
          await deleteInvoice.mutateAsync(id);
          setDetailOpen(false);
          setSelectedInvoice(null);
        }}
        isSyncing={syncInvoice.isPending}
        isUpdating={updateInvoiceStatus.isPending}
        isDeleting={deleteInvoice.isPending}
      />
    </div>
  );
}
