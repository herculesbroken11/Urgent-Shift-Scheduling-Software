import { useState, useCallback } from "react";
import { Upload, Eye, AlertTriangle, ClipboardCheck, Play, CheckCircle2, Check, Sparkles } from "lucide-react";
import { useImportWizard, STEP_ORDER, getStepIndex, type WizardStep, type BatchRow, type ConflictGroup } from "@/hooks/useImportWizard";
import { UploadStep } from "@/components/import/UploadStep";
import { PreviewStep } from "@/components/import/PreviewStep";
import { ConflictStep } from "@/components/import/ConflictStep";
import { ConfirmStep } from "@/components/import/ConfirmStep";
import { ExecuteStep } from "@/components/import/ExecuteStep";
import { ResultsStep } from "@/components/import/ResultsStep";
import { ImportOnboarding } from "@/components/import/ImportOnboarding";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { buildDemoState, SAMPLE_DATASETS, type SampleDatasetKey } from "@/lib/import-demo-data";

const STEP_META: Record<WizardStep, { label: string; icon: React.ElementType }> = {
  upload: { label: "Upload", icon: Upload },
  preview: { label: "Preview", icon: Eye },
  conflicts: { label: "Conflicts", icon: AlertTriangle },
  confirm: { label: "Confirm", icon: ClipboardCheck },
  execute: { label: "Execute", icon: Play },
  results: { label: "Results", icon: CheckCircle2 },
};

// ─── Demo data builder ──────────────────────────────────────────────────────

function buildDemoBatchRows(rows: Record<string, string>[], entityType: string): BatchRow[] {
  return rows.map((raw, i) => {
    // Simulate statuses with conflicts for appointments
    let status = "create";
    let conflictType: string | null = null;
    const validationMessages: any[] = [];

    if (entityType === "appointments") {
      const rawStatus = raw["status"] || "";
      const rawModality = raw["modality"] || "";
      const validStatuses = ["requested", "requested_last_minute", "interpreter_assigned", "interpreter_assigned_last_minute", "interpreter_confirmed", "reassignment_needed", "in_progress", "completed", "completed_last_minute", "cancelled", "late_cancel_no_show_client", "no_show_interpreter"];
      const validModalities = ["on_site", "video", "phone"];

      if (rawStatus && !validStatuses.includes(rawStatus.toLowerCase().replace(/[- ]/g, "_"))) {
        status = "conflict";
        conflictType = "status_invalid";
        validationMessages.push({ level: "error", field: "status", message: `Unknown status value "${rawStatus}"` });
      }
      if (rawModality && !validModalities.includes(rawModality.toLowerCase().replace(/[- ]/g, "_"))) {
        if (status !== "conflict") { status = "conflict"; conflictType = "modality_invalid"; }
        validationMessages.push({ level: "error", field: "modality", message: `Unknown modality "${rawModality}"` });
      }
      // Simulate some updates
      if (i === 3 || i === 8) {
        if (status === "create") status = "update";
      }
      // Simulate a skip
      if (i === 7 && !raw["interpreter_name"]) {
        validationMessages.push({ level: "warning", field: "interpreter_id", message: "No interpreter assigned" });
      }
    }

    return {
      id: `demo-row-${i}`,
      row_number: i + 1,
      raw_data: raw,
      transformed_data: { ...raw },
      previous_data: status === "update" ? { ...raw, status: "requested", notes: "Original notes" } : null,
      status,
      action_taken: null,
      validation_messages: validationMessages,
      conflict_type: conflictType,
      target_record_id: status === "update" ? `existing-${i}` : null,
    };
  });
}

function buildDemoConflictGroups(batchRows: BatchRow[]): ConflictGroup[] {
  const conflictRows = batchRows.filter(r => r.status === "conflict");
  const groupMap = new Map<string, ConflictGroup>();
  for (const row of conflictRows) {
    const errMsg = row.validation_messages.find(m => m.level === "error");
    if (!errMsg) continue;
    const match = errMsg.message.match(/"([^"]+)"/);
    const sourceValue = match ? match[1] : "unknown";
    const key = `${errMsg.field}::${sourceValue}`;
    if (!groupMap.has(key)) {
      const ct = errMsg.field === "status" ? "status_invalid" as const :
                 errMsg.field === "modality" ? "modality_invalid" as const : "generic" as const;
      groupMap.set(key, { field: errMsg.field, source_value: sourceValue, count: 0, rows: [], conflict_type: ct, action: "map" });
    }
    const group = groupMap.get(key)!;
    group.count++;
    if (group.rows.length < 3) group.rows.push(row);
  }
  return Array.from(groupMap.values());
}

export default function ImportWizard() {
  const wizard = useImportWizard();
  const { state, update, reset, goTo, handleFile, runDryRun, executeImport, resumeImport, rollbackImport, saveMappingRule, markStepComplete } = wizard;
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const currentIdx = getStepIndex(state.step);

  const handleConflictResolve = (field: string, sourceValue: string, mappedValue: string, saveAsRule: boolean) => {
    const updatedGroups = state.conflictGroups.map((g) =>
      g.field === field && g.source_value === sourceValue
        ? { ...g, resolved: true, mapped_value: mappedValue }
        : g
    );
    update({ conflictGroups: updatedGroups });
    if (saveAsRule && !isDemoMode) {
      saveMappingRule(field, sourceValue, field, mappedValue, true);
    }
  };

  const handleConflictAction = (field: string, sourceValue: string, action: "map" | "skip" | "error") => {
    const updatedGroups = state.conflictGroups.map((g) =>
      g.field === field && g.source_value === sourceValue
        ? { ...g, action, resolved: action !== "map" ? true : g.resolved, mapped_value: action === "skip" ? "__skip__" : action === "error" ? "__error__" : g.mapped_value }
        : g
    );
    update({ conflictGroups: updatedGroups });
  };

  const handleLoadSample = useCallback((key: SampleDatasetKey) => {
    setShowOnboarding(false);
    setIsDemoMode(true);
    const demo = buildDemoState(key);
    const fakeFile = new File([demo.csv], `sample-${key}.csv`, { type: "text/csv" });
    const batchRows = buildDemoBatchRows(demo.rows, key);
    const conflictGroups = buildDemoConflictGroups(batchRows);
    const creates = batchRows.filter(r => r.status === "create").length;
    const updates = batchRows.filter(r => r.status === "update").length;
    const conflicts = batchRows.filter(r => r.status === "conflict").length;
    const skips = batchRows.filter(r => r.status === "skip").length;
    const errors = batchRows.filter(r => r.status === "error").length;

    update({
      file: fakeFile,
      csvContent: demo.csv,
      headers: demo.headers,
      rowCount: demo.rowCount,
      entityType: key,
      importMode: "test",
      dryRunResult: {
        batch_id: `demo-batch-${Date.now()}`,
        entity_type: key,
        status: "ready",
        summary: { total: demo.rowCount, creates, updates, skips, errors, conflicts, auto_fixed: 0 },
        quality: { score: 78, details: {}, thresholds_met: true, threshold_violations: [] },
        headers_detected: demo.headers,
      },
      batchRows,
      conflictGroups,
      step: "preview",
      completedSteps: ["upload"],
    });
  }, [update]);

  const handleStartImport = useCallback(() => {
    setShowOnboarding(false);
    setIsDemoMode(false);
    reset();
  }, [reset]);

  const handleDemoExecute = useCallback(async () => {
    if (isDemoMode) {
      // Simulated execution
      update({ step: "execute", loading: true });
      await new Promise(r => setTimeout(r, 1500));
      const total = state.dryRunResult?.summary.total || 0;
      const creates = state.dryRunResult?.summary.creates || 0;
      const updates = state.dryRunResult?.summary.updates || 0;
      markStepComplete("confirm");
      update({
        loading: false,
        step: "results",
        executionResult: {
          batch_id: state.dryRunResult?.batch_id || "demo",
          status: "completed",
          summary: { total_processed: total, created: creates, updated: updates, failed: 0, duration_ms: 1500, chunks_processed: 1 },
        },
      });
      return;
    }
    executeImport();
  }, [isDemoMode, state.dryRunResult, update, markStepComplete, executeImport]);

  // Show onboarding if no active import
  if (showOnboarding && !state.file && state.step === "upload") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Import Data</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Upload a CSV file to import customers, locations, interpreters, or appointments
            </p>
          </div>
          <Link to="/import-history">
            <Button variant="outline" size="sm" className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Import History
            </Button>
          </Link>
        </div>
        <ImportOnboarding onStartImport={handleStartImport} onLoadSample={handleLoadSample} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Import Data</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Upload a CSV file to import customers, locations, interpreters, or appointments
            </p>
          </div>
          {isDemoMode && (
            <Badge className="bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30 gap-1">
              <Sparkles className="h-3 w-3" />
              Demo Mode
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {(isDemoMode || state.step !== "upload") && (
            <Button variant="ghost" size="sm" onClick={() => { setShowOnboarding(true); setIsDemoMode(false); reset(); }}>
              ← Start Over
            </Button>
          )}
          <Link to="/import-history">
            <Button variant="outline" size="sm" className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Import History
            </Button>
          </Link>
        </div>
      </div>

      {/* Step indicator */}
      <nav className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEP_ORDER.map((step, i) => {
          const meta = STEP_META[step];
          const Icon = meta.icon;
          const isActive = step === state.step;
          const isPast = i < currentIdx;
          const isCompleted = state.completedSteps.includes(step);
          const isFuture = i > currentIdx && !isCompleted;

          return (
            <div key={step} className="flex items-center">
              {i > 0 && (
                <div className={`h-px w-6 mx-1 transition-colors ${isPast || isCompleted ? "bg-primary" : "bg-border"}`} />
              )}
              <button
                onClick={() => (isPast || isCompleted) && goTo(step)}
                disabled={isFuture && !isCompleted}
                className={`
                  flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all whitespace-nowrap
                  ${isActive
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                    : isCompleted || isPast
                      ? "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  }
                `}
              >
                {isCompleted && !isActive ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">{meta.label}</span>
              </button>
            </div>
          );
        })}
      </nav>

      {/* Step content */}
      <div className="min-h-[400px]">
        {state.step === "upload" && (
          <UploadStep
            state={state}
            onFileSelect={handleFile}
            onEntityOverride={(val) => update({ entityTypeOverride: val })}
            onSourceSystem={(val) => update({ sourceSystem: val })}
            onImportMode={(val) => update({ importMode: val })}
            onNext={runDryRun}
          />
        )}

        {state.step === "preview" && (
          <PreviewStep
            state={state}
            onNext={() => {
              if (state.dryRunResult && state.dryRunResult.summary.conflicts > 0) {
                goTo("conflicts");
              } else {
                goTo("confirm");
              }
            }}
            onBack={() => {
              if (isDemoMode) { setShowOnboarding(true); setIsDemoMode(false); reset(); }
              else goTo("upload");
            }}
          />
        )}

        {state.step === "conflicts" && (
          <ConflictStep
            state={state}
            onResolve={handleConflictResolve}
            onConflictAction={handleConflictAction}
            onNext={() => goTo("confirm")}
            onBack={() => goTo("preview")}
          />
        )}

        {state.step === "confirm" && (
          <ConfirmStep
            state={state}
            onImportMode={(val) => update({ importMode: val })}
            onExecute={handleDemoExecute}
            onBack={() => {
              if (state.conflictGroups.length > 0) goTo("conflicts");
              else goTo("preview");
            }}
          />
        )}

        {state.step === "execute" && (
          <ExecuteStep state={state} />
        )}

        {state.step === "results" && (
          <ResultsStep
            state={state}
            onRollback={isDemoMode ? async () => {} : rollbackImport}
            onNewImport={() => { setShowOnboarding(true); setIsDemoMode(false); reset(); }}
            onResume={isDemoMode ? async () => {} : resumeImport}
          />
        )}
      </div>
    </div>
  );
}
