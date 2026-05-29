import { describe, it, expect } from "vitest";

/**
 * Batch 2/3 concurrency and correctness structural tests.
 */

// ── Section 1: Stale closure fix in MySchedule ──

describe("MySchedule reject/reassign use fresh DB reads", () => {
  it("reject mutation fetches fresh appointment before building rejection history", async () => {
    const source = await import("../../pages/MySchedule?raw");
    const code = (source as any).default || String(source);
    // Should call fetchFreshAppointment, not appointments.find
    expect(code).toContain("fetchFreshAppointment");
    // The reject mutationFn should use fresh row
    const rejectBlock = code.slice(code.indexOf("const rejectJob"), code.indexOf("const reassignJob"));
    expect(rejectBlock).toContain("fetchFreshAppointment(apptId)");
    expect(rejectBlock).toContain("fresh.custom_fields");
    expect(rejectBlock).toContain("fresh.status");
  });

  it("reassign mutation fetches fresh appointment before building notes history", async () => {
    const source = await import("../../pages/MySchedule?raw");
    const code = (source as any).default || String(source);
    const reassignBlock = code.slice(code.indexOf("const reassignJob"), code.indexOf("const noShowJob"));
    expect(reassignBlock).toContain("fetchFreshAppointment(apptId)");
    expect(reassignBlock).toContain("fresh.interpreter_notes_history");
    expect(reassignBlock).toContain("fresh.interpreter_notes");
  });

  it("fetchFreshAppointment selects required fields", async () => {
    const source = await import("../../pages/MySchedule?raw");
    const code = (source as any).default || String(source);
    expect(code).toContain("custom_fields");
    expect(code).toContain("interpreter_notes");
    expect(code).toContain("interpreter_notes_history");
  });
});

// ── Section 2: QBO month-boundary timezone awareness ──

describe("QBO export timezone-aware month boundaries", () => {
  it("uses agency timezone for month option generation", async () => {
    const source = await import("../../components/billing/QuickBooksExport?raw");
    const code = (source as any).default || String(source);
    expect(code).toContain("useAgencyTimezone");
    expect(code).toContain("localToUtcIso");
    expect(code).toContain("getMonthOptions(agencyTz)");
  });

  it("month options use startUtc/endUtc instead of browser-local Date", async () => {
    const source = await import("../../components/billing/QuickBooksExport?raw");
    const code = (source as any).default || String(source);
    expect(code).toContain("startUtc");
    expect(code).toContain("endUtc");
    // Should NOT use startOfMonth/endOfMonth from date-fns for boundary calc
    expect(code).not.toContain("startOfMonth");
    expect(code).not.toContain("endOfMonth");
  });

  it("query uses selected.startUtc and selected.endUtc", async () => {
    const source = await import("../../components/billing/QuickBooksExport?raw");
    const code = (source as any).default || String(source);
    expect(code).toContain("selected.startUtc");
    expect(code).toContain("selected.endUtc");
  });
});

// ── Section 3: Cross-surface cache invalidation ──

describe("MySchedule mutations invalidate appointments cache", () => {
  it("confirmJob invalidates both my-schedule and appointments", async () => {
    const source = await import("../../pages/MySchedule?raw");
    const code = (source as any).default || String(source);
    const confirmBlock = code.slice(code.indexOf("const confirmJob"), code.indexOf("const rejectJob"));
    expect(confirmBlock).toContain('"my-schedule"');
    expect(confirmBlock).toContain('"appointments"');
  });

  it("rejectJob invalidates both my-schedule and appointments", async () => {
    const source = await import("../../pages/MySchedule?raw");
    const code = (source as any).default || String(source);
    const rejectBlock = code.slice(code.indexOf("const rejectJob"), code.indexOf("const reassignJob"));
    expect(rejectBlock).toContain('"appointments"');
  });

  it("noShowJob invalidates both my-schedule and appointments", async () => {
    const source = await import("../../pages/MySchedule?raw");
    const code = (source as any).default || String(source);
    const noShowBlock = code.slice(code.indexOf("const noShowJob"), code.indexOf("const selfNoShowJob"));
    expect(noShowBlock).toContain('"appointments"');
  });

  it("selfNoShowJob invalidates both my-schedule and appointments", async () => {
    const source = await import("../../pages/MySchedule?raw");
    const code = (source as any).default || String(source);
    const selfNoShowBlock = code.slice(code.indexOf("const selfNoShowJob"), code.indexOf("const queryClient"));
    expect(selfNoShowBlock).toContain('"appointments"');
  });

  it("saveInterpreterNotes invalidates appointments cache", async () => {
    const source = await import("../../pages/MySchedule?raw");
    const code = (source as any).default || String(source);
    const notesBlock = code.slice(code.indexOf("const saveInterpreterNotes"), code.indexOf("/* ── filtering"));
    expect(notesBlock).toContain('"appointments"');
  });
});

// ── Section 4: Notification payload freshness ──

describe("Notification payload uses refreshed data", () => {
  it("update mutation re-fetches appointment before sending notifications", async () => {
    const source = await import("../../hooks/useAgencyData?raw");
    const code = (source as any).default || String(source);
    // Find the update mutation onSuccess
    const updateBlock = code.slice(code.indexOf("const update = useAdaptedMutation"), code.indexOf("// Bulk create"));
    expect(updateBlock).toContain("refetched");
    expect(updateBlock).toContain("freshData");
  });
});

// ── Section 5: Interpreter notes defense-in-depth ──

describe("Interpreter notes save includes interpreter scoping", () => {
  it("saveInterpreterNotes adds .eq interpreter_id guard", async () => {
    const source = await import("../../pages/MySchedule?raw");
    const code = (source as any).default || String(source);
    const notesBlock = code.slice(code.indexOf("const saveInterpreterNotes"), code.indexOf("/* ── filtering"));
    expect(notesBlock).toContain('.eq("interpreter_id"');
  });
});

// ── Section 6: Bulk series update concurrency mitigation ──

describe("Bulk series update concurrency safety", () => {
  it("bulkUpdate fetches updated_at for optimistic concurrency check", async () => {
    const source = await import("../../hooks/useAgencyData?raw");
    const code = (source as any).default || String(source);
    const bulkBlock = code.slice(code.indexOf("// Bulk update series"), code.indexOf("// Bulk delete series"));
    expect(bulkBlock).toContain("updated_at");
    expect(bulkBlock).toContain('.eq("updated_at"');
  });

  it("bulkUpdate reports per-item failure counts", async () => {
    const source = await import("../../hooks/useAgencyData?raw");
    const code = (source as any).default || String(source);
    const bulkBlock = code.slice(code.indexOf("// Bulk update series"), code.indexOf("// Bulk delete series"));
    expect(bulkBlock).toContain("succeeded");
    expect(bulkBlock).toContain("failed");
    expect(bulkBlock).toContain("modified concurrently");
  });
});
