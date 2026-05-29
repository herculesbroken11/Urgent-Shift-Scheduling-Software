import { describe, it, expect } from "vitest";

const readFile = (p: string) => {
  // vitest runs in node, so we can use this pattern
  const f = globalThis as any;
  if (!f.__fs) f.__fs = eval('require("fs")');
  return f.__fs.readFileSync(p, "utf-8") as string;
};

describe("Appointments.tsx — agency-tz date filtering", () => {
  const src = readFile("src/pages/Appointments.tsx");
  it("imports localToUtcIso", () => { expect(src).toContain("localToUtcIso"); });
  it("getDateRange accepts agencyTz", () => { expect(src).toMatch(/getDateRange\(.*agencyTz/); });
});

describe("MySchedule.tsx — status preconditions", () => {
  const src = readFile("src/pages/MySchedule.tsx");
  it("confirmJob has CONFIRMABLE_STATUSES", () => { expect(src).toContain("CONFIRMABLE_STATUSES"); });
  it("noShowJob has NO_SHOW_CLIENT_STATUSES", () => { expect(src).toContain("NO_SHOW_CLIENT_STATUSES"); });
  it("selfNoShowJob has SELF_NO_SHOW_STATUSES", () => { expect(src).toContain("SELF_NO_SHOW_STATUSES"); });
});

describe("MySchedule.tsx — fresh notification payloads", () => {
  const src = readFile("src/pages/MySchedule.tsx");
  it("confirmJob uses fresh data[0]", () => {
    const s = src.slice(src.indexOf("const confirmJob"), src.indexOf("const rejectJob"));
    expect(s).not.toContain("appointments.find");
    expect(s).toContain("const fresh = data[0]");
  });
});

describe("Requester mutation scoping", () => {
  it("RequestDetailDialog scopes by customer_id", () => {
    expect(readFile("src/components/appointments/RequestDetailDialog.tsx")).toContain('eq("customer_id"');
  });
  it("MyRequests location save scopes by customer_id", () => {
    const src = readFile("src/pages/MyRequests.tsx");
    const s = src.slice(src.indexOf("handleSaveLocation"), src.indexOf("handleOpenNotesDialog"));
    expect(s).toContain('eq("customer_id"');
  });
});
