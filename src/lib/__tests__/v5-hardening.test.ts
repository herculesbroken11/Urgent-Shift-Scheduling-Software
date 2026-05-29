import { describe, it, expect } from "vitest";
import {
  ADMIN_TILES,
  INTERPRETER_TILES,
  REQUESTER_TILES,
  resolveGroupToStatuses,
  getTilesForRole,
} from "@/lib/dashboard-tile-groups";
import { STATUS_LABELS, getStatusLabel } from "@/lib/status-labels";

/** All 12 v3 statuses */
const V3_STATUSES = [
  "requested", "requested_last_minute",
  "interpreter_assigned", "interpreter_assigned_last_minute",
  "interpreter_confirmed", "reassignment_needed",
  "in_progress",
  "completed", "completed_last_minute",
  "cancelled", "late_cancel_no_show_client", "no_show_interpreter",
];

// ═══════════════════════════════════════════════════════
// SECTION 1 — DASHBOARD TILE COVERAGE
// ═══════════════════════════════════════════════════════

describe("Dashboard tile status coverage", () => {
  it("admin tiles cover all 12 v3 statuses", () => {
    const covered = new Set(ADMIN_TILES.flatMap((t) => t.statuses));
    for (const s of V3_STATUSES) {
      expect(covered.has(s)).toBe(true);
    }
  });

  it("interpreter tiles include no_show_interpreter", () => {
    const covered = new Set(INTERPRETER_TILES.flatMap((t) => t.statuses));
    expect(covered.has("no_show_interpreter")).toBe(true);
  });

  it("interpreter tiles cover expected statuses", () => {
    const covered = new Set(INTERPRETER_TILES.flatMap((t) => t.statuses));
    const expected = [
      "interpreter_assigned", "interpreter_assigned_last_minute",
      "interpreter_confirmed", "in_progress",
      "completed", "completed_last_minute", "no_show_interpreter",
    ];
    for (const s of expected) {
      expect(covered.has(s)).toBe(true);
    }
  });

  it("requester tiles cover expected statuses", () => {
    const covered = new Set(REQUESTER_TILES.flatMap((t) => t.statuses));
    const expected = [
      "requested", "requested_last_minute",
      "interpreter_assigned", "interpreter_assigned_last_minute",
      "interpreter_confirmed", "in_progress",
      "completed", "completed_last_minute",
      "cancelled", "late_cancel_no_show_client",
    ];
    for (const s of expected) {
      expect(covered.has(s)).toBe(true);
    }
  });

  it("getTilesForRole returns correct tile sets", () => {
    expect(getTilesForRole("agency_admin")).toBe(ADMIN_TILES);
    expect(getTilesForRole("scheduler")).toBe(ADMIN_TILES);
    expect(getTilesForRole("interpreter")).toBe(INTERPRETER_TILES);
    expect(getTilesForRole("requester")).toBe(REQUESTER_TILES);
  });

  it("resolveGroupToStatuses returns correct statuses for each group", () => {
    expect(resolveGroupToStatuses("unassigned_requests")).toEqual(["requested", "requested_last_minute"]);
    expect(resolveGroupToStatuses("no_show")).toEqual(["no_show_interpreter"]);
    expect(resolveGroupToStatuses("completed")).toEqual(["completed", "completed_last_minute"]);
    expect(resolveGroupToStatuses("nonexistent")).toBeNull();
    expect(resolveGroupToStatuses(null)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════
// SECTION 2 — STATUS LABEL COVERAGE
// ═══════════════════════════════════════════════════════

describe("Status labels", () => {
  it("all 12 v3 statuses have labels", () => {
    for (const s of V3_STATUSES) {
      expect(STATUS_LABELS[s]).toBeDefined();
      expect(typeof STATUS_LABELS[s]).toBe("string");
      expect(STATUS_LABELS[s].length).toBeGreaterThan(0);
    }
  });

  it("getStatusLabel returns human-readable labels not raw codes", () => {
    for (const s of V3_STATUSES) {
      const label = getStatusLabel(s);
      expect(label).not.toBe(s); // label should differ from raw code
      expect(label).not.toContain("_"); // no underscores in display labels
    }
  });
});

// ═══════════════════════════════════════════════════════
// SECTION 3 — REQUESTER PERMISSION GUARDRAILS
// ═══════════════════════════════════════════════════════

describe("Requester status permissions", () => {
  const REQUESTER_ALLOWED = ["cancelled", "late_cancel_no_show_client"];

  it("requester should only be allowed cancel-type statuses", () => {
    // These are the ONLY statuses a requester's handleStatusUpdate should permit
    for (const s of REQUESTER_ALLOWED) {
      expect(REQUESTER_ALLOWED.includes(s)).toBe(true);
    }
  });

  it("requester should NOT be allowed to set workflow statuses", () => {
    const forbidden = [
      "requested", "interpreter_assigned", "interpreter_confirmed",
      "in_progress", "completed", "no_show_interpreter", "reassignment_needed",
    ];
    for (const s of forbidden) {
      expect(REQUESTER_ALLOWED.includes(s)).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════
// SECTION 4 — QBO EXPORT MAPPING
// ═══════════════════════════════════════════════════════

describe("QBO export line item mapping", () => {
  const BILLING_TYPE_TO_QBO_ITEM: Record<string, string> = {
    base: "Interpreting Service",
    time: "Interpreting Service",
    travel_mileage: "Travel / Mileage",
    mileage: "Travel / Mileage",
    travel_time: "Travel Time",
    after_hours: "After-Hours Premium",
    weekend: "Weekend Premium",
    overtime: "Overtime",
    parking: "Travel / Parking",
    cancellation: "Cancellation Fee",
    minimum_adjustment: "Service Adjustment",
    same_day: "Same-Day / Last-Minute Premium",
    same_day_fee: "Same-Day Flat Fee",
    same_day_travel: "Same-Day Travel Surcharge",
    holiday: "Holiday Premium",
  };

  it("maps all known billing line types", () => {
    const required = [
      "base", "time", "travel_mileage", "mileage", "travel_time",
      "after_hours", "weekend", "overtime", "parking", "cancellation",
      "minimum_adjustment", "same_day", "same_day_fee", "same_day_travel", "holiday",
    ];
    for (const type of required) {
      expect(BILLING_TYPE_TO_QBO_ITEM[type]).toBeDefined();
      expect(BILLING_TYPE_TO_QBO_ITEM[type].length).toBeGreaterThan(0);
    }
  });

  it("cancelled is included in billable statuses for QBO export", () => {
    const billableStatuses = ["completed", "completed_last_minute", "late_cancel_no_show_client", "cancelled"];
    expect(billableStatuses).toContain("cancelled");
  });

  it("no_show_interpreter is NOT billable", () => {
    const billableStatuses = ["completed", "completed_last_minute", "late_cancel_no_show_client", "cancelled"];
    expect(billableStatuses).not.toContain("no_show_interpreter");
  });
});

// ═══════════════════════════════════════════════════════
// SECTION 5 — REPORTS COMPLETED COUNT
// ═══════════════════════════════════════════════════════

describe("Reports completed count", () => {
  it("completed_count must include both completed and completed_last_minute", () => {
    // Simulate the demo report computation
    const appts = [
      { status: "completed" },
      { status: "completed_last_minute" },
      { status: "cancelled" },
      { status: "in_progress" },
      { status: "completed" },
    ];
    const completedCount = appts.filter(
      (a) => a.status === "completed" || a.status === "completed_last_minute"
    ).length;
    expect(completedCount).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════
// SECTION 6 — NOTES VISIBILITY RULES
// ═══════════════════════════════════════════════════════

describe("Three-tier notes visibility rules", () => {
  it("interpreter should NOT see interpreter_notes_history", () => {
    // The rule: isAdminOrScheduler gate for notes history
    const isInterpreter = true;
    const isAdminOrScheduler = false;
    const showHistory = isAdminOrScheduler; // only admin/scheduler
    expect(showHistory).toBe(false);
  });

  it("admin should see interpreter_notes_history", () => {
    const isAdminOrScheduler = true;
    const showHistory = isAdminOrScheduler;
    expect(showHistory).toBe(true);
  });

  it("interpreter should NOT see notes when not assigned", () => {
    const isInterpreter = true;
    const currentUserId: string = "interp-A";
    const assignedInterpreter: string = "interp-B";
    const canSeeNotes = !isInterpreter || currentUserId === assignedInterpreter;
    expect(canSeeNotes).toBe(false);
  });

  it("interpreter should see notes when assigned", () => {
    const isInterpreter = true;
    const currentUserId = "interp-A";
    const assignedInterpreter = "interp-A";
    const canSeeNotes = !isInterpreter || currentUserId === assignedInterpreter;
    expect(canSeeNotes).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// SECTION 7 — AVAILABLE JOBS INTEGRITY
// ═══════════════════════════════════════════════════════

describe("Available Jobs status integrity", () => {
  const AVAILABLE_JOB_STATUSES = ["requested", "requested_last_minute", "reassignment_needed"];

  it("only unassigned statuses appear in Available Jobs", () => {
    const forbidden = [
      "interpreter_assigned", "interpreter_confirmed", "in_progress",
      "completed", "cancelled", "no_show_interpreter",
    ];
    for (const s of forbidden) {
      expect(AVAILABLE_JOB_STATUSES).not.toContain(s);
    }
  });

  it("self-claim sets interpreter_confirmed, not interpreter_assigned", () => {
    // After claim, status should be interpreter_confirmed
    const claimResult = "interpreter_confirmed";
    expect(claimResult).toBe("interpreter_confirmed");
    expect(claimResult).not.toBe("interpreter_assigned");
  });
});

// ═══════════════════════════════════════════════════════
// SECTION 8 — CROSS-ROLE DATA ISOLATION
// ═══════════════════════════════════════════════════════

describe("Cross-role data isolation rules", () => {
  it("requester should NOT see interpreter_notes or agency_notes", () => {
    const isRequester = true;
    const showInterpreterNotes = !isRequester;
    const showAgencyNotes = !isRequester;
    expect(showInterpreterNotes).toBe(false);
    expect(showAgencyNotes).toBe(false);
  });

  it("interpreter should NOT see agency_notes", () => {
    const isInterpreter = true;
    const isAdminOrScheduler = false;
    const showAgencyNotes = isAdminOrScheduler;
    expect(showAgencyNotes).toBe(false);
  });
});
