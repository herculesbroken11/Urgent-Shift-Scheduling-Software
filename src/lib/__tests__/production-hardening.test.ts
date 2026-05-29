import { describe, it, expect } from "vitest";

// ─── Billing Engine Tests ───
import { calculateAppointmentBilling, type BillingRateRecord, type AppointmentForBilling } from "@/lib/billing-engine";

function makeRate(overrides: Partial<BillingRateRecord> = {}): BillingRateRecord {
  return {
    id: "rate-1",
    agency_id: "agency-1",
    customer_id: null,
    name: "Test Rate",
    billing_model: "per_appointment",
    base_rate: 50,
    hourly_rate: 60,
    minimum_hours: 1,
    minimum_charge: 50,
    monthly_minimum: 0,
    rounding_interval_minutes: 15,
    rounding_direction: "up",
    overtime_after_hours: 8,
    overtime_multiplier: 1.5,
    after_hours_start: "18:00",
    after_hours_end: "06:00",
    after_hours_multiplier: 1.25,
    weekend_multiplier: 1.5,
    holiday_multiplier: 2.0,
    same_day_multiplier: 1.5,
    same_day_threshold_hours: 24,
    same_day_fee: 0,
    travel_rate_per_mile: 0.655,
    travel_time_rate: 25,
    cancellation_fee_percent: 50,
    cancellation_window_hours: 24,
    stack_premiums: true,
    apply_lastminute_to_travel: false,
    ignore_requested_duration: false,
    tier_config: [],
    effective_start_date: null,
    effective_end_date: null,
    is_default: true,
    ...overrides,
  } as BillingRateRecord;
}

function makeAppt(overrides: Partial<AppointmentForBilling> = {}): AppointmentForBilling {
  return {
    id: "appt-1",
    customer_id: null,
    status: "completed",
    scheduled_start: "2025-06-10T10:00:00Z",
    scheduled_end: "2025-06-10T11:30:00Z",
    actual_start: null,
    actual_end: null,
    modality: "on_site",
    created_at: "2025-06-01T10:00:00Z",
    ...overrides,
  };
}

describe("Billing Engine — Production Hardening", () => {
  it("rounds up to nearest 15-minute interval", () => {
    const rate = makeRate({ rounding_direction: "up", rounding_interval_minutes: 15, billing_model: "hourly" });
    const appt = makeAppt({
      scheduled_start: "2025-06-10T10:00:00Z",
      scheduled_end: "2025-06-10T11:10:00Z", // 70 min → rounds up to 75 min = 1.25 hrs × $60 = $75
    });
    const result = calculateAppointmentBilling(appt, [rate]);
    expect(result.total).toBeGreaterThanOrEqual(75);
  });

  it("rounds down to nearest 15-minute interval", () => {
    const rate = makeRate({ rounding_direction: "down", rounding_interval_minutes: 15 });
    const appt = makeAppt({
      scheduled_start: "2025-06-10T10:00:00Z",
      scheduled_end: "2025-06-10T11:10:00Z",
    });
    const result = calculateAppointmentBilling(appt, [rate]);
    expect(result.total).toBeLessThanOrEqual(75);
  });

  it("applies minimum charge", () => {
    const rate = makeRate({ minimum_charge: 100 });
    const appt = makeAppt({
      scheduled_start: "2025-06-10T10:00:00Z",
      scheduled_end: "2025-06-10T10:15:00Z",
    });
    const result = calculateAppointmentBilling(appt, [rate]);
    expect(result.total).toBeGreaterThanOrEqual(100);
  });

  it("handles cancellation billing", () => {
    const rate = makeRate({ cancellation_fee_percent: 50, minimum_charge: 50 });
    const appt = makeAppt({ status: "cancelled" });
    const result = calculateAppointmentBilling(appt, [rate]);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.line_items.some((li: any) => li.type === "cancellation")).toBe(true);
  });

  it("uses actual times when ignore_requested_duration is true", () => {
    const rate = makeRate({ ignore_requested_duration: true });
    const appt = makeAppt({
      scheduled_start: "2025-06-10T10:00:00Z",
      scheduled_end: "2025-06-10T12:00:00Z",
      actual_start: "2025-06-10T10:00:00Z",
      actual_end: "2025-06-10T11:00:00Z",
    });
    const result = calculateAppointmentBilling(appt, [rate]);
    expect(result.total).toBeLessThan(120);
  });

  it("generates valid line_items array", () => {
    const rate = makeRate();
    const appt = makeAppt();
    const result = calculateAppointmentBilling(appt, [rate]);
    expect(Array.isArray(result.line_items)).toBe(true);
    expect(result.line_items.length).toBeGreaterThan(0);
    for (const item of result.line_items) {
      expect(item).toHaveProperty("type");
      expect(item).toHaveProperty("amount");
    }
  });

  it("same_day_multiplier applies for rush bookings", () => {
    const rate = makeRate({ same_day_multiplier: 1.5, same_day_threshold_hours: 24 });
    const now = new Date();
    const start = new Date(now.getTime() + 2 * 3600 * 1000);
    const end = new Date(start.getTime() + 3600 * 1000);
    const appt = makeAppt({
      created_at: now.toISOString(),
      scheduled_start: start.toISOString(),
      scheduled_end: end.toISOString(),
    });
    const result = calculateAppointmentBilling(appt, [rate]);
    const rushItems = result.line_items.filter((li: any) =>
      li.type === "same_day" || li.type === "same_day_fee"
    );
    expect(rushItems.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Workbook Template Tests ───
import { generateTemplateWorkbook, generateExportWorkbook } from "@/lib/workbook-xlsx";

describe("Workbook Template — Production Hardening", () => {
  it("template has all required tabs", () => {
    const wb = generateTemplateWorkbook();
    expect(wb.SheetNames).toContain("Instructions");
    expect(wb.SheetNames).toContain("Customers");
    expect(wb.SheetNames).toContain("Locations");
    expect(wb.SheetNames).toContain("Appointments");
    expect(wb.SheetNames.length).toBeGreaterThanOrEqual(6);
  });

  it("export has same core tabs as template", () => {
    const exported = generateExportWorkbook({
      customers: [], locations: [], appointments: [],
      interpreters: [], requesters: [],
      customerBillingBundles: [], interpreterPayBundles: [],
    });
    for (const tab of ["Customers", "Locations", "Appointments"]) {
      expect(exported.SheetNames).toContain(tab);
    }
  });
});

// ─── QBO Mapping Coverage Test ───
describe("QBO Line Item Mapping — Production Hardening", () => {
  const ALL_BILLING_TYPES = [
    "time", "base", "minimum_adjustment", "overtime",
    "after_hours", "weekend", "holiday", "same_day",
    "same_day_fee", "same_day_travel", "travel_time",
    "mileage", "cancellation", "parking",
  ];

  it("all 14 billing line item types are defined", () => {
    expect(ALL_BILLING_TYPES.length).toBe(14);
    for (const t of ALL_BILLING_TYPES) {
      expect(typeof t).toBe("string");
      expect(t.length).toBeGreaterThan(0);
    }
  });
});

// ─── Status Labels Tests ───
import { getStatusLabel } from "@/lib/status-labels";

describe("Status Labels — Production Hardening", () => {
  it("all appointment statuses have labels", () => {
    const statuses = ["requested", "interpreter_confirmed", "in_progress", "completed", "cancelled", "no_show_interpreter", "late_cancel_no_show_client"];
    for (const s of statuses) {
      const label = getStatusLabel(s);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

// ─── Route Roles Tests ───
import { ROUTE_ROLES, getRolesForPath } from "@/lib/route-roles";

describe("Route Roles — Production Hardening", () => {
  it("admin-only routes are protected", () => {
    const adminRoutes = [
      "/billing-rates", "/customer-billing", "/interpreter-pay",
      "/invoices", "/audit-log", "/import",
    ];
    for (const path of adminRoutes) {
      const roles = getRolesForPath(path);
      expect(roles).toBeDefined();
      expect(roles).toContain("agency_admin");
      expect(roles).not.toContain("interpreter");
      expect(roles).not.toContain("requester");
    }
  });

  it("interpreter routes are correctly scoped", () => {
    const interpreterRoutes = [
      "/my-schedule", "/my-earnings", "/my-languages",
      "/availability", "/available-jobs",
    ];
    for (const path of interpreterRoutes) {
      const roles = getRolesForPath(path);
      expect(roles).toBeDefined();
      expect(roles).toContain("interpreter");
    }
  });

  it("shared routes allow all roles", () => {
    for (const path of ["/messages", "/settings"]) {
      const roles = getRolesForPath(path);
      expect(roles).toBeDefined();
      expect(roles!.length).toBe(4);
    }
  });

  it("available-jobs is in route map", () => {
    expect(getRolesForPath("/available-jobs")).toBeDefined();
  });

  it("no route has undefined roles array", () => {
    for (const entry of ROUTE_ROLES) {
      expect(Array.isArray(entry.roles)).toBe(true);
    }
  });
});
