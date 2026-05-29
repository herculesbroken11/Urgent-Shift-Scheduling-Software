import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Plus, ChevronDown, Send, Trash2, Layers, Calculator } from "lucide-react";
import { useInvoices, useInvoiceLineItems, useInvoiceMutations } from "@/hooks/useBillingData";
import { BillingBreakdownView } from "@/components/billing/BillingBreakdownView";
import type { BillingBreakdown } from "@/lib/billing-engine";
import { useCustomers } from "@/hooks/useAgencyData";
import { useAgencySettings } from "@/hooks/useAgencySettings";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from "date-fns";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary/10 text-primary",
  paid: "bg-accent/10 text-accent-foreground",
  overdue: "bg-destructive/10 text-destructive",
  cancelled: "bg-destructive/10 text-destructive",
};

function InvoiceLineItems({ invoiceId }: { invoiceId: string }) {
  const { data: items = [], isLoading } = useInvoiceLineItems(invoiceId);
  if (isLoading) return <p className="text-sm text-muted-foreground py-2 pl-4">Loading…</p>;
  if (!items.length) return <p className="text-sm text-muted-foreground py-2 pl-4">No line items</p>;
  return (
    <div className="pl-4 pr-2 pb-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Description</TableHead>
            <TableHead className="text-xs text-right">Qty</TableHead>
            <TableHead className="text-xs text-right">Rate</TableHead>
            <TableHead className="text-xs text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((li) => (
            <TableRow key={li.id}>
              <TableCell className="text-xs">{li.description}</TableCell>
              <TableCell className="text-xs text-right">{li.quantity}</TableCell>
              <TableCell className="text-xs text-right">${Number(li.unit_price).toFixed(2)}</TableCell>
              <TableCell className="text-xs text-right font-medium">${Number(li.amount).toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function Invoices() {
  const { data: invoices = [], isLoading } = useInvoices();
  const { data: customers = [] } = useCustomers();
  const { generateInvoice, updateStatus, remove } = useInvoiceMutations();
  const { billingPeriodicity } = useAgencySettings();
  const [genOpen, setGenOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [genForm, setGenForm] = useState({ customerId: "", dateFrom: "", dateTo: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [batchPending, setBatchPending] = useState(false);

  // Compute period dates based on billing periodicity
  const periodDates = useMemo(() => {
    const now = new Date();
    let from: Date, to: Date;
    if (billingPeriodicity === "weekly") {
      const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      from = lastWeekStart;
      to = endOfWeek(lastWeekStart, { weekStartsOn: 1 });
    } else if (billingPeriodicity === "biweekly") {
      from = startOfWeek(subWeeks(now, 2), { weekStartsOn: 1 });
      to = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
    } else {
      const lastMonth = subMonths(now, 1);
      from = startOfMonth(lastMonth);
      to = endOfMonth(lastMonth);
    }
    return { from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
  }, [billingPeriodicity]);

  const toggleCustomer = (id: string) => {
    setSelectedCustomers((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleBatchGenerate = async () => {
    if (selectedCustomers.length === 0) return;
    setBatchPending(true);
    let success = 0;
    let failed = 0;
    for (const custId of selectedCustomers) {
      try {
        await generateInvoice.mutateAsync({
          customerId: custId,
          dateFrom: periodDates.from,
          dateTo: periodDates.to,
        });
        success++;
      } catch {
        failed++;
      }
    }
    setBatchPending(false);
    setBatchOpen(false);
    setSelectedCustomers([]);
  };

  const handleGenerate = () => {
    generateInvoice.mutate(
      { customerId: genForm.customerId, dateFrom: genForm.dateFrom, dateTo: genForm.dateTo },
      { onSuccess: () => { setGenOpen(false); setGenForm({ customerId: "", dateFrom: "", dateTo: "" }); } }
    );
  };

  const filtered = statusFilter === "all" ? invoices : invoices.filter((i) => i.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
          <p className="text-sm text-muted-foreground">Generate and manage customer invoices</p>
        </div>
        <div className="flex gap-2">
          {/* Batch Generate */}
          <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-1.5"><Layers className="h-4 w-4" />Batch Generate</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Batch Invoice Generation</DialogTitle>
                <DialogDescription>
                  Generate invoices for multiple customers at once using the {billingPeriodicity} billing period ({periodDates.from} — {periodDates.to}).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 max-h-[50vh] overflow-y-auto">
                <div className="flex items-center gap-2 mb-2">
                  <Checkbox
                    checked={selectedCustomers.length === customers.length && customers.length > 0}
                    onCheckedChange={(checked) => {
                      setSelectedCustomers(checked ? customers.map((c) => c.id) : []);
                    }}
                  />
                  <Label className="font-medium">Select All ({customers.length})</Label>
                </div>
                {customers.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 pl-2">
                    <Checkbox
                      checked={selectedCustomers.includes(c.id)}
                      onCheckedChange={() => toggleCustomer(c.id)}
                    />
                    <span className="text-sm">{c.name}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setBatchOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleBatchGenerate}
                  disabled={selectedCustomers.length === 0 || batchPending}
                >
                  {batchPending
                    ? "Generating…"
                    : `Generate ${selectedCustomers.length} Invoice${selectedCustomers.length !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Single Generate */}
          <Dialog open={genOpen} onOpenChange={setGenOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Generate Invoice</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Invoice</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Customer</Label>
                <Select value={genForm.customerId} onValueChange={(v) => setGenForm({ ...genForm, customerId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>From Date</Label>
                  <Input type="date" value={genForm.dateFrom} onChange={(e) => setGenForm({ ...genForm, dateFrom: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>To Date</Label>
                  <Input type="date" value={genForm.dateTo} onChange={(e) => setGenForm({ ...genForm, dateTo: e.target.value })} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                This will create an invoice from all completed appointments for this customer in the selected date range, using the applicable billing rate.
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setGenOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleGenerate}
                  disabled={!genForm.customerId || !genForm.dateFrom || !genForm.dateTo || generateInvoice.isPending}
                >
                  {generateInvoice.isPending ? "Generating…" : "Generate"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="flex gap-2">
        {["all", "draft", "sent", "paid", "overdue", "cancelled"].map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(s)}
            className="capitalize"
          >
            {s}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Invoices ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col items-center gap-2 py-12">
              <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Loading invoices...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12">
              <FileText className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-foreground">No invoices yet</p>
              <p className="text-xs text-muted-foreground max-w-xs">Generate invoices from completed appointments using the button above.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((inv) => (
                <Collapsible
                  key={inv.id}
                  open={expandedId === inv.id}
                  onOpenChange={(o) => setExpandedId(o ? inv.id : null)}
                >
                  <div className="border rounded-lg">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50">
                        <div className="flex items-center gap-4">
                          <ChevronDown className={`h-4 w-4 transition-transform ${expandedId === inv.id ? "rotate-180" : ""}`} />
                          <div>
                            <p className="font-medium">{inv.invoice_number}</p>
                            <p className="text-sm text-muted-foreground">{(inv.customers as any)?.name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge className={statusColors[inv.status] || ""}>{inv.status}</Badge>
                          <p className="font-semibold">${Number(inv.total).toFixed(2)}</p>
                          {inv.issued_date && (
                            <p className="text-sm text-muted-foreground">{format(new Date(inv.issued_date), "MMM d, yyyy")}</p>
                          )}
                          <div className="flex gap-1">
                            {inv.status === "draft" && (
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); updateStatus.mutate({ id: inv.id, status: "sent" }); }}>
                                <Send className="h-4 w-4" />
                              </Button>
                            )}
                            {inv.status === "sent" && (
                              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); updateStatus.mutate({ id: inv.id, status: "paid" }); }}>
                                Mark Paid
                              </Button>
                            )}
                            {inv.status === "draft" && (
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); remove.mutate(inv.id); }}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <InvoiceLineItems invoiceId={inv.id} />
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
