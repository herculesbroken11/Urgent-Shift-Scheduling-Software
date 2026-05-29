/**
 * UnassignedJobLane — overlay lane on the Assignment Board grid showing
 * unassigned appointments as draggable cards positioned at their scheduled
 * start time. Sits inside the DispatchTimeline scroll container, sticky to
 * just below the time header so it stays visible during vertical scroll.
 *
 * Positioning math reuses the same intervalMin / cellWidthPx scheme that
 * DispatchTimeline uses for its time slots:
 *   - Day view (intervalMin=60):   1 cell per hour → px/min = cellWidthPx/60
 *   - 3-Day view (intervalMin=120): 1 cell per 2h  → px/min = cellWidthPx/120
 *   - Week view (intervalMin=0):   1 cell per day  → cards span the full day cell
 *
 * Cards are draggable with id `job:${id}` so the existing drop handlers in
 * ScheduleWizard.tsx work without changes.
 */
import { useMemo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTimeInTz } from "@/lib/agency-timezone";
import { utcToTzDateStr, type DispatchHours, type DispatchView } from "./dispatch-utils";
import type { UnassignedAppointment } from "@/hooks/useScheduleWizard";

const CARD_HEIGHT = 52;
const CARD_GAP = 4;
const LANE_PADDING_Y = 6;
const MIN_LANE_HEIGHT = 64;
const MAX_LANE_HEIGHT = 240;
const MIN_CARD_WIDTH = 80;

interface Props {
  jobs: UnassignedAppointment[];
  days: string[];
  view: DispatchView;
  hours: DispatchHours;
  tz: string;
  cellWidthPx: number;
  colsPerDay: number;
  intervalMin: number;
  stickyColPx: number;
  totalGridWidth: number;
  laneTop: number;
  selectedJobId: string | null;
  activeDragJobId: string | null;
  onSelect: (id: string) => void;
}

interface PositionedJob {
  job: UnassignedAppointment;
  left: number;
  width: number;
  row: number;
}

/* -------------------- Positioning -------------------- */

/** Minutes between two HH:mm strings (b - a). */
function minutesBetween(aHHmm: string, bHHmm: string): number {
  const [ah, am] = aHHmm.split(":").map(Number);
  const [bh, bm] = bHHmm.split(":").map(Number);
  return (bh * 60 + bm) - (ah * 60 + am);
}

/** Get HH:mm in agency tz from an ISO UTC timestamp. */
function utcIsoToTzHHmm(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

/**
 * Compute (left, width) for a job within the lane body. Returns null when
 * the job is fully outside the visible window (different day) so the caller
 * can drop it.
 */
function computePosition(
  job: UnassignedAppointment,
  days: string[],
  view: DispatchView,
  hours: DispatchHours,
  tz: string,
  cellWidthPx: number,
  colsPerDay: number,
  intervalMin: number,
): { left: number; width: number } | null {
  if (!job.scheduled_start) return null;
  const dayStr = utcToTzDateStr(job.scheduled_start, tz);
  const dayIdx = days.indexOf(dayStr);
  if (dayIdx === -1) return null;

  const dayLeft = dayIdx * colsPerDay * cellWidthPx;

  // Week view: one fat cell per day, no intra-day positioning.
  if (view === "week" || intervalMin === 0) {
    return { left: dayLeft, width: colsPerDay * cellWidthPx };
  }

  const startHHmm = utcIsoToTzHHmm(job.scheduled_start, tz);
  const endHHmm = job.scheduled_end ? utcIsoToTzHHmm(job.scheduled_end, tz) : startHHmm;
  const dayWidth = colsPerDay * cellWidthPx;
  const windowMin = colsPerDay * intervalMin;

  const startOffsetMin = minutesBetween(hours.start, startHHmm);
  const durationMin = Math.max(15, minutesBetween(startHHmm, endHHmm)); // 15-min minimum visual

  const pxPerMin = cellWidthPx / intervalMin;

  // Clamp into the visible day window so out-of-hours jobs still get a marker
  // at the edge instead of disappearing entirely.
  const clampedStart = Math.max(0, Math.min(startOffsetMin, windowMin));
  const clampedEnd = Math.max(clampedStart + 15, Math.min(startOffsetMin + durationMin, windowMin));

  const left = dayLeft + clampedStart * pxPerMin;
  const width = Math.max(MIN_CARD_WIDTH, (clampedEnd - clampedStart) * pxPerMin);

  return { left, width };
}

/**
 * Pack cards into rows so overlapping jobs stack vertically.
 * Greedy first-fit: each card goes into the lowest row whose last card ends
 * before this card starts.
 */
function packIntoRows(positioned: { job: UnassignedAppointment; left: number; width: number }[]): PositionedJob[] {
  const rowEnds: number[] = [];
  const out: PositionedJob[] = [];
  // Sort by left so packing is deterministic.
  const sorted = [...positioned].sort((a, b) => a.left - b.left || (a.job.scheduled_start ?? "").localeCompare(b.job.scheduled_start ?? ""));

  for (const p of sorted) {
    let placed = false;
    for (let r = 0; r < rowEnds.length; r++) {
      if (rowEnds[r] <= p.left) {
        rowEnds[r] = p.left + p.width;
        out.push({ ...p, row: r });
        placed = true;
        break;
      }
    }
    if (!placed) {
      rowEnds.push(p.left + p.width);
      out.push({ ...p, row: rowEnds.length - 1 });
    }
  }
  return out;
}

/* -------------------- Card -------------------- */

interface CardProps {
  positioned: PositionedJob;
  tz: string;
  selected: boolean;
  isDragging: boolean;
  onSelect: (id: string) => void;
}

function UnassignedCard({ positioned, tz, selected, isDragging, onSelect }: CardProps) {
  const { job, left, width, row } = positioned;
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `job:${job.id}`,
  });

  const top = LANE_PADDING_Y + row * (CARD_HEIGHT + CARD_GAP);
  const lang = job.languages?.name ?? null;
  const customer = job.customers?.name ?? "—";
  const timeRange =
    job.scheduled_start && job.scheduled_end
      ? `${formatDateTimeInTz(job.scheduled_start, tz, { timeOnly: true })} – ${formatDateTimeInTz(job.scheduled_end, tz, { timeOnly: true })}`
      : "—";

  const card = (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(job.id);
      }}
      className={[
        "absolute text-left rounded-md border-2 border-dashed bg-background",
        "px-2 py-1 overflow-hidden transition-shadow hover:shadow-md",
        "border-primary/70 hover:border-primary",
        selected ? "ring-2 ring-primary shadow-md" : "",
        isDragging ? "opacity-30" : "",
      ].join(" ")}
      style={{
        left,
        top,
        width,
        height: CARD_HEIGHT,
      }}
      aria-label={`Unassigned: ${lang ?? "Unspecified language"} for ${customer} at ${timeRange}`}
    >
      <div className="flex items-center gap-1 mb-0.5">
        <Badge
          variant="outline"
          className="h-4 px-1 text-[9px] uppercase tracking-wide border-primary/50 text-primary bg-primary/5"
        >
          Unassigned
        </Badge>
        {!lang && (
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertTriangle className="h-3 w-3 text-warning shrink-0" />
            </TooltipTrigger>
            <TooltipContent side="top">Unspecified language</TooltipContent>
          </Tooltip>
        )}
      </div>
      <p className="text-[11px] font-medium leading-tight truncate text-foreground">
        {lang ?? "Unspecified"} · {customer}
      </p>
      <p className="text-[10px] text-muted-foreground leading-tight truncate">
        {timeRange}
      </p>
    </button>
  );

  return card;
}

/* -------------------- Lane -------------------- */

export function UnassignedJobLane({
  jobs,
  days,
  view,
  hours,
  tz,
  cellWidthPx,
  colsPerDay,
  intervalMin,
  stickyColPx,
  totalGridWidth,
  laneTop,
  selectedJobId,
  activeDragJobId,
  onSelect,
}: Props) {
  const { positionedJobs, laneHeight, naturalHeight, hiddenRows } = useMemo(() => {
    const placed: { job: UnassignedAppointment; left: number; width: number }[] = [];
    for (const job of jobs) {
      const pos = computePosition(job, days, view, hours, tz, cellWidthPx, colsPerDay, intervalMin);
      if (!pos) continue;
      placed.push({ job, ...pos });
    }
    const packed = packIntoRows(placed);
    const maxRow = packed.reduce((m, p) => Math.max(m, p.row), 0);
    const rowsCount = packed.length === 0 ? 0 : maxRow + 1;
    const natural =
      rowsCount === 0
        ? MIN_LANE_HEIGHT
        : Math.max(MIN_LANE_HEIGHT, LANE_PADDING_Y * 2 + rowsCount * CARD_HEIGHT + Math.max(0, rowsCount - 1) * CARD_GAP);
    const capped = Math.min(natural, MAX_LANE_HEIGHT);
    const visibleRows =
      rowsCount === 0
        ? 0
        : Math.max(
            1,
            Math.floor((MAX_LANE_HEIGHT - LANE_PADDING_Y * 2 + CARD_GAP) / (CARD_HEIGHT + CARD_GAP)),
          );
    const hidden = Math.max(0, rowsCount - visibleRows);
    return { positionedJobs: packed, laneHeight: capped, naturalHeight: natural, hiddenRows: hidden };
  }, [jobs, days, view, hours, tz, cellWidthPx, colsPerDay, intervalMin]);

  const totalContentWidth = stickyColPx + totalGridWidth;
  const isOverflowing = naturalHeight > laneHeight;

  return (
    <div
      className="sticky z-10 flex border-b bg-muted/30 backdrop-blur"
      style={{
        top: laneTop,
        width: totalContentWidth,
        height: laneHeight,
      }}
    >
      {/* Sticky left label column */}
      <div
        className="sticky left-0 z-20 flex shrink-0 items-center border-r bg-muted/60 backdrop-blur px-3"
        style={{ width: stickyColPx, height: laneHeight }}
      >
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Unassigned
          </p>
          <p className="text-[10px] text-muted-foreground">
            {jobs.length === 0 ? "0 jobs" : `${jobs.length} job${jobs.length === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>

      {/* Lane body — outer scroll container (capped), inner holds natural height
          so absolutely positioned cards keep their layout. */}
      <div
        className={`relative ${isOverflowing ? "overflow-y-auto" : "overflow-hidden"}`}
        style={{ width: totalGridWidth, height: laneHeight }}
      >
        <div className="relative" style={{ width: totalGridWidth, height: naturalHeight }}>
          {positionedJobs.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground italic">
              No unassigned jobs for this language on this date.
            </div>
          )}
          {positionedJobs.map((p) => (
            <UnassignedCard
              key={p.job.id}
              positioned={p}
              tz={tz}
              selected={selectedJobId === p.job.id}
              isDragging={activeDragJobId === p.job.id}
              onSelect={onSelect}
            />
          ))}
        </div>
        {isOverflowing && hiddenRows > 0 && (
          <div
            className="sticky float-right bg-background border border-border text-xs px-2 py-0.5 rounded-full shadow-sm pointer-events-none"
            style={{ bottom: 4, right: 4, marginTop: -24 }}
          >
            +{hiddenRows} more
          </div>
        )}
      </div>
    </div>
  );
}
