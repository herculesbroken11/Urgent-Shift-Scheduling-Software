import { useNavigate } from "react-router-dom";
import { usePlatformStats } from "@/hooks/usePlatformData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, AlertTriangle, TrendingUp, XCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function PlatformDashboard() {
  const { data: stats, isLoading } = usePlatformStats();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const s = stats || {};

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Platform Dashboard</h1>

      {/* Agency stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Total Agencies" value={s.total_agencies || 0} icon={Building2}
          onClick={() => navigate("/platform/agencies")} />
        <StatCard label="Active" value={s.active_agencies || 0} icon={Building2} variant="success"
          onClick={() => navigate("/platform/agencies?status=active")} />
        <StatCard label="Trial" value={s.trial_agencies || 0} icon={Building2} variant="info"
          onClick={() => navigate("/platform/agencies?status=trial")} />
        <StatCard label="Suspended" value={s.suspended_agencies || 0} icon={Building2} variant="warning"
          onClick={() => navigate("/platform/agencies?status=suspended")} />
        <StatCard label="Cancelled" value={s.cancelled_agencies || 0} icon={Building2} variant="destructive"
          onClick={() => navigate("/platform/agencies?status=cancelled")} />
      </div>

      {/* Users & health */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={s.total_users || 0} icon={Users}
          onClick={() => navigate("/platform/users")} />
        <StatCard label="Failed Syncs (30d)" value={s.failed_syncs_30d || 0} icon={XCircle}
          variant={s.failed_syncs_30d > 0 ? "destructive" : undefined}
          onClick={() => navigate("/platform/diagnostics?tab=syncs")} />
        <StatCard label="Failed Imports (30d)" value={s.failed_imports_30d || 0} icon={AlertTriangle}
          variant={s.failed_imports_30d > 0 ? "destructive" : undefined}
          onClick={() => navigate("/platform/diagnostics?tab=imports")} />
        <StatCard label="Failed Notifs (30d)" value={s.failed_notifications_30d || 0} icon={AlertTriangle}
          variant={s.failed_notifications_30d > 0 ? "destructive" : undefined}
          onClick={() => navigate("/platform/diagnostics?tab=notifications")} />
      </div>

      {/* Users by role */}
      {s.users_by_role && Object.keys(s.users_by_role).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Users by Role</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-8 flex-wrap">
              {Object.entries(s.users_by_role).map(([role, count]) => (
                <div key={role} className="text-center cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => navigate(`/platform/users?role=${role}`)}>
                  <p className="text-2xl font-bold text-foreground">{count as number}</p>
                  <p className="text-xs text-muted-foreground capitalize">{(role as string).replace('_', ' ')}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly appointments chart */}
      {s.monthly_appointments && s.monthly_appointments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" /> Monthly Appointments (12 months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={s.monthly_appointments}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs" tick={{ fontSize: 11 }} />
                <YAxis className="text-xs" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total" fill="hsl(var(--primary))" name="Total" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" fill="hsl(var(--primary) / 0.4)" name="Completed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, variant, onClick }: {
  label: string; value: number; icon: React.ElementType;
  variant?: "success" | "info" | "warning" | "destructive";
  onClick?: () => void;
}) {
  const colorMap = {
    success: "text-green-600",
    info: "text-blue-600",
    warning: "text-yellow-600",
    destructive: "text-destructive",
  };
  const color = variant ? colorMap[variant] : "text-foreground";

  return (
    <Card className={onClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""} onClick={onClick}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
          <Icon className={`h-6 w-6 ${variant ? colorMap[variant] : 'text-muted-foreground/40'}`} />
        </div>
      </CardContent>
    </Card>
  );
}
