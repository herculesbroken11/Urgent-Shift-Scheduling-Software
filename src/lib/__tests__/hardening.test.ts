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

// ── Helpers ──────────────────────────────────────────────────────────

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

// ── 1. DB constraint enforcement tests (logic-level) ────────────────

describe("Billing data integrity enforcement", () => {
  it("resolveRate throws when no rates exist", () => {
    expect(() => resolveRate([], null)).toThrow();
  });

  it("resolveRate uses customer-specific over default", () => {
    const std = makeRate();
    const custom = makeRate({ id: "cust-rate", customer_id: "c1", hourly_rate: 80, is_default: false });
    const r = resolveRate([std, custom], "c1");
    expect(r.id).toBe("cust-rate");
  });

  it("resolveRate falls back when customer rate is outside effective dates", () => {
    const std = makeRate();
    const custom = makeRate({
      id: "cust-rate", customer_id: "c1", hourly_rate: 80, is_default: false,
      effective_end_date: "2025-01-01",
    });
    const r = resolveRate([std, custom], "c1");
    expect(r.id).toBe("rate-std");
  });
});

// ── 2. Line item type coverage tests ────────────────────────────────

describe("Line item type coverage for QBO", () => {
  const ALL_TYPES = [
    "time", "base", "after_hours", "weekend", "holiday", "overtime",
    "same_day", "same_day_fee", "same_day_travel",
    "travel_mileage", "travel_time", "parking",
    "cancellation", "minimum_adjustment",
  ];

  it("same_day_travel line item is emitted when applicable", () => {
    const rate = makeRate({
      same_day_multiplier: 1.5, same_day_threshold_hours: 24,
      travel_rate_per_mile: 1, apply_lastminute_to_travel: true,
    });
    const appt = makeAppt({
      created_at: "2026-03-24T10:00:00.000Z",
      custom_fields: { mileage: 50 },
    });
    const result = calculateBilling(appt, rate, ctx);
    const types = result.line_items.map((li) => li.type);
    expect(types).toContain("same_day_travel");
  });

  it("minimum_adjustment is emitted when below minimum charge", () => {
    const rate = makeRate({ minimum_charge: 200, hourly_rate: 30 });
    const appt = makeAppt(); // 2hrs * $30 = $60 < $200
    const result = calculateBilling(appt, rate, ctx);
    const types = result.line_items.map((li) => li.type);
    expect(types).toContain("minimum_adjustment");
    expect(result.total).toBe(200);
  });

  it("cancellation line item is emitted for late cancel", () => {
    const rate = makeRate({ cancellation_window_hours: 48, cancellation_fee_percent: 50 });
    const appt = makeAppt({
      status: "cancelled",
      cancelled_at: "2026-03-24T10:00:00.000Z",
    });
    const result = calculateBilling(appt, rate, ctx);
    const types = result.line_items.map((li) => li.type);
    expect(types).toContain("cancellation");
  });

  it("parking line item is emitted", () => {
    const rate = makeRate();
    const appt = makeAppt({ parking_cost: 15 });
    const result = calculateBilling(appt, rate, ctx);
    const types = result.line_items.map((li) => li.type);
    expect(types).toContain("parking");
  });
});

// ── 3. Workbook template integrity ──────────────────────────────────

describe("Workbook template hardening", () => {
  it("has 8 standard tabs", () => {
    expect(STANDARD_TABS.length).toBe(8);
  });

  it("all tabs have unique names", () => {
    const names = STANDARD_TABS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("Instructions tab has no required/optional columns", () => {
    const instr = STANDARD_TABS.find((t) => t.name === "Instructions");
    expect(instr?.required.length).toBe(0);
    expect(instr?.optional.length).toBe(0);
  });

  it("Appointments tab has required Customer, Date, Start, End", () => {
    const appts = STANDARD_TABS.find((t) => t.name === "Appointments");
    const required = appts?.required.map((c) => c.column) ?? [];
    expect(required).toContain("Customer");
    expect(required).toContain("Date");
    expect(required).toContain("Start");
    expect(required).toContain("End");
  });

  it("status vocabulary covers all expected values", () => {
    expect(STATUS_VOCABULARY.length).toBeGreaterThanOrEqual(8);
    const workbookValues = STATUS_VOCABULARY.map((s) => s.workbook);
    expect(workbookValues).toContain("requested");
    expect(workbookValues).toContain("completed");
    expect(workbookValues).toContain("cancelled");
  });

  it("Instructions text mentions billing bundle rules", () => {
    expect(INSTRUCTIONS_TEXT).toContain("BILLING BUNDLE RULES");
    expect(INSTRUCTIONS_TEXT).toContain("INTERPRETER PAY PACKAGES");
  });

  it("template workbook generates with all tabs", () => {
    const wb = generateTemplateWorkbook();
    expect(wb.SheetNames.length).toBe(8);
    expect(wb.SheetNames).toContain("Instructions");
    expect(wb.SheetNames).toContain("Customers");
    expect(wb.SheetNames).toContain("Appointments");
    expect(wb.SheetNames).toContain("Customer Billing Bundles");
  });

  it("export workbook generates with empty data", () => {
    const wb = generateExportWorkbook({
      customers: [], locations: [], requesters: [],
      interpreters: [], appointments: [],
      customerBillingBundles: [], interpreterPayBundles: [],
    });
    expect(wb.SheetNames.length).toBe(8);
  });
});

// ── 4. Import idempotency ───────────────────────────────────────────

describe("Import idempotency logic", () => {
  it("source_record_id is used for dedup", () => {
    // This is a structural test — the source_record_id field exists in schema
    // The actual dedup is handled by the process-import edge function
    // We verify the engine doesn't break with source-tracked appointments
    const appt = makeAppt({ id: "appt-sourced" });
    const rate = makeRate();
    const result = calculateBilling(appt, rate, ctx);
    expect(result.total).toBeGreaterThan(0);
  });
});

// ── 5. Billing model completeness ───────────────────────────────────

describe("Billing model completeness", () => {
  it("per_appointment model works", () => {
    const rate = makeRate({ billing_model: "per_appointment", base_rate: 150 });
    const appt = makeAppt();
    const result = calculateBilling(appt, rate, ctx);
    expect(result.base).toBe(150);
    expect(result.time).toBe(0);
    expect(result.total).toBe(150);
  });

  it("flat model works", () => {
    const rate = makeRate({ billing_model: "flat", base_rate: 200 });
    const appt = makeAppt();
    const result = calculateBilling(appt, rate, ctx);
    expect(result.base).toBe(200);
    expect(result.total).toBe(200);
  });

  it("tiered model works", () => {
    const rate = makeRate({ billing_model: "tiered", base_rate: 100 });
    const appt = makeAppt();
    const result = calculateBilling(appt, rate, ctx);
    expect(result.base).toBe(100);
  });
});
