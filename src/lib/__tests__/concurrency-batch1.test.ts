import { describe, it, expect } from "vitest";

/**
 * Batch 1 concurrency/race-condition structural tests.
 * Validates that the guarded mutation patterns are structurally correct.
 */

// ── Self-claim race guard ──

describe("Self-claim race guard (AvailableJobs)", () => {
  it("should include .is('interpreter_id', null) guard in claim mutation", async () => {
    const source = await import("../../pages/AvailableJobs?raw");
    const code = (source as any).default || String(source);
    expect(code).toContain('.is("interpreter_id", null)');
  });

  it("should include status eligibility guard in claim mutation", async () => {
    const source = await import("../../pages/AvailableJobs?raw");
    const code = (source as any).default || String(source);
    expect(code).toContain('.in("status"');
    expect(code).toContain("requested");
    expect(code).toContain("reassignment_needed");
  });

  it("should detect 0-row update and throw user-facing error", async () => {
    const source = await import("../../pages/AvailableJobs?raw");
    const code = (source as any).default || String(source);
    expect(code).toContain("already claimed or assigned");
  });

  it("demo path should also guard against already-assigned jobs", async () => {
    const source = await import("../../pages/AvailableJobs?raw");
    const code = (source as any).default || String(source);
    expect(code).toContain("appt?.interpreter_id");
  });
});

// ── Requester cancel terminal-state guard ──

describe("Requester cancel precondition guard (MyRequests)", () => {
  it("should define CANCELLABLE_STATUSES for cancel precondition", async () => {
    const source = await import("../../pages/MyRequests?raw");
    const code = (source as any).default || String(source);
    expect(code).toContain("CANCELLABLE_STATUSES");
  });

  it("should use .in('status', CANCELLABLE_STATUSES) in standard cancel", async () => {
    const source = await import("../../pages/MyRequests?raw");
    const code = (source as any).default || String(source);
    // The cancel mutation should filter by cancellable statuses
    expect(code).toContain('.in("status"');
    expect(code).toContain("CANCELLABLE_STATUSES");
  });

  it("should show user-facing error when cancel fails due to concurrent update", async () => {
    const source = await import("../../pages/MyRequests?raw");
    const code = (source as any).default || String(source);
    expect(code).toContain("updated by someone else");
  });

  it("CANCELLABLE_STATUSES should not include terminal statuses", async () => {
    const source = await import("../../pages/MyRequests?raw");
    const code = (source as any).default || String(source);
    // Extract the array — it should contain pre-terminal statuses only
    expect(code).toContain('"requested"');
    expect(code).toContain('"interpreter_confirmed"');
    // Should NOT include completed or cancelled in cancellable list
    const cancellableMatch = code.match(/CANCELLABLE_STATUSES\s*=\s*\[([\s\S]*?)\]/);
    if (cancellableMatch) {
      const block = cancellableMatch[1];
      expect(block).not.toContain('"completed"');
      expect(block).not.toContain('"cancelled"');
      expect(block).not.toContain('"no_show_interpreter"');
    }
  });
});

// ── Complete dialog guards ──

describe("Complete dialog guards (CompleteAppointmentDialog)", () => {
  it("should use a ref-based double-submit guard", async () => {
    const source = await import("../../components/appointments/CompleteAppointmentDialog?raw");
    const code = (source as any).default || String(source);
    expect(code).toContain("submittingRef");
    expect(code).toContain("submittingRef.current = true");
    expect(code).toContain("submittingRef.current = false");
  });

  it("should early-return if submittingRef is already true", async () => {
    const source = await import("../../components/appointments/CompleteAppointmentDialog?raw");
    const code = (source as any).default || String(source);
    expect(code).toContain("if (submittingRef.current) return");
  });

  it("should add status precondition to completion update", async () => {
    const source = await import("../../components/appointments/CompleteAppointmentDialog?raw");
    const code = (source as any).default || String(source);
    expect(code).toContain("COMPLETABLE_STATUSES");
    expect(code).toContain('.in("status"');
  });

  it("should detect 0-row completion and show error", async () => {
    const source = await import("../../components/appointments/CompleteAppointmentDialog?raw");
    const code = (source as any).default || String(source);
    expect(code).toContain("updated by someone else");
  });

  it("should reset submittingRef in finally block", async () => {
    const source = await import("../../components/appointments/CompleteAppointmentDialog?raw");
    const code = (source as any).default || String(source);
    // The finally block should reset the ref
    const finallyIdx = code.indexOf("} finally {");
    expect(finallyIdx).toBeGreaterThan(-1);
    const afterFinally = code.slice(finallyIdx, finallyIdx + 200);
    expect(afterFinally).toContain("submittingRef.current = false");
  });
});
