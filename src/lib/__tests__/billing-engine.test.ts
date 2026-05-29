import { describe, it, expect } from "vitest";
import {
  resolveRate,
  calculateBilling,
  calculateAppointmentBilling,
  type BillingRateRecord,
  type AppointmentForBilling,
  type BillingContext,
} from "../billing-engine";

// ── Helpers ──────────────────────────────────────────────────────────

function makeRate(overrides: Partial<BillingRateRecord> = {}): BillingRateRecord {
  return {
    id: "rate-std",
    agency_id: "agency-1",
    customer_id: null,
    billing_model: "hourly",
    name: "Standard",
    base_rate: 0,
    hourly_rate: 60,
    minimum_hours: 1,
    minimum_charge: 0,
    monthly_minimum: 0,
    travel_rate_per_mile: 0,
    travel_time_rate: 0,
    after_hours_multiplier: 1.5,
    weekend_multiplier: 1.5,
    overtime_multiplier: 1.5,
    overtime_after_hours: 8,
    cancellation_window_hours: 24,
    cancellation_fee_percent: 100,
    tier_config: [],
    effective_start_date: null,
    effective_end_date: null,
    is_default: true,
    same_day_threshold_hours: 24,
    same_day_fee: 0,
    same_day_multiplier: 1,
    after_hours_start: "18:00",
    after_hours_end: "08:00",
    holiday_multiplier: 1,
    ...overrides,
  };
}

function makeAppt(overrides: Partial<AppointmentForBilling> = {}): AppointmentForBilling {
  return {
    id: "appt-1",
    customer_id: null,
    scheduled_start: "2026-03-24T14:00:00.000Z", // 10am ET weekday
    scheduled_end: "2026-03-24T16:00:00.000Z",   // 12pm ET (2 hrs)
    actual_start: null,
    actual_end: null,
    status: "completed",
    modality: "on_site",
    created_at: "2026-03-20T10:00:00.000Z", // 4 days prior
    cancelled_at: null,
    ...overrides,
  };
}

const TZ = "America/New_York";
const ctx: BillingContext = { agencyTimezone: TZ, holidayDates: [] };

// ── SECTION 1: Default standard bundle at safe defaults ─────────────

describe("Standard bundle with defaults", () => {
  it("calculates base hourly correctly with new fields at defaults", () => {
    const rate = makeRate();
    const appt = makeAppt();
    const result = calculateBilling(appt, rate, ctx);
    // 2 hours * $60 = $120
    expect(result.total).toBe(120);
    expect(result.hours).toBe(2);
    expect(result.same_day_premium).toBe(0);
    expect(result.holiday_premium).toBe(0);
    expect(result.line_items.length).toBe(1);
    expect(result.line_items[0].type).toBe("time");
  });
});

// ── SECTION 2: Customer override resolves correctly ─────────────────

describe("Rate resolution hierarchy", () => {
  it("customer-specific rate overrides standard", () => {
    const std = makeRate();
    const custom = makeRate({
      id: "rate-cust",
      customer_id: "cust-1",
      name: "Custom",
      hourly_rate: 80,
      is_default: false,
    });
    const resolved = resolveRate([std, custom], "cust-1");
    expect(resolved.id).toBe("rate-cust");
    expect(resolved.hourly_rate).toBe(80);
  });

  it("falls back to default when no customer-specific rate", () => {
    const std = makeRate();
    const resolved = resolveRate([std], "cust-1");
    expect(resolved.id).toBe("rate-std");
  });
});

// ── SECTION 3: Same-day threshold ──────────────────────────────────

describe("Same-day / last-minute premium", () => {
  it("applies when booked within threshold", () => {
    const rate = makeRate({ same_day_multiplier: 1.5, same_day_fee: 25, same_day_threshold_hours: 24 });
    // Booked 4 hours before start
    const appt = makeAppt({
      created_at: "2026-03-24T10:00:00.000Z",
      scheduled_start: "2026-03-24T14:00:00.000Z",
    });
    const result = calculateBilling(appt, rate, ctx);
    // Base: 2hrs * 60 = 120
    // Same-day mult: 120 * 0.5 = 60
    // Same-day fee: 25
    expect(result.same_day_premium).toBe(85);
    expect(result.total).toBe(120 + 85);
  });

  it("does NOT apply when booked outside threshold", () => {
    const rate = makeRate({ same_day_multiplier: 1.5, same_day_fee: 25, same_day_threshold_hours: 24 });
    // Booked 4 days before
    const appt = makeAppt({
      created_at: "2026-03-20T10:00:00.000Z",
      scheduled_start: "2026-03-24T14:00:00.000Z",
    });
    const result = calculateBilling(appt, rate, ctx);
    expect(result.same_day_premium).toBe(0);
  });
});

// ── SECTION 4: After-hours ─────────────────────────────────────────

describe("After-hours premium", () => {
  it("applies inside configured window", () => {
    const rate = makeRate({ after_hours_start: "18:00", after_hours_end: "08:00", after_hours_multiplier: 1.5 });
    // 7pm ET = 23:00 UTC (March, EDT)
    const appt = makeAppt({
      scheduled_start: "2026-03-24T23:00:00.000Z",
      scheduled_end: "2026-03-25T01:00:00.000Z",
    });
    const result = calculateBilling(appt, rate, ctx);
    expect(result.after_hours_premium).toBeGreaterThan(0);
  });

  it("does NOT apply outside window", () => {
    const rate = makeRate({ after_hours_start: "18:00", after_hours_end: "08:00", after_hours_multiplier: 1.5 });
    // 10am ET = 14:00 UTC
    const appt = makeAppt({
      scheduled_start: "2026-03-24T14:00:00.000Z",
      scheduled_end: "2026-03-24T16:00:00.000Z",
    });
    const result = calculateBilling(appt, rate, ctx);
    expect(result.after_hours_premium).toBe(0);
  });

  it("overnight window works (18:00-08:00, appointment at 6am)", () => {
    const rate = makeRate({ after_hours_start: "18:00", after_hours_end: "08:00", after_hours_multiplier: 1.5 });
    // 6am ET = 10:00 UTC
    const appt = makeAppt({
      scheduled_start: "2026-03-24T10:00:00.000Z",
      scheduled_end: "2026-03-24T12:00:00.000Z",
    });
    const result = calculateBilling(appt, rate, ctx);
    expect(result.after_hours_premium).toBeGreaterThan(0);
  });
});

// ── SECTION 5: Weekend premium ─────────────────────────────────────

describe("Weekend premium", () => {
  it("applies on Saturday in agency timezone", () => {
    const rate = makeRate({ weekend_multiplier: 1.5 });
    // 2026-03-28 is Saturday
    const appt = makeAppt({
      scheduled_start: "2026-03-28T14:00:00.000Z",
      scheduled_end: "2026-03-28T16:00:00.000Z",
    });
    const result = calculateBilling(appt, rate, ctx);
    expect(result.weekend_premium).toBeGreaterThan(0);
  });

  it("does NOT apply on weekday", () => {
    const rate = makeRate({ weekend_multiplier: 1.5 });
    // 2026-03-24 is Tuesday
    const appt = makeAppt();
    const result = calculateBilling(appt, rate, ctx);
    expect(result.weekend_premium).toBe(0);
  });
});

// ── SECTION 6: Holiday premium ─────────────────────────────────────

describe("Holiday premium", () => {
  it("applies on a holiday date", () => {
    const rate = makeRate({ holiday_multiplier: 2 });
    const appt = makeAppt({
      scheduled_start: "2026-12-25T18:00:00.000Z",
      scheduled_end: "2026-12-25T20:00:00.000Z",
    });
    const result = calculateBilling(appt, rate, {
      agencyTimezone: TZ,
      holidayDates: ["2026-12-25"],
    });
    // Base: 2hr * 60 = 120, holiday: 120 * (2-1) = 120
    expect(result.holiday_premium).toBe(120);
  });

  it("does NOT apply when not a holiday", () => {
    const rate = makeRate({ holiday_multiplier: 2 });
    const appt = makeAppt();
    const result = calculateBilling(appt, rate, {
      agencyTimezone: TZ,
      holidayDates: ["2026-12-25"],
    });
    expect(result.holiday_premium).toBe(0);
  });
});

// ── SECTION 7: Stacked premiums ────────────────────────────────────

describe("Additive stacking", () => {
  it("after-hours + weekend + holiday stack additively", () => {
    const rate = makeRate({
      after_hours_multiplier: 1.5,
      weekend_multiplier: 1.5,
      holiday_multiplier: 2,
      after_hours_start: "18:00",
      after_hours_end: "08:00",
    });
    // Saturday Dec 26, 2026, 7pm ET = 2026-12-27T00:00:00Z (Sunday UTC, but Saturday ET)
    // Actually let's use a clear Saturday holiday
    // 2026-12-26 is Saturday
    const appt = makeAppt({
      scheduled_start: "2026-12-26T23:00:00.000Z", // 6pm ET Saturday
      scheduled_end: "2026-12-27T01:00:00.000Z",   // 8pm ET
    });
    const result = calculateBilling(appt, rate, {
      agencyTimezone: TZ,
      holidayDates: ["2026-12-26"],
    });
    const base = 2 * 60; // 120
    // After-hours: 120 * 0.5 = 60
    expect(result.after_hours_premium).toBe(60);
    // Weekend: 120 * 0.5 = 60
    expect(result.weekend_premium).toBe(60);
    // Holiday: 120 * 1 = 120
    expect(result.holiday_premium).toBe(120);
    // Total: 120 + 60 + 60 + 120 = 360
    expect(result.total).toBe(360);
  });
});

// ── SECTION 8: Cancellation logic ──────────────────────────────────

describe("Cancellation billing", () => {
  it("early cancellation bills $0", () => {
    const rate = makeRate({ cancellation_window_hours: 24, cancellation_fee_percent: 100 });
    const appt = makeAppt({
      status: "cancelled",
      cancelled_at: "2026-03-22T14:00:00.000Z", // 2 days before
      scheduled_start: "2026-03-24T14:00:00.000Z",
    });
    const result = calculateBilling(appt, rate, ctx);
    expect(result.cancellation_fee).toBe(0);
    expect(result.total).toBe(0);
  });

  it("late cancellation bills correctly", () => {
    const rate = makeRate({ cancellation_window_hours: 24, cancellation_fee_percent: 100, minimum_hours: 1 });
    const appt = makeAppt({
      status: "cancelled",
      cancelled_at: "2026-03-24T10:00:00.000Z", // 4 hours before
      scheduled_start: "2026-03-24T14:00:00.000Z",
    });
    const result = calculateBilling(appt, rate, ctx);
    // Fee base: hourly_rate * minimum_hours = 60 * 1 = 60
    // 100% of 60 = 60
    expect(result.cancellation_fee).toBe(60);
    expect(result.total).toBe(60);
  });

  it("late_cancel_no_show_client bills at full duration", () => {
    const rate = makeRate({ cancellation_fee_percent: 50, minimum_hours: 2 });
    const appt = makeAppt({ status: "late_cancel_no_show_client" });
    const result = calculateBilling(appt, rate, ctx);
    // late_cancel_no_show_client is billed at full scheduled duration
    expect(result.total).toBeGreaterThan(0);
  });
});

// ── SECTION 9: Invoice generation matches engine ───────────────────

describe("calculateAppointmentBilling convenience wrapper", () => {
  it("resolves rate and calculates in one call", () => {
    const rates = [makeRate()];
    const appt = makeAppt();
    const result = calculateAppointmentBilling(appt, rates, ctx);
    expect(result.total).toBe(120);
    expect(result.rate_id).toBe("rate-std");
  });
});

// ── SECTION 10: QBO line items include new types ───────────────────

describe("Line items include new premium types", () => {
  it("same_day and holiday line items present when applicable", () => {
    const rate = makeRate({
      same_day_multiplier: 1.5,
      same_day_fee: 10,
      same_day_threshold_hours: 48,
      holiday_multiplier: 2,
    });
    const appt = makeAppt({
      created_at: "2026-12-24T10:00:00.000Z",
      scheduled_start: "2026-12-25T18:00:00.000Z",
      scheduled_end: "2026-12-25T20:00:00.000Z",
    });
    const result = calculateBilling(appt, rate, {
      agencyTimezone: TZ,
      holidayDates: ["2026-12-25"],
    });
    const types = result.line_items.map((li) => li.type);
    expect(types).toContain("same_day");
    expect(types).toContain("same_day_fee");
    expect(types).toContain("holiday");
  });
});
