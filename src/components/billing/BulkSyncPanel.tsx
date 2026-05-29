import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Play, Pause, RotateCcw, CheckCircle2, XCircle, Loader2, AlertTriangle,
} from "lucide-react";
import { useQboConnection, type QboSyncJob } from "@/hooks/useQboConnection";

export default function BulkSyncPanel() {
  const { bulkSync, bulkSyncContinue, bulkSyncStatus, retryFailed, syncLog } = useQboConnection();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobState, setJobState] = useState<QboSyncJob | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const progressPct = jobState
    ? jobState.total_records > 0
      ? Math.round((jobState.processed_records / jobState.total_records) * 100)
      : 0
    : 0;

  const isDone = jobState?.status === "completed" || jobState?.status === "cancelled";
  const isRunning = !!activeJobId && !isDone && !isPaused;

  // Poll job status and auto-continue
  const pollAndContinue = useCallback(async () => {
    if (!activeJobId || isPaused) return;

    try {
      const status = await bulkSyncStatus.mutateAsync(activeJobId);
      setJobState(status as QboSyncJob);

      if (status.status === "completed" || status.status === "cancelled") {
        setIsPolling(false);
        return;
      }

      // Auto-continue: process next batch
      const result = await bulkSyncContinue.mutateAsync(activeJobId);

      // Refresh status after batch
      const updated = await bulkSyncStatus.mutateAsync(activeJobId);
      setJobState(updated as QboSyncJob);

      if ((updated as QboSyncJob).status === "completed") {
        setIsPolling(false);
        return;
      }

      // Schedule next batch
      pollRef.current = setTimeout(pollAndContinue, 1000);
    } catch {
      // On error, pause and let user retry
      setIsPaused(true);
      setIsPolling(false);
    }
  }, [activeJobId, isPaused, bulkSyncContinue, bulkSyncStatus]);

  useEffect(() => {
    if (isPolling && activeJobId && !isPaused) {
      pollRef.current = setTimeout(pollAndContinue, 500);
    }
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [isPolling, activeJobId, isPaused, pollAndContinue]);

  const handleStart = async () => {
    setJobState(null);
    setIsPaused(false);
    try {
      const result = await bulkSync.mutateAsync({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      if (result.jobId) {
        setActiveJobId(result.jobId);
        // Fetch initial status
        const status = await bulkSyncStatus.mutateAsync(result.jobId);
        setJobState(status as QboSyncJob);
        setIsPolling(true);
      }
    } catch {
      // Error handled by hook
    }
  };

  const handleResume = () => {
    setIsPaused(false);
    setIsPolling(true);
  };

  const handlePause = () => {
    setIsPaused(true);
    setIsPolling(false);
    if (pollRef.current) clearTimeout(pollRef.current);
  };

  const handleRetryFailed = () => {
    const failedLogIds = syncLog
      .filter(l => l.status === "failed")
      .map(l => l.id);
    if (failedLogIds.length > 0) {
      retryFailed.mutate(failedLogIds);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Bulk Sync to QuickBooks</CardTitle>
        <CardDescription>
          Sync all eligible appointments. Processes in batches with automatic continuation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Date range */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">From Date</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To Date</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          {!isRunning && !isDone && (
            <Button onClick={handleStart} disabled={bulkSync.isPending}>
              {bulkSync.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Start Bulk Sync
            </Button>
          )}
          {isRunning && (
            <Button variant="outline" onClick={handlePause}>
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </Button>
          )}
          {isPaused && activeJobId && !isDone && (
            <Button onClick={handleResume}>
              <Play className="h-4 w-4 mr-2" />
              Resume
            </Button>
          )}
          {isDone && jobState && jobState.failed_count > 0 && (
            <Button variant="outline" onClick={handleRetryFailed} disabled={retryFailed.isPending}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Retry {jobState.failed_count} Failed
            </Button>
          )}
          {isDone && (
            <Button variant="outline" onClick={() => { setActiveJobId(null); setJobState(null); }}>
              New Sync
            </Button>
          )}
        </div>

        {/* Progress */}
        {jobState && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                {isDone ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : isRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <Pause className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium">
                  {jobState.processed_records.toLocaleString()} / {jobState.total_records.toLocaleString()} processed
                </span>
              </div>
              <Badge variant="outline">{progressPct}%</Badge>
            </div>

            <Progress value={progressPct} className="h-3" />

            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-md bg-muted p-2">
                <div className="text-lg font-bold text-primary">{jobState.synced_count.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Synced</div>
              </div>
              <div className="rounded-md bg-muted p-2">
                <div className="text-lg font-bold text-destructive">{jobState.failed_count.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
              <div className="rounded-md bg-muted p-2">
                <div className="text-lg font-bold text-muted-foreground">
                  {(jobState.total_records - jobState.processed_records).toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">Remaining</div>
              </div>
            </div>

            {/* Errors summary */}
            {jobState.errors && jobState.errors.length > 0 && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Sync Errors ({jobState.errors.length})</AlertTitle>
                <AlertDescription className="max-h-32 overflow-y-auto text-xs space-y-1">
                  {jobState.errors.slice(-10).map((e: any, i: number) => (
                    <p key={i}>
                      <code className="font-mono">{e.appointmentId?.slice(0, 8)}</code>: {e.error}
                    </p>
                  ))}
                  {jobState.errors.length > 10 && (
                    <p className="text-muted-foreground">...and {jobState.errors.length - 10} more</p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Mapping warnings */}
            {jobState.mapping_warnings && jobState.mapping_warnings.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Mapping Warnings</AlertTitle>
                <AlertDescription className="text-xs space-y-1">
                  {jobState.mapping_warnings.map((w: string, i: number) => (
                    <p key={i}>{w}</p>
                  ))}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
