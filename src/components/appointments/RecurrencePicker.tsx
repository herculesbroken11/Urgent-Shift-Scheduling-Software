import { useState, useMemo, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Repeat } from "lucide-react";
import { format, addDays, addWeeks, addMonths } from "date-fns";

export interface RecurrenceRule {
  frequency: "daily" | "weekly" | "monthly";
  weekDays?: number[]; // 0=Sun, 1=Mon, ... 6=Sat
  endType: "occurrences" | "date";
  occurrences?: number;
  endDate?: string; // yyyy-MM-dd
}

interface Props {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  rule: RecurrenceRule;
  onRuleChange: (r: RecurrenceRule) => void;
  startDate?: string; // yyyy-MM-dd for preview
  startTime?: string; // HH:mm for preview
  disabled?: boolean;
}

const DAY_LABELS = [
  { short: "Su", idx: 0 },
  { short: "M", idx: 1 },
  { short: "T", idx: 2 },
  { short: "W", idx: 3 },
  { short: "Th", idx: 4 },
  { short: "F", idx: 5 },
  { short: "S", idx: 6 },
];

const MAX_OCCURRENCES = 100;
const MAX_MONTHS_OUT = 12;

export function generateOccurrenceDates(
  startDate: string,
  rule: RecurrenceRule
): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + "T00:00:00");
  const maxDate = addMonths(start, MAX_MONTHS_OUT);
  const maxOccurrences = rule.endType === "occurrences"
    ? Math.min(rule.occurrences ?? 10, MAX_OCCURRENCES)
    : MAX_OCCURRENCES;
  const endDate = rule.endType === "date" && rule.endDate
    ? new Date(rule.endDate + "T23:59:59")
    : maxDate;

  let current = start;
  let count = 0;

  if (rule.frequency === "daily") {
    while (count < maxOccurrences && current <= endDate && current <= maxDate) {
      dates.push(format(current, "yyyy-MM-dd"));
      count++;
      current = addDays(current, 1);
    }
  } else if (rule.frequency === "weekly") {
    const selectedDays = rule.weekDays?.length ? rule.weekDays : [start.getDay()];
    // Start from the beginning of the week containing the start date
    while (count < maxOccurrences && current <= endDate && current <= maxDate) {
      const dayOfWeek = current.getDay();
      if (selectedDays.includes(dayOfWeek) && current >= start) {
        dates.push(format(current, "yyyy-MM-dd"));
        count++;
      }
      current = addDays(current, 1);
    }
  } else if (rule.frequency === "monthly") {
    const dayOfMonth = start.getDate();
    while (count < maxOccurrences && current <= endDate && current <= maxDate) {
      dates.push(format(current, "yyyy-MM-dd"));
      count++;
      current = addMonths(current, 1);
      // Handle months where dayOfMonth doesn't exist (e.g., Jan 31 -> Feb 28)
      const newMonth = current.getMonth();
      current = new Date(current.getFullYear(), newMonth, Math.min(dayOfMonth, new Date(current.getFullYear(), newMonth + 1, 0).getDate()));
    }
  }

  return dates;
}

export function RecurrencePicker({ enabled, onEnabledChange, rule, onRuleChange, startDate, startTime, disabled }: Props) {
  const toggleDay = (dayIdx: number) => {
    const current = rule.weekDays || [];
    const next = current.includes(dayIdx)
      ? current.filter((d) => d !== dayIdx)
      : [...current, dayIdx].sort();
    onRuleChange({ ...rule, weekDays: next });
  };

  const previewText = useMemo(() => {
    if (!enabled || !startDate) return "";
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const shortDayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const timeStr = startTime ? format(new Date(`2000-01-01T${startTime}`), "h:mm a") : "";

    let freq = "";
    if (rule.frequency === "daily") {
      freq = "every day";
    } else if (rule.frequency === "weekly") {
      const days = (rule.weekDays || []).map((d) => shortDayNames[d]);
      freq = days.length ? `every ${days.join(", ")}` : "every week";
    } else {
      const dt = new Date(startDate + "T00:00:00");
      freq = `monthly on the ${dt.getDate()}${getOrdinalSuffix(dt.getDate())}`;
    }

    let end = "";
    if (rule.endType === "occurrences") {
      end = `for ${rule.occurrences ?? 10} occurrences`;
    } else if (rule.endDate) {
      end = `until ${format(new Date(rule.endDate + "T00:00:00"), "MMM d, yyyy")}`;
    }

    const count = startDate ? generateOccurrenceDates(startDate, rule).length : 0;

    return `Occurs ${freq}${timeStr ? ` at ${timeStr}` : ""} ${end} (${count} total)`;
  }, [enabled, rule, startDate, startTime]);

  if (disabled) return null;

  return (
    <div className="space-y-3 rounded-lg border p-4 bg-muted/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Repeat className="h-4 w-4 text-muted-foreground" />
          <Label className="cursor-pointer font-medium">Recurring Appointment</Label>
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </div>

      {enabled && (
        <div className="space-y-3 pt-1">
          {/* Frequency */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Frequency</Label>
            <Select
              value={rule.frequency}
              onValueChange={(v) => onRuleChange({ ...rule, frequency: v as any })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Weekly day selector */}
          {rule.frequency === "weekly" && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Repeat on</Label>
              <div className="flex gap-1">
                {DAY_LABELS.map((d) => (
                  <button
                    key={d.idx}
                    type="button"
                    onClick={() => toggleDay(d.idx)}
                    className={`h-8 w-8 rounded-full text-xs font-medium border transition-colors ${
                      (rule.weekDays || []).includes(d.idx)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {d.short}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* End criteria */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Ends</Label>
              <Select
                value={rule.endType}
                onValueChange={(v) => onRuleChange({ ...rule, endType: v as any })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="occurrences">After # occurrences</SelectItem>
                  <SelectItem value="date">By date</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {rule.endType === "occurrences" ? "Count" : "End Date"}
              </Label>
              {rule.endType === "occurrences" ? (
                <Input
                  type="number"
                  min={2}
                  max={MAX_OCCURRENCES}
                  className="h-8 text-sm"
                  value={rule.occurrences ?? 10}
                  onChange={(e) =>
                    onRuleChange({
                      ...rule,
                      occurrences: Math.min(parseInt(e.target.value) || 2, MAX_OCCURRENCES),
                    })
                  }
                />
              ) : (
                <Input
                  type="date"
                  className="h-8 text-sm"
                  value={rule.endDate ?? ""}
                  onChange={(e) => onRuleChange({ ...rule, endDate: e.target.value })}
                />
              )}
            </div>
          </div>

          {/* Preview summary */}
          {previewText && (
            <p className="text-xs text-muted-foreground italic border-t pt-2">
              {previewText}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
