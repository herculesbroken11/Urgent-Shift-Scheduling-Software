import { useState, useMemo, useCallback } from "react";
import { usePlatformRevenue } from "@/hooks/usePlatformData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CalendarIcon, ChevronRight, ChevronDown, FileText, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfQuarter, startOfYear } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

type TimeframeKey = "current_month" | "prior_month" | "quarter" | "ytd" | "all_time" | "custom";

function getDateRange(key: TimeframeKey): { from: string | undefined; to: string | undefined; label: string } {
  const now = new Date();
  switch (key) {
    case "current_month":
      return { from: format(startOfMonth(now), "yyyy-MM-dd"), to: format(endOfMonth(now), "yyyy-MM-dd"), label: "Current Month" };
    case "prior_month": {
      const pm = subMonths(now, 1);
      return { from: format(startOfMonth(pm), "yyyy-MM-dd"), to: format(endOfMonth(pm), "yyyy-MM-dd"), label: "Prior Month" };
    }
    case "quarter":
      return { from: format(startOfQuarter(now), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd"), label: "This Quarter" };
    case "ytd":
      return { from: format(startOfYear(now), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd"), label: "Year to Date" };
    case "all_time":
      return { from: undefined, to: undefined, label: "All Time (6 months)" };
    default:
      return { from: undefined, to: undefined, label: "Custom" };
  }
}

export default function PlatformRevenue() {
  const [timeframe, setTimeframe] = useState<TimeframeKey>("current_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedAgency, setSelectedAgency] = useState<any>(null);

  const range = useMemo(() => {
    if (timeframe === "custom") return { from: customFrom || undefined, to: customTo || undefined, label: "Custom Range" };
    return getDateRange(timeframe);
  }, [timeframe, customFrom, customTo]);

  const { data, isLoading } = usePlatformRevenue(range.from, range.to);

  const summaries = data?.agency_summaries || [];
  const monthlyTotals = data?.monthly_platform_totals || [];
  const queryTimeframe = data?.query_timeframe;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Revenue & Billing Oversight</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={timeframe} onValueChange={(v) => setTimeframe(v as TimeframeKey)}>
            <SelectTrigger className="w-[180px]">
              <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current_month">Current Month</SelectItem>
              <SelectItem value="prior_month">Prior Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="ytd">Year to Date</SelectItem>
              <SelectItem value="all_time">All Time</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          {timeframe === "custom" && (
            <>
              <Input type="date" className="w-[150px]" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <span className="text-muted-foreground text-sm">to</span>
              <Input type="date" className="w-[150px]" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <>
          {monthlyTotals.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Platform Monthly Totals — {range.label}</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthlyTotals}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="appointments" fill="hsl(var(--primary))" name="Appointments" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="completed" fill="hsl(var(--primary) / 0.5)" name="Completed" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-lg">Agency Billing Summary</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agency</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead className="text-right">Appointments</TableHead>
                    <TableHead className="text-right">Usage</TableHead>
                    <TableHead className="text-right">Computed Revenue</TableHead>
                    <TableHead className="text-right">Invoiced</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaries.map((a: any) => (
                    <TableRow
                      key={a.agency_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedAgency(a)}
                    >
                      <TableCell className="font-medium">{a.agency_name}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{a.plan_name || a.plan_type}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={a.usage_billing_trigger === "booked" ? "default" : "secondary"} className="capitalize">
                          {a.usage_billing_trigger || "completed"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{a.total_appointments}</TableCell>
                      <TableCell className="text-right">{a.platform_usage_count || 0}</TableCell>
                      <TableCell className="text-right font-semibold text-foreground">
                        ${Number(a.computed_revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        ${Number(a.invoiced_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                  {summaries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No revenue data for selected period</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Revenue detail drill-down */}
      <Dialog open={!!selectedAgency} onOpenChange={(open) => !open && setSelectedAgency(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Revenue Detail — {selectedAgency?.agency_name}</DialogTitle>
          </DialogHeader>
          {selectedAgency && (
            <RevenueDetailView
              agency={selectedAgency}
              timeframeLabel={range.label}
              queryTimeframe={queryTimeframe}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RevenueDetailView({
  agency,
  timeframeLabel,
  queryTimeframe,
}: {
  agency: any;
  timeframeLabel: string;
  queryTimeframe?: { since: string; until: string };
}) {
  const usageCount = Number(agency.platform_usage_count || 0);
  const computedRevenue = Number(agency.computed_revenue || 0);
  const configSegments: any[] = agency.config_segments || [];
  const hasMultipleConfigs = configSegments.length > 1;

  const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatDate = (d: string | null | undefined) => {
    if (!d) return "—";
    try { return format(new Date(d), "MMM d, yyyy"); } catch { return d; }
  };

  // Usage records lazy loading
  const [usageRecords, setUsageRecords] = useState<any[] | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const loadUsageRecords = useCallback(async () => {
    if (usageRecords !== null) return;
    setUsageLoading(true);
    try {
      const { data: result } = await supabase.functions.invoke("platform-admin", {
        body: {
          action: "agency.usage_records",
          agency_id: agency.agency_id,
          date_from: queryTimeframe?.since || null,
          date_to: queryTimeframe?.until || null,
        },
      });
      setUsageRecords(result?.records || []);
    } catch {
      setUsageRecords([]);
    } finally {
      setUsageLoading(false);
    }
  }, [agency.agency_id, queryTimeframe, usageRecords]);

  return (
    <div className="space-y-4">
      {/* Traceability header */}
      <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" /> Audit Traceability
        </h4>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <span className="text-muted-foreground">Query Timeframe</span>
          <span className="font-medium">
            {queryTimeframe
              ? `${formatDate(queryTimeframe.since)} → ${formatDate(queryTimeframe.until)}`
              : timeframeLabel}
          </span>
          <span className="text-muted-foreground">Config Versions Used</span>
          <span className="font-medium">
            {configSegments.length === 0 ? (
              <span className="text-muted-foreground italic">No config</span>
            ) : hasMultipleConfigs ? (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                {configSegments.length} versions
              </Badge>
            ) : (
              <span className="font-mono text-xs">{configSegments[0]?.config_id?.slice(0, 8) ?? "—"}…</span>
            )}
          </span>
        </div>
      </div>

      {/* Invoice status */}
      <div className="flex items-center gap-2 text-sm">
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Invoice Status:</span>
        {agency.has_invoice ? (
          <Badge variant={agency.invoice_status === "paid" ? "default" : "secondary"} className="capitalize text-xs">
            {agency.invoice_status}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs">
            <AlertCircle className="h-3 w-3 mr-1" /> Not yet invoiced
          </Badge>
        )}
      </div>

      <Separator />

      {/* Config segments — the core of multi-config traceability */}
      {configSegments.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold text-sm text-foreground">
            {hasMultipleConfigs ? "Revenue by Config Period" : "Billing Configuration & Revenue"}
          </h4>
          {configSegments.map((seg: any, idx: number) => {
            const segUsage = Number(seg.usage_count || 0);
            const segRevenue = Number(seg.revenue || 0);
            const segBase = Number(seg.monthly_base_fee || 0);
            const segPerAppt = Number(seg.per_appointment_fee || 0);
            const segIncluded = Number(seg.included_appointments || 0);
            const segOverage = Number(seg.overage_rate || 0);
            const segMin = Number(seg.min_monthly_fee || 0);
            const segMax = Number(seg.max_monthly_fee || 0);
            const monthsCount = Number(seg.months_count || 1);

            return (
              <div key={seg.config_id || idx} className="rounded-md border border-border p-3 bg-muted/30 space-y-2">
                {/* Segment header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {hasMultipleConfigs && (
                      <Badge variant="outline" className="text-xs">
                        Period {idx + 1}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {seg.first_month === seg.last_month
                        ? seg.first_month
                        : `${seg.first_month} → ${seg.last_month}`}
                      {monthsCount > 1 && ` (${monthsCount} months)`}
                    </span>
                  </div>
                  <span className="font-semibold text-sm">{fmt(segRevenue)}</span>
                </div>

                {/* Config details */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                  <span className="text-muted-foreground">Config ID</span>
                  <span className="font-mono">{seg.config_id?.slice(0, 8) ?? "—"}…</span>
                  <span className="text-muted-foreground">Effective</span>
                  <span>
                    {formatDate(seg.effective_start)} → {seg.effective_end ? formatDate(seg.effective_end) : "Open-ended"}
                  </span>
                  <span className="text-muted-foreground">Model</span>
                  <span className="capitalize">{(seg.billing_model || "per_appointment").replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground">Trigger</span>
                  <span className="capitalize">{seg.usage_billing_trigger || "completed"}</span>
                </div>

                {/* Mini calculation breakdown */}
                <div className="border-t border-border pt-1.5 space-y-0.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Base × {monthsCount} mo</span>
                    <span>{fmt(segBase * monthsCount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Usage ({segUsage} × {fmt(segPerAppt)})</span>
                    <span>{fmt(segUsage * segPerAppt)}</span>
                  </div>
                  {segIncluded > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Included: {segIncluded}/mo · Overage rate: {fmt(segOverage)}</span>
                      <span>—</span>
                    </div>
                  )}
                  {segMin > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Min fee: {fmt(segMin)}/mo</span>
                      <span>—</span>
                    </div>
                  )}
                  {segMax > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Max cap: {fmt(segMax)}/mo</span>
                      <span>—</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Grand total when multiple configs */}
          {hasMultipleConfigs && (
            <>
              <Separator />
              <div className="flex justify-between text-base font-bold px-1">
                <span>Total Computed Revenue</span>
                <span>{fmt(computedRevenue)}</span>
              </div>
            </>
          )}
        </div>
      )}

      {configSegments.length === 0 && (
        <div className="text-sm text-muted-foreground italic">
          No billing configuration found for this agency in the selected period.
        </div>
      )}

      <Separator />

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <span className="text-muted-foreground">Total Appointments</span>
        <span className="font-medium">{agency.total_appointments}</span>
        <span className="text-muted-foreground">Completed</span>
        <span className="font-medium">{agency.completed_appointments}</span>
        <span className="text-muted-foreground">Invoiced Total</span>
        <span className="font-medium">{fmt(Number(agency.invoiced_total || 0))}</span>
      </div>

      <Separator />

      {/* Usage records collapsible */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between text-sm font-medium"
            onClick={loadUsageRecords}
          >
            <span>Underlying Usage Records ({usageCount})</span>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          {usageLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : usageRecords && usageRecords.length > 0 ? (
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Appointment</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Fee</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead>Recorded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usageRecords.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.appointment_id?.slice(0, 8)}…</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">{r.trigger_type}</Badge>
                      </TableCell>
                      <TableCell className="text-xs capitalize">{r.triggered_status}</TableCell>
                      <TableCell className="text-right font-medium text-xs">{fmt(Number(r.fee_amount || 0))}</TableCell>
                      <TableCell className="text-xs">{r.billing_month}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.created_at ? format(new Date(r.created_at), "MMM d, HH:mm") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : usageRecords !== null ? (
            <p className="text-center py-4 text-sm text-muted-foreground">No usage records for this period</p>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}