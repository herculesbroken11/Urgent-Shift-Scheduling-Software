import { describe, it, expect } from "vitest";
import {
  calculateBilling,
  resolveRate,
  type BillingRateRecord,
  type AppointmentForBilling,
  type BillingContext,
} from "../billing-engine";
import { STANDARD_TABS, STATUS_VOCABULARY, INSTRUCTIONS_TEXT } from "../workbook-template";
import { generateTemplateWorkbook, generateExportWorkbook } from "../workbook-xlsx";
import { ROUTE_ROLES } from "../route-roles";

function makeRate(overrides: Partial<BillingRateRecord> = {}): BillingRateRecord {
  return {
    id: "rate-std", agency_id: "a1", customer_id: null,
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
    id: "a1", customer_id: null,
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

// ── Rounding ─────────────────────────────────────────────────────
describe("Rounding directions", () => {
  it("rounds up 70min → 75min with 15min interval", () => {
    const rate = makeRate({ rounding_direction: "up", rounding_interval_minutes: 15 });
    const appt = makeAppt({
      scheduled_start: "2026-03-24T14:00:00.000Z",
      scheduled_end: "2026-03-24T15:10:00.000Z",
    });
    const r = calculateBilling(appt, rate, ctx);
    expect(r.hours).toBe(1.25);
    expect(r.total).toBe(75);
  });

  it("rounds down 70min → 60min with 15min interval", () => {
    const rate = makeRate({ rounding_direction: "down", rounding_interval_minutes: 15 });
    const appt = makeAppt({
      scheduled_start: "2026-03-24T14:00:00.000Z",
      scheduled_end: "2026-03-24T15:10:00.000Z",
    });
    const r = calculateBilling(appt, rate, ctx);
    expect(r.hours).toBe(1);
    expect(r.total).toBe(60);
  });

  it("rounds nearest 70min → 75min with 15min interval", () => {
    const rate = makeRate({ rounding_direction: "nearest", rounding_interval_minutes: 15 });
    const appt = makeAppt({
      scheduled_start: "2026-03-24T14:00:00.000Z",
      scheduled_end: "2026-03-24T15:10:00.000Z",
    });
    const r = calculateBilling(appt, rate, ctx);
    expect(r.hours).toBe(1.25);
  });

  it("no rounding when interval is 0", () => {
    const rate = makeRate({ rounding_direction: "up", rounding_interval_minutes: 0 });
    const appt = makeAppt({
      scheduled_start: "2026-03-24T14:00:00.000Z",
      scheduled_end: "2026-03-24T15:10:00.000Z",
    });
    const r = calculateBilling(appt, rate, ctx);
    expect(r.hours).toBeCloseTo(1.167, 2);
  });
});

// ── Premium stacking ─────────────────────────────────────────────
describe("Premium stacking logic", () => {
  it("stacks all premiums when stack_premiums=true", () => {
    const rate = makeRate({
      stack_premiums: true,
      after_hours_multiplier: 1.5,
      weekend_multiplier: 1.5,
      holiday_multiplier: 2,
    });
    // Saturday evening in ET → weekend + after hours + holiday
    const appt = makeAppt({
      scheduled_start: "2026-03-29T00:00:00.000Z", // Sat 8pm ET
      scheduled_end: "2026-03-29T02:00:00.000Z",
    });
    const ctxH: BillingContext = { agencyTimezone: TZ, holidayDates: ["2026-03-28"] };
    const r = calculateBilling(appt, rate, ctxH);
    const types = r.line_items.map((li) => li.type);
    expect(types).toContain("after_hours");
    expect(types).toContain("weekend");
    expect(types).toContain("holiday");
  });

  it("uses highest-only when stack_premiums=false", () => {
    const rate = makeRate({
      stack_premiums: false,
      after_hours_multiplier: 1.5,
      weekend_multiplier: 1.5,
      holiday_multiplier: 2,
    });
    const appt = makeAppt({
      scheduled_start: "2026-03-29T00:00:00.000Z",
      scheduled_end: "2026-03-29T02:00:00.000Z",
    });
    const ctxH: BillingContext = { agencyTimezone: TZ, holidayDates: ["2026-03-28"] };
    const r = calculateBilling(appt, rate, ctxH);
    const premiums = r.line_items.filter((li) =>
      ["after_hours", "weekend", "holiday"].includes(li.type)
    );
    expect(premiums).toHaveLength(1);
    expect(premiums[0].type).toBe("holiday");
  });
});

// ── ignore_requested_duration ────────────────────────────────────
describe("ignore_requested_duration", () => {
  it("uses actual times when ignore=true and actuals exist", () => {
    const rate = makeRate({ ignore_requested_duration: true });
    const appt = makeAppt({
      scheduled_start: "2026-03-24T14:00:00.000Z",
      scheduled_end: "2026-03-24T16:00:00.000Z",
      actual_start: "2026-03-24T14:00:00.000Z",
      actual_end: "2026-03-24T17:00:00.000Z",
    });
    const r = calculateBilling(appt, rate, ctx);
    expect(r.hours).toBe(3);
    expect(r.total).toBe(180);
  });

  it("falls back to scheduled when ignore=true but no actuals", () => {
    const rate = makeRate({ ignore_requested_duration: true });
    const appt = makeAppt();
    const r = calculateBilling(appt, rate, ctx);
    expect(r.hours).toBe(2);
  });
});

// ── apply_lastminute_to_travel ───────────────────────────────────
describe("apply_lastminute_to_travel", () => {
  it("applies same-day multiplier to travel when enabled", () => {
    const rate = makeRate({
      same_day_multiplier: 1.5,
      same_day_threshold_hours: 24,
      travel_rate_per_mile: 1,
      apply_lastminute_to_travel: true,
    });
    const appt = makeAppt({
      created_at: "2026-03-24T10:00:00.000Z",
      custom_fields: { mileage: 100 },
    });
    const r = calculateBilling(appt, rate, ctx);
    const travelSurcharge = r.line_items.find((li) => li.type === "same_day_travel");
    expect(travelSurcharge).toBeDefined();
    expect(travelSurcharge!.amount).toBe(50); // 100 * 1 * 0.5
  });

  it("does not apply when disabled", () => {
    const rate = makeRate({
      same_day_multiplier: 1.5,
      same_day_threshold_hours: 24,
      travel_rate_per_mile: 1,
      apply_lastminute_to_travel: false,
    });
    const appt = makeAppt({
      created_at: "2026-03-24T10:00:00.000Z",
      custom_fields: { mileage: 100 },
    });
    const r = calculateBilling(appt, rate, ctx);
    expect(r.line_items.find((li) => li.type === "same_day_travel")).toBeUndefined();
  });
});

// ── QBO line item mapping completeness ───────────────────────────
describe("All 14 line item types are emittable", () => {
  const ALL_TYPES = [
    "time", "base", "after_hours", "weekend", "holiday", "overtime",
    "same_day", "same_day_fee", "same_day_travel",
    "travel_mileage", "travel_time", "parking",
    "cancellation", "minimum_adjustment",
  ];

  it("each type can be generated by the engine", () => {
    const emitted = new Set<string>();

    // time
    emitted.add(calculateBilling(makeAppt(), makeRate(), ctx).line_items[0].type);

    // base
    emitted.add(calculateBilling(makeAppt(), makeRate({ billing_model: "per_appointment", base_rate: 100 }), ctx).line_items[0].type);

    // cancellation
    const cancel = calculateBilling(
      makeAppt({ status: "cancelled", cancelled_at: "2026-03-24T10:00:00.000Z" }),
      makeRate({ cancellation_window_hours: 48, cancellation_fee_percent: 50 }),
      ctx
    );
    cancel.line_items.forEach((li) => emitted.add(li.type));

    // parking
    calculateBilling(makeAppt({ parking_cost: 10 }), makeRate(), ctx)
      .line_items.forEach((li) => emitted.add(li.type));

    // minimum_adjustment
    calculateBilling(makeAppt(), makeRate({ minimum_charge: 500 }), ctx)
      .line_items.forEach((li) => emitted.add(li.type));

    // travel_mileage + travel_time
    calculateBilling(
      makeAppt({ custom_fields: { mileage: 10, travel_hours: 1 } }),
      makeRate({ travel_rate_per_mile: 1, travel_time_rate: 30 }),
      ctx
    ).line_items.forEach((li) => emitted.add(li.type));

    // same_day + same_day_fee + same_day_travel
    calculateBilling(
      makeAppt({ created_at: "2026-03-24T10:00:00.000Z", custom_fields: { mileage: 10 } }),
      makeRate({ same_day_multiplier: 1.5, same_day_fee: 25, same_day_threshold_hours: 24, travel_rate_per_mile: 1, apply_lastminute_to_travel: true }),
      ctx
    ).line_items.forEach((li) => emitted.add(li.type));

    // after_hours (Saturday night in ET)
    calculateBilling(
      makeAppt({ scheduled_start: "2026-03-29T00:00:00.000Z", scheduled_end: "2026-03-29T02:00:00.000Z" }),
      makeRate({ after_hours_multiplier: 1.5 }),
      ctx
    ).line_items.forEach((li) => emitted.add(li.type));

    // weekend
    calculateBilling(
      makeAppt({ scheduled_start: "2026-03-28T16:00:00.000Z", scheduled_end: "2026-03-28T18:00:00.000Z" }),
      makeRate({ weekend_multiplier: 1.5 }),
      ctx
    ).line_items.forEach((li) => emitted.add(li.type));

    // holiday
    calculateBilling(
      makeAppt({ scheduled_start: "2026-03-24T14:00:00.000Z", scheduled_end: "2026-03-24T16:00:00.000Z" }),
      makeRate({ holiday_multiplier: 2 }),
      { agencyTimezone: TZ, holidayDates: ["2026-03-24"] }
    ).line_items.forEach((li) => emitted.add(li.type));

    // overtime
    calculateBilling(
      makeAppt({ scheduled_start: "2026-03-24T06:00:00.000Z", scheduled_end: "2026-03-24T16:00:00.000Z" }),
      makeRate({ overtime_after_hours: 8, overtime_multiplier: 1.5 }),
      ctx
    ).line_items.forEach((li) => emitted.add(li.type));

    for (const t of ALL_TYPES) {
      expect(emitted.has(t)).toBe(true);
    }
  });
});

// ── Workbook template/export alignment ───────────────────────────
describe("Template/export tab alignment", () => {
  it("template and export have identical tab names", () => {
    const template = generateTemplateWorkbook();
    const exported = generateExportWorkbook({
      customers: [], locations: [], requesters: [],
      interpreters: [], appointments: [],
      customerBillingBundles: [], interpreterPayBundles: [],
    });
    expect(template.SheetNames).toEqual(exported.SheetNames);
  });

  it("Instructions tab contains all 4 sections", () => {
    expect(INSTRUCTIONS_TEXT).toContain("SECTION 1: AUTOMATICALLY IMPORTABLE DATA");
    expect(INSTRUCTIONS_TEXT).toContain("SECTION 2: AUTH-BACKED USERS");
    expect(INSTRUCTIONS_TEXT).toContain("SECTION 3: ADMIN CONFIGURATION");
    expect(INSTRUCTIONS_TEXT).toContain("SECTION 4: ONBOARDING SEQUENCE");
  });

  it("status vocabulary maps all critical statuses", () => {
    const internal = STATUS_VOCABULARY.map((s) => s.internal);
    expect(internal).toContain("requested");
    expect(internal).toContain("completed");
    expect(internal).toContain("cancelled");
    expect(internal).toContain("interpreter_confirmed");
  });
});

// ── Route/role coverage ──────────────────────────────────────────
describe("Route-role map completeness", () => {
  it("no route maps to billing-rules", () => {
    const paths = ROUTE_ROLES.map((r) => r.path);
    expect(paths).not.toContain("/billing-rules");
  });
});
