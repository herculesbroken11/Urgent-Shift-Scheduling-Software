import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  FileText, AlertTriangle, Ban, Send, RefreshCw, CheckCircle2,
  ShieldCheck, Clock, ArrowRight, Info,
} from "lucide-react";

interface StepProps {
  number: number;
  title: string;
  children: React.ReactNode;
}

function Step({ number, title, children }: StepProps) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {number}
      </div>
      <div className="flex-1 space-y-2 pb-6">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <div className="text-sm leading-relaxed text-muted-foreground space-y-2">{children}</div>
      </div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div>{children}</div>
    </div>
  );
}

function WarningBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-foreground">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div>{children}</div>
    </div>
  );
}

export default function PlatformRunbook() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Platform Billing Runbook</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Step-by-step operator guide for the monthly billing cycle in Platform Settings.
        </p>
      </div>

      {/* Section 1: Generate */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-primary" />
            1. Generate Monthly Platform Invoices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <Step number={1} title="Navigate to Platform Settings">
            <p>Open the <strong>Platform Console</strong> {">"} <strong>Settings</strong> tab. The <em>Platform Invoicing</em> section is in the lower half of the page.</p>
          </Step>
          <Step number={2} title="Select the billing month">
            <p>Use the billing month picker (format: <code>YYYY-MM</code>). This determines which appointments and billing configs are included.</p>
          </Step>
          <Step number={3} title='Click "Generate Invoices"'>
            <p>The system creates one <Badge variant="secondary">Draft</Badge> invoice per agency that has an active billing config for that month. Each invoice includes:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>Base fee from the billing config</li>
              <li>Per-appointment fees based on usage log entries</li>
              <li>Overage charges if usage exceeds the included tier</li>
              <li>A config snapshot for auditability</li>
            </ul>
          </Step>
          <Tip>
            If an agency has no active billing config, no invoice is created. Check <strong>Agency Detail</strong> {">"} <strong>Billing</strong> to verify config exists.
          </Tip>
        </CardContent>
      </Card>

      {/* Section 2: Orphan / Incomplete */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            2. Spot &amp; Remediate Orphan / Incomplete Invoices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <Step number={1} title="Identify incomplete invoices">
            <p>After generation, review the invoice list for red flags:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li><strong>Total = $0.00</strong> &mdash; agency had no billable activity and no base fee</li>
              <li><strong>Missing config snapshot</strong> &mdash; the billing config was deleted after generation</li>
              <li><strong>No line items</strong> &mdash; generation ran but usage data was absent</li>
            </ul>
          </Step>
          <Step number={2} title="Remediate">
            <p>For each problematic invoice:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>If total is legitimately $0, <strong>Void</strong> the invoice</li>
              <li>If data was missing, fix the billing config or usage data, then <strong>Void</strong> the bad invoice and <strong>re-generate</strong></li>
              <li>If the invoice is a duplicate, <strong>Void</strong> the newer one</li>
            </ul>
          </Step>
          <WarningBox>
            The pre-flight validation (dry run) flags these issues <em>before</em> you issue. Always run bulk issue with the confirmation modal to catch warnings first.
          </WarningBox>
        </CardContent>
      </Card>

      {/* Section 3: Void vs Delete */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Ban className="h-5 w-5 text-destructive" />
            3. When to Void vs Delete
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border p-4 space-y-2">
              <h4 className="font-semibold text-foreground flex items-center gap-2">
                <Badge variant="destructive">Void</Badge> (preferred)
              </h4>
              <ul className="ml-4 list-disc text-sm text-muted-foreground space-y-1">
                <li>Keeps the invoice record for audit trail</li>
                <li>Status moves to <Badge variant="destructive">Void</Badge></li>
                <li>Use for: duplicates, incorrect amounts, agency disputes, test invoices</li>
                <li>If synced to QBO, the QBO invoice should also be voided manually</li>
              </ul>
            </div>
            <div className="rounded-md border p-4 space-y-2">
              <h4 className="font-semibold text-foreground flex items-center gap-2">
                <Badge variant="outline">Delete</Badge> (rare)
              </h4>
              <ul className="ml-4 list-disc text-sm text-muted-foreground space-y-1">
                <li>Permanently removes the record &mdash; <strong>no undo</strong></li>
                <li>Only use for invoices that were never issued or synced</li>
                <li>Not available for issued, synced, or paid invoices</li>
                <li>Deletion is logged in the platform audit log</li>
              </ul>
            </div>
          </div>
          <Tip>
            <strong>Rule of thumb:</strong> If anyone outside the platform team might have seen the invoice (e.g., it was issued or synced to QBO), always void &mdash; never delete.
          </Tip>
        </CardContent>
      </Card>

      {/* Section 4: Issue Invoices */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Send className="h-5 w-5 text-primary" />
            4. Issue Invoices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <Step number={1} title="Single invoice">
            <p>Click the <strong>Issue</strong> button on any <Badge variant="secondary">Draft</Badge> invoice row. This sets the issued date and transitions the status to <Badge variant="outline">Issued</Badge>.</p>
          </Step>
          <Step number={2} title="Bulk issue">
            <p>Use the <strong>Bulk Issue Drafts</strong> button in the Bulk Actions card:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>A dry-run pre-flight check runs automatically</li>
              <li>The confirmation modal shows total eligible invoices and any warnings (missing snapshots, $0 totals, no line items)</li>
              <li>Review warnings &mdash; invoices with warnings are still processed but flagged</li>
              <li>Click <strong>Confirm</strong> to issue all drafts for the selected month</li>
            </ul>
          </Step>
          <Step number={3} title="Review results">
            <p>The result dialog shows processed / succeeded / failed counts, execution time, and remaining draft count. Failed invoices include the specific error reason.</p>
          </Step>
        </CardContent>
      </Card>

      {/* Section 5: Bulk Sync to QBO */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <RefreshCw className="h-5 w-5 text-primary" />
            5. Bulk Sync Invoices to QuickBooks
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <Step number={1} title="Verify QBO connection">
            <p>Check the <strong>QuickBooks Connection</strong> card at the top of Platform Settings. Status must be <Badge variant="default">Connected</Badge>.</p>
          </Step>
          <Step number={2} title='Click "Bulk Sync to QBO"'>
            <p>The pre-flight check verifies:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>QBO connection is active</li>
              <li>Each invoice has at least one line item</li>
              <li>Invoices are in <Badge variant="outline">Issued</Badge> status</li>
            </ul>
          </Step>
          <Step number={3} title="Confirm and monitor">
            <p>The sync processes invoices sequentially with a rate-limit delay between calls. If a QBO API call fails, it retries up to 3 times with exponential backoff (500ms, 1000ms, 1500ms). Failures do not block remaining invoices.</p>
          </Step>
          <Tip>
            Synced invoices move to <Badge variant="default">Synced</Badge> status and store the QBO invoice ID for cross-referencing.
          </Tip>
        </CardContent>
      </Card>

      {/* Section 6: Verify Sync */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            6. Verify Sync Success
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <Step number={1} title="Check the result summary">
            <p>After bulk sync, the result dialog shows success/failure counts and remaining issued invoices. All processed invoices should now show <Badge variant="default">Synced</Badge>.</p>
          </Step>
          <Step number={2} title="Verify in QBO">
            <p>Open QuickBooks Online and confirm:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>Invoice numbers match between the platform and QBO</li>
              <li>Line item descriptions and amounts are correct</li>
              <li>Customer names are correctly mapped</li>
            </ul>
          </Step>
          <Step number={3} title="Check the audit log">
            <p>Navigate to <strong>Platform Console</strong> {">"} <strong>Audit Log</strong> to review the <code>bulk-sync</code> entries. Each entry includes the billing month, processed count, and failure details.</p>
          </Step>
        </CardContent>
      </Card>

      {/* Section 7: Handle Failures */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            7. Handle Failures &amp; Pre-flight Warnings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">Pre-flight warnings (before execution)</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-4 text-left font-medium text-foreground">Warning</th>
                  <th className="py-2 text-left font-medium text-foreground">Action</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2 pr-4">Missing config snapshot</td>
                  <td className="py-2">Void invoice, fix billing config, regenerate</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4">Missing generation details</td>
                  <td className="py-2">Void invoice and regenerate &mdash; details are set at generation time</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4">No line items</td>
                  <td className="py-2">Check if agency had billable activity; void if not</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4">Total = $0</td>
                  <td className="py-2">If expected (free tier), proceed. Otherwise void and investigate.</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4">QBO connection missing</td>
                  <td className="py-2">Connect QBO in Platform Settings before syncing</td>
                </tr>
              </tbody>
            </table>
          </div>

          <Separator className="my-4" />

          <h4 className="text-sm font-semibold text-foreground">Sync errors (during execution)</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-4 text-left font-medium text-foreground">Error</th>
                  <th className="py-2 text-left font-medium text-foreground">Resolution</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2 pr-4">401 / Token expired</td>
                  <td className="py-2">Reconnect QBO (disconnect and re-authorize)</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4">429 / Rate limit</td>
                  <td className="py-2">Automatic retry with backoff; wait and re-run if all retries fail</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4">Customer not found in QBO</td>
                  <td className="py-2">The system auto-creates QBO customers; check agency QBO customer mapping</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4">Duplicate invoice number</td>
                  <td className="py-2">Invoice was already synced &mdash; check QBO for existing record</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4">Concurrency lock</td>
                  <td className="py-2">Another bulk action is running for this month; wait 10 minutes and retry</td>
                </tr>
              </tbody>
            </table>
          </div>

          <WarningBox>
            Failed invoices remain in their current status. Fix the underlying issue, then re-run the bulk action &mdash; only unsynced invoices will be processed (idempotent).
          </WarningBox>
        </CardContent>
      </Card>

      {/* Section 8: Duplicate Prevention */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-primary" />
            8. Confirm Duplicate Prevention &amp; Status Integrity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <Step number={1} title="Invoice number uniqueness">
            <p>Each invoice number includes the agency slug and billing month (e.g., <code>PLAT-acme-2026-03</code>). The system prevents generating a second invoice for the same agency + month combination.</p>
          </Step>
          <Step number={2} title="Concurrency locks">
            <p>Bulk operations acquire a lock for the billing month. If a second operator tries to run the same action within 10 minutes, they receive a clear error. No duplicate processing occurs.</p>
          </Step>
          <Step number={3} title="Status transitions">
            <p>Invoices follow a strict lifecycle:</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge variant="secondary">Draft</Badge>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <Badge variant="outline">Issued</Badge>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <Badge variant="default">Synced</Badge>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <Badge variant="default">Paid</Badge>
            </div>
            <p className="mt-2">Any status can transition to <Badge variant="destructive">Void</Badge>. Once voided, no further transitions are possible.</p>
          </Step>
          <Step number={4} title="Audit trail">
            <p>Every status change, bulk action, and sync result is logged to the <strong>Platform Audit Log</strong> with the actor, timestamp, and details. Review this to confirm no unintended changes occurred.</p>
          </Step>
        </CardContent>
      </Card>

      {/* Quick Reference */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Monthly Billing Checklist
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="ml-4 list-decimal space-y-2 text-sm text-muted-foreground">
            <li>Verify all agencies have active billing configs</li>
            <li>Generate invoices for the billing month</li>
            <li>Review generated invoices &mdash; void any with $0 or missing data</li>
            <li>Bulk issue all remaining drafts (review pre-flight warnings)</li>
            <li>Verify QBO connection is active</li>
            <li>Bulk sync issued invoices to QBO</li>
            <li>Review sync result summary &mdash; address any failures</li>
            <li>Spot-check 2&ndash;3 invoices in QBO for accuracy</li>
            <li>Review audit log for the month to confirm clean run</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
