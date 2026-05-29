import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ──────────────────────────────────────────────────────────────────

export type WizardStep = "upload" | "preview" | "conflicts" | "confirm" | "execute" | "results";

export type ImportMode = "test" | "staged" | "live";

export type ConflictType =
  | "status_invalid"
  | "modality_invalid"
  | "customer_not_found"
  | "location_not_found"
  | "interpreter_not_found"
  | "generic";

export type ConflictAction = "map" | "skip" | "error";

export interface ImportSummary {
  total: number;
  creates: number;
  updates: number;
  skips: number;
  errors: number;
  conflicts: number;
  auto_fixed: number;
}

export interface QualityInfo {
  score: number;
  details: Record<string, unknown>;
  thresholds_met: boolean;
  threshold_violations: string[];
}

export interface DryRunResult {
  batch_id: string;
  entity_type: string;
  status: string;
  summary: ImportSummary;
  quality: QualityInfo;
  headers_detected: string[];
}

export interface BatchRow {
  id: string;
  row_number: number;
  raw_data: Record<string, string>;
  transformed_data: Record<string, unknown> | null;
  previous_data: Record<string, unknown> | null;
  status: string;
  action_taken: string | null;
  validation_messages: ValidationMessage[];
  conflict_type: string | null;
  target_record_id: string | null;
}

export interface ValidationMessage {
  level: "info" | "warning" | "error" | "blocking";
  field: string;
  message: string;
  auto_fixed?: boolean;
}

export interface ConflictGroup {
  field: string;
  source_value: string;
  count: number;
  rows: BatchRow[];
  conflict_type: ConflictType;
  resolved?: boolean;
  mapped_value?: string;
  action: ConflictAction;
}

export interface DeltaField {
  field: string;
  old_value: string | null;
  new_value: string | null;
}

export interface ExecutionResult {
  batch_id: string;
  status: string;
  summary: {
    total_processed: number;
    created: number;
    updated: number;
    failed: number;
    duration_ms: number;
    chunks_processed: number;
  };
}

// ─── Wizard State ───────────────────────────────────────────────────────────

export interface WizardState {
  step: WizardStep;
  file: File | null;
  csvContent: string;
  entityType: string;
  entityTypeOverride: string | null;
  sourceSystem: string;
  headers: string[];
  rowCount: number;
  importMode: ImportMode;
  protectedFields: string[];
  // Dry run
  dryRunResult: DryRunResult | null;
  batchRows: BatchRow[];
  // Conflicts
  conflictGroups: ConflictGroup[];
  mappingDecisions: { source_field: string; source_value: string; mapped_value: string; save_as_rule: boolean }[];
  // Execution
  executionResult: ExecutionResult | null;
  executionProgress: { current_chunk: number; total_chunks: number; processed_rows: number };
  // UI
  loading: boolean;
  error: string | null;
  completedSteps: WizardStep[];
}

const INITIAL_STATE: WizardState = {
  step: "upload",
  file: null,
  csvContent: "",
  entityType: "",
  entityTypeOverride: null,
  sourceSystem: "codas_plus",
  headers: [],
  rowCount: 0,
  importMode: "staged",
  protectedFields: [],
  dryRunResult: null,
  batchRows: [],
  conflictGroups: [],
  mappingDecisions: [],
  executionResult: null,
  executionProgress: { current_chunk: 0, total_chunks: 0, processed_rows: 0 },
  loading: false,
  error: null,
  completedSteps: [],
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function classifyConflictType(field: string, message: string): ConflictType {
  if (field === "status") return "status_invalid";
  if (field === "modality") return "modality_invalid";
  if (field === "customer_id" || message.toLowerCase().includes("customer")) return "customer_not_found";
  if (field === "location_id" || message.toLowerCase().includes("location")) return "location_not_found";
  if (field === "interpreter_id" || message.toLowerCase().includes("interpreter")) return "interpreter_not_found";
  return "generic";
}

function extractSourceValue(message: string): string {
  const match = message.match(/"([^"]+)"/);
  return match ? match[1] : "unknown";
}

export function getDeltaFields(row: BatchRow): DeltaField[] {
  if (row.status !== "update" || !row.previous_data || !row.transformed_data) return [];
  const deltas: DeltaField[] = [];
  const transformed = row.transformed_data as Record<string, unknown>;
  const previous = row.previous_data as Record<string, unknown>;
  for (const key of Object.keys(transformed)) {
    if (["id", "agency_id", "created_at", "updated_at", "source_hash", "import_batch_id", "is_import_staged", "is_deleted"].includes(key)) continue;
    const oldVal = previous[key];
    const newVal = transformed[key];
    if (String(oldVal ?? "") !== String(newVal ?? "")) {
      deltas.push({ field: key, old_value: oldVal != null ? String(oldVal) : null, new_value: newVal != null ? String(newVal) : null });
    }
  }
  return deltas;
}

export const CONFLICT_TYPE_LABELS: Record<ConflictType, string> = {
  status_invalid: "Invalid Status",
  modality_invalid: "Invalid Modality",
  customer_not_found: "Customer Not Found",
  location_not_found: "Location Not Found",
  interpreter_not_found: "Interpreter Not Found",
  generic: "Data Mismatch",
};

export const IMPORT_MODE_INFO: Record<ImportMode, { label: string; description: string; color: string }> = {
  test: { label: "Test Run", description: "Validates the file without writing anything to the database. Use this to check for errors before committing.", color: "info" },
  staged: { label: "Staged Import", description: "Records are imported but hidden from live views. You can review and promote them later.", color: "primary" },
  live: { label: "Live Import", description: "Records go directly into the live system and are immediately visible. Use with caution.", color: "warning" },
};

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useImportWizard() {
  const [state, setState] = useState<WizardState>(INITIAL_STATE);

  const update = useCallback((partial: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  const markStepComplete = useCallback((step: WizardStep) => {
    setState((prev) => ({
      ...prev,
      completedSteps: prev.completedSteps.includes(step) ? prev.completedSteps : [...prev.completedSteps, step],
    }));
  }, []);

  const goTo = useCallback((step: WizardStep) => {
    setState((prev) => {
      const currentStep = prev.step;
      const completed = prev.completedSteps.includes(currentStep) ? prev.completedSteps : [...prev.completedSteps, currentStep];
      return { ...prev, step, error: null, completedSteps: completed };
    });
  }, []);

  // ── File handling ──
  const handleFile = useCallback(async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const headers = lines[0]
      ? lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase().replace(/[^a-z0-9_]/g, "_"))
      : [];
    update({
      file,
      csvContent: text,
      headers,
      rowCount: Math.max(0, lines.length - 1),
      error: null,
    });
  }, [update]);

  // ── Dry run ──
  const runDryRun = useCallback(async () => {
    update({ loading: true, error: null });
    try {
      const { data, error } = await supabase.functions.invoke("process-import", {
        body: {
          action: "dry_run",
          csv_content: state.csvContent,
          entity_type: state.entityTypeOverride || undefined,
          source_system: state.sourceSystem,
          filename: state.file?.name || "import.csv",
          protected_fields: state.protectedFields,
          is_staged: state.importMode !== "live",
        },
      });
      if (error) throw new Error(error.message || "Dry run failed");
      if (data?.error) throw new Error(data.error);

      const result = data as DryRunResult;

      // Fetch batch rows
      const { data: rows } = await supabase
        .from("import_batch_rows")
        .select("*")
        .eq("batch_id", result.batch_id)
        .order("row_number", { ascending: true })
        .limit(1000);

      const batchRows = (rows || []) as unknown as BatchRow[];

      // Build conflict groups with structured types
      const conflictRows = batchRows.filter((r) => r.status === "conflict");
      const groupMap = new Map<string, ConflictGroup>();
      for (const row of conflictRows) {
        const errMsg = row.validation_messages.find((m) => m.level === "error");
        if (!errMsg) continue;
        const sourceValue = extractSourceValue(errMsg.message);
        const conflictType = classifyConflictType(errMsg.field, errMsg.message);
        const key = `${errMsg.field}::${sourceValue}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, { field: errMsg.field, source_value: sourceValue, count: 0, rows: [], conflict_type: conflictType, action: "map" });
        }
        const group = groupMap.get(key)!;
        group.count++;
        if (group.rows.length < 3) group.rows.push(row);
      }

      markStepComplete("upload");
      update({
        dryRunResult: result,
        batchRows,
        entityType: result.entity_type,
        conflictGroups: Array.from(groupMap.values()),
        loading: false,
        step: "preview",
      });
    } catch (err) {
      update({ loading: false, error: err instanceof Error ? err.message : "Dry run failed" });
    }
  }, [state.csvContent, state.entityTypeOverride, state.sourceSystem, state.file, state.protectedFields, state.importMode, update, markStepComplete]);

  // ── Execute import ──
  const executeImport = useCallback(async () => {
    if (!state.dryRunResult) return;

    // Test mode — don't actually execute
    if (state.importMode === "test") {
      markStepComplete("confirm");
      update({
        executionResult: {
          batch_id: state.dryRunResult.batch_id,
          status: "completed",
          summary: {
            total_processed: state.dryRunResult.summary.total,
            created: 0,
            updated: 0,
            failed: 0,
            duration_ms: 0,
            chunks_processed: 0,
          },
        },
        step: "results",
      });
      return;
    }

    update({ loading: true, error: null, step: "execute" });
    try {
      const { data, error } = await supabase.functions.invoke("process-import", {
        body: {
          action: "execute",
          batch_id: state.dryRunResult.batch_id,
          chunk_size: 100,
        },
      });
      if (error) throw new Error(error.message || "Execution failed");
      if (data?.error) throw new Error(data.error);

      markStepComplete("execute");
      update({
        executionResult: data as ExecutionResult,
        loading: false,
        step: "results",
      });
    } catch (err) {
      update({ loading: false, error: err instanceof Error ? err.message : "Execution failed" });
    }
  }, [state.dryRunResult, state.importMode, update, markStepComplete]);

  // ── Resume ──
  const resumeImport = useCallback(async () => {
    if (!state.dryRunResult) return;
    update({ loading: true, error: null });
    try {
      const { data, error } = await supabase.functions.invoke("process-import", {
        body: { action: "resume", batch_id: state.dryRunResult.batch_id },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      update({ executionResult: data as ExecutionResult, loading: false, step: "results" });
    } catch (err) {
      update({ loading: false, error: err instanceof Error ? err.message : "Resume failed" });
    }
  }, [state.dryRunResult, update]);

  // ── Rollback ──
  const rollbackImport = useCallback(async () => {
    if (!state.dryRunResult) return;
    update({ loading: true, error: null });
    try {
      const { data, error } = await supabase.functions.invoke("process-import", {
        body: { action: "rollback", batch_id: state.dryRunResult.batch_id },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      update({ loading: false });
    } catch (err) {
      update({ loading: false, error: err instanceof Error ? err.message : "Rollback failed" });
    }
  }, [state.dryRunResult, update]);

  // ── Save mapping rule ──
  const saveMappingRule = useCallback(async (
    sourceField: string,
    sourceValue: string,
    mappedField: string,
    mappedValue: string,
    saveAsReusable: boolean
  ) => {
    if (!state.dryRunResult) return;
    await supabase.from("import_mapping_rules" as any).insert({
      agency_id: undefined,
      source_system: state.sourceSystem,
      entity_type: state.entityType,
      source_field: sourceField,
      source_value: sourceValue,
      mapped_field: mappedField,
      mapped_value: mappedValue,
      is_reusable: saveAsReusable,
      created_by: undefined,
    });
  }, [state.dryRunResult, state.sourceSystem, state.entityType]);

  return {
    state,
    update,
    reset,
    goTo,
    handleFile,
    runDryRun,
    executeImport,
    resumeImport,
    rollbackImport,
    saveMappingRule,
    markStepComplete,
  };
}

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  appointments: "Appointments",
  customers: "Customers",
  locations: "Locations",
  interpreters: "Interpreters",
};

export const STEP_ORDER: WizardStep[] = ["upload", "preview", "conflicts", "confirm", "execute", "results"];

export function getStepIndex(step: WizardStep): number {
  return STEP_ORDER.indexOf(step);
}
