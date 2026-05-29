import { useState } from "react";
import { FileText, ChevronDown, Check, Layers } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BUILT_IN_TEMPLATES, type MappingTemplate } from "@/lib/import-demo-data";

interface MappingTemplateSelectorProps {
  sourceSystem: string;
  onApplyTemplate: (template: MappingTemplate) => void;
  savedRulesCount: number;
  onUseSavedRules: () => void;
}

export function MappingTemplateSelector({ sourceSystem, onApplyTemplate, savedRulesCount, onUseSavedRules }: MappingTemplateSelectorProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");

  const relevant = BUILT_IN_TEMPLATES.filter(t => t.source_system === sourceSystem || t.source_system === "csv_manual");

  if (relevant.length === 0 && savedRulesCount === 0) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 w-full text-left"
        >
          <Layers className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground flex-1">Mapping Templates & Rules</span>
          {savedRulesCount > 0 && (
            <Badge variant="secondary" className="text-xs">{savedRulesCount} saved rules</Badge>
          )}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>

        {expanded && (
          <div className="mt-4 space-y-3">
            {savedRulesCount > 0 && (
              <button
                onClick={onUseSavedRules}
                className="w-full flex items-start gap-3 rounded-lg border-2 border-border hover:border-primary/30 hover:bg-primary/5 p-3 text-left transition-all"
              >
                <FileText className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Use Existing Mapping Rules</p>
                  <p className="text-xs text-muted-foreground">Apply {savedRulesCount} previously saved rules from your agency</p>
                </div>
              </button>
            )}

            {relevant.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground font-medium">Or apply a template:</p>
                {relevant.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => onApplyTemplate(template)}
                    className="w-full flex items-start gap-3 rounded-lg border-2 border-border hover:border-primary/30 hover:bg-primary/5 p-3 text-left transition-all"
                  >
                    <Layers className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">{template.name}</p>
                      <p className="text-xs text-muted-foreground">{template.description}</p>
                      <Badge variant="outline" className="text-[10px] mt-1">{template.rules.length} rules</Badge>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
