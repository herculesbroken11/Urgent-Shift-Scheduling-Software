import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { GripVertical, Settings2 } from "lucide-react";

export interface ColumnDef {
  id: string;
  label: string;
  defaultVisible?: boolean;
  minWidth?: string;
}

export interface ColumnConfig {
  id: string;
  visible: boolean;
}

const STORAGE_KEY = "appt-grid-columns";

function loadConfig(allColumns: ColumnDef[]): ColumnConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved: ColumnConfig[] = JSON.parse(raw);
      // Merge: keep order from saved, add new columns at end
      const savedIds = new Set(saved.map((c) => c.id));
      const merged = saved.filter((c) => allColumns.some((ac) => ac.id === c.id));
      for (const col of allColumns) {
        if (!savedIds.has(col.id)) {
          merged.push({ id: col.id, visible: col.defaultVisible !== false });
        }
      }
      return merged;
    }
  } catch {}
  return allColumns.map((c) => ({ id: c.id, visible: c.defaultVisible !== false }));
}

function saveConfig(config: ColumnConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function useColumnLayout(allColumns: ColumnDef[]) {
  const [columns, setColumns] = useState<ColumnConfig[]>(() => loadConfig(allColumns));

  useEffect(() => {
    saveConfig(columns);
  }, [columns]);

  const visibleColumns = columns.filter((c) => c.visible);

  const toggleColumn = (id: string) => {
    setColumns((prev) =>
      prev.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c))
    );
  };

  const moveColumn = (fromIndex: number, toIndex: number) => {
    setColumns((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const resetToDefaults = () => {
    const defaults = allColumns.map((c) => ({ id: c.id, visible: c.defaultVisible !== false }));
    setColumns(defaults);
  };

  return { columns, visibleColumns, toggleColumn, moveColumn, resetToDefaults, setColumns };
}

interface ColumnLayoutEditorProps {
  allColumns: ColumnDef[];
  columns: ColumnConfig[];
  toggleColumn: (id: string) => void;
  moveColumn: (from: number, to: number) => void;
  resetToDefaults: () => void;
}

export function ColumnLayoutEditor({
  allColumns,
  columns,
  toggleColumn,
  moveColumn,
  resetToDefaults,
}: ColumnLayoutEditorProps) {
  const [open, setOpen] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const colMap = Object.fromEntries(allColumns.map((c) => [c.id, c]));

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) {
      moveColumn(dragIdx, idx);
      setDragIdx(idx);
    }
  };
  const handleDragEnd = () => setDragIdx(null);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5 text-xs h-7">
        <Settings2 className="h-3.5 w-3.5" />
        Columns
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Customize Columns</DialogTitle>
            <DialogDescription>Drag to reorder, toggle visibility</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {columns.map((col, idx) => {
              const def = colMap[col.id];
              if (!def) return null;
              return (
                <div
                  key={col.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-2 p-2 rounded-md border cursor-move transition-colors ${
                    dragIdx === idx ? "bg-accent/30 border-primary" : "bg-card hover:bg-muted/50"
                  }`}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <Label className="flex-1 cursor-move text-sm">{def.label}</Label>
                  <Switch
                    checked={col.visible}
                    onCheckedChange={() => toggleColumn(col.id)}
                    className="scale-75"
                  />
                </div>
              );
            })}
          </div>
          <Button variant="ghost" size="sm" onClick={resetToDefaults} className="w-full text-xs">
            Reset to Defaults
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
