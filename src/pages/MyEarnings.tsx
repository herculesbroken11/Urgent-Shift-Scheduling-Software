import { useMemo } from "react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoData } from "@/contexts/DemoDataContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, TrendingUp, Clock } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { useAdaptedQuery } from "@/lib/data-adapter";
import { useAgencyTimezone } from "@/hooks/useAgencyTimezone";
import { formatDateTimeInTz } from "@/lib/agency-timezone";

export default function MyEarnings() {
  const { user, profile, isDemoMode } = useAuth();
  const { state } = useDemoData();
  const [monthOffset, setMonthOffset] = useState(0);
  const targetMonth = subMonths(new Date(), monthOffset);
  const agencyTz = useAgencyTimezone();

  const { data: appointments = [], isLoading } = useAdaptedQuery<any[]>({
    queryKey: ["my-earnings", user?.id, monthOffset],
    queryFn: async () => {
      const start = startOfMonth(targetMonth);
      const end = endOfMonth(targetMonth);
      const { data, error } = await supabase
        .from("appointments")
        .select("*, customers(name), languages(name)")
        .eq("agency_id", profile!.agency_id!)
        .eq("interpreter_id", user!.id)
        .eq("is_import_staged", false).eq("is_deleted", false)
        .in("status", ["completed", "completed_last_minute"] as any[])
        .gte("scheduled_start", start.toISOString())
        .lte("scheduled_start", end.toISOString())
        .order("scheduled_start", { ascending: true });
      if (error) throw error;
      return data;
    },
    demoFn: () => {
      const start = startOfMonth(targetMonth);
      const end = endOfMonth(targetMonth);
      return state.appointments.filter((a: any) => {
        if (a.interpreter_id !== user?.id || !["completed", "completed_last_minute"].includes(a.status)) return false;
        if (!a.scheduled_start) return false;
        const d = new Date(a.scheduled_start);
        return d >= start && d <= end;
      });
    },
    enabled: !!user && !!profile?.agency_id,
  });

  const { data: rates = [] } = useAdaptedQuery<any[]>({
    queryKey: ["my-billing-rate", profile?.agency_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_rates")
        .select("*")
        .eq("agency_id", profile!.agency_id!)
        .eq("is_default", true)
        .limit(1);
      if (error) throw error;
      return data;
    },
    demoFn: () => state.billingRates.filter((r: any) => r.is_default),
    enabled: !!profile?.agency_id,
  });

  const defaultRate = rates[0];
  const hourlyRate = defaultRate?.hourly_rate ?? 0;
  const minHours = defaultRate?.minimum_hours ?? 1;
  const travelRate = defaultRate?.travel_rate_per_mile ?? 0;

  const earnings = useMemo(() => {
    return appointments.map((a: any) => {
      const cf = (a.custom_fields as Record<string, any>) || {};
      const start = a.actual_start ? new Date(a.actual_start) : (a.scheduled_start ? new Date(a.scheduled_start) : null);
      const end = a.actual_end ? new Date(a.actual_end) : (a.scheduled_end ? new Date(a.scheduled_end) : null);
      let hours = 0;
      if (start && end) {
        hours = Math.max((end.getTime() - start.getTime()) / 3600000, minHours);
      }
      const serviceAmount = hours * hourlyRate;
      const mileageAmount = cf.include_mileage && cf.mileage ? cf.mileage * travelRate : 0;
      const total = serviceAmount + mileageAmount;
      let customerName = a.customers?.name;
      if (!customerName && isDemoMode && a.customer_id) {
        const cust = state.customers.find((c: any) => c.id === a.customer_id);
        customerName = cust?.name;
      }
      return { ...a, hours: Math.round(hours * 100) / 100, serviceAmount, mileageAmount, total, mileage: cf.mileage || 0, customerName };
    });
  }, [appointments, hourlyRate, minHours, travelRate, isDemoMode, state.customers]);

  const totalEarnings = earnings.reduce((sum: number, e: any) => sum + e.total, 0);
  const totalHours = earnings.reduce((sum: number, e: any) => sum + e.hours, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Earnings</h1>
        <p className="text-muted-foreground">View your completed job earnings and monthly totals</p>
      </div>

      <div className="flex items-center gap-4">
        <Select value={monthOffset.toString()} onValueChange={(v) => setMonthOffset(parseInt(v))}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }, (_, i) => (
              <SelectItem key={i} value={i.toString()}>
                {format(subMonths(new Date(), i), "MMMM yyyy")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Earnings</p>
              <p className="text-xl font-bold">${totalEarnings.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10">
              <Clock className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Hours</p>
              <p className="text-xl font-bold">{totalHours.toFixed(1)}h</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
              <TrendingUp className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Completed Jobs</p>
              <p className="text-xl font-bold">{earnings.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Job Details — {format(targetMonth, "MMMM yyyy")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Mileage</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : earnings.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No completed jobs this month</TableCell></TableRow>
              ) : (
                earnings.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{e.scheduled_start ? formatDateTimeInTz(e.scheduled_start, agencyTz, { dateOnly: true }) : "—"}</TableCell>
                    <TableCell>{e.title || "Appointment"}</TableCell>
                    <TableCell>{e.customerName ?? e.customers?.name ?? "—"}</TableCell>
                    <TableCell className="text-right">{e.hours}h</TableCell>
                    <TableCell className="text-right">${hourlyRate}/hr</TableCell>
                    <TableCell className="text-right">
                      {e.mileageAmount > 0 ? (
                        <span>{e.mileage}mi · ${e.mileageAmount.toFixed(2)}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">${e.total.toFixed(2)}</TableCell>
                  </TableRow>
                ))
              )}
              {earnings.length > 0 && (
                <TableRow className="bg-muted/30 font-semibold">
                  <TableCell colSpan={6} className="text-right">Monthly Total</TableCell>
                  <TableCell className="text-right">${totalEarnings.toFixed(2)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
