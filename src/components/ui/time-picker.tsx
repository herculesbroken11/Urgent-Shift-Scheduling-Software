import * as React from "react";
import { useState, useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TimePickerProps {
  value: string; // HH:mm 24h format
  onChange: (value: string) => void;
  interval?: number; // minutes between slots, default 15
  className?: string;
  required?: boolean;
  disabled?: boolean;
}

export type { TimePickerProps };

function generateTimeSlots(interval: number) {
  const slots: string[] = [];
  for (let m = 0; m < 24 * 60; m += interval) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`);
  }
  return slots;
}

function to12h(hhmm: string): string {
  if (!hhmm) return "";
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const m = mStr;
  const ampm = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${ampm}`;
}

function parse12hTo24h(input: string): string | null {
  const trimmed = input.trim().toUpperCase();
  
  // Try HH:mm 24h format first
  const m24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = parseInt(m24[1], 10);
    const m = parseInt(m24[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    }
  }

  // Try 12h format: 2:30 PM, 2:30PM, 2PM, 2 PM
  const m12 = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const m = parseInt(m12[2] || "0", 10);
    const period = m12[3];
    if (h < 1 || h > 12 || m < 0 || m > 59) return null;
    if (period === "AM" && h === 12) h = 0;
    else if (period === "PM" && h !== 12) h += 12;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  }

  return null;
}

export function TimePicker({ value, onChange, interval = 15, className, required, disabled }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const slots = useMemo(() => generateTimeSlots(interval), [interval]);
  const displayValue = to12h(value);

  // When opening, scroll to current value
  useEffect(() => {
    if (open && activeRef.current) {
      setTimeout(() => activeRef.current?.scrollIntoView({ block: "center" }), 50);
    }
  }, [open]);

  const filteredSlots = useMemo(() => {
    if (!search) return slots;
    const lower = search.trim().toLowerCase().replace(/\s+/g, "");
    return slots.filter((s) => {
      const display = to12h(s).toLowerCase().replace(/\s+/g, "");
      // Also match just the hour: "9" matches "9:00am", "9:15am", etc.
      const hourMatch = s.startsWith(lower.padStart(2, "0")) || display.startsWith(lower);
      return display.includes(lower) || s.includes(lower) || hourMatch;
    });
  }, [slots, search]);

  const handleSelect = (slot: string) => {
    onChange(slot);
    setOpen(false);
    setSearch("");
  };

  const handleInputBlur = () => {
    if (search) {
      const parsed = parse12hTo24h(search);
      if (parsed) {
        onChange(parsed);
      }
      setSearch("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (search) {
        const parsed = parse12hTo24h(search);
        if (parsed) {
          onChange(parsed);
          setOpen(false);
          setSearch("");
        } else if (filteredSlots.length > 0) {
          handleSelect(filteredSlots[0]);
        }
      }
    }
  };

  return (
    <Popover open={disabled ? false : open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            !value && "text-muted-foreground",
            className
          )}
        >
          <Clock className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <span>{displayValue || "Select time"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-0" align="start">
        <div className="p-2 border-b">
          <input
            ref={inputRef}
            type="text"
            className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Type time e.g. 2:30 PM"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>
        <ScrollArea className="h-56">
          <div className="p-1">
            {filteredSlots.map((slot) => {
              const isActive = slot === value;
              return (
                <button
                  key={slot}
                  ref={isActive ? activeRef : undefined}
                  type="button"
                  className={cn(
                    "w-full text-left rounded-sm px-2 py-1.5 text-sm cursor-pointer transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    isActive && "bg-primary text-primary-foreground"
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(slot)}
                >
                  {to12h(slot)}
                </button>
              );
            })}
            {filteredSlots.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Press Enter to use typed time
              </p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
