import { useState } from "react";
import { CheckCircle2, Download, RotateCcw, AlertTriangle, Clock, XCircle, ArrowRight, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { WizardState } from "@/hooks/useImportWizard";

interface ResultsStepProps {
  state: WizardState;
  onRollback: () => void;
  onNewImport: () => void;
  onResume: () => void;
}

export function ResultsStep({ state, onRollback, onNewImport, onResume }: ResultsStepProps) {
  const { executionResult } = state;
  const [confirmRollback, setConfirmRollback] = useState(false);

  if (!executionResult) return null;

  const { summary, status } = executionResult;
  const isSuccess = status === "completed";
  const isFailed = status === "failed";

  const downloadReport = () => {
    const rows = state.batchRows;
    const csvLines = [
      "row_number,status,action_taken,messages",
      ...rows.map((r) =>
        `${r.row_number},"${r.status}","${r.action_taken || ""}","${r.validation_messages.map((m) => m.message).join("; ").replace(/"/g, '""')}"`
      ),
    ];
    const blob = new Blob([csvLines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-report-${executionResult.batch_id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Status banner */}
      <Card className={isSuccess ? "border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/[0.03]" : "border-destructive/40 bg-destructive/[0.03]"}>
        <CardContent className="p-6 flex items-center gap-4">
          {isSuccess ? (
            <CheckCircle2 className="h-10 w-10 text-[hsl(var(--success))]" />
          ) : (
            <XCircle className="h-10 w-10 text-destructive" />
          )}
          <div>
            <h3 className="text-xl font-semibold text-foreground">
              {isSuccess ? "Import Complete" : "Import Failed"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {isSuccess
                ? `Successfully processed ${summary.total_processed.toLocaleString()} rows`
                : "Some records could not be imported. You can resume or review the errors."}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Created" value={summary.created} icon={<CheckCircle2 className="h-4 w-4" />} color="text-[hsl(var(--success))]" />
        <StatCard label="Updated" value={summary.updated} icon={<ArrowRight className="h-4 w-4" />} color="text-[hsl(var(--info))]" />
        <StatCard label="Failed" value={summary.failed} icon={<XCircle className="h-4 w-4" />} color="text-destructive" />
        <StatCard label="Duration" value={`${(summary.duration_ms / 1000).toFixed(1)}s`} icon={<Clock className="h-4 w-4" />} color="text-muted-foreground" isText />
      </div>

      {/* Warnings */}
      {summary.failed > 0 && (
        <Card className="border-[hsl(var(--warning))]/40">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-[hsl(var(--warning))] shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {summary.failed} record{summary.failed !== 1 ? "s" : ""} failed to import
              </p>
              <p className="text-xs text-muted-foreground">
                Download the report below for details on each failed row.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={downloadReport} className="gap-2">
          <Download className="h-4 w-4" />
          Download Report
        </Button>

        {isFailed && (
          <Button variant="outline" onClick={onResume} disabled={state.loading} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Resume Import
          </Button>
        )}

        {isSuccess && !confirmRollback && (
          <Button
            variant="outline"
            onClick={() => setConfirmRollback(true)}
            className="gap-2 text-destructive hover:text-destructive"
          >
            <RotateCcw className="h-4 w-4" />
            Rollback
          </Button>
        )}

        {confirmRollback && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
            <p className="text-sm text-destructive">Are you sure? This will undo the entire import.</p>
            <Button variant="destructive" size="sm" onClick={onRollback} disabled={state.loading}>
              Confirm Rollback
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmRollback(false)}>
              Cancel
            </Button>
          </div>
        )}

        <Button onClick={onNewImport} className="ml-auto gap-2">
          New Import
        </Button>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color, isText }: {
  label: string; value: number | string; icon: React.ReactNode; color: string; isText?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <div className={`flex items-center justify-center gap-1.5 mb-1 ${color}`}>
          {icon}
          <span className="text-2xl font-bold">
            {isText ? value : (typeof value === "number" ? value.toLocaleString() : value)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
