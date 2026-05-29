import { describe, it, expect } from "vitest";
import {
  getStatusLabel,
  STATUS_LABELS,
  INTERPRETER_STATUS_LABELS,
  REQUESTER_STATUS_LABELS,
} from "../status-labels";

describe("STATUS_LABELS", () => {
  it("covers all v3 workflow statuses", () => {
    const expected = [
      "requested", "requested_last_minute",
      "interpreter_assigned", "interpreter_assigned_last_minute",
      "interpreter_confirmed", "reassignment_needed",
      "in_progress",
      "completed", "completed_last_minute",
      "cancelled", "late_cancel_no_show_client", "no_show_interpreter",
    ];
    expected.forEach((s) => expect(STATUS_LABELS[s]).toBeDefined());
  });
});

describe("getStatusLabel", () => {
  // ── Admin / default view ──
  it("returns 'Requested' for requested (admin)", () => {
    expect(getStatusLabel("requested", "agency_admin")).toBe("Requested");
  });

  it("returns 'Interpreter Assigned' for interpreter_assigned (admin)", () => {
    expect(getStatusLabel("interpreter_assigned", "agency_admin")).toBe("Interpreter Assigned");
  });

  it("returns 'Interpreter Confirmed' for interpreter_confirmed (admin)", () => {
    expect(getStatusLabel("interpreter_confirmed", "agency_admin")).toBe("Interpreter Confirmed");
  });

  it("returns 'Reassignment Needed' for reassignment_needed (admin)", () => {
    expect(getStatusLabel("reassignment_needed", "agency_admin")).toBe("Reassignment Needed");
  });

  // ── Interpreter view ──
  it("returns 'New Assignment' for interpreter_assigned (interpreter)", () => {
    expect(getStatusLabel("interpreter_assigned", "interpreter")).toBe("New Assignment");
  });

  it("returns 'Accepted' for interpreter_confirmed (interpreter)", () => {
    expect(getStatusLabel("interpreter_confirmed", "interpreter")).toBe("Accepted");
  });

  // ── Requester view ──
  it("returns 'Submitted' for requested (requester)", () => {
    expect(getStatusLabel("requested", "requester")).toBe("Submitted");
  });

  it("returns 'Submitted (Urgent)' for requested_last_minute (requester)", () => {
    expect(getStatusLabel("requested_last_minute", "requester")).toBe("Submitted (Urgent)");
  });

  // ── Edge cases ──
  it("returns raw status string for unknown statuses", () => {
    expect(getStatusLabel("some_unknown_status", "agency_admin")).toBe("some_unknown_status");
  });

  it("works with null/undefined role (defaults to admin labels)", () => {
    expect(getStatusLabel("requested")).toBe("Requested");
    expect(getStatusLabel("requested", null)).toBe("Requested");
  });
});
