import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  RefreshCw, RotateCcw, CheckCircle2, XCircle, Clock, Loader2,
  AlertTriangle, ArrowUpDown, Calendar, Search, FileText,
} from "lucide-react";
import { useQboConnection, type QboSyncLogEntry } from "@/hooks/useQboConnection";
import { format } from "date-fns";

const STATUS_CONFIG: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  success: { variant: "default", icon: CheckCircle2 },
  pending: { variant: "outline", icon: Clock },
  failed: { variant: "destructive", icon: XCircle },
  retrying: { variant: "secondary", icon: RefreshCw },
};

export default function QboSyncLog() {
  const { syncLog, syncLogLoading, retryFailed, bulkSync, reconcile } = useQboConnection();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = syncLog.filter((entry) => {
    if (statusFilter !== "all" && entry.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        entry.appointment_id?.toLowerCase().includes(q) ||
        entry.entity_type.toLowerCase().includes(q) ||
        entry.qbo_invoice_id?.toLowerCase().includes(q) ||
        entry.error_details?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const failedIds = filtered.filter((e) => e.status === "failed").map((e) => e.id);
  const selectedFailedIds = [...selectedIds].filter((id) => failedIds.includes(id));

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const selectAllFailed = () => {
    setSelectedIds(new Set(failedIds));
  };

  const stats = {
    total: syncLog.length,
    success: syncLog.filter((e) => e.status === "success").length,
    failed: syncLog.filter((e) => e.status === "failed").length,
    pending: syncLog.filter((e) => e.status === "pending").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">QuickBooks Sync Log</h1>
          <p className="text-sm text-muted-foreground">Track and manage sync activity with QuickBooks Online</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => reconcile.mutate()}
            disabled={reconcile.isPending}
          >
            {reconcile.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ArrowUpDown className="h-3 w-3 mr-1" />}
            Reconcile
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => retryFailed.mutate(selectedFailedIds)}
            disabled={selectedFailedIds.length === 0 || retryFailed.isPending}
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Retry Selected ({selectedFailedIds.length})
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total Syncs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{stats.success}</p>
            <p className="text-xs text-muted-foreground">Successful</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-destructive">{stats.failed}</p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-muted-foreground">{stats.pending}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
      </div>

      {/* Reconciliation results */}
      {reconcile.data && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Reconciliation Results</AlertTitle>
          <AlertDescription>
            {(reconcile.data as any).issues?.length
              ? `Found ${(reconcile.data as any).issues.length} issues.`
              : "No issues found."}
            {" "}{(reconcile.data as any).unsynced_count} unsynced appointments eligible for sync.
          </AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by appointment, invoice ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-60"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="retrying">Retrying</SelectItem>
            </SelectContent>
          </Select>
          {stats.failed > 0 && (
            <Button variant="ghost" size="sm" onClick={selectAllFailed}>
              Select All Failed
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Bulk Sync */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bulk Sync / Backfill</CardTitle>
          <CardDescription>Sync a range of historical appointments</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">From</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">To</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
          </div>
          <Button
            onClick={() => bulkSync.mutate({ dateFrom, dateTo })}
            disabled={!dateFrom || !dateTo || bulkSync.isPending}
            size="sm"
          >
            {bulkSync.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Bulk Sync
          </Button>
        </CardContent>
      </Card>

      {/* Log Table */}
      <Card>
        <CardContent className="p-0">
          {syncLogLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No sync activity yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 sticky left-0 z-30 bg-background" />
                  <TableHead>Time</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>QBO Type</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>QBO IDs</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((entry) => {
                  const sc = STATUS_CONFIG[entry.status] || STATUS_CONFIG.pending;
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="sticky left-0 z-10 bg-card">
                        {entry.status === "failed" && (
                          <Checkbox
                            checked={selectedIds.has(entry.id)}
                            onCheckedChange={() => toggleSelect(entry.id)}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-nowrap">
                        {format(new Date(entry.created_at), "MMM d, HH:mm")}
                      </TableCell>
                      <TableCell className="text-sm">{entry.entity_type}</TableCell>
                      <TableCell className="text-sm">{entry.qbo_object_type}</TableCell>
                      <TableCell className="text-sm">{entry.action}</TableCell>
                      <TableCell>
                        <Badge variant={sc.variant} className="gap-1 text-xs">
                          <sc.icon className="h-3 w-3" />
                          {entry.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono max-w-32 truncate">
                        {entry.qbo_invoice_id && <span>INV: {entry.qbo_invoice_id}</span>}
                        {entry.qbo_bill_id && <span className="ml-1">BILL: {entry.qbo_bill_id}</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-48 truncate">
                        {entry.error_details || (entry.completed_at ? `Done ${format(new Date(entry.completed_at), "HH:mm:ss")}` : "—")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
