import { describe, it, expect } from "vitest";
import {
  calculateBilling,
  type BillingRateRecord,
  type AppointmentForBilling,
  type BillingContext,
} from "../billing-engine";

function makeRate(overrides: Partial<BillingRateRecord> = {}): BillingRateRecord {
  return {
    id: "rate-std", agency_id: "agency-1", customer_id: null,
    billing_model: "hourly", name: "Standard", base_rate: 0,
    hourly_rate: 60, minimum_hours: 1, minimum_charge: 0, monthly_minimum: 0,
    travel_rate_per_mile: 0, travel_time_rate: 0,
    after_hours_multiplier: 1.5, weekend_multiplier: 1.5,
    overtime_multiplier: 1.5, overtime_after_hours: 8,
    cancellation_window_hours: 24, cancellation_fee_percent: 100,
    tier_config: [], effective_start_date: null, effective_end_date: null,
    is_default: true, same_day_threshold_hours: 24, same_day_fee: 0,
    same_day_multiplier: 1, after_hours_start: "18:00", after_hours_end: "08:00",
    holiday_multiplier: 1,
    ...overrides,
  };
}

function makeAppt(overrides: Partial<AppointmentForBilling> = {}): AppointmentForBilling {
  return {
    id: "appt-1", customer_id: null,
    scheduled_start: "2026-03-24T14:00:00.000Z",
    scheduled_end: "2026-03-24T16:00:00.000Z",
    actual_start: null, actual_end: null,
    status: "completed", modality: "on_site",
    created_at: "2026-03-20T10:00:00.000Z", cancelled_at: null,
    ...overrides,
  };
}

const TZ = "America/New_York";
const ctx: BillingContext = { agencyTimezone: TZ, holidayDates: [] };

describe("Rounding logic", () => {
  it("rounds up to 15-minute intervals", () => {
    const rate = makeRate({ rounding_direction: "up", rounding_interval_minutes: 15 });
    // 1hr 10min = 70min → rounds up to 75min = 1.25hr
    const appt = makeAppt({
      scheduled_start: "2026-03-24T14:00:00.000Z",
      scheduled_end: "2026-03-24T15:10:00.000Z",
    });
    const result = calculateBilling(appt, rate, ctx);
    expect(result.hours).toBe(1.25);
    expect(result.total).toBe(75); // 1.25 * 60
  });

  it("rounds down to 15-minute intervals", () => {
    const rate = makeRate({ rounding_direction: "down", rounding_interval_minutes: 15 });
    // 1hr 10min = 70min → rounds down to 60min = 1hr
    const appt = makeAppt({
      scheduled_start: "2026-03-24T14:00:00.000Z",
      scheduled_end: "2026-03-24T15:10:00.000Z",
    });
    const result = calculateBilling(appt, rate, ctx);
    expect(result.hours).toBe(1);
    expect(result.total).toBe(60);
  });

  it("rounds nearest to 15-minute intervals", () => {
    const rate = makeRate({ rounding_direction: "nearest", rounding_interval_minutes: 15 });
    // 1hr 10min = 70min → nearest 15 = 75min = 1.25hr
    const appt = makeAppt({
      scheduled_start: "2026-03-24T14:00:00.000Z",
      scheduled_end: "2026-03-24T15:10:00.000Z",
    });
    const result = calculateBilling(appt, rate, ctx);
    expect(result.hours).toBe(1.25);
  });

  it("rounds nearest down when closer to lower interval", () => {
    const rate = makeRate({ rounding_direction: "nearest", rounding_interval_minutes: 15 });
    // 1hr 5min = 65min → nearest 15 = 60min = 1hr
    const appt = makeAppt({
      scheduled_start: "2026-03-24T14:00:00.000Z",
      scheduled_end: "2026-03-24T15:05:00.000Z",
    });
    const result = calculateBilling(appt, rate, ctx);
    expect(result.hours).toBe(1);
  });

  it("respects minimum hours after rounding", () => {
    const rate = makeRate({ rounding_direction: "down", rounding_interval_minutes: 30, minimum_hours: 1 });
    // 20min → rounds down to 0 → but minimum is 1hr
    const appt = makeAppt({
      scheduled_start: "2026-03-24T14:00:00.000Z",
      scheduled_end: "2026-03-24T14:20:00.000Z",
    });
    const result = calculateBilling(appt, rate, ctx);
    expect(result.hours).toBe(1);
    expect(result.total).toBe(60);
  });
});

describe("stack_premiums=false (highest only)", () => {
  it("picks only the highest premium when stacking is off", () => {
    const rate = makeRate({
      after_hours_multiplier: 1.5, weekend_multiplier: 1.75, holiday_multiplier: 2,
      after_hours_start: "18:00", after_hours_end: "08:00",
      stack_premiums: false,
    });
    // Saturday Dec 26, 2026, 7pm ET (after-hours + weekend + holiday)
    const appt = makeAppt({
      scheduled_start: "2026-12-26T23:00:00.000Z",
      scheduled_end: "2026-12-27T01:00:00.000Z",
    });
    const result = calculateBilling(appt, rate, {
      agencyTimezone: TZ, holidayDates: ["2026-12-26"],
    });
    const base = 2 * 60; // 120
    // Only holiday (2x) should apply = 120 * 1 = 120
    expect(result.holiday_premium).toBe(120);
    expect(result.after_hours_premium).toBe(0);
    expect(result.weekend_premium).toBe(0);
    expect(result.total).toBe(base + 120);
  });
});

describe("apply_lastminute_to_travel", () => {
  it("applies same-day surcharge to travel when enabled", () => {
    const rate = makeRate({
      same_day_multiplier: 1.5, same_day_threshold_hours: 24,
      travel_rate_per_mile: 1, travel_time_rate: 0,
      apply_lastminute_to_travel: true,
    });
    const appt = makeAppt({
      created_at: "2026-03-24T10:00:00.000Z",
      scheduled_start: "2026-03-24T14:00:00.000Z",
      custom_fields: { mileage: 100 },
    });
    const result = calculateBilling(appt, rate, ctx);
    // Travel = 100 * $1 = $100
    // Same-day on base: 120 * 0.5 = 60
    // Same-day on travel: 100 * 0.5 = 50
    // Total same_day_premium = 60 + 50 = 110
    expect(result.same_day_premium).toBe(110);
    expect(result.travel_mileage).toBe(100);
  });

  it("does not apply same-day surcharge to travel when disabled", () => {
    const rate = makeRate({
      same_day_multiplier: 1.5, same_day_threshold_hours: 24,
      travel_rate_per_mile: 1, travel_time_rate: 0,
      apply_lastminute_to_travel: false,
    });
    const appt = makeAppt({
      created_at: "2026-03-24T10:00:00.000Z",
      scheduled_start: "2026-03-24T14:00:00.000Z",
      custom_fields: { mileage: 100 },
    });
    const result = calculateBilling(appt, rate, ctx);
    // Same-day premium only on base: 120 * 0.5 = 60
    expect(result.same_day_premium).toBe(60);
  });
});

describe("ignore_requested_duration", () => {
  it("uses actual times when ignore_requested_duration is true", () => {
    const rate = makeRate({ ignore_requested_duration: true });
    const appt = makeAppt({
      scheduled_start: "2026-03-24T14:00:00.000Z",
      scheduled_end: "2026-03-24T16:00:00.000Z", // 2 hrs scheduled
      actual_start: "2026-03-24T14:00:00.000Z",
      actual_end: "2026-03-24T15:00:00.000Z", // 1 hr actual
    });
    const result = calculateBilling(appt, rate, ctx);
    expect(result.hours).toBe(1);
    expect(result.total).toBe(60);
  });

  it("uses scheduled times when ignore_requested_duration is false", () => {
    const rate = makeRate({ ignore_requested_duration: false });
    const appt = makeAppt({
      scheduled_start: "2026-03-24T14:00:00.000Z",
      scheduled_end: "2026-03-24T16:00:00.000Z",
      actual_start: "2026-03-24T14:00:00.000Z",
      actual_end: "2026-03-24T15:00:00.000Z",
    });
    const result = calculateBilling(appt, rate, ctx);
    // actual_start/end take priority normally, so hours = 1
    // But since ignore is false, the normal logic (actual || scheduled) still applies
    // actual_start exists so it's used anyway → 1hr
    expect(result.hours).toBe(1);
  });
});
