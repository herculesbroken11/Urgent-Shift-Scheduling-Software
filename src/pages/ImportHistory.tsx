import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import {
  CheckCircle2, XCircle, Clock, Download, RotateCcw, Eye, Upload,
  AlertTriangle, Loader2, FileSpreadsheet, ArrowLeft
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ENTITY_TYPE_LABELS } from "@/hooks/useImportWizard";
import { format } from "date-fns";
import { toast } from "sonner";

interface ImportBatch {
  id: string;
  entity_type: string;
  uploaded_filename: string;
  status: string;
  total_rows: number | null;
  processed_rows: number | null;
  source_system: string;
  is_staged: boolean;
  is_rollbackable: boolean;
  quality_score: number | null;
  dry_run_summary: any;
  execution_summary: any;
  created_at: string;
  completed_at: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  pending: { label: "Pending", icon: Clock, className: "bg-muted text-muted-foreground" },
  validating: { label: "Validating", icon: Loader2, className: "bg-[hsl(var(--info))]/15 text-[hsl(var(--info))]" },
  ready: { label: "Ready", icon: CheckCircle2, className: "bg-[hsl(var(--info))]/15 text-[hsl(var(--info))]" },
  processing: { label: "Processing", icon: Loader2, className: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]" },
  completed: { label: "Completed", icon: CheckCircle2, className: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]" },
  failed: { label: "Failed", icon: XCircle, className: "bg-destructive/15 text-destructive" },
  rolled_back: { label: "Rolled Back", icon: RotateCcw, className: "bg-muted text-muted-foreground" },
  rolling_back: { label: "Rolling Back", icon: Loader2, className: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]" },
};

export default function ImportHistory() {
  const [selectedBatch, setSelectedBatch] = useState<ImportBatch | null>(null);
  const [rollingBack, setRollingBack] = useState<string | null>(null);

  const { data: batches, isLoading, refetch } = useQuery({
    queryKey: ["import-batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_batches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as ImportBatch[];
    },
  });

  const handleRollback = async (batchId: string) => {
    setRollingBack(batchId);
    try {
      const { data, error } = await supabase.functions.invoke("process-import", {
        body: { action: "rollback", batch_id: batchId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Import rolled back successfully");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rollback failed");
    } finally {
      setRollingBack(null);
    }
  };

  const downloadReport = async (batch: ImportBatch) => {
    const { data: rows } = await supabase
      .from("import_batch_rows")
      .select("*")
      .eq("batch_id", batch.id)
      .order("row_number", { ascending: true })
      .limit(1000);

    if (!rows?.length) {
      toast.error("No rows found for this batch");
      return;
    }

    const csvLines = [
      "row_number,status,action_taken,messages",
      ...rows.map((r: any) =>
        `${r.row_number},"${r.status}","${r.action_taken || ""}","${((r.validation_messages as any[]) || []).map((m: any) => m.message).join("; ").replace(/"/g, '""')}"`
      ),
    ];
    const blob = new Blob([csvLines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-report-${batch.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Import History</h1>
          <p className="text-sm text-muted-foreground mt-1">View past imports, download reports, and manage rollbacks</p>
        </div>
        <Link to="/import">
          <Button className="gap-2">
            <Upload className="h-4 w-4" />
            New Import
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </div>
      ) : !batches?.length ? (
        <Card>
          <CardContent className="p-12 flex flex-col items-center text-center">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-1">No imports yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Start your first import to see history here.</p>
            <Link to="/import">
              <Button>Start Import</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead className="text-right">Quality</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => {
                  const cfg = STATUS_CONFIG[batch.status] || STATUS_CONFIG.pending;
                  const StatusIcon = cfg.icon;
                  const summary = batch.execution_summary as any;

                  return (
                    <TableRow key={batch.id}>
                      <TableCell className="text-sm">
                        {format(new Date(batch.created_at), "MMM d, yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="text-sm font-mono max-w-[200px] truncate" title={batch.uploaded_filename}>
                        {batch.uploaded_filename}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {ENTITY_TYPE_LABELS[batch.entity_type] || batch.entity_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs gap-1 ${cfg.className}`}>
                          <StatusIcon className={`h-3 w-3 ${batch.status === "processing" || batch.status === "validating" || batch.status === "rolling_back" ? "animate-spin" : ""}`} />
                          {cfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <span className="text-foreground">{batch.processed_rows ?? 0}</span>
                        <span className="text-muted-foreground">/{batch.total_rows ?? 0}</span>
                        {summary && (
                          <div className="text-xs text-muted-foreground">
                            {summary.created > 0 && <span className="text-[hsl(var(--success))]">+{summary.created}</span>}
                            {summary.updated > 0 && <span className="text-[hsl(var(--info))] ml-1">~{summary.updated}</span>}
                            {summary.failed > 0 && <span className="text-destructive ml-1">✗{summary.failed}</span>}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {batch.quality_score != null && (
                          <span className={`text-sm font-semibold ${
                            batch.quality_score >= 80 ? "text-[hsl(var(--success))]" :
                            batch.quality_score >= 50 ? "text-[hsl(var(--warning))]" : "text-destructive"
                          }`}>
                            {batch.quality_score}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedBatch(batch)} title="View details">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => downloadReport(batch)} title="Download report">
                            <Download className="h-4 w-4" />
                          </Button>
                          {batch.status === "completed" && batch.is_rollbackable && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRollback(batch.id)}
                              disabled={rollingBack === batch.id}
                              className="text-destructive hover:text-destructive"
                              title="Rollback"
                            >
                              {rollingBack === batch.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selectedBatch} onOpenChange={() => setSelectedBatch(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Details</DialogTitle>
          </DialogHeader>
          {selectedBatch && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-4">
                <DetailRow label="Batch ID" value={selectedBatch.id.slice(0, 12) + "…"} />
                <DetailRow label="File" value={selectedBatch.uploaded_filename} />
                <DetailRow label="Entity Type" value={ENTITY_TYPE_LABELS[selectedBatch.entity_type] || selectedBatch.entity_type} />
                <DetailRow label="Source System" value={selectedBatch.source_system} />
                <DetailRow label="Status" value={selectedBatch.status} />
                <DetailRow label="Mode" value={selectedBatch.is_staged ? "Staged" : "Live"} />
                <DetailRow label="Total Rows" value={String(selectedBatch.total_rows ?? 0)} />
                <DetailRow label="Processed" value={String(selectedBatch.processed_rows ?? 0)} />
                <DetailRow label="Quality Score" value={selectedBatch.quality_score != null ? String(selectedBatch.quality_score) : "—"} />
                <DetailRow label="Created" value={format(new Date(selectedBatch.created_at), "MMM d, yyyy HH:mm:ss")} />
                {selectedBatch.completed_at && (
                  <DetailRow label="Completed" value={format(new Date(selectedBatch.completed_at), "MMM d, yyyy HH:mm:ss")} />
                )}
                {selectedBatch.execution_summary && (
                  <>
                    <p className="text-xs font-semibold text-foreground pt-2 border-t border-border">Execution Summary</p>
                    {Object.entries(selectedBatch.execution_summary as Record<string, any>).map(([k, v]) => (
                      <DetailRow key={k} label={k.replace(/_/g, " ")} value={String(v)} />
                    ))}
                  </>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground capitalize">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}
