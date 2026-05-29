import { useAuth } from "@/contexts/AuthContext";
import { useDemoData } from "@/contexts/DemoDataContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import { useAdaptedQuery } from "@/lib/data-adapter";
import { startOfWeek, endOfWeek, format, subMonths, eachDayOfInterval } from "date-fns";
import { STATUS_LABELS } from "@/lib/status-labels";

const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
const CHART_TEXT_COLOR = "hsl(var(--chart-text))";
const CHART_GRID_COLOR = "hsl(var(--chart-grid))";

interface ReportData {
  status_counts: Record<string, number>;
  total_appointments: number;
  completed_count: number;
  active_interpreters: number;
  monthly_trends: { month: string; count: number }[];
  language_distribution: { name: string; value: number }[];
  interpreter_utilization: { name: string; count: number }[];
  monthly_revenue: { month: string; total: number }[];
  total_revenue: number;
  weekly_breakdown: { day: string; count: number }[];
}

export default function Reports() {
  const { profile } = useAuth();
  const { state } = useDemoData();
  const agencyId = profile?.agency_id;

  const { data: report } = useAdaptedQuery<ReportData>({
    queryKey: ["report-data", agencyId],
    queryFn: async () => {
      // RPC defined in supabase/migrations – get_report_data() SECURITY DEFINER
      const { data, error } = await (supabase.rpc as any)("get_report_data");
      if (error) throw error;
      return data as unknown as ReportData;
    },
    demoFn: () => {
      const sixMonthsAgo = subMonths(new Date(), 6);
      const appts = state.appointments.filter(
        (a: any) => a.scheduled_start && new Date(a.scheduled_start) >= sixMonthsAgo,
      );

      const status_counts: Record<string, number> = {};
      for (const a of appts) status_counts[a.status] = (status_counts[a.status] || 0) + 1;

      const monthlyMap: Record<string, number> = {};
      for (let i = 5; i >= 0; i--) monthlyMap[format(subMonths(new Date(), i), "MMM yyyy")] = 0;
      appts.forEach((a: any) => {
        if (a.scheduled_start) {
          const key = format(new Date(a.scheduled_start), "MMM yyyy");
          if (key in monthlyMap) monthlyMap[key]++;
        }
      });

      const langMap: Record<string, number> = {};
      appts.forEach((a: any) => {
        const lang =
          a.languages?.name ||
          state.languages.find((l: any) => l.id === a.language_id)?.name ||
          "Unknown";
        langMap[lang] = (langMap[lang] || 0) + 1;
      });

      const interpMap: Record<string, number> = {};
      appts
        .filter((a: any) => a.interpreter_id)
        .forEach((a: any) => {
          const interp =
            a.interpreter || state.interpreters.find((i: any) => i.id === a.interpreter_id);
          if (interp) {
            const name = `${interp.first_name} ${interp.last_name}`;
            interpMap[name] = (interpMap[name] || 0) + 1;
          }
        });

      const revMap: Record<string, number> = {};
      for (let i = 5; i >= 0; i--) revMap[format(subMonths(new Date(), i), "MMM yyyy")] = 0;
      state.invoices.forEach((inv: any) => {
        const key = format(new Date(inv.created_at), "MMM yyyy");
        if (key in revMap) revMap[key] += Number(inv.total) || 0;
      });

      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
      const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
      const weekly = weekDays.map((day) => {
        const dayStr = format(day, "yyyy-MM-dd");
        return {
          day: format(day, "EEE"),
          count: appts.filter((a: any) => a.scheduled_start?.startsWith(dayStr)).length,
        };
      });

      return {
        status_counts,
        total_appointments: appts.length,
        completed_count: appts.filter((a: any) => a.status === "completed" || a.status === "completed_last_minute").length,
        active_interpreters: new Set(
          appts.filter((a: any) => a.interpreter_id).map((a: any) => a.interpreter_id),
        ).size,
        monthly_trends: Object.entries(monthlyMap).map(([month, count]) => ({ month, count })),
        language_distribution: Object.entries(langMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 7)
          .map(([name, value]) => ({ name, value })),
        interpreter_utilization: Object.entries(interpMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([name, count]) => ({ name, count })),
        monthly_revenue: Object.entries(revMap).map(([month, total]) => ({ month, total })),
        total_revenue: state.invoices.reduce(
          (s: number, i: any) => s + (Number(i.total) || 0),
          0,
        ),
        weekly_breakdown: weekly,
      };
    },
    enabled: !!agencyId,
  });

  const statusData = Object.entries(report?.status_counts ?? {}).map(([name, value]) => ({
    name: STATUS_LABELS[name] ?? name,
    value,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports & Analytics</h1>
        <p className="text-muted-foreground">
          Insights across appointments, interpreters, and revenue
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-3xl font-bold">{report?.total_appointments ?? 0}</p>
            <p className="text-sm text-muted-foreground">Total Appointments (6 mo)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-3xl font-bold">{report?.completed_count ?? 0}</p>
            <p className="text-sm text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-3xl font-bold">{report?.active_interpreters ?? 0}</p>
            <p className="text-sm text-muted-foreground">Active Interpreters</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-3xl font-bold">
              ${(report?.total_revenue ?? 0).toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground">Total Revenue</p>
            {(report?.total_revenue ?? 0) === 0 && (
              <p className="text-xs text-muted-foreground/70 mt-1">
                Configure billing rates to start tracking revenue
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="appointments">
        <TabsList>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="languages">Languages</TabsTrigger>
          <TabsTrigger value="interpreters">Interpreters</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
        </TabsList>

        <TabsContent value="appointments" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Monthly Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={report?.monthly_trends ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: CHART_TEXT_COLOR }} />
                    <YAxis allowDecimals={false} tick={{ fill: CHART_TEXT_COLOR }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Status Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                    >
                      {statusData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">This Week</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={report?.weekly_breakdown ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                  <XAxis dataKey="day" tick={{ fill: CHART_TEXT_COLOR }} />
                  <YAxis allowDecimals={false} tick={{ fill: CHART_TEXT_COLOR }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="languages">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Languages Requested</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={report?.language_distribution ?? []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: CHART_TEXT_COLOR }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={100}
                    tick={{ fontSize: 12, fill: CHART_TEXT_COLOR }}
                  />
                  <Tooltip />
                  <Bar
                    dataKey="value"
                    fill="hsl(var(--primary))"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="interpreters">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Interpreter Utilization (Appointments)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={report?.interpreter_utilization ?? []}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: CHART_TEXT_COLOR }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 12, fill: CHART_TEXT_COLOR }}
                  />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    fill="hsl(var(--accent))"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={report?.monthly_revenue ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: CHART_TEXT_COLOR }} />
                  <YAxis tickFormatter={(v) => `$${v}`} tick={{ fill: CHART_TEXT_COLOR }} />
                  <Tooltip
                    formatter={(v: number) => `$${v.toLocaleString()}`}
                  />
                  <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
