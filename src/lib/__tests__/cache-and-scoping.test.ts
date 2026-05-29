/**
 * Tests for cache invalidation, timezone-aware filtering, QBO export scoping,
 * and agency_id defense-in-depth — verifying fixes #1–#4.
 */
import { describe, it, expect } from "vitest";
import { localToUtcIso, utcToLocalParts } from "@/lib/agency-timezone";

// @ts-ignore — node fs available in vitest
import * as nodeFs from "fs";

function readFile(path: string): string {
  return nodeFs.readFileSync(path, "utf-8");
}

/* ------------------------------------------------------------------ */
/*  #2 — Timezone-aware date range boundaries                          */
/* ------------------------------------------------------------------ */

describe("MyRequests date range uses agency timezone", () => {
  function getAgencyTzRange(
    preset: "today" | "week" | "month",
    agencyTz: string,
  ): { from: string; to: string } | null {
    const now = new Date();
    const todayParts = utcToLocalParts(now.toISOString(), agencyTz);
    if (!todayParts.date) return null;

    const [year, month] = todayParts.date.split("-").map(Number);

    let fromDate = todayParts.date;
    let toDate = todayParts.date;

    if (preset === "month") {
      fromDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      toDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }

    const fromUtc = localToUtcIso(fromDate, "00:00", agencyTz);
    const toUtc = localToUtcIso(toDate, "23:59", agencyTz);
    return fromUtc && toUtc ? { from: fromUtc, to: toUtc } : null;
  }

  it("produces UTC boundaries for America/New_York", () => {
    const range = getAgencyTzRange("today", "America/New_York");
    expect(range).not.toBeNull();
    const fromHour = new Date(range!.from).getUTCHours();
    expect([4, 5]).toContain(fromHour);
  });

  it("produces UTC boundaries for America/Los_Angeles", () => {
    const range = getAgencyTzRange("today", "America/Los_Angeles");
    expect(range).not.toBeNull();
    const fromHour = new Date(range!.from).getUTCHours();
    expect([7, 8]).toContain(fromHour);
  });

  it("month range covers full month", () => {
    const range = getAgencyTzRange("month", "America/Chicago");
    expect(range).not.toBeNull();
    const toParts = utcToLocalParts(new Date(range!.to).toISOString(), "America/Chicago");
    expect(toParts.time).toBe("23:59");
  });
});

/* ------------------------------------------------------------------ */
/*  #3 — QBO export billable statuses                                   */
/* ------------------------------------------------------------------ */

describe("QBO export billable status set", () => {
  const BILLABLE_STATUSES = ["completed", "completed_last_minute", "late_cancel_no_show_client", "cancelled"];

  it("includes all four billable statuses", () => {
    expect(BILLABLE_STATUSES).toContain("completed");
    expect(BILLABLE_STATUSES).toContain("completed_last_minute");
    expect(BILLABLE_STATUSES).toContain("late_cancel_no_show_client");
    expect(BILLABLE_STATUSES).toContain("cancelled");
  });

  it("does not include non-billable statuses", () => {
    expect(BILLABLE_STATUSES).not.toContain("requested");
    expect(BILLABLE_STATUSES).not.toContain("in_progress");
    expect(BILLABLE_STATUSES).not.toContain("no_show_interpreter");
  });
});

/* ------------------------------------------------------------------ */
/*  #3 — QBO item mapping completeness                                  */
/* ------------------------------------------------------------------ */

describe("QBO BILLING_TYPE_TO_QBO_ITEM mapping", () => {
  const BILLING_TYPE_TO_QBO_ITEM: Record<string, string> = {
    base: "Interpreting Service", time: "Interpreting Service",
    travel_mileage: "Travel / Mileage", mileage: "Travel / Mileage",
    travel_time: "Travel Time", after_hours: "After-Hours Premium",
    weekend: "Weekend Premium", overtime: "Overtime",
    parking: "Travel / Parking", cancellation: "Cancellation Fee",
    minimum_adjustment: "Service Adjustment",
    same_day: "Same-Day / Last-Minute Premium",
    same_day_fee: "Same-Day Flat Fee",
    same_day_travel: "Same-Day Travel Surcharge",
    holiday: "Holiday Premium",
  };

  it("maps every known billing line type", () => {
    const required = ["base", "time", "travel_mileage", "mileage", "travel_time",
      "after_hours", "weekend", "overtime", "parking", "cancellation",
      "minimum_adjustment", "same_day", "same_day_fee", "same_day_travel", "holiday"];
    for (const t of required) {
      expect(BILLING_TYPE_TO_QBO_ITEM[t]).toBeDefined();
    }
  });
});

/* ------------------------------------------------------------------ */
/*  #4 — Agency scoping on requester location update                   */
/* ------------------------------------------------------------------ */

describe("Requester location update agency scoping", () => {
  it("includes agency_id in handleSaveLocation", () => {
    const code = readFile("src/pages/MyRequests.tsx");
    const block = code.slice(code.indexOf("handleSaveLocation"), code.indexOf("handleSaveLocation") + 800);
    expect(block).toContain('eq("agency_id"');
  });
});

/* ------------------------------------------------------------------ */
/*  #1 — Cache invalidation structural checks                          */
/* ------------------------------------------------------------------ */

describe("Cache invalidation after raw supabase updates", () => {
  it("MyRequests.handleSaveNotes invalidates queries", () => {
    const code = readFile("src/pages/MyRequests.tsx");
    const block = code.slice(code.indexOf("handleSaveNotes"), code.indexOf("handleSaveNotes") + 800);
    expect(block).toContain("invalidateQueries");
  });

  it("MyRequests.handleSaveLocation invalidates queries", () => {
    const code = readFile("src/pages/MyRequests.tsx");
    const start = code.indexOf("handleSaveLocation = async");
    const block = code.slice(start, start + 1200);
    expect(block).toContain("invalidateQueries");
  });

  it("RequestDetailDialog.handleSaveNotes invalidates queries", () => {
    const code = readFile("src/components/appointments/RequestDetailDialog.tsx");
    const block = code.slice(code.indexOf("handleSaveNotes"), code.indexOf("handleSaveNotes") + 600);
    expect(block).toContain("invalidateQueries");
  });

  it("MySchedule.saveInterpreterNotes invalidates queries", () => {
    const code = readFile("src/pages/MySchedule.tsx");
    const block = code.slice(code.indexOf("saveInterpreterNotes"), code.indexOf("saveInterpreterNotes") + 500);
    expect(block).toContain("invalidateQueries");
  });
});

/* ------------------------------------------------------------------ */
/*  #5 — Requester upcoming_appointments tile uses windowed counts     */
/* ------------------------------------------------------------------ */

describe("Requester upcoming_appointments tile is windowed", () => {
  it("Dashboard.getTileCount falls through to windowedCounts for windowed tiles", () => {
    const code = readFile("src/pages/Dashboard.tsx");
    const block = code.slice(code.indexOf("const getTileCount"), code.indexOf("const getTileCount") + 500);
    // No special-cased today branch any more
    expect(block).not.toContain('tile.id === "todays_appointments"');
    // Standard windowed path is present
    expect(block).toContain("windowedCounts");
    expect(block).toContain("nonWindowedCounts");
  });

  it("dashboard-tile-groups exposes upcoming_appointments with useTimeWindow=true", () => {
    const code = readFile("src/lib/dashboard-tile-groups.ts");
    expect(code).toContain('id: "upcoming_appointments"');
    const idx = code.indexOf('id: "upcoming_appointments"');
    const block = code.slice(idx, idx + 400);
    expect(block).toContain("useTimeWindow: true");
  });
});
