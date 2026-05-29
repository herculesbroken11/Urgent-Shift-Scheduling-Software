/**
 * Standard workbook template definition for agency import/export.
 * Defines the canonical tab structure, columns, and instructions.
 */

export interface WorkbookTab {
  name: string;
  purpose: string;
  required: { column: string; description: string }[];
  optional: { column: string; description: string }[];
}

export const STANDARD_TABS: WorkbookTab[] = [
  {
    name: "Instructions",
    purpose: "Read-me tab with import guidelines",
    required: [],
    optional: [],
  },
  {
    name: "Customers",
    purpose: "Customer/organization master list",
    required: [
      { column: "Customer Name", description: "Exact organization name (must match across tabs)" },
    ],
    optional: [
      { column: "Contact Name", description: "Primary contact person" },
      { column: "Contact Email", description: "Contact email address" },
      { column: "Contact Phone", description: "Contact phone number" },
      { column: "Billing Email", description: "Email for billing/invoices" },
      { column: "Active", description: "Yes/No — defaults to Yes" },
      { column: "Notes", description: "Free text notes" },
    ],
  },
  {
    name: "Locations",
    purpose: "Customer locations / sites",
    required: [
      { column: "Customer Name", description: "Must exactly match a row in Customers tab" },
      { column: "Location Name", description: "Full site/facility name (no truncation)" },
    ],
    optional: [
      { column: "Address", description: "Street address" },
      { column: "City", description: "City" },
      { column: "State", description: "State/province" },
      { column: "ZIP", description: "Postal code" },
      { column: "Phone", description: "Location phone" },
      { column: "Instructions", description: "Navigation/parking instructions" },
    ],
  },
  {
    name: "Requesters",
    purpose: "Requester users linked to customers",
    required: [
      { column: "First Name", description: "Requester first name" },
      { column: "Last Name", description: "Requester last name" },
      { column: "Email", description: "Requester email address" },
      { column: "Customer Name", description: "Must exactly match a row in Customers tab" },
    ],
    optional: [
      { column: "Phone", description: "Phone number" },
    ],
  },
  {
    name: "Interpreters",
    purpose: "Interpreter roster",
    required: [
      { column: "First Name", description: "Interpreter first name" },
      { column: "Last Name", description: "Interpreter last name" },
      { column: "Email", description: "Interpreter email address" },
    ],
    optional: [
      { column: "Phone", description: "Phone number" },
      { column: "Languages", description: "Comma-separated language list" },
    ],
  },
  {
    name: "Appointments",
    purpose: "Appointment records",
    required: [
      { column: "Customer", description: "Must exactly match a row in Customers tab" },
      { column: "Date", description: "Appointment date (YYYY-MM-DD or M/D/YYYY)" },
      { column: "Start", description: "Start time (HH:MM or H:MM AM/PM)" },
      { column: "End", description: "End time (HH:MM or H:MM AM/PM)" },
    ],
    optional: [
      { column: "At", description: "Location name — resolves to a Customer Location" },
      { column: "Interpreter", description: "Interpreter name (First Last)" },
      { column: "Status", description: "scheduled, confirmed, completed, cancelled, no_show. Defaults to 'scheduled'" },
      { column: "Client Initials", description: "Patient/client initials (metadata only)" },
      { column: "Client Reference", description: "External reference number" },
      { column: "Category", description: "Service category" },
      { column: "View", description: "External source record ID" },
      { column: "Notes", description: "Appointment notes" },
    ],
  },
  {
    name: "Customer Billing Bundles",
    purpose: "Billing bundle definitions and customer assignments",
    required: [
      { column: "Bundle Name", description: "Unique bundle name" },
    ],
    optional: [
      { column: "Customer Name", description: "Assigned customer (blank = agency default)" },
      { column: "Is Default", description: "Yes/No — marks the agency default bundle" },
      { column: "Billing Model", description: "hourly, per_appointment, flat, tiered" },
      { column: "Hourly Rate", description: "Dollar amount per hour" },
      { column: "Minimum Hours", description: "Minimum billable hours" },
      { column: "After Hours Multiplier", description: "Multiplier (e.g. 1.5)" },
      { column: "After Hours Start", description: "HH:MM (e.g. 18:00)" },
      { column: "After Hours End", description: "HH:MM (e.g. 08:00)" },
      { column: "Weekend Multiplier", description: "Multiplier" },
      { column: "Holiday Multiplier", description: "Multiplier" },
      { column: "Same Day Multiplier", description: "Multiplier for last-minute bookings" },
      { column: "Cancellation Fee %", description: "Percentage (e.g. 100)" },
      { column: "Cancellation Window Hours", description: "Hours before start" },
      { column: "Rounding Direction", description: "up, down, or nearest" },
      { column: "Rounding Minutes", description: "Interval in minutes (e.g. 15)" },
      { column: "Stack Premiums", description: "Yes/No — stack or use highest only" },
    ],
  },
  {
    name: "Interpreter Billing Bundles",
    purpose: "Interpreter pay package definitions",
    required: [
      { column: "Package Name", description: "Unique package name" },
    ],
    optional: [
      { column: "Interpreter", description: "Assigned interpreter (First Last). Blank = default" },
      { column: "Is Default", description: "Yes/No — marks the agency default package" },
      { column: "Hourly Rate", description: "Dollar amount per hour" },
      { column: "Minimum Hours", description: "Minimum billable hours" },
      { column: "After Hours Multiplier", description: "Multiplier" },
      { column: "Weekend Multiplier", description: "Multiplier" },
      { column: "Holiday Multiplier", description: "Multiplier" },
      { column: "Rounding Direction", description: "up, down, or nearest" },
      { column: "Rounding Minutes", description: "Interval in minutes" },
    ],
  },
];

export const STATUS_VOCABULARY = [
  { workbook: "requested",            internal: "requested",                    notes: "Default when blank" },
  { workbook: "requested_last_minute", internal: "requested_last_minute",      notes: "Auto-detected last-minute" },
  { workbook: "assigned",             internal: "interpreter_assigned",         notes: "Interpreter assigned" },
  { workbook: "assigned_last_minute",  internal: "interpreter_assigned_last_minute", notes: "" },
  { workbook: "confirmed",            internal: "interpreter_confirmed",        notes: "Interpreter confirmed" },
  { workbook: "reassignment_needed",   internal: "reassignment_needed",        notes: "" },
  { workbook: "in_progress",          internal: "in_progress",                 notes: "" },
  { workbook: "completed",            internal: "completed",                   notes: "" },
  { workbook: "completed_last_minute", internal: "completed_last_minute",      notes: "" },
  { workbook: "cancelled",            internal: "cancelled",                   notes: "" },
  { workbook: "late_cancel_no_show",   internal: "late_cancel_no_show_client", notes: "" },
  { workbook: "no_show_interpreter",   internal: "no_show_interpreter",        notes: "" },
];

export const INSTRUCTIONS_TEXT = `STANDARD IMPORT WORKBOOK — INSTRUCTIONS

This workbook is the standard format for importing and exporting agency data.

═══════════════════════════════════════════════
SECTION 1: AUTOMATICALLY IMPORTABLE DATA
═══════════════════════════════════════════════

The following tabs support full automated import via the Import Wizard:

  ✅ Customers — full create/update round-trip
  ✅ Locations — full create/update round-trip (linked to Customers by exact name match)
  ✅ Appointments — full create/update round-trip

GENERAL RULES:
• Customer Name must match EXACTLY across all tabs
• The "At" column in Appointments resolves to a Customer Location — use the exact Location Name
• Dates use YYYY-MM-DD format; Times use HH:MM (24h) or H:MM AM/PM
• Status defaults to "requested" when left blank
• Client Initials is metadata only — not used for relational matching
• Re-importing the same file will update existing records (matched by source_record_id), not create duplicates

ALLOWED STATUS VALUES:
  requested (default), requested_last_minute, interpreter_assigned, interpreter_assigned_last_minute, interpreter_confirmed, reassignment_needed, in_progress, completed, completed_last_minute, cancelled, late_cancel_no_show_client, no_show_interpreter

═══════════════════════════════════════════════
SECTION 2: AUTH-BACKED USERS (INVITE REQUIRED)
═══════════════════════════════════════════════

These tabs are included for export/reference but require manual invite flows:

  ⚠️ Requesters — export works; import creates profile stubs. Users must be invited via Settings → User Management.
  ⚠️ Interpreters — export works; import creates profile stubs. Users must be invited via Settings → User Management.

These users require authentication accounts and cannot be bulk-created via file import alone.

═══════════════════════════════════════════════
SECTION 3: ADMIN CONFIGURATION (POST-IMPORT)
═══════════════════════════════════════════════

These tabs are for reference/export only. Configuration is done via the admin UI after import:

  🔧 Customer Billing Bundles — configure via Customer Billing Assignment page
  🔧 Interpreter Billing Bundles — configure via Interpreter Pay page

Billing bundles are low-volume configuration (typically 1-10 per agency).
They are intentionally managed through the UI to prevent naming ambiguity and orphan records.

BILLING BUNDLE RULES:
• One bundle may be marked "Is Default = Yes" — this becomes the agency-wide default
• Customer-specific bundles must have a Customer Name that matches the Customers tab
• Rounding Direction: up, down, or nearest
• Stack Premiums: Yes = add all applicable premiums; No = use highest only

INTERPRETER PAY PACKAGES:
• One package may be marked "Is Default = Yes" — this becomes the agency-wide default
• Interpreter-specific packages must reference an interpreter by "First Last" name

═══════════════════════════════════════════════
SECTION 4: ONBOARDING SEQUENCE
═══════════════════════════════════════════════

Recommended order after agency creation:
  1. Invite interpreters via Settings → User Management
  2. Download this template from Settings → Data Import & Export
  3. Populate Customers, Locations, and Appointments tabs
  4. Import via Settings → Data Import & Export → Import Data
  5. Configure billing bundles via Customer Billing Assignment
  6. Configure interpreter pay via Interpreter Pay
  7. Invite requesters via Settings → User Management
  8. Connect QuickBooks (optional) via Settings → Billing Integrations
`;
