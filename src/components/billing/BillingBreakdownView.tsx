import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clock, DollarSign, ArrowRight, AlertTriangle, Calculator } from "lucide-react";
import type { BillingBreakdown } from "@/lib/billing-engine";

interface BillingBreakdownViewProps {
  breakdown: BillingBreakdown | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentTitle?: string;
}

function AuditRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-right">
        <span className="text-sm font-medium text-foreground">{value}</span>
        {note && <span className="text-xs text-muted-foreground ml-1.5">({note})</span>}
      </div>
    </div>
  );
}

export function BillingBreakdownView({ breakdown, open, onOpenChange, appointmentTitle }: BillingBreakdownViewProps) {
  if (!breakdown) return null;

  const hasMinAdj = breakdown.minimum_adjustment > 0;
  const hasPremiums = breakdown.after_hours_premium + breakdown.weekend_premium + breakdown.holiday_premium + breakdown.same_day_premium > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Billing Breakdown Audit
          </DialogTitle>
          {appointmentTitle && <p className="text-sm text-muted-foreground">{appointmentTitle}</p>}
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary badges */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" /> {breakdown.hours} hrs
            </Badge>
            <Badge variant="outline" className="gap-1">
              <DollarSign className="h-3 w-3" /> {breakdown.billing_model}
            </Badge>
            <Badge variant="secondary">{breakdown.rate_name}</Badge>
          </div>

          {/* Audit trail */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Calculation Audit Trail</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 pt-0">
              <AuditRow label="Duration used" value={`${breakdown.hours} hrs`} note={breakdown.billing_model === "hourly" ? "after rounding" : undefined} />
              <AuditRow label="Base / time charge" value={`$${(breakdown.base + breakdown.time).toFixed(2)}`} />
              {breakdown.travel_mileage > 0 && <AuditRow label="Travel mileage" value={`$${breakdown.travel_mileage.toFixed(2)}`} />}
              {breakdown.travel_time > 0 && <AuditRow label="Travel time" value={`$${breakdown.travel_time.toFixed(2)}`} />}
              {breakdown.after_hours_premium > 0 && <AuditRow label="After-hours premium" value={`+$${breakdown.after_hours_premium.toFixed(2)}`} />}
              {breakdown.weekend_premium > 0 && <AuditRow label="Weekend premium" value={`+$${breakdown.weekend_premium.toFixed(2)}`} />}
              {breakdown.holiday_premium > 0 && <AuditRow label="Holiday premium" value={`+$${breakdown.holiday_premium.toFixed(2)}`} />}
              {breakdown.same_day_premium > 0 && <AuditRow label="Same-day / last-minute" value={`+$${breakdown.same_day_premium.toFixed(2)}`} />}
              {breakdown.overtime_premium > 0 && <AuditRow label="Overtime premium" value={`+$${breakdown.overtime_premium.toFixed(2)}`} />}
              {breakdown.parking > 0 && <AuditRow label="Parking" value={`$${breakdown.parking.toFixed(2)}`} />}
              {breakdown.cancellation_fee > 0 && <AuditRow label="Cancellation fee" value={`$${breakdown.cancellation_fee.toFixed(2)}`} />}
              {hasMinAdj && (
                <AuditRow label="Minimum charge adjustment" value={`+$${breakdown.minimum_adjustment.toFixed(2)}`} note="brought to minimum" />
              )}
              <div className="flex items-center justify-between pt-2 mt-1 border-t-2 border-foreground/20">
                <span className="text-sm font-semibold text-foreground">Total</span>
                <span className="text-lg font-bold text-foreground">${breakdown.total.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Line items */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Invoice Line Items ({breakdown.line_items.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs text-right">Qty</TableHead>
                    <TableHead className="text-xs text-right">Rate</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {breakdown.line_items.map((li, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-mono">{li.type}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{li.description}</TableCell>
                      <TableCell className="text-xs text-right">{li.quantity}</TableCell>
                      <TableCell className="text-xs text-right">${li.unit_price.toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-right font-medium">${li.amount.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {!hasPremiums && !hasMinAdj && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground p-2 rounded bg-muted/50">
              <AlertTriangle className="h-3 w-3" />
              No premiums or adjustments applied to this appointment.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
