import { useState } from "react";
import { AlertTriangle, Check, Save, SkipForward, XCircle, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CONFLICT_TYPE_LABELS, type WizardState, type ConflictGroup, type ConflictAction, type ConflictType } from "@/hooks/useImportWizard";

interface ConflictStepProps {
  state: WizardState;
  onResolve: (field: string, sourceValue: string, mappedValue: string, saveAsRule: boolean) => void;
  onConflictAction: (field: string, sourceValue: string, action: ConflictAction) => void;
  onNext: () => void;
  onBack: () => void;
}

const STATUS_OPTIONS = [
  "requested", "requested_last_minute", "interpreter_assigned", "interpreter_assigned_last_minute",
  "interpreter_confirmed", "reassignment_needed", "in_progress",
  "completed", "completed_last_minute", "cancelled",
  "late_cancel_no_show_client", "no_show_interpreter",
];

const MODALITY_OPTIONS = ["on_site", "video", "phone"];

function getOptionsForField(field: string): string[] {
  if (field === "status") return STATUS_OPTIONS;
  if (field === "modality") return MODALITY_OPTIONS;
  return [];
}

function formatOptionLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getConflictIcon(type: ConflictType) {
  switch (type) {
    case "customer_not_found":
    case "location_not_found":
    case "interpreter_not_found":
      return <XCircle className="h-4 w-4 text-destructive" />;
    default:
      return <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />;
  }
}

export function ConflictStep({ state, onResolve, onConflictAction, onNext, onBack }: ConflictStepProps) {
  const unresolved = state.conflictGroups.filter((g) => !g.resolved);
  const resolved = state.conflictGroups.filter((g) => g.resolved);
  const allResolved = unresolved.length === 0;

  // Group by conflict type
  const groupedByType = new Map<ConflictType, ConflictGroup[]>();
  for (const g of state.conflictGroups) {
    const existing = groupedByType.get(g.conflict_type) || [];
    existing.push(g);
    groupedByType.set(g.conflict_type, existing);
  }

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-[hsl(var(--warning))]" />
        <div className="flex-1">
          <p className="text-sm font-medium">
            {allResolved
              ? "All conflicts resolved"
              : `${unresolved.length} conflict${unresolved.length !== 1 ? "s" : ""} need resolution`}
          </p>
          <p className="text-xs text-muted-foreground">
            Map unknown source values, skip affected rows, or mark as errors
          </p>
        </div>
        <Badge variant={allResolved ? "default" : "outline"}>
          {resolved.length}/{state.conflictGroups.length} resolved
        </Badge>
      </div>

      {/* Bulk actions hint */}
      {unresolved.length > 1 && (
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          <ChevronDown className="h-4 w-4" />
          Each conflict can be mapped, skipped, or marked as an error individually.
        </div>
      )}

      {/* Grouped by type */}
      {Array.from(groupedByType.entries()).map(([type, groups]) => {
        const unresolvedInGroup = groups.filter(g => !g.resolved);
        if (unresolvedInGroup.length === 0 && resolved.length > 0) return null;
        
        return (
          <div key={type} className="space-y-3">
            <div className="flex items-center gap-2">
              {getConflictIcon(type)}
              <h3 className="text-sm font-semibold text-foreground">{CONFLICT_TYPE_LABELS[type]}</h3>
              <Badge variant="outline" className="text-xs">{groups.length}</Badge>
            </div>
            {unresolvedInGroup.map((group) => (
              <ConflictCard
                key={`${group.field}::${group.source_value}`}
                group={group}
                onResolve={onResolve}
                onConflictAction={onConflictAction}
              />
            ))}
          </div>
        );
      })}

      {/* Resolved */}
      {resolved.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Resolved</p>
          {resolved.map((group) => (
            <Card key={`${group.field}::${group.source_value}`} className="opacity-70">
              <CardContent className="p-3 flex items-center gap-3">
                {group.action === "skip" ? (
                  <SkipForward className="h-4 w-4 text-muted-foreground" />
                ) : group.action === "error" ? (
                  <XCircle className="h-4 w-4 text-destructive" />
                ) : (
                  <Check className="h-4 w-4 text-[hsl(var(--success))]" />
                )}
                <span className="text-sm">
                  <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{group.source_value}</span>
                  {group.action === "skip" ? (
                    <span className="text-muted-foreground ml-2">→ Rows will be skipped</span>
                  ) : group.action === "error" ? (
                    <span className="text-destructive ml-2">→ Marked as error</span>
                  ) : (
                    <>
                      {" → "}
                      <span className="font-medium">{formatOptionLabel(group.mapped_value || "")}</span>
                    </>
                  )}
                </span>
                <Badge variant="secondary" className="ml-auto text-xs">{group.count} rows</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={onNext} disabled={!allResolved}>
          Review & Confirm
        </Button>
      </div>
    </div>
  );
}

// ─── Conflict Card ──────────────────────────────────────────────────────────

function ConflictCard({ group, onResolve, onConflictAction }: {
  group: ConflictGroup;
  onResolve: (field: string, sourceValue: string, mappedValue: string, saveAsRule: boolean) => void;
  onConflictAction: (field: string, sourceValue: string, action: ConflictAction) => void;
}) {
  const [selectedValue, setSelectedValue] = useState("");
  const [saveAsRule, setSaveAsRule] = useState(true);
  const [activeTab, setActiveTab] = useState<ConflictAction>("map");
  const options = getOptionsForField(group.field);

  return (
    <Card className="border-[hsl(var(--warning))]/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {getConflictIcon(group.conflict_type)}
            <span className="font-mono bg-[hsl(var(--warning))]/10 px-2 py-0.5 rounded text-sm">{group.source_value}</span>
          </CardTitle>
          <Badge variant="outline">{group.count} rows affected</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Example rows */}
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Example rows</p>
          {group.rows.slice(0, 2).map((row) => (
            <div key={row.row_number} className="text-xs text-foreground/70 flex gap-4 py-1">
              <span className="text-muted-foreground">Row {row.row_number}:</span>
              <span className="truncate max-w-[300px]">
                {Object.entries(row.raw_data).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(", ")}
              </span>
            </div>
          ))}
        </div>

        {/* Action tabs */}
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {([
            { key: "map" as const, label: "Map Value", icon: Check },
            { key: "skip" as const, label: "Skip Rows", icon: SkipForward },
            { key: "error" as const, label: "Mark Error", icon: XCircle },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                activeTab === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>

        {activeTab === "map" && (
          <>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label className="text-xs mb-1.5 block">Map to</Label>
                {options.length > 0 ? (
                  <Select value={selectedValue} onValueChange={setSelectedValue}>
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${group.field}…`} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((opt) => (
                        <SelectItem key={opt} value={opt}>{formatOptionLabel(opt)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <input
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder={`Enter mapped value for ${group.field}…`}
                    value={selectedValue}
                    onChange={(e) => setSelectedValue(e.target.value)}
                  />
                )}
              </div>
              <Button
                size="sm"
                disabled={!selectedValue}
                onClick={() => onResolve(group.field, group.source_value, selectedValue, saveAsRule)}
              >
                <Check className="h-4 w-4 mr-1" />
                Apply
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Switch id={`save-rule-${group.field}-${group.source_value}`} checked={saveAsRule} onCheckedChange={setSaveAsRule} />
              <Label htmlFor={`save-rule-${group.field}-${group.source_value}`} className="text-xs text-muted-foreground flex items-center gap-1">
                <Save className="h-3 w-3" />
                Save as reusable mapping rule
              </Label>
            </div>
          </>
        )}

        {activeTab === "skip" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              All {group.count} rows with this value will be skipped during import.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onConflictAction(group.field, group.source_value, "skip")}
            >
              <SkipForward className="h-4 w-4 mr-1" />
              Skip {group.count} rows
            </Button>
          </div>
        )}

        {activeTab === "error" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Rows will be marked as errors in the report but the rest of the import will continue.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => onConflictAction(group.field, group.source_value, "error")}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Mark as error
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
