/**
 * Generate downloadable XLSX workbooks for standard template and agency data export.
 * Uses SheetJS (xlsx) library.
 */
import * as XLSX from "xlsx";
import { STANDARD_TABS, STATUS_VOCABULARY, INSTRUCTIONS_TEXT, type WorkbookTab } from "./workbook-template";

// ── Template generation ──────────────────────────────────────────────

function getTabHeaders(tab: WorkbookTab): string[] {
  return [
    ...tab.required.map((c) => c.column),
    ...tab.optional.map((c) => c.column),
  ];
}

export function generateTemplateWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // Instructions tab
  const instrLines = INSTRUCTIONS_TEXT.split("\n").map((line) => [line]);
  const instrWs = XLSX.utils.aoa_to_sheet(instrLines);
  instrWs["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, instrWs, "Instructions");

  // Data tabs
  for (const tab of STANDARD_TABS) {
    if (tab.name === "Instructions") continue;
    const headers = getTabHeaders(tab);
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 4, 16) }));
    XLSX.utils.book_append_sheet(wb, ws, tab.name);
  }

  return wb;
}

export function downloadTemplateXlsx() {
  const wb = generateTemplateWorkbook();
  XLSX.writeFile(wb, "standard_import_template.xlsx");
}

// ── Export generation ────────────────────────────────────────────────

export interface AgencyExportData {
  customers: any[];
  locations: any[];
  requesters: any[];
  interpreters: any[];
  appointments: any[];
  customerBillingBundles: any[];
  interpreterPayBundles: any[];
  customerMap?: Map<string, string>; // id → name
  locationMap?: Map<string, string>; // id → name
  interpreterMap?: Map<string, string>; // id → "First Last"
}

function buildCustomerMap(customers: any[]): Map<string, string> {
  const m = new Map<string, string>();
  customers.forEach((c) => m.set(c.id, c.name));
  return m;
}

function buildInterpreterMap(interpreters: any[]): Map<string, string> {
  const m = new Map<string, string>();
  interpreters.forEach((i) => m.set(i.id, `${i.first_name} ${i.last_name}`));
  return m;
}

function buildLocationMap(locations: any[]): Map<string, string> {
  const m = new Map<string, string>();
  locations.forEach((l) => m.set(l.id, l.name));
  return m;
}

const STATUS_REVERSE: Record<string, string> = {};
STATUS_VOCABULARY.forEach((s) => { STATUS_REVERSE[s.internal] = s.workbook; });

export function generateExportWorkbook(data: AgencyExportData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const custMap = data.customerMap || buildCustomerMap(data.customers);
  const interpMap = data.interpreterMap || buildInterpreterMap(data.interpreters);
  const locMap = data.locationMap || buildLocationMap(data.locations);

  // Instructions
  const instrLines = INSTRUCTIONS_TEXT.split("\n").map((line) => [line]);
  const instrWs = XLSX.utils.aoa_to_sheet(instrLines);
  instrWs["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, instrWs, "Instructions");

  // Customers
  const custRows = data.customers.map((c) => ({
    "Customer Name": c.name,
    "Contact Name": c.contact_name || "",
    "Contact Email": c.contact_email || "",
    "Contact Phone": c.contact_phone || "",
    "Billing Email": c.billing_email || "",
    "Active": c.is_active !== false ? "Yes" : "No",
    "Notes": c.notes || "",
  }));
  appendSheet(wb, "Customers", custRows);

  // Locations
  const locRows = data.locations.map((l) => ({
    "Customer Name": custMap.get(l.customer_id) || "",
    "Location Name": l.name,
    "Address": l.address_line1 || "",
    "City": l.city || "",
    "State": l.state || "",
    "ZIP": l.zip_code || "",
    "Phone": l.phone || "",
    "Instructions": l.navigation_instructions || "",
  }));
  appendSheet(wb, "Locations", locRows);

  // Requesters
  const reqRows = data.requesters.map((r) => ({
    "First Name": r.first_name || "",
    "Last Name": r.last_name || "",
    "Email": r.email || "",
    "Customer Name": custMap.get(r.customer_id) || "",
    "Phone": r.phone || "",
  }));
  appendSheet(wb, "Requesters", reqRows);

  // Interpreters
  const interpRows = data.interpreters.map((i) => ({
    "First Name": i.first_name || "",
    "Last Name": i.last_name || "",
    "Email": i.email || "",
    "Phone": i.phone || "",
    "Languages": (i.languages_text || ""),
  }));
  appendSheet(wb, "Interpreters", interpRows);

  // Appointments
  const apptRows = data.appointments.map((a) => {
    const start = a.scheduled_start ? new Date(a.scheduled_start) : null;
    const end = a.scheduled_end ? new Date(a.scheduled_end) : null;
    return {
      "Customer": custMap.get(a.customer_id) || "",
      "Date": start ? formatDate(start) : "",
      "Start": start ? formatTime(start) : "",
      "End": end ? formatTime(end) : "",
      "At": locMap.get(a.location_id) || "",
      "Interpreter": interpMap.get(a.interpreter_id) || "",
      "Status": STATUS_REVERSE[a.status] || a.status || "requested",
      "Client Initials": a.patient_client_name || "",
      "Client Reference": a.client_reference || "",
      "Category": a.category || "",
      "View": a.source_record_id || "",
      "Notes": a.notes || "",
    };
  });
  appendSheet(wb, "Appointments", apptRows);

  // Customer Billing Bundles
  const custBundleRows = data.customerBillingBundles.map((b) => ({
    "Bundle Name": b.name || "",
    "Customer Name": custMap.get(b.customer_id) || "",
    "Is Default": b.is_default ? "Yes" : "No",
    "Billing Model": b.billing_model || "hourly",
    "Hourly Rate": b.hourly_rate ?? "",
    "Minimum Hours": b.minimum_hours ?? "",
    "After Hours Multiplier": b.after_hours_multiplier ?? "",
    "After Hours Start": (b.after_hours_start || "").substring(0, 5),
    "After Hours End": (b.after_hours_end || "").substring(0, 5),
    "Weekend Multiplier": b.weekend_multiplier ?? "",
    "Holiday Multiplier": b.holiday_multiplier ?? "",
    "Same Day Multiplier": b.same_day_multiplier ?? "",
    "Cancellation Fee %": b.cancellation_fee_percent ?? "",
    "Cancellation Window Hours": b.cancellation_window_hours ?? "",
    "Rounding Direction": b.rounding_direction || "",
    "Rounding Minutes": b.rounding_interval_minutes ?? "",
    "Stack Premiums": b.stack_premiums ? "Yes" : "No",
  }));
  appendSheet(wb, "Customer Billing Bundles", custBundleRows);

  // Interpreter Billing Bundles
  const interpBundleRows = data.interpreterPayBundles.map((p) => ({
    "Package Name": p.name || "",
    "Interpreter": interpMap.get(p.interpreter_id) || "",
    "Is Default": p.is_default ? "Yes" : "No",
    "Hourly Rate": p.hourly_rate ?? "",
    "Minimum Hours": p.minimum_hours ?? "",
    "After Hours Multiplier": p.after_hours_multiplier ?? "",
    "Weekend Multiplier": p.weekend_multiplier ?? "",
    "Holiday Multiplier": p.holiday_multiplier ?? "",
    "Rounding Direction": p.rounding_direction || "",
    "Rounding Minutes": p.rounding_interval_minutes ?? "",
  }));
  appendSheet(wb, "Interpreter Billing Bundles", interpBundleRows);

  return wb;
}

function appendSheet(wb: XLSX.WorkBook, name: string, rows: Record<string, any>[]) {
  if (rows.length === 0) {
    // Still create headers from the STANDARD_TABS definition
    const tab = STANDARD_TABS.find((t) => t.name === name);
    if (tab) {
      const headers = getTabHeaders(tab);
      const ws = XLSX.utils.aoa_to_sheet([headers]);
      ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 4, 16) }));
      XLSX.utils.book_append_sheet(wb, ws, name);
      return;
    }
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
  ws["!cols"] = keys.map((k) => ({ wch: Math.max(k.length + 4, 16) }));
  XLSX.utils.book_append_sheet(wb, ws, name);
}

export function downloadExportXlsx(data: AgencyExportData, agencyName: string) {
  const wb = generateExportWorkbook(data);
  const safeName = agencyName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 30);
  XLSX.writeFile(wb, `${safeName}_export.xlsx`);
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
