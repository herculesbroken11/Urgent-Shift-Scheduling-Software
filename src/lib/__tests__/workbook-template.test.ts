import { describe, it, expect } from "vitest";
import { STANDARD_TABS, STATUS_VOCABULARY, INSTRUCTIONS_TEXT } from "@/lib/workbook-template";

describe("Standard Workbook Template", () => {
  it("has all 8 required tabs", () => {
    const tabNames = STANDARD_TABS.map(t => t.name);
    expect(tabNames).toContain("Instructions");
    expect(tabNames).toContain("Customers");
    expect(tabNames).toContain("Locations");
    expect(tabNames).toContain("Requesters");
    expect(tabNames).toContain("Interpreters");
    expect(tabNames).toContain("Appointments");
    expect(tabNames).toContain("Customer Billing Bundles");
    expect(tabNames).toContain("Interpreter Billing Bundles");
    expect(STANDARD_TABS).toHaveLength(8);
  });

  it("Customers tab requires Customer Name", () => {
    const tab = STANDARD_TABS.find(t => t.name === "Customers")!;
    expect(tab.required.some(c => c.column === "Customer Name")).toBe(true);
  });

  it("Appointments tab requires Customer, Date, Start, End", () => {
    const tab = STANDARD_TABS.find(t => t.name === "Appointments")!;
    const reqCols = tab.required.map(c => c.column);
    expect(reqCols).toContain("Customer");
    expect(reqCols).toContain("Date");
    expect(reqCols).toContain("Start");
    expect(reqCols).toContain("End");
  });

  it("Appointments tab has optional Status and Client Initials", () => {
    const tab = STANDARD_TABS.find(t => t.name === "Appointments")!;
    const optCols = tab.optional.map(c => c.column);
    expect(optCols).toContain("Status");
    expect(optCols).toContain("Client Initials");
    expect(optCols).toContain("At");
    expect(optCols).toContain("Client Reference");
  });

  it("status vocabulary includes requested as default", () => {
    const requested = STATUS_VOCABULARY.find(s => s.workbook === "requested");
    expect(requested).toBeDefined();
    expect(requested!.notes).toContain("Default");
  });

  it("all standard statuses have valid internal mappings", () => {
    for (const s of STATUS_VOCABULARY) {
      expect(s.workbook).toBeTruthy();
      expect(s.internal).toBeTruthy();
    }
  });

  it("instructions text is non-empty and contains key rules", () => {
    expect(INSTRUCTIONS_TEXT.length).toBeGreaterThan(100);
    expect(INSTRUCTIONS_TEXT).toContain("Customer Name must match EXACTLY");
    expect(INSTRUCTIONS_TEXT).toContain("Client Initials");
  });

  it("billing bundles tab has rounding fields", () => {
    const tab = STANDARD_TABS.find(t => t.name === "Customer Billing Bundles")!;
    const optCols = tab.optional.map(c => c.column);
    expect(optCols).toContain("Rounding Direction");
    expect(optCols).toContain("Rounding Minutes");
    expect(optCols).toContain("Stack Premiums");
  });

  it("interpreter billing bundles tab exists with required fields", () => {
    const tab = STANDARD_TABS.find(t => t.name === "Interpreter Billing Bundles")!;
    expect(tab.required.some(c => c.column === "Package Name")).toBe(true);
    const optCols = tab.optional.map(c => c.column);
    expect(optCols).toContain("Interpreter");
    expect(optCols).toContain("Is Default");
  });

  it("each data tab has at least one required column", () => {
    const dataTabs = STANDARD_TABS.filter(t => t.name !== "Instructions");
    for (const tab of dataTabs) {
      expect(tab.required.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("tab names match export/import standard exactly", () => {
    const expected = [
      "Instructions", "Customers", "Locations", "Requesters",
      "Interpreters", "Appointments", "Customer Billing Bundles",
      "Interpreter Billing Bundles",
    ];
    expect(STANDARD_TABS.map(t => t.name)).toEqual(expected);
  });

  it("status vocabulary covers all v3 statuses", () => {
    const workbookValues = STATUS_VOCABULARY.map(s => s.workbook);
    expect(workbookValues).toContain("requested");
    expect(workbookValues).toContain("confirmed");
    expect(workbookValues).toContain("completed");
    expect(workbookValues).toContain("cancelled");
    expect(workbookValues).toContain("no_show_interpreter");
    expect(workbookValues).toContain("in_progress");
    expect(workbookValues).toContain("completed_last_minute");
    expect(workbookValues).toContain("late_cancel_no_show");
  });
});
