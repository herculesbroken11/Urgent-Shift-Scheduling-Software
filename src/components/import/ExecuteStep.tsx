import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { WizardState } from "@/hooks/useImportWizard";

interface ExecuteStepProps {
  state: WizardState;
}

export function ExecuteStep({ state }: ExecuteStepProps) {
  const { executionProgress, dryRunResult } = state;
  const totalRows = dryRunResult?.summary.total || 0;
  const progressPct = executionProgress.total_chunks > 0
    ? Math.round((executionProgress.current_chunk / executionProgress.total_chunks) * 100)
    : 0;

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-8">
      {/* Spinner */}
      <div className="relative">
        <div className="h-24 w-24 rounded-full border-4 border-muted flex items-center justify-center">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        </div>
      </div>

      <div className="text-center space-y-2">
        <h3 className="text-xl font-semibold text-foreground">Importing Data…</h3>
        <p className="text-sm text-muted-foreground">
          Processing {totalRows.toLocaleString()} rows in chunks
        </p>
      </div>

      {/* Progress */}
      <Card className="w-full max-w-md">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-semibold text-foreground">{progressPct}%</span>
          </div>
          <Progress value={progressPct} className="h-3" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Chunk {executionProgress.current_chunk} of {executionProgress.total_chunks}</span>
            <span>{executionProgress.processed_rows.toLocaleString()} rows</span>
          </div>
        </CardContent>
      </Card>

      {state.error && (
        <Card className="w-full max-w-md border-destructive/40">
          <CardContent className="p-4">
            <p className="text-sm text-destructive">{state.error}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
