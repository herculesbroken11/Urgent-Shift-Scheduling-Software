import { useCallback, useState } from "react";
import { Upload, FileSpreadsheet, AlertCircle, TestTube, Shield, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ENTITY_TYPE_LABELS, IMPORT_MODE_INFO, type WizardState, type ImportMode } from "@/hooks/useImportWizard";
import { MappingTemplateSelector } from "@/components/import/MappingTemplateSelector";
import { toast } from "sonner";

interface UploadStepProps {
  state: WizardState;
  onFileSelect: (file: File) => void;
  onEntityOverride: (val: string | null) => void;
  onSourceSystem: (val: string) => void;
  onImportMode: (val: ImportMode) => void;
  onNext: () => void;
}

const MODE_ICONS: Record<ImportMode, React.ElementType> = {
  test: TestTube,
  staged: Shield,
  live: Zap,
};

export function UploadStep({ state, onFileSelect, onEntityOverride, onSourceSystem, onImportMode, onNext }: UploadStepProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith(".csv")) onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect]
  );

  const fileSizeLabel = state.file
    ? state.file.size > 1024 * 1024
      ? `${(state.file.size / (1024 * 1024)).toFixed(1)} MB`
      : `${(state.file.size / 1024).toFixed(1)} KB`
    : "";

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        className={`
          relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-all cursor-pointer
          ${dragOver ? "border-primary bg-primary/5 scale-[1.01]" : "border-border hover:border-primary/50 hover:bg-muted/40"}
          ${state.file ? "border-accent bg-accent/5" : ""}
        `}
        onClick={() => document.getElementById("csv-upload-input")?.click()}
      >
        <input id="csv-upload-input" type="file" accept=".csv" className="hidden" onChange={handleFileInput} />
        {state.file ? (
          <>
            <FileSpreadsheet className="h-12 w-12 text-accent mb-3" />
            <p className="text-lg font-semibold text-foreground">{state.file.name}</p>
            <div className="flex gap-3 mt-2">
              <Badge variant="secondary">{fileSizeLabel}</Badge>
              <Badge variant="secondary">{state.rowCount.toLocaleString()} rows</Badge>
              <Badge variant="secondary">{state.headers.length} columns</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-3">Click or drop to replace</p>
          </>
        ) : (
          <>
            <Upload className="h-12 w-12 text-muted-foreground/60 mb-3" />
            <p className="text-lg font-medium text-foreground">Drop your CSV file here</p>
            <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
          </>
        )}
      </div>

      {state.file && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Headers preview */}
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium text-foreground mb-2">Detected Headers</p>
                <div className="flex flex-wrap gap-1.5">
                  {state.headers.map((h) => (
                    <Badge key={h} variant="outline" className="text-xs font-mono">
                      {h}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Entity type & source */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground mb-1.5">Entity Type</p>
                  <Select
                    value={state.entityTypeOverride || "__auto__"}
                    onValueChange={(v) => onEntityOverride(v === "__auto__" ? null : v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">Auto-detect</SelectItem>
                      {Object.entries(ENTITY_TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground mb-1.5">Source System</p>
                  <Select value={state.sourceSystem} onValueChange={onSourceSystem}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="codas_plus">CodaPlus</SelectItem>
                      <SelectItem value="csv_manual">Manual CSV</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Import Mode Selector */}
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

          {/* Mapping Templates */}
          <MappingTemplateSelector
            sourceSystem={state.sourceSystem}
            savedRulesCount={0}
            onApplyTemplate={(template) => {
              toast.success(`Applied "${template.name}" — ${template.rules.length} mapping rules loaded`);
            }}
            onUseSavedRules={() => {
              toast.success("Saved mapping rules will be applied during analysis");
            }}
          />
        </div>
      )}

      {state.error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!state.file || state.loading} size="lg">
          {state.loading ? "Analyzing…" : "Analyze File"}
        </Button>
      </div>
    </div>
  );
}
