import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useAppointments } from "@/hooks/useAgencyData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Filter, Ban } from "lucide-react";
import { statusCalendarColors, statusBadgeColors } from "@/lib/status-colors";
import { getStatusLabel } from "@/lib/status-labels";
import { cn } from "@/lib/utils";
import {
  format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameDay, isSameMonth, addWeeks, addMonths,
  parseISO, isWithinInterval,
} from "date-fns";
import { ActivityDetailDialog } from "@/components/dashboard/ActivityDetailDialog";
import { useAgencyTimezone } from "@/hooks/useAgencyTimezone";
import { formatDateTimeInTz } from "@/lib/agency-timezone";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export interface CalendarTimeRange {
  date: string;       // yyyy-MM-dd
  start_time: string; // HH:mm
  end_time: string;   // HH:mm
}

interface Props {
  view: "day" | "week" | "month";
  customerId?: string;
  interpreterId?: string;
  /** When provided, enables Outlook-style click + click-drag to create a new appointment in day/week views. */
  onCreateRequest?: (range: CalendarTimeRange) => void;
}

const hours = Array.from({ length: 14 }, (_, i) => i + 7); // 7am–8pm
const SLOTS_PER_HOUR = 2; // 30-min granularity

/** Check if a given date is blocked by an availability entry */
function isDayBlocked(date: Date, blocks: any[]): { blocked: boolean; allDay: boolean; notes?: string; startTime?: string; endTime?: string } {
  const dayOfWeek = date.getDay(); // 0=Sun
  const dateStr = format(date, "yyyy-MM-dd");

  for (const b of blocks) {
    // Recurring weekly block
    if (b.is_recurring && b.day_of_week === dayOfWeek) {
      // Check end_date if set
      if (b.end_date && dateStr > b.end_date) continue;
      return { blocked: true, allDay: b.is_all_day, notes: b.notes, startTime: b.start_time, endTime: b.end_time };
    }
    // Single date block
    if (!b.is_recurring && b.specific_date === dateStr) {
      return { blocked: true, allDay: b.is_all_day, notes: b.notes, startTime: b.start_time, endTime: b.end_time };
    }
    // Date range block (specific_date = start, end_date = end)
    if (!b.is_recurring && b.specific_date && b.end_date && b.specific_date !== b.end_date) {
      if (dateStr >= b.specific_date && dateStr <= b.end_date) {
        return { blocked: true, allDay: b.is_all_day, notes: b.notes, startTime: b.start_time, endTime: b.end_time };
      }
    }
  }
  return { blocked: false, allDay: false };
}

/** Check if a specific hour is blocked */
function isHourBlocked(date: Date, hour: number, blocks: any[]): { blocked: boolean; notes?: string } {
  const dayInfo = isDayBlocked(date, blocks);
  if (!dayInfo.blocked) return { blocked: false };
  if (dayInfo.allDay) return { blocked: true, notes: dayInfo.notes };
  // Check time window
  if (dayInfo.startTime && dayInfo.endTime) {
    const startH = parseInt(dayInfo.startTime.split(":")[0], 10);
    const endH = parseInt(dayInfo.endTime.split(":")[0], 10);
    if (hour >= startH && hour < endH) {
      return { blocked: true, notes: dayInfo.notes };
    }
  }
  return { blocked: false };
}

export function AppointmentCalendar({ view, customerId, interpreterId, onCreateRequest }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedAppointment, setSelectedAppointment] = useState<any | null>(null);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  // When interpreterId is provided, scope the query server-side so non-assigned
  // appointment data (customer names, patient names, notes) never reaches the client.
  const { data: allAppointments = [] } = useAppointments(
    interpreterId ? { interpreterId } : undefined
  );
  const agencyTz = useAgencyTimezone();

  // Fetch interpreter availability blocks
  const { data: availabilityBlocks = [] } = useQuery({
    queryKey: ["interpreter-availability-calendar", interpreterId],
    queryFn: async () => {
      if (!interpreterId) return [];
      const { data, error } = await supabase
        .from("interpreter_availability")
        .select("*")
        .eq("interpreter_id", interpreterId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!interpreterId,
  });

  // Base filtering by customer and/or interpreter
  const baseAppointments = useMemo(() => {
    let filtered = allAppointments;
    if (interpreterId) {
      filtered = filtered.filter((a: any) => a.interpreter_id === interpreterId);
    }
    if (customerId) {
      filtered = filtered.filter((a: any) => a.customer_id === customerId);
    }
    return filtered;
  }, [allAppointments, customerId, interpreterId]);

  // Derive unique statuses present in data
  const availableStatuses = useMemo(() => {
    const set = new Set<string>();
    baseAppointments.forEach((a: any) => { if (a.status) set.add(a.status); });
    return Array.from(set).sort();
  }, [baseAppointments]);

  // Apply status filter
  const appointments = useMemo(() => {
    if (selectedStatuses.length === 0) return baseAppointments;
    return baseAppointments.filter((a: any) => selectedStatuses.includes(a.status));
  }, [baseAppointments, selectedStatuses]);

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const clearFilter = () => setSelectedStatuses([]);

  const filterActive = selectedStatuses.length > 0;

  const navigate = (dir: number) => {
    if (view === "day") setCurrentDate((d) => addDays(d, dir));
    else if (view === "week") setCurrentDate((d) => addWeeks(d, dir));
    else setCurrentDate((d) => addMonths(d, dir));
  };

  const title = useMemo(() => {
    if (view === "day") return format(currentDate, "EEEE, MMMM d, yyyy");
    if (view === "week") {
      const s = startOfWeek(currentDate, { weekStartsOn: 1 });
      const e = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}`;
    }
    return format(currentDate, "MMMM yyyy");
  }, [currentDate, view]);

  const getAppointmentsForDay = (date: Date) =>
    appointments.filter((a: any) => a.scheduled_start && isSameDay(new Date(a.scheduled_start), date));

  const blockedChip = (notes?: string) => (
    <div className="text-[10px] px-1 py-0.5 rounded border truncate bg-destructive/10 text-destructive border-destructive/30 dark:bg-destructive/20 dark:text-red-300 dark:border-destructive/40 flex items-center gap-0.5">
      <Ban className="h-2.5 w-2.5 shrink-0" />
      {notes || "Blocked"}
    </div>
  );

  const filterButton = (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={filterActive ? "default" : "outline"} size="sm" className="gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          Status
          {filterActive && (
            <span className="ml-0.5 rounded-full bg-primary-foreground/20 px-1.5 text-[10px] font-semibold">
              {selectedStatuses.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <div className="flex items-center justify-between px-2 pb-2 border-b border-border mb-1">
          <span className="text-xs font-medium text-muted-foreground">Filter by status</span>
          {filterActive && (
            <button onClick={clearFilter} className="text-[10px] text-primary hover:underline">
              Clear all
            </button>
          )}
        </div>
        <div className="space-y-0.5 max-h-64 overflow-y-auto">
          {availableStatuses.map((status) => (
            <label
              key={status}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
            >
              <Checkbox
                checked={selectedStatuses.includes(status)}
                onCheckedChange={() => toggleStatus(status)}
              />
              <span className={cn("text-[11px] px-1.5 py-0.5 rounded border font-medium", statusBadgeColors[status] ?? "bg-muted text-muted-foreground")}>
                {getStatusLabel(status)}
              </span>
            </label>
          ))}
          {availableStatuses.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-2">No appointments found</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );

  // ── Drag-select hooks (must be declared before any conditional return) ──
  const dragEnabled = !!onCreateRequest;
  const [dragState, setDragState] = useState<{ colIdx: number; startSlot: number; endSlot: number } | null>(null);
  const isDraggingRef = useRef(false);
  const pendingRangeRef = useRef<CalendarTimeRange | null>(null);

  const endDrag = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setDragState(null);
    const range = pendingRangeRef.current;
    pendingRangeRef.current = null;
    if (range && onCreateRequest) onCreateRequest(range);
  }, [onCreateRequest]);

  useEffect(() => {
    if (!dragEnabled) return;
    const handleUp = () => endDrag();
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchend", handleUp);
    return () => {
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchend", handleUp);
    };
  }, [dragEnabled, endDrag]);

  if (view === "month") {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: calStart, end: calEnd });

    // Month-view drag uses dragState.colIdx as the START day index and endSlot as the END day index.
    // Range fires onCreateRequest with the START day, no time — opens form prefilled to that date.
    const beginMonthDrag = (dayIdx: number) => {
      if (!dragEnabled) return;
      isDraggingRef.current = true;
      const day = days[dayIdx];
      pendingRangeRef.current = day ? { date: format(day, "yyyy-MM-dd"), start_time: "", end_time: "" } : null;
      setDragState({ colIdx: dayIdx, startSlot: dayIdx, endSlot: dayIdx });
    };

    const extendMonthDrag = (dayIdx: number) => {
      if (!dragEnabled || !isDraggingRef.current) return;
      setDragState((s) => {
        if (!s) return s;
        const startDay = days[s.colIdx];
        if (startDay) {
          pendingRangeRef.current = { date: format(startDay, "yyyy-MM-dd"), start_time: "", end_time: "" };
        }
        return { ...s, endSlot: dayIdx };
      });
    };

    const isDayInDragRange = (idx: number) => {
      if (!dragState) return false;
      const lo = Math.min(dragState.colIdx, dragState.endSlot);
      const hi = Math.max(dragState.colIdx, dragState.endSlot);
      return idx >= lo && idx <= hi;
    };

    return (<>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg">{title}</CardTitle>
          <div className="flex gap-1 items-center">
            {filterButton}
            <Button variant="outline" size="icon" onClick={() => navigate(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>Today</Button>
            <Button variant="outline" size="icon" onClick={() => navigate(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </CardHeader>
        {dragEnabled && (
          <p className="px-6 pb-2 text-xs text-muted-foreground -mt-1">
            Tip: click a day to start a new appointment on that date.
          </p>
        )}
        <CardContent>
          <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden select-none">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="bg-muted p-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
            ))}
            {days.map((day, idx) => {
              const dayAppts = getAppointmentsForDay(day);
              const isToday = isSameDay(day, new Date());
              const isCurrentMonth = isSameMonth(day, currentDate);
              const dayBlock = isDayBlocked(day, availabilityBlocks);
              const inDragRange = isDayInDragRange(idx);
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-[100px] p-1 transition-colors",
                    !isCurrentMonth ? "opacity-40" : "",
                    dayBlock.blocked && dayBlock.allDay
                      ? "bg-destructive/5 dark:bg-destructive/10"
                      : "bg-card",
                    dragEnabled && "cursor-pointer hover:bg-primary/5",
                    inDragRange && "bg-primary/15 dark:bg-primary/25 ring-1 ring-primary/40 ring-inset"
                  )}
                  onMouseDown={(e) => {
                    if (!dragEnabled) return;
                    // Skip if clicking on an appointment chip (those have their own onClick)
                    if ((e.target as HTMLElement).closest("[data-appt-chip]")) return;
                    e.preventDefault();
                    beginMonthDrag(idx);
                  }}
                  onMouseEnter={() => extendMonthDrag(idx)}
                  onTouchStart={(e) => {
                    if (!dragEnabled) return;
                    if ((e.target as HTMLElement).closest("[data-appt-chip]")) return;
                    beginMonthDrag(idx);
                  }}
                >
                  <div className={cn(
                    "text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full",
                    isToday ? "bg-primary text-primary-foreground" : ""
                  )}>
                    {format(day, "d")}
                  </div>
                  <div className="space-y-0.5">
                    {dayBlock.blocked && dayBlock.allDay && blockedChip(dayBlock.notes)}
                    {dayAppts.slice(0, dayBlock.blocked && dayBlock.allDay ? 2 : 3).map((a: any) => (
                      <div
                        key={a.id}
                        data-appt-chip
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setSelectedAppointment(a); }}
                        className={cn("text-[10px] px-1 py-0.5 rounded border truncate cursor-pointer hover:opacity-80 transition-opacity", statusCalendarColors[a.status] ?? "bg-primary/10 text-primary")}
                      >
                        {a.scheduled_start && formatDateTimeInTz(a.scheduled_start, agencyTz, { timeOnly: true })} {a.title || a.languages?.name || "Appt"}
                      </div>
                    ))}
                    {dayAppts.length > (dayBlock.blocked && dayBlock.allDay ? 2 : 3) && (
                      <div className="text-[10px] text-muted-foreground px-1">+{dayAppts.length - (dayBlock.blocked && dayBlock.allDay ? 2 : 3)} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <ActivityDetailDialog
        appointment={selectedAppointment}
        open={!!selectedAppointment}
        onOpenChange={(open) => { if (!open) setSelectedAppointment(null); }}
      />
    </>);
  }

  // Day and Week views — time grid
  const days = view === "day"
    ? [currentDate]
    : eachDayOfInterval({
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
      });

  // ── Drag-select helpers (hooks already declared above) ──
  const slotToTime = (slot: number) => {
    const totalMins = hours[0] * 60 + slot * (60 / SLOTS_PER_HOUR);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  const computeRange = (colIdx: number, startSlot: number, endSlot: number): CalendarTimeRange | null => {
    const day = days[colIdx];
    if (!day) return null;
    const lo = Math.min(startSlot, endSlot);
    const hi = Math.max(startSlot, endSlot) + 1;
    return {
      date: format(day, "yyyy-MM-dd"),
      start_time: slotToTime(lo),
      end_time: slotToTime(hi),
    };
  };

  const beginDrag = (colIdx: number, slot: number) => {
    if (!dragEnabled) return;
    isDraggingRef.current = true;
    pendingRangeRef.current = computeRange(colIdx, slot, slot);
    setDragState({ colIdx, startSlot: slot, endSlot: slot });
  };

  const extendDrag = (colIdx: number, slot: number) => {
    if (!dragEnabled || !isDraggingRef.current) return;
    setDragState((s) => {
      if (!s || s.colIdx !== colIdx) return s;
      pendingRangeRef.current = computeRange(colIdx, s.startSlot, slot);
      return { ...s, endSlot: slot };
    });
  };

  return (<>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
        <div className="flex gap-1 items-center">
          {filterButton}
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>Today</Button>
          <Button variant="outline" size="icon" onClick={() => navigate(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      {dragEnabled && (
        <p className="px-6 pb-2 text-xs text-muted-foreground -mt-1">
          Tip: click a time slot to start a new appointment, or click and drag to set the duration.
        </p>
      )}
      <CardContent className="overflow-x-auto">
        <div className="min-w-[600px] border border-border rounded-lg overflow-hidden select-none">
          {/* Header */}
          <div className="grid" style={{ gridTemplateColumns: `60px repeat(${days.length}, 1fr)` }}>
            <div className="bg-muted p-2 border-b border-r border-border" />
            {days.map((d, i) => {
              const dayBlock = isDayBlocked(d, availabilityBlocks);
              return (
                <div key={d.toISOString()} className={cn(
                  "p-2 text-center border-b border-border",
                  i < days.length - 1 && "border-r",
                  dayBlock.blocked && dayBlock.allDay
                    ? "bg-destructive/5 dark:bg-destructive/10"
                    : isSameDay(d, new Date()) ? "bg-primary/5" : "bg-muted"
                )}>
                  <div className="text-xs text-muted-foreground">{format(d, "EEE")}</div>
                  <div className={cn("text-sm font-medium flex items-center justify-center gap-1",
                    isSameDay(d, new Date()) && "text-primary",
                    dayBlock.blocked && dayBlock.allDay && "text-destructive"
                  )}>
                    {format(d, "d")}
                    {dayBlock.blocked && dayBlock.allDay && <Ban className="h-3 w-3" />}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Time grid */}
          {hours.map((hour, rowIdx) => (
            <div key={hour} className="grid" style={{ gridTemplateColumns: `60px repeat(${days.length}, 1fr)` }}>
              <div className={cn("bg-card p-1 text-right text-xs text-muted-foreground pr-2 border-r border-border", rowIdx < hours.length - 1 && "border-b border-border")}>
                {format(new Date().setHours(hour, 0), "h a")}
              </div>
              {days.map((day, colIdx) => {
                const hourBlock = isHourBlocked(day, hour, availabilityBlocks);
                const dayAppts = getAppointmentsForDay(day).filter((a: any) => {
                  const h = new Date(a.scheduled_start).getHours();
                  return h === hour;
                });
                const baseSlot = rowIdx * SLOTS_PER_HOUR;
                const dragLo = dragState && dragState.colIdx === colIdx ? Math.min(dragState.startSlot, dragState.endSlot) : -1;
                const dragHi = dragState && dragState.colIdx === colIdx ? Math.max(dragState.startSlot, dragState.endSlot) : -1;
                return (
                  <div key={day.toISOString()} className={cn(
                    "min-h-[48px] relative",
                    colIdx < days.length - 1 && "border-r border-border",
                    rowIdx < hours.length - 1 && "border-b border-border",
                    hourBlock.blocked
                      ? "bg-destructive/5 dark:bg-destructive/10"
                      : "bg-card"
                  )}>
                    {/* Drag-select overlay slots (rendered behind appointments) */}
                    {dragEnabled && (
                      <div className="absolute inset-0 grid grid-rows-2 z-0">
                        {Array.from({ length: SLOTS_PER_HOUR }).map((_, sIdx) => {
                          const slot = baseSlot + sIdx;
                          const isInDrag = slot >= dragLo && slot <= dragHi;
                          return (
                            <div
                              key={sIdx}
                              role="button"
                              aria-label="Create appointment"
                              className={cn(
                                "cursor-cell hover:bg-primary/10 transition-colors",
                                isInDrag && "bg-primary/25"
                              )}
                              onMouseDown={(e) => { e.preventDefault(); beginDrag(colIdx, slot); }}
                              onMouseEnter={() => extendDrag(colIdx, slot)}
                              onTouchStart={(e) => { e.preventDefault(); beginDrag(colIdx, slot); }}
                              onTouchMove={(e) => {
                                const t = e.touches[0];
                                const el = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null;
                                const c = el?.dataset?.colidx;
                                const s = el?.dataset?.slot;
                                if (c && s) extendDrag(parseInt(c, 10), parseInt(s, 10));
                              }}
                              data-colidx={colIdx}
                              data-slot={slot}
                            />
                          );
                        })}
                      </div>
                    )}
                    <div className="relative z-10 p-0.5">
                      {dayAppts.map((a: any) => (
                        <div
                          key={a.id}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={() => setSelectedAppointment(a)}
                          className={cn(
                            "text-[11px] p-1 rounded border mb-0.5 cursor-pointer hover:opacity-80 transition-opacity",
                            statusCalendarColors[a.status] ?? "bg-primary/10 text-primary border-primary/20"
                          )}
                        >
                          <div className="font-medium truncate">{a.title || a.languages?.name || "Appointment"}</div>
                          <div className="opacity-70 truncate">
                            {formatDateTimeInTz(a.scheduled_start, agencyTz, { timeOnly: true })}
                            {a.interpreter && ` • ${a.interpreter.first_name}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
    <ActivityDetailDialog
      appointment={selectedAppointment}
      open={!!selectedAppointment}
      onOpenChange={(open) => { if (!open) setSelectedAppointment(null); }}
    />
    </>
  );
}
