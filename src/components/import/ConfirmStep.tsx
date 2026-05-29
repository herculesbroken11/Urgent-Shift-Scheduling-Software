import { Shield, ShieldAlert, TestTube, Zap, CheckCircle2, AlertTriangle, BarChart3, TrendingUp, TrendingDown, Gauge } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ENTITY_TYPE_LABELS, IMPORT_MODE_INFO, type WizardState, type ImportMode } from "@/hooks/useImportWizard";

interface ConfirmStepProps {
  state: WizardState;
  onImportMode: (val: ImportMode) => void;
  onExecute: () => void;
  onBack: () => void;
}

const MODE_ICONS: Record<ImportMode, React.ElementType> = { test: TestTube, staged: Shield, live: Zap };

function computeConfidence(state: WizardState): { level: number; label: string; color: string } {
  const { dryRunResult, conflictGroups } = state;
  if (!dryRunResult) return { level: 0, label: "Unknown", color: "text-muted-foreground" };

  const { summary, quality } = dryRunResult;
  let score = quality.score;

  // Penalize unresolved conflicts
  const unresolvedCount = conflictGroups.filter(g => !g.resolved).length;
  score -= unresolvedCount * 10;

  // Penalize errors
  const errorRate = summary.total > 0 ? (summary.errors / summary.total) * 100 : 0;
  score -= errorRate * 2;

  // Bonus for staging mode
  if (state.importMode === "staged") score += 5;
  if (state.importMode === "test") score += 10;

  score = Math.max(0, Math.min(100, Math.round(score)));

  if (score >= 80) return { level: score, label: "High Confidence", color: "text-[hsl(var(--success))]" };
  if (score >= 50) return { level: score, label: "Moderate Confidence", color: "text-[hsl(var(--warning))]" };
  return { level: score, label: "Low Confidence", color: "text-destructive" };
}

export function ConfirmStep({ state, onImportMode, onExecute, onBack }: ConfirmStepProps) {
  const { dryRunResult } = state;
  if (!dryRunResult) return null;

  const { summary, quality } = dryRunResult;
  const canExecute = quality.thresholds_met || summary.errors === 0;
  const isRisky = state.importMode === "live" && (summary.creates > 100 || summary.updates > 50);
  const confidence = computeConfidence(state);

  const risks: { label: string; severity: "warning" | "error" }[] = [];
  if (state.importMode === "live" && summary.creates > 50) risks.push({ label: `${summary.creates} records will be created in live mode`, severity: "warning" });
  if (state.importMode === "live" && summary.updates > 20) risks.push({ label: `${summary.updates} existing records will be modified`, severity: "warning" });
  if (summary.errors > 0) risks.push({ label: `${summary.errors} rows have errors and will be skipped`, severity: "error" });
  if (quality.score < 50) risks.push({ label: `Quality score (${quality.score}) is below recommended threshold`, severity: "error" });
  if (state.conflictGroups.some(g => g.action === "skip")) {
    const skippedRows = state.conflictGroups.filter(g => g.action === "skip").reduce((s, g) => s + g.count, 0);
    risks.push({ label: `${skippedRows} rows will be skipped due to conflict resolution`, severity: "warning" });
  }

  return (
    <div className="space-y-6">
      {/* Executive Summary */}
      <Card className="border-primary/20 bg-primary/[0.02]">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Executive Summary</h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <ImpactCard icon={<TrendingUp className="h-4 w-4" />} label="New Records" value={summary.creates} color="text-[hsl(var(--success))]" />
            <ImpactCard icon={<TrendingDown className="h-4 w-4" />} label="Updates" value={summary.updates} color="text-[hsl(var(--info))]" />
            <ImpactCard icon={<AlertTriangle className="h-4 w-4" />} label="Skipped" value={summary.skips + summary.errors} color="text-muted-foreground" />
            <div className="rounded-lg border border-border p-3 text-center">
              <div className={`flex items-center justify-center gap-1.5 mb-1 ${confidence.color}`}>
                <Gauge className="h-4 w-4" />
                <span className="text-2xl font-bold">{confidence.level}</span>
              </div>
              <p className="text-xs text-muted-foreground">{confidence.label}</p>
            </div>
          </div>

          {/* Confidence bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Import Confidence</span>
              <span className={`font-semibold ${confidence.color}`}>{confidence.level}%</span>
            </div>
            <Progress value={confidence.level} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Risk highlights */}
      {risks.length > 0 && (
        <Card className={risks.some(r => r.severity === "error") ? "border-destructive/30" : "border-[hsl(var(--warning))]/30"}>
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />
              Risk Assessment
            </p>
            {risks.map((risk, i) => (
              <div key={i} className={`flex items-center gap-2 text-xs ${risk.severity === "error" ? "text-destructive" : "text-[hsl(var(--warning))]"}`}>
                {risk.severity === "error" ? <ShieldAlert className="h-3 w-3 shrink-0" /> : <AlertTriangle className="h-3 w-3 shrink-0" />}
                {risk.label}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="text-lg font-semibold text-foreground">Import Details</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <SummaryItem label="Entity Type" value={ENTITY_TYPE_LABELS[state.entityType] || state.entityType} />
            <SummaryItem label="Source System" value={state.sourceSystem} />
            <SummaryItem label="File" value={state.file?.name || "—"} />
            <SummaryItem label="Total Rows" value={String(summary.total)} />
            <SummaryItem label="Quality Score" value={`${quality.score}/100`} highlight={quality.score >= 80 ? "success" : quality.score >= 50 ? "warning" : "error"} />
            <SummaryItem label="Conflicts Resolved" value={`${state.conflictGroups.filter((g) => g.resolved).length}/${state.conflictGroups.length}`} />
          </div>
        </CardContent>
      </Card>

      {/* Import Mode selector */}
      <div>
        <p className="text-sm font-medium text-foreground mb-3">Import Mode</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(["test", "staged", "live"] as ImportMode[]).map((mode) => {
            const info = IMPORT_MODE_INFO[mode];
            const Icon = MODE_ICONS[mode];
            const isSelected = state.importMode === mode;
            return (
              <button
                key={mode}
                onClick={() => onImportMode(mode)}
                className={`
                  flex items-start gap-3 rounded-lg border-2 p-4 text-left transition-all
                  ${isSelected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-primary/30 hover:bg-muted/30"
                  }
                `}
              >
                <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                <div>
                  <p className={`text-sm font-semibold ${isSelected ? "text-primary" : "text-foreground"}`}>{info.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{info.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Threshold warnings */}
      {!quality.thresholds_met && quality.threshold_violations.length > 0 && (
        <Card className="border-destructive/40">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-destructive mb-2">Quality Threshold Warnings</p>
            {quality.threshold_violations.map((v, i) => (
              <p key={i} className="text-xs text-destructive/80 flex items-center gap-2 py-0.5">
                <ShieldAlert className="h-3 w-3 shrink-0" /> {v}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={onExecute} disabled={!canExecute || state.loading} size="lg" className="gap-2">
          {state.loading ? "Starting…" : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              {state.importMode === "test" ? "Run Test" : "Confirm & Execute Import"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function ImpactCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-border p-3 text-center">
      <div className={`flex items-center justify-center gap-1.5 mb-1 ${color}`}>
        {icon}
        <span className="text-2xl font-bold">{value.toLocaleString()}</span>
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function SummaryItem({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  const colors: Record<string, string> = {
    success: "text-[hsl(var(--success))]",
    info: "text-[hsl(var(--info))]",
    warning: "text-[hsl(var(--warning))]",
    error: "text-destructive",
  };
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? colors[highlight] : "text-foreground"}`}>{value}</p>
    </div>
  );
}
