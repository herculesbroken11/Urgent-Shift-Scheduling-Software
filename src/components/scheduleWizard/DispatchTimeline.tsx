/**
 * DispatchTimeline — the main grid of the redesigned Schedule Wizard.
 *
 * Vertical: interpreter rows (virtualized when >30).
 * Horizontal: time slots within agency-configured business hours.
 *   - Day view: 1 day × 1-hour columns
 *   - 3-Day view: 3 days × 2-hour columns (per day)
 *   - Week view: 7 days × 1 column per day
 *
 * Each cell renders a state (available / appointment / conflict / blocked /
 * highlighted) and acts as a drop target when a job is being dragged. Clicking
 * a cell with a job selected triggers the assignment dialog flow.
 */
import { useMemo, useRef, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDroppable } from "@dnd-kit/core";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Star, AlertTriangle } from "lucide-react";
import { localToUtcIso, formatDateTimeInTz } from "@/lib/agency-timezone";
import {
  buildDays, buildSlots, computeEffectiveHours, formatDayHeader, formatHourLabel, rangesOverlap,
  type DispatchHours, type DispatchView,
} from "./dispatch-utils";
import type {
  InterpreterScheduleEntry, UnassignedAppointment, WizardInterpreter,
} from "@/hooks/useScheduleWizard";
import type { ScoredInterpreter } from "@/hooks/useInterpreterScoring";
import type { ConflictHit } from "@/components/scheduleWizard/dispatch-utils";
import { UnassignedJobLane } from "./UnassignedJobLane";

export interface CellTarget {
  interpreter: WizardInterpreter;
  conflict: ConflictHit | null;
  /** UTC ISO of the cell's start (used as the override conflict.start when no entry exists). */
  cellStartIso: string;
  cellEndIso: string;
}

interface Props {
  view: DispatchView;
  anchorDate: string;
  hours: DispatchHours;
  tz: string;
  interpreters: WizardInterpreter[];
  /** Map of interpreter_id → schedule entries within the visible window. */
  schedules: Map<string, InterpreterScheduleEntry[]> | undefined;
  /** Currently selected job (drives compatibility highlighting + the silhouette band). */
  selectedJob: UnassignedAppointment | null;
  /** Score lookup for badge / row tinting. */
  scoreById: Map<string, ScoredInterpreter>;
  /** Set of interpreter IDs known to be incompatible (no language match). */
  incompatibleIds: Set<string>;
  /** Set of interpreter IDs to mark as recommended. */
  recommendedIds: Set<string>;
  /** Click on a cell that has no conflict. */
  onCellClick: (target: CellTarget) => void;
  isLoading: boolean;
  dragActive: boolean;
  /** Assignment Board only: unassigned jobs to render in the overlay lane. */
  unassignedJobs?: UnassignedAppointment[];
  /** Assignment Board only: show the unassigned lane (hidden in Job-First mode). */
  showUnassignedLane?: boolean;
  /** Currently selected job id (for ring on unassigned cards). */
  selectedJobId?: string | null;
  /** Currently dragged job id (for opacity on the source card). */
  activeDragJobId?: string | null;
  /** Click on an unassigned card. */
  onSelectUnassigned?: (id: string) => void;
}

const ROW_HEIGHT = 64;
const STICKY_COL_PX = 200;
const HEADER_HEIGHT = 56; // weekday row + slot label row

export function DispatchTimeline(props: Props) {
  const {
    view, anchorDate, hours, tz, interpreters, schedules, selectedJob,
    scoreById, incompatibleIds, recommendedIds, onCellClick, isLoading, dragActive,
    unassignedJobs = [], showUnassignedLane = false,
    selectedJobId = null, activeDragJobId = null, onSelectUnassigned,
  } = props;

  const days = useMemo(() => buildDays(anchorDate, view), [anchorDate, view]);

  // Auto-extend the rendered hours when any visible appointment, availability
  // block, or unassigned job falls outside the agency's default dispatch hours.
  // Auto-extend only for real appointments and unassigned jobs. Availability
  // blocks (especially all-day unavailability spanning 00:00–23:59) must NOT
  // drive the visible window — otherwise a single all-day block would expand
  // the grid to a full 24 hours.
  const effectiveHours = useMemo(() => {
    const allEntries: { start: string; end: string }[] = [];
    if (schedules) {
      for (const list of schedules.values()) {
        for (const e of list) {
          if (e.type === "appointment") {
            allEntries.push({ start: e.start, end: e.end });
          }
        }
      }
    }
    for (const j of unassignedJobs) {
      if (j.scheduled_start && j.scheduled_end) {
        allEntries.push({ start: j.scheduled_start, end: j.scheduled_end });
      }
    }
    return computeEffectiveHours(hours, view, days, tz, allEntries);
  }, [hours, view, days, tz, schedules, unassignedJobs]);

  const { intervalMin, slots } = useMemo(() => buildSlots(effectiveHours, view), [effectiveHours, view]);

  // Pixel sizing per cell varies by view density.
  const cellWidthPx = view === "day" ? 110 : view === "3day" ? 88 : 140;
  const colsPerDay = view === "week" ? 1 : slots.length;
  const totalCols = days.length * colsPerDay;
  const totalGridWidth = totalCols * cellWidthPx;

  // Virtualize interpreter rows for large rosters.
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: interpreters.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  // Selected job UTC bounds for highlighting / conflict ribbon.
  const selectedStart = selectedJob?.scheduled_start ?? null;
  const selectedEnd = selectedJob?.scheduled_end ?? null;

  const totalContentWidth = STICKY_COL_PX + totalGridWidth;
  const bodyHeight = Math.max(virtualizer.getTotalSize(), ROW_HEIGHT);

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-full min-h-0 flex-col bg-background">
        {/*
          Single scroll container: vertical scroll inside, horizontal scroll inside.
          - Time header row: position: sticky; top: 0; z-20 (stays put on vertical scroll)
          - Interpreter column: position: sticky; left: 0; z-10 (stays put on horizontal scroll)
          - Corner cell where they intersect: z-30
        */}
        <div ref={scrollRef} className="relative flex-1 overflow-auto">
          {isLoading && interpreters.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading roster…</div>
          )}
          {!isLoading && interpreters.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No interpreters match the current filter.
            </div>
          )}

          {interpreters.length > 0 && (
            <div
              className="relative"
              style={{ width: totalContentWidth }}
            >
              {/* Sticky header strip */}
              <div
                className="sticky top-0 z-20 flex border-b bg-muted/40 backdrop-blur text-xs"
                style={{ width: totalContentWidth, height: HEADER_HEIGHT }}
              >
                {/* Corner cell — intersection of sticky header + sticky interpreter column */}
                <div
                  className="sticky left-0 z-30 flex shrink-0 items-center border-r bg-muted/60 backdrop-blur px-3 font-medium text-muted-foreground"
                  style={{ width: STICKY_COL_PX, height: HEADER_HEIGHT }}
                >
                  Interpreter
                </div>
                <div className="flex" style={{ width: totalGridWidth }}>
                  {days.map((day) => {
                    const head = formatDayHeader(day, tz);
                    return (
                      <div
                        key={day}
                        className="border-r"
                        style={{ width: colsPerDay * cellWidthPx }}
                      >
                        <div className="flex items-baseline justify-center gap-1.5 px-2 py-1.5 border-b bg-background/60">
                          <span className="font-semibold">{head.weekday}</span>
                          <span className="text-muted-foreground">{head.date}</span>
                        </div>
                        {view !== "week" && (
                          <div className="flex">
                            {slots.map((slot) => (
                              <div
                                key={`${day}-${slot}`}
                                className="border-r last:border-r-0 px-1 py-1 text-center text-[10px] text-muted-foreground"
                                style={{ width: cellWidthPx }}
                              >
                                {formatHourLabel(slot)}
                              </div>
                            ))}
                          </div>
                        )}
                        {view === "week" && (
                          <div
                            className="px-1 py-1 text-center text-[10px] text-muted-foreground"
                            style={{ width: cellWidthPx }}
                          >
                            {effectiveHours.start} – {effectiveHours.end}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Unassigned jobs overlay lane (Assignment Board only) */}
              {showUnassignedLane && (
                <UnassignedJobLane
                  jobs={unassignedJobs}
                  days={days}
                  view={view}
                  hours={effectiveHours}
                  tz={tz}
                  cellWidthPx={cellWidthPx}
                  colsPerDay={colsPerDay}
                  intervalMin={intervalMin}
                  stickyColPx={STICKY_COL_PX}
                  totalGridWidth={totalGridWidth}
                  laneTop={HEADER_HEIGHT}
                  selectedJobId={selectedJobId}
                  activeDragJobId={activeDragJobId}
                  onSelect={(id) => onSelectUnassigned?.(id)}
                />
              )}

              {/* Body — virtualized rows */}
              <div className="relative" style={{ height: bodyHeight }}>
                {virtualizer.getVirtualItems().map((vRow) => {
                  const interp = interpreters[vRow.index];
                  const incompatible = incompatibleIds.has(interp.id);
                  const recommended = recommendedIds.has(interp.id);
                  const score = scoreById.get(interp.id);
                  const entries = schedules?.get(interp.id) ?? [];

                  return (
                    <InterpreterRow
                      key={interp.id}
                      style={{
                        transform: `translateY(${vRow.start}px)`,
                        height: ROW_HEIGHT,
                      }}
                      interp={interp}
                      score={score}
                      incompatible={incompatible}
                      recommended={recommended}
                      days={days}
                      slots={slots}
                      intervalMin={intervalMin}
                      view={view}
                      cellWidthPx={cellWidthPx}
                      colsPerDay={colsPerDay}
                      hours={effectiveHours}
                      tz={tz}
                      entries={entries}
                      selectedStart={selectedStart}
                      selectedEnd={selectedEnd}
                      selectedJobLanguage={selectedJob?.languages?.name}
                      onCellClick={onCellClick}
                      dragActive={dragActive}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

/* ============================================================== */
/* Interpreter row (memoized) */
/* ============================================================== */

interface RowProps {
  interp: WizardInterpreter;
  score: ScoredInterpreter | undefined;
  incompatible: boolean;
  recommended: boolean;
  days: string[];
  slots: string[];
  intervalMin: number;
  view: DispatchView;
  cellWidthPx: number;
  colsPerDay: number;
  hours: DispatchHours;
  tz: string;
  entries: InterpreterScheduleEntry[];
  selectedStart: string | null;
  selectedEnd: string | null;
  selectedJobLanguage: string | undefined;
  onCellClick: (target: CellTarget) => void;
  dragActive: boolean;
  style: React.CSSProperties;
}

const InterpreterRow = memo(function InterpreterRow(p: RowProps) {
  const fullName = `${p.interp.first_name ?? ""} ${p.interp.last_name ?? ""}`.trim() || "Interpreter";

  return (
    <div
      className={[
        "absolute left-0 top-0 flex w-full border-b",
        p.incompatible ? "opacity-40" : "",
        p.recommended ? "bg-primary/5" : "",
      ].join(" ")}
      style={p.style}
    >
      {/* Sticky info column */}
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r bg-background px-3"
        style={{ width: STICKY_COL_PX, height: p.style.height }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium">{fullName}</p>
            {p.interp.admin_confirms && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                </TooltipTrigger>
                <TooltipContent>Admin Confirms — assignments skip interpreter accept</TooltipContent>
              </Tooltip>
            )}
            {p.recommended && (
              <Star className="h-3.5 w-3.5 fill-primary text-primary" />
            )}
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {p.interp.languages.slice(0, 3).map((l) => l.name).filter(Boolean).join(", ") || "—"}
          </p>
        </div>
        {p.score && (
          <Badge
            variant="secondary"
            className={[
              "shrink-0 text-[10px] px-1.5 py-0 h-5 font-semibold",
              p.score.score >= 75 ? "bg-primary/15 text-primary" :
              p.score.score >= 50 ? "bg-warning/15 text-warning" :
              "bg-muted text-muted-foreground",
            ].join(" ")}
          >
            {p.score.score}%
          </Badge>
        )}
      </div>

      {/* Time cells */}
      {p.days.map((day) => (
        <DayBlock
          key={`${p.interp.id}-${day}`}
          interp={p.interp}
          day={day}
          slots={p.slots}
          intervalMin={p.intervalMin}
          view={p.view}
          cellWidthPx={p.cellWidthPx}
          hours={p.hours}
          tz={p.tz}
          entries={p.entries}
          selectedStart={p.selectedStart}
          selectedEnd={p.selectedEnd}
          incompatible={p.incompatible}
          dragActive={p.dragActive}
          onCellClick={p.onCellClick}
        />
      ))}
    </div>
  );
});

/* ============================================================== */
/* Day block (one per day per interpreter) */
/* ============================================================== */

interface DayBlockProps {
  interp: WizardInterpreter;
  day: string;
  slots: string[];
  intervalMin: number;
  view: DispatchView;
  cellWidthPx: number;
  hours: DispatchHours;
  tz: string;
  entries: InterpreterScheduleEntry[];
  selectedStart: string | null;
  selectedEnd: string | null;
  incompatible: boolean;
  dragActive: boolean;
  onCellClick: (target: CellTarget) => void;
}

function DayBlock(p: DayBlockProps) {
  // Week view: render one wide cell representing the whole day's business hours.
  if (p.view === "week") {
    const cellStart = localToUtcIso(p.day, p.hours.start, p.tz)!;
    const cellEnd = localToUtcIso(p.day, p.hours.end, p.tz)!;
    return (
      <div className="flex border-r" style={{ width: p.cellWidthPx }}>
        <TimelineCell
          interp={p.interp}
          cellStart={cellStart}
          cellEnd={cellEnd}
          widthPx={p.cellWidthPx}
          entries={p.entries}
          selectedStart={p.selectedStart}
          selectedEnd={p.selectedEnd}
          incompatible={p.incompatible}
          dragActive={p.dragActive}
          onClick={p.onCellClick}
          tz={p.tz}
          isWeek
        />
      </div>
    );
  }

  return (
    <div className="flex border-r" style={{ width: p.slots.length * p.cellWidthPx }}>
      {p.slots.map((slot) => {
        const cellStart = localToUtcIso(p.day, slot, p.tz)!;
        // Compute cell end by adding intervalMin
        const [hh, mm] = slot.split(":").map(Number);
        let endH = hh;
        let endM = mm + p.intervalMin;
        while (endM >= 60) { endH += 1; endM -= 60; }
        const endHHmm = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
        const cellEnd = localToUtcIso(p.day, endHHmm, p.tz)!;

        return (
          <TimelineCell
            key={`${p.interp.id}-${p.day}-${slot}`}
            interp={p.interp}
            cellStart={cellStart}
            cellEnd={cellEnd}
            widthPx={p.cellWidthPx}
            entries={p.entries}
            selectedStart={p.selectedStart}
            selectedEnd={p.selectedEnd}
            incompatible={p.incompatible}
            dragActive={p.dragActive}
            onClick={p.onCellClick}
            tz={p.tz}
          />
        );
      })}
    </div>
  );
}

/* ============================================================== */
/* Single cell (memoized + droppable) */
/* ============================================================== */

interface CellProps {
  interp: WizardInterpreter;
  cellStart: string;
  cellEnd: string;
  widthPx: number;
  entries: InterpreterScheduleEntry[];
  selectedStart: string | null;
  selectedEnd: string | null;
  incompatible: boolean;
  dragActive: boolean;
  onClick: (target: CellTarget) => void;
  tz: string;
  isWeek?: boolean;
}

const TimelineCell = memo(function TimelineCell(p: CellProps) {
  // Find first overlapping entry (appointment beats availability for visual priority)
  let entry: InterpreterScheduleEntry | null = null;
  for (const e of p.entries) {
    if (rangesOverlap(p.cellStart, p.cellEnd, e.start, e.end)) {
      if (!entry || (e.type === "appointment" && entry.type !== "appointment")) {
        entry = e;
      }
    }
  }

  // Highlight if the selected job's window overlaps this cell
  const highlighted =
    !!p.selectedStart && !!p.selectedEnd &&
    rangesOverlap(p.cellStart, p.cellEnd, p.selectedStart, p.selectedEnd);

  // Conflict only relevant inside the highlighted window
  const conflict: ConflictHit | null = highlighted && entry
    ? {
        type: entry.type,
        conflicting_entity_id: entry.appointment_id ?? entry.availability_id ?? null,
        start: entry.start,
        end: entry.end,
      }
    : null;

  // Droppable wiring
  const { setNodeRef, isOver } = useDroppable({
    id: `cell:${p.interp.id}:${p.cellStart}`,
    data: {
      kind: "timeline-cell",
      interpreterId: p.interp.id,
      cellStart: p.cellStart,
      cellEnd: p.cellEnd,
    },
    disabled: p.incompatible,
  });

  // Cell appearance
  let toneClass = "bg-success/5 hover:bg-success/15"; // default available
  let label: string | null = null;
  let labelTone = "";

  if (entry?.type === "appointment") {
    toneClass = "bg-primary/15 border-l-2 border-l-primary";
    label = entry.label || "Appointment";
    labelTone = "text-primary";
  } else if (entry?.type === "availability") {
    toneClass = "bg-muted bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,hsl(var(--muted-foreground)/0.15)_4px,hsl(var(--muted-foreground)/0.15)_8px)]";
    label = "Off";
    labelTone = "text-muted-foreground";
  }

  if (conflict) {
    toneClass = "bg-destructive/15 border border-destructive/40";
  } else if (highlighted && !entry) {
    toneClass = "bg-primary/10 ring-1 ring-primary/40";
  }

  if (p.dragActive && isOver && !p.incompatible) {
    toneClass += " ring-2 ring-primary";
  }

  const tooltipContent = entry ? (
    entry.type === "appointment" ? (
      <div className="space-y-0.5">
        <p className="font-medium">{entry.label || "Appointment"}</p>
        <p className="text-xs">{formatDateTimeInTz(entry.start, p.tz, { timeOnly: true })} – {formatDateTimeInTz(entry.end, p.tz, { timeOnly: true })}</p>
        {entry.status && <p className="text-xs text-muted-foreground">{entry.status}</p>}
      </div>
    ) : (
      <div className="space-y-0.5">
        <p className="font-medium">Blocked</p>
        <p className="text-xs">{formatDateTimeInTz(entry.start, p.tz, { timeOnly: true })} – {formatDateTimeInTz(entry.end, p.tz, { timeOnly: true })}</p>
        {entry.notes && <p className="text-xs text-muted-foreground">{entry.notes}</p>}
      </div>
    )
  ) : (
    <p className="text-xs">Available</p>
  );

  const cellInner = (
    <div
      ref={setNodeRef}
      onClick={() => {
        if (p.incompatible) return;
        p.onClick({
          interpreter: p.interp,
          conflict,
          cellStartIso: p.cellStart,
          cellEndIso: p.cellEnd,
        });
      }}
      role="gridcell"
      aria-label={`${p.interp.first_name ?? ""} ${p.interp.last_name ?? ""} — ${formatDateTimeInTz(p.cellStart, p.tz, { timeOnly: true })}`}
      className={[
        "relative flex h-full cursor-pointer items-center justify-center border-r last:border-r-0 px-1 text-[10px]",
        toneClass,
        p.incompatible ? "cursor-not-allowed" : "",
      ].join(" ")}
      style={{ width: p.widthPx }}
    >
      {label && (
        <span className={`truncate ${labelTone}`}>
          {label}
        </span>
      )}
      {conflict && (
        <AlertTriangle className="absolute right-1 top-1 h-3 w-3 text-destructive" />
      )}
    </div>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{cellInner}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">{tooltipContent}</TooltipContent>
    </Tooltip>
  );
});
