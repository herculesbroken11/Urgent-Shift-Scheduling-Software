import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, SkipForward, ArrowRight, Info, Eye, EyeOff, ArrowLeftRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getDeltaFields, type WizardState, type BatchRow } from "@/hooks/useImportWizard";

interface PreviewStepProps {
  state: WizardState;
  onNext: () => void;
  onBack: () => void;
}

export function PreviewStep({ state, onNext, onBack }: PreviewStepProps) {
  const { dryRunResult, batchRows } = state;
  const [showDeltaOnly, setShowDeltaOnly] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  if (!dryRunResult) return null;

  const { summary, quality } = dryRunResult;
  const previewRows = batchRows.slice(0, 50);
  const rawHeaders = previewRows.length > 0 ? Object.keys(previewRows[0].raw_data) : [];
  const hasConflicts = summary.conflicts > 0;
  const hasUpdates = summary.updates > 0;
  const nextLabel = hasConflicts ? "Resolve Conflicts" : "Review & Confirm";

  // Warning banners
  const warnings: string[] = [];
  if (summary.errors > 0) warnings.push(`${summary.errors} rows have errors that will prevent import.`);
  if (state.importMode === "live" && summary.creates > 50) warnings.push(`${summary.creates} records will be created directly in the live system.`);
  if (quality.score < 50) warnings.push("Quality score is below 50. Consider reviewing your data before proceeding.");

  return (
    <div className="space-y-6">
      {/* Warning banners */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-[hsl(var(--warning))]/10 border border-[hsl(var(--warning))]/30 p-3 text-sm text-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <SummaryCard label="Total" value={summary.total} icon={<Info className="h-4 w-4" />} variant="default" />
        <SummaryCard label="Create" value={summary.creates} icon={<CheckCircle2 className="h-4 w-4" />} variant="success" />
        <SummaryCard label="Update" value={summary.updates} icon={<ArrowRight className="h-4 w-4" />} variant="info" />
        <SummaryCard label="Skip" value={summary.skips} icon={<SkipForward className="h-4 w-4" />} variant="muted" />
        <SummaryCard label="Errors" value={summary.errors} icon={<XCircle className="h-4 w-4" />} variant="error" />
        <SummaryCard label="Conflicts" value={summary.conflicts} icon={<AlertTriangle className="h-4 w-4" />} variant="warning" />
        <SummaryCard label="Auto-fixed" value={summary.auto_fixed} icon={<CheckCircle2 className="h-4 w-4" />} variant="info" />
      </div>

      {/* Quality score */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Import Quality Score</span>
            <span className={`text-2xl font-bold ${scoreColor(quality.score)}`}>{quality.score}</span>
          </div>
          <Progress value={quality.score} className="h-2" />
          {!quality.thresholds_met && quality.threshold_violations.length > 0 && (
            <div className="mt-3 space-y-1">
              {quality.threshold_violations.map((v, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-destructive">
                  <XCircle className="h-3 w-3 shrink-0" />
                  {v}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delta toggle for updates */}
      {hasUpdates && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-[hsl(var(--info))]/5 border border-[hsl(var(--info))]/20">
          <ArrowLeftRight className="h-4 w-4 text-[hsl(var(--info))]" />
          <span className="text-sm text-foreground flex-1">{summary.updates} rows will be updated. Click a row to see field-level changes.</span>
          <div className="flex items-center gap-2">
            <Switch id="delta-toggle" checked={showDeltaOnly} onCheckedChange={setShowDeltaOnly} />
            <Label htmlFor="delta-toggle" className="text-xs text-muted-foreground whitespace-nowrap">Changed fields only</Label>
          </div>
        </div>
      )}

      {/* Row preview table */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 sticky left-0 bg-card z-10">#</TableHead>
                  <TableHead className="w-24 sticky left-12 bg-card z-10">Status</TableHead>
                  {rawHeaders.slice(0, 6).map((h) => (
                    <TableHead key={h} className="min-w-[120px] text-xs font-mono">{h}</TableHead>
                  ))}
                  <TableHead className="min-w-[200px]">Messages</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row) => {
                  const deltas = row.status === "update" ? getDeltaFields(row) : [];
                  const isExpanded = expandedRow === row.row_number;
                  const isSkipNoChanges = row.status === "skip" && row.validation_messages.some(m => m.message.toLowerCase().includes("unchanged"));

                  return (
                    <>
                      <TableRow
                        key={row.row_number}
                        className={`${rowBgClass(row.status)} ${row.status === "update" ? "cursor-pointer hover:bg-[hsl(var(--info))]/[0.08]" : ""}`}
                        onClick={() => row.status === "update" && setExpandedRow(isExpanded ? null : row.row_number)}
                      >
                        <TableCell className="text-xs text-muted-foreground sticky left-0 bg-inherit z-10">{row.row_number}</TableCell>
                        <TableCell className="sticky left-12 bg-inherit z-10">
                          <RowStatusBadge status={row.status} />
                        </TableCell>
                        {rawHeaders.slice(0, 6).map((h) => (
                          <TableCell key={h} className="text-xs max-w-[160px] truncate" title={row.raw_data[h]}>
                            {row.raw_data[h] || "—"}
                          </TableCell>
                        ))}
                        <TableCell>
                          <div className="space-y-0.5">
                            {isSkipNoChanges ? (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <SkipForward className="h-3 w-3" /> No changes (will be skipped)
                              </p>
                            ) : (
                              row.validation_messages
                                .filter((m) => m.level !== "info" || !m.auto_fixed)
                                .slice(0, 2)
                                .map((m, i) => (
                                  <p key={i} className={`text-xs ${msgColor(m.level)}`}>
                                    {m.message}
                                  </p>
                                ))
                            )}
                            {row.status === "update" && deltas.length > 0 && !isExpanded && (
                              <p className="text-xs text-[hsl(var(--info))] flex items-center gap-1">
                                <ArrowLeftRight className="h-3 w-3" /> {deltas.length} field{deltas.length !== 1 ? "s" : ""} changed
                              </p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && deltas.length > 0 && (
                        <TableRow key={`delta-${row.row_number}`} className="bg-[hsl(var(--info))]/[0.04]">
                          <TableCell colSpan={rawHeaders.slice(0, 6).length + 3} className="px-6 py-3">
                            <div className="space-y-1.5">
                              <p className="text-xs font-medium text-muted-foreground mb-2">Field-level changes:</p>
                              {deltas.map((d) => (
                                <div key={d.field} className="flex items-center gap-2 text-xs">
                                  <span className="font-mono text-muted-foreground w-32 truncate">{d.field}</span>
                                  <span className="text-destructive/70 line-through">{d.old_value || "—"}</span>
                                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-[hsl(var(--success))] font-medium">{d.new_value || "—"}</span>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={onNext} disabled={!quality.thresholds_met && summary.errors > 0}>
          {nextLabel}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SummaryCard({ label, value, icon, variant }: {
  label: string; value: number; icon: React.ReactNode; variant: string;
}) {
  const colors: Record<string, string> = {
    default: "text-foreground",
    success: "text-[hsl(var(--success))]",
    info: "text-[hsl(var(--info))]",
    warning: "text-[hsl(var(--warning))]",
    error: "text-destructive",
    muted: "text-muted-foreground",
  };
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <div className={`flex items-center justify-center gap-1 mb-1 ${colors[variant]}`}>
          {icon}
          <span className="text-2xl font-bold">{value}</span>
        </div>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function RowStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    create: { label: "Create", className: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30" },
    update: { label: "Update", className: "bg-[hsl(var(--info))]/15 text-[hsl(var(--info))] border-[hsl(var(--info))]/30" },
    skip: { label: "Skip", className: "bg-muted text-muted-foreground border-border" },
    error: { label: "Error", className: "bg-destructive/15 text-destructive border-destructive/30" },
    conflict: { label: "Conflict", className: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30" },
  };
  const c = config[status] || config.error;
  return <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${c.className}`}>{c.label}</Badge>;
}

function rowBgClass(status: string): string {
  switch (status) {
    case "create": return "bg-[hsl(var(--success))]/[0.03]";
    case "update": return "bg-[hsl(var(--info))]/[0.03]";
    case "error": return "bg-destructive/[0.04]";
    case "conflict": return "bg-[hsl(var(--warning))]/[0.04]";
    default: return "";
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-[hsl(var(--success))]";
  if (score >= 50) return "text-[hsl(var(--warning))]";
  return "text-destructive";
}

function msgColor(level: string): string {
  switch (level) {
    case "warning": return "text-[hsl(var(--warning))]";
    case "error": case "blocking": return "text-destructive";
    default: return "text-muted-foreground";
  }
}
