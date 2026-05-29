import { useState } from "react";
import {
  FileSpreadsheet, Upload, Eye, AlertTriangle, CheckCircle2, ArrowRight,
  Play, Sparkles, BookOpen, Download, Layers
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SAMPLE_DATASETS, type SampleDatasetKey } from "@/lib/import-demo-data";

interface ImportOnboardingProps {
  onStartImport: () => void;
  onLoadSample: (key: SampleDatasetKey) => void;
}

const STEPS = [
  { icon: Upload, title: "Upload CSV", description: "Drag & drop your file or choose a sample dataset to explore" },
  { icon: Eye, title: "Preview & Validate", description: "See a row-by-row preview with quality scoring and error detection" },
  { icon: AlertTriangle, title: "Resolve Conflicts", description: "Map legacy values to system fields — save rules for future imports" },
  { icon: CheckCircle2, title: "Confirm & Execute", description: "Choose test, staged, or live mode — then run the import" },
];

export function ImportOnboarding({ onStartImport, onLoadSample }: ImportOnboardingProps) {
  const [showSamples, setShowSamples] = useState(false);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-4">
          <FileSpreadsheet className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Welcome to Data Import</h2>
        <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
          Bring your data from spreadsheets or legacy systems. Our guided wizard validates,
          maps, and safely imports your records.
        </p>
      </div>

      {/* How it works */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 text-center">How It Works</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map((step, i) => (
            <Card key={i} className="relative overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 shrink-0">
                    <step.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{i + 1}</Badge>
                      <p className="text-sm font-semibold text-foreground">{step.title}</p>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-3">
          <Button size="lg" onClick={onStartImport} className="gap-2">
            <Upload className="h-4 w-4" />
            Upload Your CSV
          </Button>
          <Button size="lg" variant="outline" onClick={() => setShowSamples(!showSamples)} className="gap-2">
            <Sparkles className="h-4 w-4" />
            Try a Sample
          </Button>
        </div>
      </div>

      {/* Sample datasets */}
      {showSamples && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground text-center">Choose a Sample Dataset</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-3xl mx-auto">
            {(Object.entries(SAMPLE_DATASETS) as [SampleDatasetKey, typeof SAMPLE_DATASETS[SampleDatasetKey]][]).map(([key, ds]) => (
              <button
                key={key}
                onClick={() => onLoadSample(key)}
                className="flex flex-col items-start gap-2 rounded-lg border-2 border-border hover:border-primary/40 hover:bg-primary/5 p-4 text-left transition-all"
              >
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">{ds.label}</span>
                </div>
                <p className="text-xs text-muted-foreground">{ds.description}</p>
                <Badge variant="secondary" className="text-xs">{ds.rowCount} rows</Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick start guide */}
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <BookOpen className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">Quick Start Guide</h4>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">1.</span>
                  <span><strong>Prepare your CSV</strong> — Include headers like <code className="bg-muted px-1 rounded">name</code>, <code className="bg-muted px-1 rounded">status</code>, <code className="bg-muted px-1 rounded">email</code>. The system auto-detects the entity type.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">2.</span>
                  <span><strong>Review quality</strong> — Each import gets a 0–100 quality score. Errors are flagged before anything touches your data.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">3.</span>
                  <span><strong>Map legacy values</strong> — If your CSV uses different status names (e.g. "To-do" instead of "requested"), the wizard lets you map them. Save rules for future imports.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">4.</span>
                  <span><strong>Choose your mode</strong> — <strong>Test</strong> validates without writing. <strong>Staged</strong> imports hidden from live views. <strong>Live</strong> goes directly to production.</span>
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
