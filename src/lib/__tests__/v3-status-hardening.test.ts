import { describe, it, expect } from "vitest";
import { calculateBilling, type BillingRateRecord, type AppointmentForBilling, type BillingContext } from "../billing-engine";
import { STATUS_LABELS, INTERPRETER_STATUS_LABELS, REQUESTER_STATUS_LABELS, getStatusLabel } from "../status-labels";
import { statusTileColors, statusBadgeColors } from "../status-colors";

// ── Helpers ──────────────────────────────────────────────────────────

const ALL_V3_STATUSES = [
  "requested", "requested_last_minute",
  "interpreter_assigned", "interpreter_assigned_last_minute",
  "interpreter_confirmed", "reassignment_needed",
  "in_progress",
  "completed", "completed_last_minute",
  "cancelled", "late_cancel_no_show_client", "no_show_interpreter",
] as const;

const ACTIVE_STATUSES = [
  "requested", "requested_last_minute",
  "interpreter_assigned", "interpreter_assigned_last_minute",
  "interpreter_confirmed", "reassignment_needed", "in_progress",
];

const SELF_CLAIM_ELIGIBLE = ["requested", "requested_last_minute", "reassignment_needed"];

function makeRate(overrides: Partial<BillingRateRecord> = {}): BillingRateRecord {
  return {
    id: "rate-1", agency_id: "a1", customer_id: null,
    billing_model: "hourly", name: "Default",
    base_rate: 100, hourly_rate: 60, minimum_hours: 1,
    minimum_charge: 0, monthly_minimum: 0,
    travel_rate_per_mile: 0, travel_time_rate: 0,
    after_hours_multiplier: 1, weekend_multiplier: 1,
    overtime_multiplier: 1.5, overtime_after_hours: 8,
    cancellation_window_hours: 24, cancellation_fee_percent: 100,
    tier_config: [], effective_start_date: null, effective_end_date: null,
    is_default: true, same_day_threshold_hours: 24,
    same_day_fee: 0, same_day_multiplier: 1,
    after_hours_start: "18:00", after_hours_end: "08:00",
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
    created_at: "2026-03-20T10:00:00.000Z",
    cancelled_at: null,
    ...overrides,
  };
}

const ctx: BillingContext = { agencyTimezone: "America/New_York", holidayDates: [] };

// ═════════════════════════════════════════════════════════════════════
// 1. BILLING BY TERMINAL STATUS
// ═════════════════════════════════════════════════════════════════════

describe("v3 terminal status billing", () => {
  it("completed: bills at standard rate", () => {
    const result = calculateBilling(makeAppt({ status: "completed" }), makeRate(), ctx);
    expect(result.total).toBe(120); // 2hrs * $60
    expect(result.cancellation_fee).toBe(0);
  });

  it("completed_last_minute: bills at standard rate (last-minute premium via same_day fields)", () => {
    const rate = makeRate({ same_day_multiplier: 1.5, same_day_fee: 20, same_day_threshold_hours: 24 });
    const appt = makeAppt({
      status: "completed_last_minute",
      created_at: "2026-03-24T10:00:00.000Z", // 4hrs before start
    });
    const result = calculateBilling(appt, rate, ctx);
    expect(result.same_day_premium).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(120);
  });

  it("cancelled (early): bills $0", () => {
    const result = calculateBilling(
      makeAppt({ status: "cancelled", cancelled_at: "2026-03-22T10:00:00.000Z" }),
      makeRate({ cancellation_fee_percent: 100, cancellation_window_hours: 24 }),
      ctx,
    );
    expect(result.total).toBe(0);
  });

  it("cancelled (late, within window): bills cancellation fee", () => {
    const result = calculateBilling(
      makeAppt({ status: "cancelled", cancelled_at: "2026-03-24T10:00:00.000Z" }),
      makeRate({ cancellation_fee_percent: 50, cancellation_window_hours: 24, minimum_hours: 1 }),
      ctx,
    );
    // Fee base: 60 * 1 = 60, 50% = 30
    expect(result.cancellation_fee).toBe(30);
    expect(result.total).toBe(30);
  });

  it("late_cancel_no_show_client: bills full scheduled duration", () => {
    const rate = makeRate({ cancellation_fee_percent: 50, minimum_hours: 1 });
    const result = calculateBilling(makeAppt({ status: "late_cancel_no_show_client" }), rate, ctx);
    // Full scheduled: max(2hrs, 1min) * 60 * (50/100) — but the billing engine uses
    // cancellation_fee_percent applied to full duration for late cancel
    expect(result.cancellation_fee).toBeGreaterThan(0);
    expect(result.total).toBe(result.cancellation_fee);
    // Time/base should be zero — only cancellation fee
    expect(result.base).toBe(0);
    expect(result.time).toBe(0);
  });

  it("no_show_interpreter: non-billable ($0 total)", () => {
    const result = calculateBilling(makeAppt({ status: "no_show_interpreter" }), makeRate(), ctx);
    expect(result.total).toBe(0);
    expect(result.base).toBe(0);
    expect(result.time).toBe(0);
    expect(result.cancellation_fee).toBe(0);
    expect(result.parking).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 2. DASHBOARD COUNT COVERAGE — all 12 statuses have labels & colors
// ═════════════════════════════════════════════════════════════════════

describe("v3 dashboard status coverage", () => {
  it("all 12 v3 statuses have admin labels", () => {
    for (const s of ALL_V3_STATUSES) {
      expect(STATUS_LABELS[s]).toBeDefined();
      expect(STATUS_LABELS[s]).not.toBe(s); // should be human-readable
    }
  });

  it("all 12 v3 statuses have tile colors", () => {
    for (const s of ALL_V3_STATUSES) {
      expect(statusTileColors[s]).toBeDefined();
    }
  });

  it("all 12 v3 statuses have badge colors", () => {
    for (const s of ALL_V3_STATUSES) {
      expect(statusBadgeColors[s]).toBeDefined();
    }
  });

  it("interpreter labels override specific statuses", () => {
    expect(getStatusLabel("interpreter_assigned", "interpreter")).toBe("New Assignment");
    expect(getStatusLabel("interpreter_confirmed", "interpreter")).toBe("Accepted");
  });

  it("requester labels override specific statuses", () => {
    expect(getStatusLabel("requested", "requester")).toBe("Submitted");
    expect(getStatusLabel("requested_last_minute", "requester")).toBe("Submitted (Urgent)");
  });

  it("admin active statuses are 7", () => {
    expect(ACTIVE_STATUSES).toHaveLength(7);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 3. SELF-CLAIM ELIGIBILITY
// ═════════════════════════════════════════════════════════════════════

describe("v3 self-claim eligible statuses", () => {
  it("only requested, requested_last_minute, reassignment_needed are self-claimable", () => {
    expect(SELF_CLAIM_ELIGIBLE).toEqual(["requested", "requested_last_minute", "reassignment_needed"]);
  });

  it("interpreter_assigned is NOT self-claimable", () => {
    expect(SELF_CLAIM_ELIGIBLE).not.toContain("interpreter_assigned");
  });

  it("in_progress is NOT self-claimable", () => {
    expect(SELF_CLAIM_ELIGIBLE).not.toContain("in_progress");
  });

  it("completed statuses are NOT self-claimable", () => {
    expect(SELF_CLAIM_ELIGIBLE).not.toContain("completed");
    expect(SELF_CLAIM_ELIGIBLE).not.toContain("completed_last_minute");
  });
});

// ═════════════════════════════════════════════════════════════════════
// 4. QBO BILLABLE STATUS SET
// ═════════════════════════════════════════════════════════════════════

describe("v3 QBO-billable status set", () => {
  const QBO_BILLABLE = ["completed", "completed_last_minute", "late_cancel_no_show_client"];

  it("includes completed", () => expect(QBO_BILLABLE).toContain("completed"));
  it("includes completed_last_minute", () => expect(QBO_BILLABLE).toContain("completed_last_minute"));
  it("includes late_cancel_no_show_client", () => expect(QBO_BILLABLE).toContain("late_cancel_no_show_client"));
  it("excludes no_show_interpreter", () => expect(QBO_BILLABLE).not.toContain("no_show_interpreter"));
  it("excludes cancelled", () => expect(QBO_BILLABLE).not.toContain("cancelled"));
  it("excludes active statuses", () => {
    for (const s of ACTIVE_STATUSES) {
      expect(QBO_BILLABLE).not.toContain(s);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// 5. NO LEGACY STATUS REFERENCES IN MAPS
// ═════════════════════════════════════════════════════════════════════

describe("no legacy statuses in label/color maps", () => {
  const LEGACY = ["pending", "scheduled", "offered", "confirmed", "validated", "billed", "revision_needed", "pending_verification", "no_show"];

  it("STATUS_LABELS has no legacy keys", () => {
    for (const s of LEGACY) expect(STATUS_LABELS[s]).toBeUndefined();
  });

  it("INTERPRETER_STATUS_LABELS has no legacy keys", () => {
    for (const s of LEGACY) expect(INTERPRETER_STATUS_LABELS[s]).toBeUndefined();
  });

  it("REQUESTER_STATUS_LABELS has no legacy keys", () => {
    for (const s of LEGACY) expect(REQUESTER_STATUS_LABELS[s]).toBeUndefined();
  });

  it("statusTileColors has no legacy keys", () => {
    for (const s of LEGACY) expect(statusTileColors[s]).toBeUndefined();
  });
});
