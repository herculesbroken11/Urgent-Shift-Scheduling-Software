/**
 * Shared helpers for the dispatch board components.
 * Keep all date/time work going through agency timezone (Intl + localToUtcIso).
 */
import { localToUtcIso } from "@/lib/agency-timezone";

export type DispatchView = "day" | "3day" | "week";

export interface ConflictHit {
  type: "appointment" | "availability";
  conflicting_entity_id: string | null;
  start: string;
  end: string;
}

export interface DispatchHours {
  start: string; // "HH:mm"
  end: string;   // "HH:mm" (exclusive)
}

export const DEFAULT_DISPATCH_HOURS: DispatchHours = { start: "08:00", end: "18:00" };

export function readDispatchHours(settings: any): DispatchHours {
  const dh = settings?.dispatch_hours;
  if (
    dh &&
    typeof dh.start === "string" &&
    typeof dh.end === "string" &&
    /^\d{2}:\d{2}$/.test(dh.start) &&
    /^\d{2}:\d{2}$/.test(dh.end) &&
    dh.start < dh.end
  ) {
    return dh;
  }
  return DEFAULT_DISPATCH_HOURS;
}

export function todayInTz(tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function utcToTzDateStr(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function shiftDate(yyyyMmDd: string, days: number): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12));
  const ys = dt.getUTCFullYear();
  const ms = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const ds = String(dt.getUTCDate()).padStart(2, "0");
  return `${ys}-${ms}-${ds}`;
}

export function viewSpan(view: DispatchView): number {
  return view === "day" ? 1 : view === "3day" ? 3 : 7;
}

/** Returns array of YYYY-MM-DD dates for the visible window. */
export function buildDays(anchor: string, view: DispatchView): string[] {
  const span = viewSpan(view);
  const out: string[] = [];
  for (let i = 0; i < span; i++) out.push(shiftDate(anchor, i));
  return out;
}

/** Compute UTC window bounds from the visible days + agency hours. */
export function computeWindow(
  days: string[],
  hours: DispatchHours,
  tz: string,
): { startUtc: string | null; endUtc: string | null } {
  if (days.length === 0) return { startUtc: null, endUtc: null };
  const startUtc = localToUtcIso(days[0], hours.start, tz);
  const endUtc = localToUtcIso(days[days.length - 1], hours.end, tz);
  return { startUtc, endUtc };
}

/**
 * Build the time slots (one per cell) within agency hours.
 * Slot interval scales with view density.
 */
export function buildSlots(hours: DispatchHours, view: DispatchView): {
  intervalMin: number;
  slots: string[]; // "HH:mm"
} {
  const intervalMin =
    view === "day" ? 60 : view === "3day" ? 120 : 0; // week handles per-day cells separately
  if (intervalMin === 0) return { intervalMin: 0, slots: [] };
  const [sh, sm] = hours.start.split(":").map(Number);
  const [eh, em] = hours.end.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const slots: string[] = [];
  for (let m = startMin; m < endMin; m += intervalMin) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }
  return { intervalMin, slots };
}

/* -------------------- Effective hours (auto-extend for off-hours) -------------------- */

function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minToHHmm(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, min));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  if (h >= 24) return "24:00";
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Extract HH:mm in agency tz from a UTC ISO. */
function utcIsoToTzHHmmInternal(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

/** YYYY-MM-DD in tz. */
function utcIsoToTzDateInternal(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Expand the visible hours window if any entry (appointment, availability,
 * or unassigned job) falls outside the agency's default dispatch hours on
 * any of the visible days. Returns hours snapped to the slot interval so
 * the grid remains evenly divisible.
 */
export function computeEffectiveHours(
  hours: DispatchHours,
  view: DispatchView,
  visibleDays: string[],
  tz: string,
  entries: { start: string; end: string }[],
): DispatchHours {
  if (view === "week") return hours; // week view uses one cell per day; no intra-day scroll
  const intervalMin = view === "day" ? 60 : 120;

  let earliestMin = hhmmToMin(hours.start);
  let latestMin = hhmmToMin(hours.end);
  const dayset = new Set(visibleDays);

  for (const e of entries) {
    if (!e.start || !e.end) continue;
    // Consider start side
    const sDate = utcIsoToTzDateInternal(e.start, tz);
    if (dayset.has(sDate)) {
      const sMin = hhmmToMin(utcIsoToTzHHmmInternal(e.start, tz));
      if (sMin < earliestMin) earliestMin = sMin;
    }
    // Consider end side (only if same visible day; otherwise it crosses midnight which we don't extend for)
    const eDate = utcIsoToTzDateInternal(e.end, tz);
    if (dayset.has(eDate)) {
      const eMin = hhmmToMin(utcIsoToTzHHmmInternal(e.end, tz));
      if (eMin > latestMin) latestMin = eMin;
    }
  }

  // Snap to interval boundaries: round earliest down, latest up.
  const snappedStart = Math.max(0, Math.floor(earliestMin / intervalMin) * intervalMin);
  const snappedEnd = Math.min(24 * 60, Math.ceil(latestMin / intervalMin) * intervalMin);

  // Guarantee at least one slot.
  if (snappedEnd <= snappedStart) {
    return hours;
  }

  return { start: minToHHmm(snappedStart), end: minToHHmm(snappedEnd) };
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function formatHourLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function formatDayHeader(yyyyMmDd: string, tz: string): { weekday: string; date: string } {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: tz }).format(dt);
  const date = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: tz }).format(dt);
  return { weekday, date };
}

/** Job priority for queue categorization. */
export type JobBucket = "urgent" | "lastMinute" | "thisWeek" | "future";

export function categorizeJob(
  scheduledStart: string | null,
  status: string,
  tz: string,
  nowMs = Date.now(),
): JobBucket {
  const lastMinuteStatus =
    status === "requested_last_minute" || status === "interpreter_assigned_last_minute";
  if (lastMinuteStatus) return "lastMinute";
  if (!scheduledStart) return "future";
  const startMs = new Date(scheduledStart).getTime();
  const diffH = (startMs - nowMs) / (60 * 60 * 1000);
  if (diffH < 0) return "urgent"; // already started but still unassigned — treat as urgent
  const today = todayInTz(tz);
  const apptDate = utcToTzDateStr(scheduledStart, tz);
  if (apptDate === today) return "urgent";
  if (diffH <= 24) return "lastMinute";
  if (diffH <= 24 * 7) return "thisWeek";
  return "future";
}
