import { useState } from "react";
import { usePlatformAuditLog } from "@/hooks/usePlatformData";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";

const ACTION_TYPES = [
  "bootstrap", "seed_platform_owner", "promote_platform_owner", "demote_platform_owner",
  "update_agency", "disable_user", "enable_user", "force_password_reset",
  "remove_user_from_agency", "start_support_session", "end_support_session",
];

const TARGET_TYPES = ["platform", "agency", "user", "support_session"];

export default function PlatformAudit() {
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState("all");
  const [targetFilter, setTargetFilter] = useState("all");

  const { data, isLoading } = usePlatformAuditLog(
    page,
    actionFilter !== "all" ? actionFilter : undefined,
    targetFilter !== "all" ? targetFilter : undefined,
  );

  const entries = data?.data || [];
  const totalCount = data?.total_count || 0;
  const totalPages = Math.ceil(totalCount / 50);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Platform Audit Log</h1>

      <div className="flex flex-wrap gap-3">
        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Actions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {ACTION_TYPES.map((a) => (
              <SelectItem key={a} value={a}>{a.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={targetFilter} onValueChange={(v) => { setTargetFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Targets" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Targets</SelectItem>
            {TARGET_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="capitalize">{t.replace('_', ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center p-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(e.created_at), "MMM d, yyyy HH:mm:ss")}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{e.actor_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{e.action.replace(/_/g, ' ')}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="text-muted-foreground">{e.target_type}</span>
                      {e.target_id && <span className="ml-1 text-xs font-mono">{e.target_id.slice(0, 8)}</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate" title={JSON.stringify(e.details)}>
                      {JSON.stringify(e.details).slice(0, 80)}
                    </TableCell>
                  </TableRow>
                ))}
                {entries.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No audit entries</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{totalCount} total entries</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm py-1">Page {page + 1} of {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={page >= totalPages - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
