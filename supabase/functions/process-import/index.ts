import { getCorsHeaders, authenticateCaller, AuthError, errorResponse } from "../_shared/cors.ts";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ImportRequest {
  action: "dry_run" | "execute" | "rollback" | "resume";
  batch_id?: string;
  csv_content?: string;
  entity_type?: string;
  source_system?: string;
  filename?: string;
  protected_fields?: string[];
  is_staged?: boolean;
  chunk_size?: number;
}

interface RowResult {
  row_number: number;
  action: "create" | "update" | "skip" | "error" | "conflict";
  validation_messages: ValidationMessage[];
  raw_data: Record<string, string>;
  transformed_data: Record<string, unknown> | null;
  source_hash: string;
  existing_record_id?: string;
  previous_data?: Record<string, unknown>;
  conflict_type?: string;
}

interface ValidationMessage {
  level: "info" | "warning" | "error" | "blocking";
  field: string;
  message: string;
  auto_fixed?: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const VALID_STATUSES = [
  "requested", "requested_last_minute",
  "interpreter_assigned", "interpreter_assigned_last_minute",
  "interpreter_confirmed", "reassignment_needed",
  "in_progress", "completed", "completed_last_minute",
  "cancelled", "late_cancel_no_show_client", "no_show_interpreter",
];

const VALID_MODALITIES = ["on_site", "video", "phone"];

const HEADER_SIGNATURES: Record<string, string[][]> = {
  appointments: [
    ["date", "status", "customer"],
    ["scheduled_start", "status"],
    ["appointment", "date", "interpreter"],
  ],
  customers: [
    ["customer name", "contact", "billing"],
    ["name", "billing_email"],
    ["organization", "contact_email"],
  ],
  locations: [
    ["location", "address", "city"],
    ["name", "address_line1"],
    ["site", "street"],
  ],
  interpreters: [
    ["first name", "last name", "email", "phone"],
    ["interpreter", "email"],
    ["first_name", "last_name"],
  ],
};

// ─── CSV Parser ─────────────────────────────────────────────────────────────

function parseCSV(content: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const values = parseRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = values[i] ?? "";
    });
    return obj;
  });

  return { headers, rows };
}

// ─── Entity Detection ───────────────────────────────────────────────────────

function detectEntityType(headers: string[]): string | null {
  const normalized = headers.map((h) => h.toLowerCase());
  for (const [entity, signatures] of Object.entries(HEADER_SIGNATURES)) {
    for (const sig of signatures) {
      if (sig.every((s) => normalized.some((h) => h.includes(s)))) {
        return entity;
      }
    }
  }
  return null;
}

// ─── Source Hash ─────────────────────────────────────────────────────────────

async function generateSourceHash(data: Record<string, string>): Promise<string> {
  const sorted = Object.keys(data).sort().map((k) => `${k}:${data[k]}`).join("|");
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(sorted));
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Field Normalizers ──────────────────────────────────────────────────────

function cleanEmail(email: string): { value: string; cleaned: boolean } {
  const trimmed = email.trim().toLowerCase().replace(/\s+/g, "");
  const cleaned = trimmed !== email.trim();
  return { value: trimmed, cleaned };
}

function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

function parseAddress(raw: string): {
  address_line1: string;
  city: string;
  state: string;
  zip_code: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  const parts = raw.split(",").map((p) => p.trim());
  const result = { address_line1: "", city: "", state: "", zip_code: "", warnings };

  if (parts.length >= 1) result.address_line1 = parts[0];
  if (parts.length >= 2) result.city = parts[1];
  if (parts.length >= 3) {
    const stateZip = parts[2].trim().split(/\s+/);
    result.state = stateZip[0] || "";
    result.zip_code = stateZip.slice(1).join(" ") || "";
  }
  if (parts.length < 3) warnings.push("Address may be incomplete; parsed as best-effort");
  if (result.zip_code && !/^\d{5}(-\d{4})?$/.test(result.zip_code)) {
    warnings.push("Zip code format may be invalid: " + result.zip_code);
  }

  return result;
}

function normalizeStatus(raw: string): string | null {
  const lower = raw.trim().toLowerCase().replace(/[\s_-]+/g, "_");
  const aliases: Record<string, string> = {
    todo: "requested",
    "to_do": "requested",
    new: "requested",
    open: "requested",
    pending: "requested",
    scheduled: "interpreter_assigned",
    assigned: "interpreter_assigned",
    offered: "interpreter_assigned",
    confirmed: "interpreter_confirmed",
    accepted: "interpreter_confirmed",
    interpreter_accepted: "interpreter_confirmed",
    ready_for_interpreter: "interpreter_assigned",
    active: "in_progress",
    done: "completed",
    complete: "completed",
    finished: "completed",
    canceled: "cancelled",
    cancelled: "cancelled",
    no_show: "late_cancel_no_show_client",
    no_show_client: "late_cancel_no_show_client",
    late_cancel: "late_cancel_no_show_client",
  };
  if (VALID_STATUSES.includes(lower)) return lower;
  if (aliases[lower]) return aliases[lower];
  return null;
}

function normalizeModality(raw: string): string | null {
  const lower = raw.trim().toLowerCase().replace(/[\s_-]+/g, "_");
  const aliases: Record<string, string> = {
    onsite: "on_site",
    on_site: "on_site",
    "in_person": "on_site",
    "face_to_face": "on_site",
    video: "video",
    remote: "video",
    virtual: "video",
    zoom: "video",
    teams: "video",
    phone: "phone",
    telephonic: "phone",
    telephone: "phone",
    over_the_phone: "phone",
    opi: "phone",
    vri: "video",
  };
  if (VALID_MODALITIES.includes(lower)) return lower;
  if (aliases[lower]) return aliases[lower];
  return null;
}

// ─── Mapping Rule Engine ────────────────────────────────────────────────────

interface MappingRule {
  source_field: string;
  source_value: string;
  mapped_field: string;
  mapped_value: string;
}

function applyMappingRules(
  row: Record<string, string>,
  rules: MappingRule[]
): { mapped: Record<string, string>; applied: string[] } {
  const result = { ...row };
  const applied: string[] = [];
  for (const rule of rules) {
    const fieldValue = row[rule.source_field];
    if (fieldValue !== undefined && fieldValue.toLowerCase() === rule.source_value.toLowerCase()) {
      result[rule.mapped_field] = rule.mapped_value;
      applied.push(`${rule.source_field}:${rule.source_value} → ${rule.mapped_field}:${rule.mapped_value}`);
    }
  }
  return { mapped: result, applied };
}

// ─── Row Transformers ───────────────────────────────────────────────────────

function transformAppointmentRow(
  raw: Record<string, string>,
  messages: ValidationMessage[],
  lookups: LookupData
): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};

  // Title
  result.title = raw.title || raw.appointment_title || raw.subject || raw.description?.substring(0, 100) || "Untitled";

  // Status
  const rawStatus = raw.status || "requested";
  const status = normalizeStatus(rawStatus);
  if (!status) {
    messages.push({ level: "error", field: "status", message: `Unknown status: "${rawStatus}". Needs mapping.` });
    return null;
  }
  result.status = status;

  // Modality
  const rawModality = raw.modality || raw.type || raw.service_type || "";
  if (rawModality) {
    const modality = normalizeModality(rawModality);
    if (!modality) {
      messages.push({ level: "warning", field: "modality", message: `Unknown modality: "${rawModality}". Defaulting to on_site.` });
      result.modality = "on_site";
    } else {
      result.modality = modality;
    }
  } else {
    result.modality = "on_site";
  }

  // Dates
  const startRaw = raw.scheduled_start || raw.date || raw.start_date || raw.appointment_date || "";
  if (startRaw) {
    const d = new Date(startRaw);
    if (isNaN(d.getTime())) {
      messages.push({ level: "blocking", field: "scheduled_start", message: `Invalid date: "${startRaw}"` });
      return null;
    }
    result.scheduled_start = d.toISOString();
    // Add time if present
    const timeRaw = raw.start_time || raw.time || "";
    if (timeRaw && result.scheduled_start) {
      const timeParts = timeRaw.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
      if (timeParts) {
        let hours = parseInt(timeParts[1]);
        const mins = parseInt(timeParts[2]);
        const ampm = timeParts[3]?.toLowerCase();
        if (ampm === "pm" && hours < 12) hours += 12;
        if (ampm === "am" && hours === 12) hours = 0;
        d.setHours(hours, mins, 0, 0);
        result.scheduled_start = d.toISOString();
      }
    }
  }

  const endRaw = raw.scheduled_end || raw.end_date || raw.end_time || "";
  if (endRaw) {
    const d = new Date(endRaw);
    if (!isNaN(d.getTime())) result.scheduled_end = d.toISOString();
  }

  // Customer lookup
  const customerName = raw.customer || raw.customer_name || raw.organization || "";
  if (customerName) {
    const match = lookups.customers.find((c) => c.name.toLowerCase() === customerName.trim().toLowerCase());
    if (match) {
      result.customer_id = match.id;
    } else {
      messages.push({ level: "warning", field: "customer", message: `Customer not found: "${customerName}". Will be auto-created if executed.` });
      result._pending_customer_name = customerName.trim();
    }
  }

  // Location lookup
  const locationName = raw.location || raw.location_name || raw.at || raw.site || "";
  if (locationName) {
    const match = lookups.locations.find((l) => l.name.toLowerCase() === locationName.trim().toLowerCase());
    if (match) {
      result.location_id = match.id;
    } else {
      messages.push({ level: "warning", field: "location", message: `Location not found: "${locationName}". Will be auto-created if executed.` });
      result._pending_location_name = locationName.trim();
      result._pending_location_raw = raw.address || raw.location_address || locationName;
    }
  }

  // Language lookup
  const langName = raw.language || raw.language_name || raw.lang || "";
  if (langName) {
    const match = lookups.languages.find(
      (l) => l.name.toLowerCase() === langName.trim().toLowerCase() || l.code.toLowerCase() === langName.trim().toLowerCase()
    );
    if (match) {
      result.language_id = match.id;
    } else {
      messages.push({ level: "warning", field: "language", message: `Language not found: "${langName}"` });
    }
  }

  // Interpreter lookup
  const interpName = raw.interpreter || raw.interpreter_name || "";
  if (interpName) {
    const { first_name, last_name } = splitName(interpName);
    const match = lookups.interpreters.find(
      (i) =>
        i.first_name?.toLowerCase() === first_name.toLowerCase() &&
        i.last_name?.toLowerCase() === last_name.toLowerCase()
    );
    if (match) {
      result.interpreter_id = match.id;
    } else {
      messages.push({ level: "warning", field: "interpreter", message: `Interpreter not found: "${interpName}"` });
    }
  }

  // Extra fields
  result.category = raw.category || raw.appt_category || null;
  result.patient_client_name = raw.patient || raw.client || raw.patient_client_name || null;
  result.client_reference = raw.client_reference || raw.reference || raw.ref || null;
  result.notes = raw.notes || raw.comments || null;
  result.description = raw.description || null;

  return result;
}

function transformCustomerRow(
  raw: Record<string, string>,
  messages: ValidationMessage[]
): Record<string, unknown> | null {
  const name = raw.name || raw.customer_name || raw.organization || "";
  if (!name.trim()) {
    messages.push({ level: "blocking", field: "name", message: "Customer name is required" });
    return null;
  }

  const result: Record<string, unknown> = { name: name.trim() };

  result.contact_name = raw.contact_name || raw.contact || null;

  if (raw.contact_email || raw.email) {
    const { value, cleaned } = cleanEmail(raw.contact_email || raw.email);
    result.contact_email = value || null;
    if (cleaned) messages.push({ level: "info", field: "contact_email", message: "Email cleaned", auto_fixed: true });
  }
  if (raw.billing_email) {
    const { value, cleaned } = cleanEmail(raw.billing_email);
    result.billing_email = value || null;
    if (cleaned) messages.push({ level: "info", field: "billing_email", message: "Billing email cleaned", auto_fixed: true });
  }

  result.contact_phone = raw.contact_phone || raw.phone || null;
  result.notes = raw.notes || null;

  return result;
}

function transformLocationRow(
  raw: Record<string, string>,
  messages: ValidationMessage[],
  lookups: LookupData
): Record<string, unknown> | null {
  const name = raw.name || raw.location_name || raw.site || "";
  if (!name.trim()) {
    messages.push({ level: "blocking", field: "name", message: "Location name is required" });
    return null;
  }

  const result: Record<string, unknown> = { name: name.trim() };

  // Customer link
  const customerName = raw.customer || raw.customer_name || "";
  if (customerName) {
    const match = lookups.customers.find((c) => c.name.toLowerCase() === customerName.trim().toLowerCase());
    if (match) result.customer_id = match.id;
    else messages.push({ level: "warning", field: "customer", message: `Customer not found: "${customerName}"` });
  }

  // Address
  const rawAddr = raw.address || raw.full_address || "";
  if (rawAddr && !raw.address_line1) {
    const parsed = parseAddress(rawAddr);
    result.address_line1 = parsed.address_line1;
    result.city = parsed.city;
    result.state = parsed.state;
    result.zip_code = parsed.zip_code;
    result.raw_address = rawAddr;
    if (parsed.warnings.length > 0) {
      result.address_parse_warnings = parsed.warnings.join("; ");
      messages.push({ level: "warning", field: "address", message: parsed.warnings.join("; ") });
    }
  } else {
    result.address_line1 = raw.address_line1 || null;
    result.city = raw.city || null;
    result.state = raw.state || null;
    result.zip_code = raw.zip_code || raw.zip || null;
  }

  result.phone = raw.phone || null;

  return result;
}

function transformInterpreterRow(
  raw: Record<string, string>,
  messages: ValidationMessage[]
): Record<string, unknown> | null {
  const firstName = raw.first_name || "";
  const lastName = raw.last_name || "";
  let fn = firstName.trim();
  let ln = lastName.trim();

  if (!fn && !ln) {
    const full = raw.name || raw.interpreter_name || raw.interpreter || "";
    if (!full.trim()) {
      messages.push({ level: "blocking", field: "name", message: "Interpreter name is required" });
      return null;
    }
    const split = splitName(full);
    fn = split.first_name;
    ln = split.last_name;
  }

  const result: Record<string, unknown> = { first_name: fn, last_name: ln };

  if (raw.email) {
    const { value, cleaned } = cleanEmail(raw.email);
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      messages.push({ level: "error", field: "email", message: `Invalid email: "${raw.email}"` });
    } else {
      result.email = value || null;
      if (cleaned) messages.push({ level: "info", field: "email", message: "Email cleaned", auto_fixed: true });
    }
  }

  result.phone = raw.phone || null;

  return result;
}

// ─── Lookup Data ────────────────────────────────────────────────────────────

interface LookupData {
  customers: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  languages: { id: string; name: string; code: string }[];
  interpreters: { id: string; first_name: string; last_name: string }[];
}

async function loadLookups(adminClient: any, agencyId: string): Promise<LookupData> {
  const [customers, locations, languages, interpreters] = await Promise.all([
    adminClient.from("customers").select("id, name").eq("agency_id", agencyId).eq("is_deleted", false),
    adminClient.from("locations").select("id, name").eq("agency_id", agencyId).eq("is_deleted", false),
    adminClient.from("languages").select("id, name, code"),
    adminClient
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("agency_id", agencyId)
      .eq("is_deleted", false)
      .eq("is_active", true),
  ]);

  return {
    customers: customers.data || [],
    locations: locations.data || [],
    languages: languages.data || [],
    interpreters: interpreters.data || [],
  };
}

// ─── Row Processor ──────────────────────────────────────────────────────────

async function processRow(
  row: Record<string, string>,
  rowNum: number,
  entityType: string,
  agencyId: string,
  sourceSystem: string,
  lookups: LookupData,
  mappingRules: MappingRule[],
  existingRecords: Map<string, { id: string; source_hash: string; data: Record<string, unknown> }>,
  protectedFields: string[]
): Promise<RowResult> {
  const messages: ValidationMessage[] = [];

  // Apply mapping rules
  const { mapped, applied } = applyMappingRules(row, mappingRules);
  if (applied.length > 0) {
    messages.push({ level: "info", field: "_mapping", message: `Applied rules: ${applied.join("; ")}`, auto_fixed: true });
  }

  // Generate source hash
  const sourceHash = await generateSourceHash(mapped);

  // Determine source_record_id
  const sourceRecordId = mapped.source_record_id || mapped.id || mapped.record_id || `row_${rowNum}`;

  // Check existing
  const existingKey = `${sourceSystem}:${sourceRecordId}`;
  const existing = existingRecords.get(existingKey);

  // Transform row
  let transformed: Record<string, unknown> | null = null;
  switch (entityType) {
    case "appointments":
      transformed = transformAppointmentRow(mapped, messages, lookups);
      break;
    case "customers":
      transformed = transformCustomerRow(mapped, messages);
      break;
    case "locations":
      transformed = transformLocationRow(mapped, messages, lookups);
      break;
    case "interpreters":
      transformed = transformInterpreterRow(mapped, messages);
      break;
  }

  // Check for blocking errors
  const hasBlocking = messages.some((m) => m.level === "blocking");
  if (hasBlocking || !transformed) {
    return {
      row_number: rowNum,
      action: "error",
      validation_messages: messages,
      raw_data: row,
      transformed_data: null,
      source_hash: sourceHash,
    };
  }

  // Check for unresolved conflicts (errors that need mapping)
  const hasConflict = messages.some((m) => m.level === "error");
  if (hasConflict) {
    return {
      row_number: rowNum,
      action: "conflict",
      validation_messages: messages,
      raw_data: row,
      transformed_data: transformed,
      source_hash: sourceHash,
      conflict_type: messages.find((m) => m.level === "error")?.field || "unknown",
    };
  }

  // Determine action
  if (existing) {
    if (existing.source_hash === sourceHash) {
      return {
        row_number: rowNum,
        action: "skip",
        validation_messages: [{ level: "info", field: "_hash", message: "Source hash unchanged; skipping" }],
        raw_data: row,
        transformed_data: null,
        source_hash: sourceHash,
        existing_record_id: existing.id,
      };
    }
    // Check protected fields
    if (protectedFields.length > 0 && transformed) {
      for (const pf of protectedFields) {
        if (pf in transformed) {
          messages.push({ level: "warning", field: pf, message: `Protected field "${pf}" excluded from update` });
          delete transformed[pf];
        }
      }
    }
    return {
      row_number: rowNum,
      action: "update",
      validation_messages: messages,
      raw_data: row,
      transformed_data: transformed,
      source_hash: sourceHash,
      existing_record_id: existing.id,
      previous_data: existing.data,
    };
  }

  return {
    row_number: rowNum,
    action: "create",
    validation_messages: messages,
    raw_data: row,
    transformed_data: transformed,
    source_hash: sourceHash,
  };
}

// ─── Existing Records Loader ────────────────────────────────────────────────

async function loadExistingRecords(
  adminClient: any,
  agencyId: string,
  entityType: string,
  sourceSystem: string
): Promise<Map<string, { id: string; source_hash: string; data: Record<string, unknown> }>> {
  const map = new Map<string, { id: string; source_hash: string; data: Record<string, unknown> }>();
  const table = entityType === "interpreters" ? "profiles" : entityType;

  const { data } = await adminClient
    .from(table)
    .select("*")
    .eq("agency_id", agencyId)
    .eq("source_system", sourceSystem)
    .eq("is_deleted", false)
    .not("source_record_id", "is", null);

  if (data) {
    for (const rec of data) {
      const key = `${sourceSystem}:${rec.source_record_id}`;
      map.set(key, { id: rec.id, source_hash: rec.source_hash || "", data: rec });
    }
  }
  return map;
}

// ─── Quality Score ──────────────────────────────────────────────────────────

function computeQualityScore(results: RowResult[]): { score: number; details: Record<string, unknown> } {
  const total = results.length;
  if (total === 0) return { score: 100, details: {} };

  const creates = results.filter((r) => r.action === "create").length;
  const updates = results.filter((r) => r.action === "update").length;
  const skips = results.filter((r) => r.action === "skip").length;
  const errors = results.filter((r) => r.action === "error").length;
  const conflicts = results.filter((r) => r.action === "conflict").length;

  const errorRate = (errors / total) * 100;
  const conflictRate = (conflicts / total) * 100;
  const warningCount = results.reduce(
    (sum, r) => sum + r.validation_messages.filter((m) => m.level === "warning").length,
    0
  );
  const warningRate = (warningCount / (total * 3)) * 100; // Normalize: 3 warnings per row = max

  // Score: start at 100, deduct for issues
  let score = 100;
  score -= errorRate * 2; // Errors heavily penalized
  score -= conflictRate * 1.5;
  score -= Math.min(warningRate, 20); // Cap warning penalty
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    details: {
      total_rows: total,
      creates,
      updates,
      skips,
      errors,
      conflicts,
      warning_count: warningCount,
      error_rate_pct: Math.round(errorRate * 10) / 10,
      conflict_rate_pct: Math.round(conflictRate * 10) / 10,
    },
  };
}

// ─── Dry Run ────────────────────────────────────────────────────────────────

async function dryRun(
  adminClient: any,
  agencyId: string,
  userId: string,
  csvContent: string,
  entityType: string | undefined,
  sourceSystem: string,
  filename: string,
  protectedFields: string[],
  isStaged: boolean
) {
  const { headers, rows } = parseCSV(csvContent);
  if (rows.length === 0) throw new Error("CSV file is empty or has no data rows");

  const detectedType = entityType || detectEntityType(headers);
  if (!detectedType) throw new Error("Could not detect entity type from CSV headers. Please specify entity_type.");

  // Check concurrency
  const { data: canProceed } = await adminClient.rpc("check_import_concurrency", {
    _agency_id: agencyId,
    _entity_type: detectedType,
    _source_system: sourceSystem,
  });
  if (canProceed === false) {
    throw new Error(`An active import already exists for ${detectedType} from ${sourceSystem}. Please wait for it to complete.`);
  }

  // Create batch
  const { data: batch, error: batchErr } = await adminClient
    .from("import_batches")
    .insert({
      agency_id: agencyId,
      uploaded_by: userId,
      entity_type: detectedType,
      source_system: sourceSystem,
      uploaded_filename: filename || "import.csv",
      status: "pending",
      total_rows: rows.length,
      protected_fields: protectedFields,
      is_staged: isStaged,
    })
    .select()
    .single();

  if (batchErr) throw new Error("Failed to create import batch: " + batchErr.message);

  // Transition to validating
  await adminClient.rpc("transition_import_batch", { _batch_id: batch.id, _new_status: "validating" });

  // Load lookups, mapping rules, and existing records
  const [lookups, mappingRules, existingRecords] = await Promise.all([
    loadLookups(adminClient, agencyId),
    loadMappingRules(adminClient, agencyId, detectedType, sourceSystem),
    loadExistingRecords(adminClient, agencyId, detectedType, sourceSystem),
  ]);

  // Process all rows
  const results: RowResult[] = [];
  for (let i = 0; i < rows.length; i++) {
    const result = await processRow(
      rows[i], i + 1, detectedType, agencyId, sourceSystem,
      lookups, mappingRules, existingRecords, protectedFields
    );
    results.push(result);
  }

  // Compute quality
  const { score, details } = computeQualityScore(results);

  // Check thresholds
  const { data: thresholds } = await adminClient
    .from("import_quality_thresholds")
    .select("*")
    .eq("agency_id", agencyId)
    .maybeSingle();

  let thresholdsMet = true;
  const thresholdViolations: string[] = [];
  if (thresholds) {
    if (score < thresholds.min_quality_score) {
      thresholdsMet = false;
      thresholdViolations.push(`Quality score ${score} below minimum ${thresholds.min_quality_score}`);
    }
    const errorPct = ((details as any).error_rate_pct || 0);
    if (errorPct > thresholds.max_error_percent) {
      thresholdsMet = false;
      thresholdViolations.push(`Error rate ${errorPct}% exceeds maximum ${thresholds.max_error_percent}%`);
    }
    if (thresholds.require_zero_blocking_errors) {
      const blockingCount = results.reduce(
        (sum, r) => sum + r.validation_messages.filter((m) => m.level === "blocking").length, 0
      );
      if (blockingCount > 0) {
        thresholdsMet = false;
        thresholdViolations.push(`${blockingCount} blocking errors found (zero required)`);
      }
    }
  }

  // Save batch rows
  const batchRows = results.map((r) => ({
    batch_id: batch.id,
    row_number: r.row_number,
    raw_data: r.raw_data,
    transformed_data: r.transformed_data,
    status: r.action,
    action_taken: null,
    validation_messages: r.validation_messages,
    target_record_id: r.existing_record_id || null,
    previous_data: r.previous_data || null,
    conflict_type: r.conflict_type || null,
  }));

  // Insert in chunks of 500
  for (let i = 0; i < batchRows.length; i += 500) {
    const chunk = batchRows.slice(i, i + 500);
    const { error: rowErr } = await adminClient.from("import_batch_rows").insert(chunk);
    if (rowErr) console.error("Error inserting batch rows:", rowErr.message);
  }

  // Compute summary
  const summary = {
    total: rows.length,
    creates: results.filter((r) => r.action === "create").length,
    updates: results.filter((r) => r.action === "update").length,
    skips: results.filter((r) => r.action === "skip").length,
    errors: results.filter((r) => r.action === "error").length,
    conflicts: results.filter((r) => r.action === "conflict").length,
    auto_fixed: results.reduce(
      (sum, r) => sum + r.validation_messages.filter((m) => m.auto_fixed).length, 0
    ),
  };

  // Transition to ready (or failed if thresholds not met)
  const newStatus = thresholdsMet ? "ready" : "failed";
  await adminClient.rpc("transition_import_batch", { _batch_id: batch.id, _new_status: newStatus });

  // Update batch with summary
  await adminClient.from("import_batches").update({
    dry_run_summary: summary,
    quality_score: score,
    quality_details: { ...details, thresholds_met: thresholdsMet, threshold_violations: thresholdViolations },
    total_chunks: Math.ceil(rows.length / 100),
  }).eq("id", batch.id);

  return {
    batch_id: batch.id,
    entity_type: detectedType,
    status: newStatus,
    summary,
    quality: { score, details, thresholds_met: thresholdsMet, threshold_violations: thresholdViolations },
    headers_detected: headers,
  };
}

async function loadMappingRules(
  adminClient: any,
  agencyId: string,
  entityType: string,
  sourceSystem: string
): Promise<MappingRule[]> {
  const { data } = await adminClient
    .from("import_mapping_rules")
    .select("source_field, source_value, mapped_field, mapped_value")
    .eq("agency_id", agencyId)
    .eq("entity_type", entityType)
    .eq("source_system", sourceSystem)
    .eq("is_reusable", true);

  return data || [];
}

// ─── Execute ────────────────────────────────────────────────────────────────

async function executeImport(
  adminClient: any,
  agencyId: string,
  userId: string,
  batchId: string,
  chunkSize: number,
  startChunk: number = 0
) {
  // Verify batch is ready
  const { data: batch, error: batchErr } = await adminClient
    .from("import_batches")
    .select("*")
    .eq("id", batchId)
    .eq("agency_id", agencyId)
    .single();

  if (batchErr || !batch) throw new Error("Batch not found");
  if (batch.status !== "ready" && batch.status !== "processing") {
    throw new Error(`Batch status is "${batch.status}", expected "ready" or "processing" (for resume)`);
  }

  if (batch.status === "ready") {
    await adminClient.rpc("transition_import_batch", { _batch_id: batchId, _new_status: "processing" });
  }

  const entityType = batch.entity_type;
  const sourceSystem = batch.source_system;
  const isStaged = batch.is_staged;

  // Load lookups for auto-creation
  const lookups = await loadLookups(adminClient, agencyId);

  // Get actionable rows (create or update), ordered by row_number
  const { data: actionRows, error: rowErr } = await adminClient
    .from("import_batch_rows")
    .select("*")
    .eq("batch_id", batchId)
    .in("status", ["create", "update"])
    .order("row_number", { ascending: true });

  if (rowErr) throw new Error("Failed to load batch rows: " + rowErr.message);
  if (!actionRows || actionRows.length === 0) {
    await adminClient.rpc("transition_import_batch", { _batch_id: batchId, _new_status: "completed" });
    await adminClient.from("import_batches").update({
      execution_summary: { total_processed: 0, created: 0, updated: 0, failed: 0 },
      processed_rows: 0,
    }).eq("id", batchId);
    return { batch_id: batchId, status: "completed", summary: { total_processed: 0, created: 0, updated: 0, failed: 0 } };
  }

  // Chunk processing
  const totalChunks = Math.ceil(actionRows.length / chunkSize);
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  const startTime = Date.now();

  for (let chunkIdx = startChunk; chunkIdx < totalChunks; chunkIdx++) {
    const chunkRows = actionRows.slice(chunkIdx * chunkSize, (chunkIdx + 1) * chunkSize);
    const chunkStart = Date.now();

    for (const row of chunkRows) {
      try {
        const transformed = row.transformed_data as Record<string, unknown>;
        if (!transformed) {
          await updateRowStatus(adminClient, row.id, "error", "skipped", "No transformed data");
          totalFailed++;
          continue;
        }

        const table = entityType === "interpreters" ? "profiles" : entityType;
        const sourceRecordId = (row.raw_data as any).source_record_id || (row.raw_data as any).id || `row_${row.row_number}`;

        if (row.status === "create") {
          const record = await createRecord(adminClient, table, agencyId, sourceSystem, sourceRecordId, transformed, isStaged, lookups, entityType);
          if (record) {
            await adminClient.from("import_batch_rows").update({
              status: "completed",
              action_taken: "created",
              target_record_id: record.id,
            }).eq("id", row.id);
            totalCreated++;
          } else {
            await updateRowStatus(adminClient, row.id, "error", "failed", "Insert failed");
            totalFailed++;
          }
        } else if (row.status === "update") {
          const success = await updateRecord(adminClient, table, row.target_record_id, transformed, sourceSystem, sourceRecordId);
          if (success) {
            await adminClient.from("import_batch_rows").update({
              status: "completed",
              action_taken: "updated",
            }).eq("id", row.id);
            totalUpdated++;
          } else {
            await updateRowStatus(adminClient, row.id, "error", "failed", "Update failed");
            totalFailed++;
          }
        }
      } catch (err) {
        console.error(`Row ${row.row_number} failed:`, err);
        await updateRowStatus(adminClient, row.id, "error", "failed", err instanceof Error ? err.message : "Unknown error");
        totalFailed++;
      }
    }

    // Update progress
    const chunkDuration = Date.now() - chunkStart;
    await adminClient.from("import_batches").update({
      current_chunk: chunkIdx + 1,
      total_chunks: totalChunks,
      processed_rows: Math.min((chunkIdx + 1) * chunkSize, actionRows.length),
    }).eq("id", batchId);

    console.log(`Chunk ${chunkIdx + 1}/${totalChunks} completed in ${chunkDuration}ms`);
  }

  const totalDuration = Date.now() - startTime;

  // Finalize
  const executionSummary = {
    total_processed: actionRows.length,
    created: totalCreated,
    updated: totalUpdated,
    failed: totalFailed,
    duration_ms: totalDuration,
    chunks_processed: totalChunks,
  };

  await adminClient.from("import_batches").update({
    execution_summary: executionSummary,
    processed_rows: actionRows.length,
  }).eq("id", batchId);

  await adminClient.rpc("transition_import_batch", {
    _batch_id: batchId,
    _new_status: totalFailed > 0 && totalFailed === actionRows.length ? "failed" : "completed",
  });

  return {
    batch_id: batchId,
    status: totalFailed > 0 && totalFailed === actionRows.length ? "failed" : "completed",
    summary: executionSummary,
  };
}

async function createRecord(
  adminClient: any,
  table: string,
  agencyId: string,
  sourceSystem: string,
  sourceRecordId: string,
  transformed: Record<string, unknown>,
  isStaged: boolean,
  lookups: LookupData,
  entityType: string
): Promise<{ id: string } | null> {
  // Handle pending customer auto-creation
  if (transformed._pending_customer_name) {
    const { data: newCust } = await adminClient
      .from("customers")
      .insert({
        agency_id: agencyId,
        name: transformed._pending_customer_name,
        source_system: sourceSystem,
        is_import_staged: isStaged,
      })
      .select("id")
      .single();
    if (newCust) {
      transformed.customer_id = newCust.id;
      lookups.customers.push({ id: newCust.id, name: transformed._pending_customer_name as string });
    }
    delete transformed._pending_customer_name;
  }

  // Handle pending location auto-creation
  if (transformed._pending_location_name) {
    const rawAddr = (transformed._pending_location_raw as string) || "";
    const parsed = rawAddr ? parseAddress(rawAddr) : { address_line1: "", city: "", state: "", zip_code: "", warnings: [] };
    const { data: newLoc } = await adminClient
      .from("locations")
      .insert({
        agency_id: agencyId,
        name: transformed._pending_location_name,
        address_line1: parsed.address_line1 || null,
        city: parsed.city || null,
        state: parsed.state || null,
        zip_code: parsed.zip_code || null,
        raw_address: rawAddr || null,
        address_parse_warnings: parsed.warnings.length > 0 ? parsed.warnings.join("; ") : null,
        source_system: sourceSystem,
        is_import_staged: isStaged,
        customer_id: transformed.customer_id || null,
      })
      .select("id")
      .single();
    if (newLoc) {
      transformed.location_id = newLoc.id;
      lookups.locations.push({ id: newLoc.id, name: transformed._pending_location_name as string });
    }
    delete transformed._pending_location_name;
    delete transformed._pending_location_raw;
  }

  // Remove internal fields
  const cleanData = { ...transformed };
  Object.keys(cleanData).forEach((k) => { if (k.startsWith("_")) delete cleanData[k]; });

  const insertData: Record<string, unknown> = {
    ...cleanData,
    agency_id: agencyId,
    source_system: sourceSystem,
    source_record_id: sourceRecordId,
    is_import_staged: isStaged,
    is_deleted: false,
  };

  // Compute and store source_hash
  const hashInput: Record<string, string> = {};
  Object.entries(cleanData).forEach(([k, v]) => { hashInput[k] = String(v ?? ""); });
  insertData.source_hash = await generateSourceHash(hashInput);
  insertData.last_imported_at = new Date().toISOString();

  const { data, error } = await adminClient.from(table).insert(insertData).select("id").single();
  if (error) {
    console.error(`Create failed on ${table}:`, error.message);
    return null;
  }
  return data;
}

async function updateRecord(
  adminClient: any,
  table: string,
  recordId: string,
  transformed: Record<string, unknown>,
  sourceSystem: string,
  sourceRecordId: string
): Promise<boolean> {
  const cleanData = { ...transformed };
  Object.keys(cleanData).forEach((k) => { if (k.startsWith("_")) delete cleanData[k]; });

  const hashInput: Record<string, string> = {};
  Object.entries(cleanData).forEach(([k, v]) => { hashInput[k] = String(v ?? ""); });
  const newHash = await generateSourceHash(hashInput);

  const { error } = await adminClient
    .from(table)
    .update({
      ...cleanData,
      source_hash: newHash,
      last_imported_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", recordId);

  if (error) {
    console.error(`Update failed on ${table}/${recordId}:`, error.message);
    return false;
  }
  return true;
}

async function updateRowStatus(
  adminClient: any,
  rowId: string,
  status: string,
  actionTaken: string,
  errorMsg?: string
) {
  const update: Record<string, unknown> = { status, action_taken: actionTaken };
  if (errorMsg) {
    update.validation_messages = [{ level: "blocking", field: "_execution", message: errorMsg }];
  }
  await adminClient.from("import_batch_rows").update(update).eq("id", rowId);
}

// ─── Rollback Handler ───────────────────────────────────────────────────────

async function handleRollback(adminClient: any, agencyId: string, userId: string, batchId: string) {
  const { data: batch } = await adminClient
    .from("import_batches")
    .select("agency_id")
    .eq("id", batchId)
    .eq("agency_id", agencyId)
    .single();

  if (!batch) throw new Error("Batch not found or access denied");

  const { data: result, error } = await adminClient.rpc("rollback_import_batch", {
    _batch_id: batchId,
    _user_id: userId,
  });

  if (error) throw error;
  return result;
}

// ─── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    const { userId, agencyId, roles, adminClient } = await authenticateCaller(req);

    if (!roles.includes("agency_admin")) {
      throw new AuthError("Only agency admins can manage imports", 403);
    }

    const body: ImportRequest = await req.json();
    const { action } = body;

    let result: unknown;

    switch (action) {
      case "dry_run":
        if (!body.csv_content) throw new Error("csv_content is required for dry_run");
        result = await dryRun(
          adminClient, agencyId, userId,
          body.csv_content,
          body.entity_type,
          body.source_system || "codas_plus",
          body.filename || "import.csv",
          body.protected_fields || [],
          body.is_staged ?? true
        );
        break;

      case "execute":
        if (!body.batch_id) throw new Error("batch_id is required for execute");
        result = await executeImport(
          adminClient, agencyId, userId,
          body.batch_id,
          body.chunk_size || 100,
          0
        );
        break;

      case "resume":
        if (!body.batch_id) throw new Error("batch_id is required for resume");
        {
          const { data: batch } = await adminClient
            .from("import_batches")
            .select("current_chunk")
            .eq("id", body.batch_id)
            .single();
          result = await executeImport(
            adminClient, agencyId, userId,
            body.batch_id,
            body.chunk_size || 100,
            batch?.current_chunk || 0
          );
        }
        break;

      case "rollback":
        if (!body.batch_id) throw new Error("batch_id is required for rollback");
        result = await handleRollback(adminClient, agencyId, userId, body.batch_id);
        break;

      default:
        throw new Error(`Unknown action: "${action}". Valid actions: dry_run, execute, resume, rollback`);
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return errorResponse(error, req);
  }
});
