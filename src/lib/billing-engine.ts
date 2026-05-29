/**
 * Billing Calculation Engine
 *
 * Resolves rates using a hierarchy:
 *   1. Customer-specific rate (matching customer_id, active, within effective dates)
 *   2. Agency default rate (is_default=true, no customer_id)
 *   3. Error if none found
 *
 * Returns a structured breakdown for every appointment.
 */

import { utcToLocalParts } from "@/lib/agency-timezone";

export interface BillingRateRecord {
  id: string;
  agency_id: string;
  customer_id: string | null;
  billing_model: string; // hourly | per_appointment | flat | tiered
  name: string;
  base_rate: number;
  hourly_rate: number;
  minimum_hours: number;
  minimum_charge: number;
  monthly_minimum: number;
  travel_rate_per_mile: number;
  travel_time_rate: number;
  after_hours_multiplier: number;
  weekend_multiplier: number;
  overtime_multiplier: number;
  overtime_after_hours: number;
  cancellation_window_hours: number;
  cancellation_fee_percent: number;
  tier_config: TierEntry[];
  effective_start_date: string | null;
  effective_end_date: string | null;
  is_default: boolean;
  is_active?: boolean;
  // Bundle fields
  same_day_threshold_hours: number;
  same_day_fee: number;
  same_day_multiplier: number;
  after_hours_start: string; // "HH:mm" or "HH:mm:ss"
  after_hours_end: string;   // "HH:mm" or "HH:mm:ss"
  holiday_multiplier: number;
  // Advanced billing fields
  rounding_direction?: string;        // 'up' | 'down' | 'nearest'
  rounding_interval_minutes?: number; // e.g. 15
  stack_premiums?: boolean;           // if false, only highest premium applies
  apply_lastminute_to_travel?: boolean;
  ignore_requested_duration?: boolean;
}

export interface TierEntry {
  min_appointments: number;
  max_appointments: number | null;
  rate: number;
}

export interface AppointmentForBilling {
  id: string;
  customer_id: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: string;
  modality: string | null;
  custom_fields?: Record<string, any> | null;
  parking_cost?: number | null;
  created_at?: string | null;
  cancelled_at?: string | null;
}

export interface BillingBreakdown {
  base: number;
  time: number;
  travel_mileage: number;
  travel_time: number;
  after_hours_premium: number;
  weekend_premium: number;
  overtime_premium: number;
  same_day_premium: number;
  holiday_premium: number;
  parking: number;
  cancellation_fee: number;
  minimum_adjustment: number;
  total: number;
  hours: number;
  rate_id: string;
  rate_name: string;
  billing_model: string;
  line_items: BillingLineItem[];
}

export interface BillingLineItem {
  type: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface BillingContext {
  agencyTimezone?: string;
  holidayDates?: string[]; // ISO date strings e.g. ["2026-01-01", "2026-12-25"]
}

// ── Hierarchy resolver ────────────────────────────────────────────────

export function resolveRate(
  rates: BillingRateRecord[],
  customerId: string | null,
  appointmentDate?: Date
): BillingRateRecord {
  const now = appointmentDate ?? new Date();
  const dateStr = now.toISOString().split("T")[0];

  // Filter to active & within effective dates
  const active = rates.filter((r) => {
    if (r.is_active === false) return false;
    if (r.effective_start_date && r.effective_start_date > dateStr) return false;
    if (r.effective_end_date && r.effective_end_date < dateStr) return false;
    return true;
  });

  // 1. Customer-specific
  if (customerId) {
    const customerRate = active.find((r) => r.customer_id === customerId);
    if (customerRate) return customerRate;
  }

  // 2. Agency default
  const defaultRate = active.find((r) => r.is_default && !r.customer_id);
  if (defaultRate) return defaultRate;

  // 3. Any rate without customer (fallback)
  const anyDefault = active.find((r) => !r.customer_id);
  if (anyDefault) return anyDefault;

  throw new Error(
    "No billing rate found. Please configure a default billing rate for your agency."
  );
}

// ── Time helpers ──────────────────────────────────────────────────────

/**
 * Apply rounding to raw hours based on direction and interval.
 */
function applyRounding(rawHours: number, direction: string, intervalMinutes: number): number {
  if (intervalMinutes <= 0) return rawHours;
  const totalMinutes = rawHours * 60;
  let rounded: number;
  switch (direction) {
    case "down":
      rounded = Math.floor(totalMinutes / intervalMinutes) * intervalMinutes;
      break;
    case "nearest":
      rounded = Math.round(totalMinutes / intervalMinutes) * intervalMinutes;
      break;
    case "up":
    default:
      rounded = Math.ceil(totalMinutes / intervalMinutes) * intervalMinutes;
      break;
  }
  return rounded / 60;
}

function getHours(
  start: string | null,
  end: string | null,
  minHours: number,
  roundingDirection?: string,
  roundingInterval?: number
): number {
  if (!start || !end) return minHours;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  let hours = ms / 3_600_000;
  // Apply rounding before minimum
  if (roundingDirection && roundingInterval && roundingInterval > 0) {
    hours = applyRounding(hours, roundingDirection, roundingInterval);
  }
  return Math.max(hours, minHours);
}

/**
 * Parse a time string "HH:mm" or "HH:mm:ss" to total minutes since midnight.
 */
function timeToMinutes(t: string): number {
  const parts = t.split(":").map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

/**
 * Determine whether a given UTC timestamp falls within the after-hours window,
 * using the agency timezone for evaluation.
 */
function isAfterHoursConfigurable(
  dateStr: string | null,
  afterHoursStart: string | undefined,
  afterHoursEnd: string | undefined,
  timezone: string
): boolean {
  if (!dateStr) return false;

  const startMin = timeToMinutes(afterHoursStart ?? "18:00");
  const endMin = timeToMinutes(afterHoursEnd ?? "08:00");

  // Get local time in agency timezone
  const local = utcToLocalParts(dateStr, timezone);
  if (!local.time) return false;
  const appointmentMin = timeToMinutes(local.time);

  // Overnight window (e.g. 18:00 → 08:00): after-hours if >= start OR < end
  if (startMin > endMin) {
    return appointmentMin >= startMin || appointmentMin < endMin;
  }
  // Same-day window (e.g. 22:00 → 23:00): after-hours if >= start AND < end
  if (startMin < endMin) {
    return appointmentMin >= startMin && appointmentMin < endMin;
  }
  // startMin === endMin means 24h after-hours (always true) — edge case
  return true;
}

/**
 * Check if a UTC timestamp falls on a weekend in the agency timezone.
 */
function isWeekendTz(dateStr: string | null, timezone: string): boolean {
  if (!dateStr) return false;
  const local = utcToLocalParts(dateStr, timezone);
  if (!local.date) return false;
  // Parse local date to get day of week
  const [y, m, d] = local.date.split("-").map(Number);
  const localDate = new Date(y, m - 1, d);
  const day = localDate.getDay();
  return day === 0 || day === 6;
}

/**
 * Check if a UTC timestamp falls on a holiday in the agency timezone.
 */
function isHoliday(dateStr: string | null, holidayDates: string[], timezone: string): boolean {
  if (!dateStr || holidayDates.length === 0) return false;
  const local = utcToLocalParts(dateStr, timezone);
  return holidayDates.includes(local.date);
}

/**
 * Check if an appointment was booked within the same-day threshold.
 * "Same-day" means scheduled_start - created_at <= threshold hours.
 */
function isSameDay(
  createdAt: string | null | undefined,
  scheduledStart: string | null,
  thresholdHours: number
): boolean {
  if (!createdAt || !scheduledStart || thresholdHours <= 0) return false;
  const created = new Date(createdAt).getTime();
  const start = new Date(scheduledStart).getTime();
  const diffHours = (start - created) / 3_600_000;
  return diffHours >= 0 && diffHours <= thresholdHours;
}

// ── Main calculator ──────────────────────────────────────────────────

export function calculateBilling(
  appointment: AppointmentForBilling,
  rate: BillingRateRecord,
  context?: BillingContext
): BillingBreakdown {
  const lines: BillingLineItem[] = [];
  const timezone = context?.agencyTimezone || "America/Los_Angeles";
  const holidayDates = context?.holidayDates ?? [];

  // Safe defaults for new fields on legacy rate records
  const sameDayThreshold = rate.same_day_threshold_hours ?? 24;
  const sameDayFee = rate.same_day_fee ?? 0;
  const sameDayMult = rate.same_day_multiplier ?? 1;
  const afterHoursStart = rate.after_hours_start ?? "18:00";
  const afterHoursEnd = rate.after_hours_end ?? "08:00";
  const holidayMult = rate.holiday_multiplier ?? 1;

  // Advanced fields with safe defaults
  const roundDir = rate.rounding_direction ?? "up";
  const roundInt = rate.rounding_interval_minutes ?? 0;
  const stackPremiums = rate.stack_premiums !== false; // default true
  const applyLastMinToTravel = rate.apply_lastminute_to_travel ?? false;
  const ignoreDuration = rate.ignore_requested_duration ?? false;

  const start = appointment.actual_start || appointment.scheduled_start;
  const end = appointment.actual_end || appointment.scheduled_end;

  // If ignore_requested_duration is true and we have actual times, only use actual; otherwise use scheduled
  const effectiveStart = ignoreDuration && appointment.actual_start ? appointment.actual_start : start;
  const effectiveEnd = ignoreDuration && appointment.actual_end ? appointment.actual_end : end;

  const hours = getHours(effectiveStart, effectiveEnd, rate.minimum_hours, roundDir, roundInt);
  const cf = (appointment.custom_fields ?? {}) as Record<string, any>;

  let base = 0;
  let timeCharge = 0;
  let travelMileage = 0;
  let travelTime = 0;
  let afterHoursPremium = 0;
  let weekendPremium = 0;
  let overtimePremium = 0;
  let sameDayPremium = 0;
  let holidayPremium = 0;
  let parking = Number(appointment.parking_cost ?? 0);
  let cancellationFee = 0;
  let minimumAdj = 0;

  // ── Cancelled / no-show ─────────────────────────────────────────
  const isCancelled = appointment.status === "cancelled";
  const isLateCancel = appointment.status === "late_cancel_no_show_client";
  const isNoShowInterpreter = appointment.status === "no_show_interpreter";

  // no_show_interpreter is non-billable — return zero
  if (isNoShowInterpreter) {
    return {
      base: 0, time: 0, travel_mileage: 0, travel_time: 0,
      after_hours_premium: 0, weekend_premium: 0, overtime_premium: 0,
      same_day_premium: 0, holiday_premium: 0,
      parking: 0, cancellation_fee: 0, minimum_adjustment: 0,
      total: 0, hours: 0, rate_id: rate.id, rate_name: rate.name,
      billing_model: rate.billing_model, line_items: lines,
    };
  }

  // late_cancel_no_show_client — billed at full scheduled duration
  if (isLateCancel) {
    const feeBase = rate.billing_model === "per_appointment" ? rate.base_rate : rate.hourly_rate * Math.max(hours, rate.minimum_hours);
    cancellationFee = Math.round(feeBase * (rate.cancellation_fee_percent / 100) * 100) / 100;
    lines.push({ type: "cancellation", description: `Late Cancel / No-Show Client Fee (${rate.cancellation_fee_percent}%, full scheduled duration)`, quantity: 1, unit_price: cancellationFee, amount: cancellationFee });
    return {
      base: 0, time: 0, travel_mileage: 0, travel_time: 0,
      after_hours_premium: 0, weekend_premium: 0, overtime_premium: 0,
      same_day_premium: 0, holiday_premium: 0,
      parking: 0, cancellation_fee: cancellationFee, minimum_adjustment: 0,
      total: cancellationFee, hours, rate_id: rate.id, rate_name: rate.name,
      billing_model: rate.billing_model, line_items: lines,
    };
  }

  if (isCancelled) {
    // Regular cancellation: check if within cancellation window
    const cancelledAt = appointment.cancelled_at;
    const scheduledStart = appointment.scheduled_start;
    let shouldBill = false;
    if (cancelledAt && scheduledStart) {
      const cancelTime = new Date(cancelledAt).getTime();
      const startTime = new Date(scheduledStart).getTime();
      const hoursBeforeStart = (startTime - cancelTime) / 3_600_000;
      shouldBill = hoursBeforeStart >= 0 && hoursBeforeStart < rate.cancellation_window_hours;
    } else if (!cancelledAt) {
      shouldBill = true;
    }
    if (shouldBill) {
      const feeBase = rate.billing_model === "per_appointment" ? rate.base_rate : rate.hourly_rate * rate.minimum_hours;
      cancellationFee = Math.round(feeBase * (rate.cancellation_fee_percent / 100) * 100) / 100;
      lines.push({ type: "cancellation", description: `Cancellation Fee (${rate.cancellation_fee_percent}%, within ${rate.cancellation_window_hours}hr window)`, quantity: 1, unit_price: cancellationFee, amount: cancellationFee });
    }
    return {
      base: 0, time: 0, travel_mileage: 0, travel_time: 0,
      after_hours_premium: 0, weekend_premium: 0, overtime_premium: 0,
      same_day_premium: 0, holiday_premium: 0,
      parking: 0, cancellation_fee: cancellationFee, minimum_adjustment: 0,
      total: cancellationFee, hours: 0, rate_id: rate.id, rate_name: rate.name,
      billing_model: rate.billing_model, line_items: lines,
    };
  }

  // ── Base / time charge ──────────────────────────────────────────
  switch (rate.billing_model) {
    case "per_appointment":
      base = rate.base_rate;
      lines.push({ type: "base", description: "Per-appointment base rate", quantity: 1, unit_price: base, amount: base });
      break;

    case "flat":
      base = rate.base_rate;
      lines.push({ type: "base", description: "Flat rate", quantity: 1, unit_price: base, amount: base });
      break;

    case "tiered": {
      base = rate.base_rate;
      lines.push({ type: "base", description: "Tiered base rate", quantity: 1, unit_price: base, amount: base });
      break;
    }

    case "hourly":
    default:
      timeCharge = Math.round(hours * rate.hourly_rate * 100) / 100;
      lines.push({ type: "time", description: `Interpreting (${hours.toFixed(2)} hrs @ $${rate.hourly_rate}/hr)`, quantity: parseFloat(hours.toFixed(2)), unit_price: rate.hourly_rate, amount: timeCharge });
      break;
  }

  const premiumBase = timeCharge || base;

  // ── Same-day / last-minute premium ──────────────────────────────
  const isSameDayAppt = isSameDay(appointment.created_at, appointment.scheduled_start, sameDayThreshold);
  if (isSameDayAppt) {
    if (sameDayMult > 1) {
      const multDelta = Math.round(premiumBase * (sameDayMult - 1) * 100) / 100;
      sameDayPremium += multDelta;
      lines.push({ type: "same_day", description: `Same-day / last-minute premium (${sameDayMult}x)`, quantity: 1, unit_price: multDelta, amount: multDelta });
    }
    if (sameDayFee > 0) {
      sameDayPremium += sameDayFee;
      lines.push({ type: "same_day_fee", description: `Same-day flat fee`, quantity: 1, unit_price: sameDayFee, amount: sameDayFee });
    }
  }

  // ── Apply last-minute surcharge to travel if configured ─────────
  if (applyLastMinToTravel && isSameDayAppt && sameDayMult > 1) {
    // Travel charges computed below will get the same-day multiplier applied after travel section
  }

  // ── Situational premiums ─────────────────────────────────────────
  const isAH = isAfterHoursConfigurable(start, afterHoursStart, afterHoursEnd, timezone) && rate.after_hours_multiplier > 1;
  const isWE = isWeekendTz(start, timezone) && rate.weekend_multiplier > 1;
  const isHol = isHoliday(start, holidayDates, timezone) && holidayMult > 1;

  if (stackPremiums) {
    // Additive stacking — each premium adds independently
    if (isAH) {
      afterHoursPremium = Math.round(premiumBase * (rate.after_hours_multiplier - 1) * 100) / 100;
      lines.push({ type: "after_hours", description: `After-hours premium (${rate.after_hours_multiplier}x)`, quantity: 1, unit_price: afterHoursPremium, amount: afterHoursPremium });
    }
    if (isWE) {
      weekendPremium = Math.round(premiumBase * (rate.weekend_multiplier - 1) * 100) / 100;
      lines.push({ type: "weekend", description: `Weekend premium (${rate.weekend_multiplier}x)`, quantity: 1, unit_price: weekendPremium, amount: weekendPremium });
    }
    if (isHol) {
      holidayPremium = Math.round(premiumBase * (holidayMult - 1) * 100) / 100;
      lines.push({ type: "holiday", description: `Holiday premium (${holidayMult}x)`, quantity: 1, unit_price: holidayPremium, amount: holidayPremium });
    }
  } else {
    // Highest-only: pick the single largest multiplier among applicable premiums
    const candidates: { type: string; mult: number; label: string }[] = [];
    if (isAH) candidates.push({ type: "after_hours", mult: rate.after_hours_multiplier, label: "After-hours" });
    if (isWE) candidates.push({ type: "weekend", mult: rate.weekend_multiplier, label: "Weekend" });
    if (isHol) candidates.push({ type: "holiday", mult: holidayMult, label: "Holiday" });
    if (candidates.length > 0) {
      const best = candidates.reduce((a, b) => (b.mult > a.mult ? b : a));
      const prem = Math.round(premiumBase * (best.mult - 1) * 100) / 100;
      if (best.type === "after_hours") afterHoursPremium = prem;
      else if (best.type === "weekend") weekendPremium = prem;
      else holidayPremium = prem;
      lines.push({ type: best.type, description: `${best.label} premium (${best.mult}x, highest)`, quantity: 1, unit_price: prem, amount: prem });
    }
  }

  // ── Travel mileage ──────────────────────────────────────────────
  const mileage = Number(cf.mileage ?? 0);
  if (mileage > 0 && rate.travel_rate_per_mile > 0) {
    travelMileage = Math.round(mileage * rate.travel_rate_per_mile * 100) / 100;
    lines.push({ type: "travel_mileage", description: `Travel (${mileage} mi @ $${rate.travel_rate_per_mile}/mi)`, quantity: mileage, unit_price: rate.travel_rate_per_mile, amount: travelMileage });
  }

  // ── Travel time ─────────────────────────────────────────────────
  const travelHours = Number(cf.travel_hours ?? 0);
  if (travelHours > 0 && rate.travel_time_rate > 0) {
    travelTime = Math.round(travelHours * rate.travel_time_rate * 100) / 100;
    lines.push({ type: "travel_time", description: `Travel time (${travelHours} hrs @ $${rate.travel_time_rate}/hr)`, quantity: travelHours, unit_price: rate.travel_time_rate, amount: travelTime });
  }

  // ── Apply last-minute surcharge to travel ───────────────────────
  if (applyLastMinToTravel && isSameDayAppt && sameDayMult > 1) {
    const travelTotal = travelMileage + travelTime;
    if (travelTotal > 0) {
      const travelSurcharge = Math.round(travelTotal * (sameDayMult - 1) * 100) / 100;
      sameDayPremium += travelSurcharge;
      lines.push({ type: "same_day_travel", description: `Same-day travel surcharge (${sameDayMult}x on travel)`, quantity: 1, unit_price: travelSurcharge, amount: travelSurcharge });
    }
  }

  // ── Overtime premium ────────────────────────────────────────────
  if (rate.billing_model === "hourly" && hours > rate.overtime_after_hours && rate.overtime_multiplier > 1) {
    const otHours = hours - rate.overtime_after_hours;
    overtimePremium = Math.round(otHours * rate.hourly_rate * (rate.overtime_multiplier - 1) * 100) / 100;
    lines.push({ type: "overtime", description: `Overtime (${otHours.toFixed(2)} hrs @ ${rate.overtime_multiplier}x)`, quantity: parseFloat(otHours.toFixed(2)), unit_price: Math.round(rate.hourly_rate * (rate.overtime_multiplier - 1) * 100) / 100, amount: overtimePremium });
  }

  // ── Parking ─────────────────────────────────────────────────────
  if (parking > 0) {
    lines.push({ type: "parking", description: "Parking", quantity: 1, unit_price: parking, amount: parking });
  }

  // ── Subtotal and minimum charge ─────────────────────────────────
  let subtotal = base + timeCharge + travelMileage + travelTime + afterHoursPremium + weekendPremium + overtimePremium + sameDayPremium + holidayPremium + parking;
  if (rate.minimum_charge > 0 && subtotal < rate.minimum_charge) {
    minimumAdj = Math.round((rate.minimum_charge - subtotal) * 100) / 100;
    lines.push({ type: "minimum_adjustment", description: `Minimum charge adjustment`, quantity: 1, unit_price: minimumAdj, amount: minimumAdj });
    subtotal = rate.minimum_charge;
  }

  const total = Math.round(subtotal * 100) / 100;

  return {
    base, time: timeCharge, travel_mileage: travelMileage, travel_time: travelTime,
    after_hours_premium: afterHoursPremium, weekend_premium: weekendPremium,
    overtime_premium: overtimePremium, same_day_premium: sameDayPremium,
    holiday_premium: holidayPremium,
    parking, cancellation_fee: cancellationFee,
    minimum_adjustment: minimumAdj, total, hours: parseFloat(hours.toFixed(2)),
    rate_id: rate.id, rate_name: rate.name, billing_model: rate.billing_model,
    line_items: lines,
  };
}

// ── Convenience: resolve + calculate in one call ──────────────────

export function calculateAppointmentBilling(
  appointment: AppointmentForBilling,
  allRates: BillingRateRecord[],
  context?: BillingContext
): BillingBreakdown {
  const apptDate = appointment.scheduled_start ? new Date(appointment.scheduled_start) : undefined;
  const rate = resolveRate(allRates, appointment.customer_id, apptDate);
  return calculateBilling(appointment, rate, context);
}
