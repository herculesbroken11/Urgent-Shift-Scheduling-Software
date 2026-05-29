import { describe, it, expect } from "vitest";
import {
  statusTileColors,
  statusTileTextColors,
  statusBadgeColors,
  statusRowColors,
  statusCardBorderColors,
} from "../status-colors";

const ALL_STATUSES = [
  "requested", "requested_last_minute",
  "interpreter_assigned", "interpreter_assigned_last_minute",
  "interpreter_confirmed", "reassignment_needed",
  "in_progress",
  "completed", "completed_last_minute",
  "cancelled", "late_cancel_no_show_client", "no_show_interpreter",
];

describe("status-colors", () => {
  it("statusTileColors covers all statuses", () => {
    ALL_STATUSES.forEach((s) => expect(statusTileColors[s]).toBeDefined());
  });

  it("statusTileTextColors covers all statuses", () => {
    ALL_STATUSES.forEach((s) => expect(statusTileTextColors[s]).toBeDefined());
  });

  it("statusBadgeColors covers all statuses", () => {
    ALL_STATUSES.forEach((s) => expect(statusBadgeColors[s]).toBeDefined());
  });

  it("statusRowColors covers all statuses", () => {
    ALL_STATUSES.forEach((s) => expect(statusRowColors[s]).toBeDefined());
  });

  it("statusCardBorderColors covers all statuses", () => {
    ALL_STATUSES.forEach((s) => expect(statusCardBorderColors[s]).toBeDefined());
  });

  it("all color maps have the same keys", () => {
    const maps = [statusTileColors, statusTileTextColors, statusBadgeColors, statusRowColors, statusCardBorderColors];
    maps.forEach((m) => {
      expect(Object.keys(m).sort()).toEqual(ALL_STATUSES.sort());
    });
  });
});
