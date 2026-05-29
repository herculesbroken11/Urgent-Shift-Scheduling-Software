import { useState, useMemo } from "react";
import { format, subMonths, addDays } from "date-fns";
import { Download, FileSpreadsheet, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { useCustomers } from "@/hooks/useAgencyData";
import { useBillingRates } from "@/hooks/useBillingData";
import { useAdaptedQuery } from "@/lib/data-adapter";
import { useDemoData } from "@/contexts/DemoDataContext";
import { supabase } from "@/integrations/supabase/client";
import { generateQuickBooksCSV, downloadCSV, type QBLineItem } from "@/lib/quickbooks-export";
import { calculateAppointmentBilling, type BillingRateRecord, type AppointmentForBilling } from "@/lib/billing-engine";
import { toast } from "sonner";
import { useAgencyTimezone } from "@/hooks/useAgencyTimezone";
import { localToUtcIso } from "@/lib/agency-timezone";

const modalityLabel = (t: string) => t === "on_site" ? "On-Site" : t === "vri" ? "VRI" : "OPI";

const BILLABLE_STATUSES = ["completed", "completed_last_minute", "late_cancel_no_show_client", "cancelled"];

/** Build month options: current + last 11 months with agency-tz-aware boundaries */
function getMonthOptions(agencyTz: string) {
  const opts: { value: string; label: string; startUtc: string; endUtc: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = subMonths(new Date(), i);
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-indexed
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const localStartDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const localEndDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
    const startUtc = localToUtcIso(localStartDate, "00:00", agencyTz) || new Date(year, month, 1).toISOString();
    const endUtc = localToUtcIso(localEndDate, "23:59", agencyTz) || new Date(year, month + 1, 0, 23, 59, 59).toISOString();
    opts.push({ value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy"), startUtc, endUtc });
  }
  return opts;
}

/** Map billing engine line type to QBO item name */
const BILLING_TYPE_TO_QBO_ITEM: Record<string, string> = {
  base: "Interpreting Service",
  time: "Interpreting Service",
  travel_mileage: "Travel / Mileage",
  mileage: "Travel / Mileage",
  travel_time: "Travel Time",
  after_hours: "After-Hours Premium",
  weekend: "Weekend Premium",
  overtime: "Overtime",
  parking: "Travel / Parking",
  cancellation: "Cancellation Fee",
  minimum_adjustment: "Service Adjustment",
  same_day: "Same-Day / Last-Minute Premium",
  same_day_fee: "Same-Day Flat Fee",
  same_day_travel: "Same-Day Travel Surcharge",
  holiday: "Holiday Premium",
};

export default function QuickBooksExport() {
  const agencyTz = useAgencyTimezone();
  const months = useMemo(() => getMonthOptions(agencyTz), [agencyTz]);
  const [selectedMonth, setSelectedMonth] = useState(months[0].value);
  const { profile } = useAuth();
  const { state } = useDemoData();

  const selected = months.find((m) => m.value === selectedMonth)!;

  // Date-and-status-scoped query with agency-timezone-aware boundaries
  const { data: monthAppointments = [], isLoading } = useAdaptedQuery<any[]>({
    queryKey: ["qbo-export-appointments", profile?.agency_id, selectedMonth, agencyTz],
    queryFn: async () => {
      if (!profile?.agency_id) return [];
      const { data, error } = await supabase
        .from("appointments")
        .select("*, customers(name), locations(name, address_line1, city, state, zip_code), languages(name, code), interpreter:profiles!appointments_interpreter_id_fkey(first_name, last_name)")
        .eq("agency_id", profile.agency_id)
        .eq("is_import_staged", false)
        .eq("is_deleted", false)
        .in("status", BILLABLE_STATUSES as any)
        .gte("scheduled_start", selected.startUtc)
        .lte("scheduled_start", selected.endUtc)
        .order("scheduled_start", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
    demoFn: () => {
      const startUtc = new Date(selected.startUtc);
      const endUtc = new Date(selected.endUtc);
      return state.appointments.filter((a: any) => {
        if (!BILLABLE_STATUSES.includes(a.status)) return false;
        const d = a.scheduled_start ? new Date(a.scheduled_start) : null;
        return d && d >= startUtc && d <= endUtc;
      });
    },
    enabled: !!profile?.agency_id,
  });

  const { data: customers } = useCustomers();
  const { data: billingRates = [] } = useBillingRates();

  // Filter billable appointments (status already scoped by query, just date-check actual_start fallback)
  const filtered = useMemo(() => {
    const startUtc = new Date(selected.startUtc);
    const endUtc = new Date(selected.endUtc);
    return (monthAppointments as any[]).filter((a) => {
      if (!BILLABLE_STATUSES.includes(a.status)) return false;
      const apptDate = a.actual_start || a.scheduled_start;
      if (!apptDate) return false;
      const d = new Date(apptDate);
      return d >= startUtc && d <= endUtc;
    });
  }, [monthAppointments, selected]);

  // Build line items using the billing engine
  const lineItems = useMemo(() => {
    const monthDate = new Date(selected.startUtc);
    const monthEndDate = new Date(selected.endUtc);
    const invoiceNo = `INV-${format(monthDate, "yyyyMM")}`;
    const invoiceDate = format(monthEndDate, "MM/dd/yyyy");
    const dueDate = format(addDays(monthEndDate, 30), "MM/dd/yyyy");

    return filtered.map((a: any) => {
      const custName = a.customers?.name || customers?.find((c) => c.id === a.customer_id)?.name || "Unknown Customer";
      const interpreterName = a.interpreter
        ? `${a.interpreter.first_name || ""} ${a.interpreter.last_name || ""}`.trim()
        : "Unassigned";
      const langName = a.languages?.name || "Unknown";
      const modality = modalityLabel(a.modality || "on_site");
      const start = new Date(a.actual_start || a.scheduled_start);

      // Use pre-calculated breakdown if available, otherwise calculate
      let breakdown: any = null;
      let billingSource = "none";

      if (a.billing_breakdown && a.billing_breakdown.line_items?.length > 0) {
        breakdown = a.billing_breakdown;
        billingSource = "stored";
      } else if (billingRates.length > 0) {
        try {
          breakdown = calculateAppointmentBilling(
            a as AppointmentForBilling,
            billingRates as unknown as BillingRateRecord[]
          );
          billingSource = "calculated";
        } catch {
          // No rate available — fall back to placeholder
        }
      }

      const totalAmt = breakdown
        ? breakdown.total
        : (a.billed_amount && Number(a.billed_amount) > 0 ? Number(a.billed_amount) : 0);
      const hours = breakdown?.hours ?? 1;
      const rate = breakdown?.billing_model === "hourly"
        ? (breakdown.time / (breakdown.hours || 1))
        : totalAmt;

      return {
        id: a.id,
        customer: custName,
        interpreter: interpreterName,
        language: langName,
        modality,
        title: a.title || "Interpreting Service",
        serviceDate: format(start, "MM/dd/yyyy"),
        hours,
        rate,
        totalAmt,
        breakdown,
        billingSource,
        invoiceNo: `${invoiceNo}-${custName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10)}`,
        invoiceDate,
        dueDate,
      };
    })
    // Exclude cancelled appointments that resolved to $0 (no cancellation fee)
    .filter((li) => !(li.totalAmt === 0 && filtered.find((a: any) => a.id === li.id)?.status === "cancelled"));
  }, [filtered, customers, selected, billingRates]);

  const grandTotal = lineItems.reduce((s, i) => s + i.totalAmt, 0);
  const totalHours = lineItems.reduce((s, i) => s + i.hours, 0);

  const handleExport = () => {
    if (lineItems.length === 0) {
      toast.error("No data to export: No billable appointments found for this period.");
      return;
    }

    const qbLines: QBLineItem[] = [];
    for (const li of lineItems) {
      if (li.breakdown?.line_items?.length > 0) {
        // Export each billing line item as a separate QBO line
        for (const bLine of li.breakdown.line_items) {
          qbLines.push({
            invoiceNo: li.invoiceNo,
            customer: li.customer,
            invoiceDate: li.invoiceDate,
            dueDate: li.dueDate,
            item: BILLING_TYPE_TO_QBO_ITEM[bLine.type] || "Interpreting Service",
            description: bLine.description,
            quantity: Number(bLine.quantity ?? bLine.qty ?? 1),
            rate: Number(bLine.unit_price ?? bLine.rate ?? 0),
            amount: Number(bLine.amount),
            serviceDate: li.serviceDate,
          });
        }
      } else {
        // Fallback: single service line
        qbLines.push({
          invoiceNo: li.invoiceNo,
          customer: li.customer,
          invoiceDate: li.invoiceDate,
          dueDate: li.dueDate,
          item: "Interpreting Service",
          description: `${li.language} ${li.modality} — ${li.title} (${li.interpreter})`,
          quantity: li.hours,
          rate: li.rate,
          amount: li.totalAmt,
          serviceDate: li.serviceDate,
        });
      }
    }

    const csv = generateQuickBooksCSV(qbLines);
    downloadCSV(csv, `quickbooks-import-${selectedMonth}.csv`);
    toast.success(`Export complete: Downloaded ${qbLines.length} line items for ${selected.label}.`);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Monthly Billing Export</h1>
          <p className="text-sm text-muted-foreground">QuickBooks-compatible CSV using billing engine rates</p>
        </div>
        <Badge variant="outline" className="text-xs uppercase tracking-wider border-primary/50 text-primary">
          <FileSpreadsheet className="w-3 h-3 mr-1" /> QuickBooks Ready
        </Badge>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Billing Period:</span>
          </div>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="sm:ml-auto">
            <Button onClick={handleExport} disabled={lineItems.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV for QuickBooks
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{lineItems.length}</p>
            <p className="text-xs text-muted-foreground">Appointments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{totalHours.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">Total Hours</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{new Set(lineItems.map((i) => i.customer)).size}</p>
            <p className="text-xs text-muted-foreground">Customers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">${grandTotal.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Total Amount</p>
          </CardContent>
        </Card>
      </div>

      {/* Preview Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export Preview</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-center text-muted-foreground">Loading appointments…</p>
          ) : lineItems.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground">No completed appointments for {selected.label}.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Interpreter</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-nowrap text-sm">{item.serviceDate}</TableCell>
                    <TableCell className="text-sm">{item.customer}</TableCell>
                    <TableCell className="text-sm">{item.title}</TableCell>
                    <TableCell className="text-sm">{item.interpreter}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{item.modality}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm">{item.hours.toFixed(1)}</TableCell>
                    <TableCell className="text-right text-sm font-medium">${item.totalAmt.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={item.billingSource === "stored" ? "default" : item.billingSource === "calculated" ? "secondary" : "outline"} className="text-xs">
                        {item.billingSource === "stored" ? "Engine" : item.billingSource === "calculated" ? "Calc" : "—"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={6} className="text-right text-base font-bold">Grand Total</TableCell>
                  <TableCell className="text-right text-base font-bold text-primary">${grandTotal.toFixed(2)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-medium text-foreground">CSV Import Instructions for QuickBooks Online:</p>
          <ol className="text-xs text-muted-foreground list-decimal ml-4 space-y-1">
            <li>Go to <strong>Settings → Import Data → Invoices</strong> in QuickBooks Online</li>
            <li>Upload the downloaded CSV file</li>
            <li>Map columns: InvoiceNo, Customer, InvoiceDate, DueDate, Item, Description, Quantity, Rate, Amount, ServiceDate</li>
            <li>Review and confirm the import</li>
          </ol>
          <Separator className="my-2" />
          <p className="text-xs text-muted-foreground">
            Billing source: <strong>Engine</strong> = pre-calculated breakdown stored on appointment, <strong>Calc</strong> = computed at export time from billing rates, <strong>—</strong> = no rate available
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
