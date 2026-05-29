import { getCorsHeaders, authenticateCaller, errorResponse, AuthError } from "../_shared/cors.ts";

const QBO_SANDBOX_BASE = "https://sandbox-quickbooks.api.intuit.com";
const QBO_PROD_BASE = "https://quickbooks.api.intuit.com";
const OAUTH_BASE = "https://oauth.platform.intuit.com/oauth2/v1";

function getQboBase() {
  const env = Deno.env.get("QBO_ENVIRONMENT") || "sandbox";
  return env === "production" ? QBO_PROD_BASE : QBO_SANDBOX_BASE;
}

// ── Token Management ──────────────────────────────────────────────────

async function refreshAccessToken(adminClient: any, connectionId: string, refreshToken: string) {
  const clientId = Deno.env.get("QBO_CLIENT_ID");
  const clientSecret = Deno.env.get("QBO_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("QuickBooks credentials not configured. Add QBO_CLIENT_ID and QBO_CLIENT_SECRET secrets first.");

  const resp = await fetch(`${OAUTH_BASE}/tokens/bearer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    await adminClient.from("qbo_connections").update({
      connection_status: "expired",
      updated_at: new Date().toISOString(),
    }).eq("id", connectionId);
    throw new Error(`Token refresh failed: ${err}`);
  }

  const tokens = await resp.json();
  await adminClient.from("qbo_connections").update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || refreshToken,
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    connection_status: "connected",
    updated_at: new Date().toISOString(),
  }).eq("id", connectionId);

  return tokens.access_token;
}

async function getValidAccessToken(agencyId: string, adminClient: any) {
  const { data: conn } = await adminClient.from("qbo_connections")
    .select("*").eq("agency_id", agencyId).single();

  if (!conn || conn.connection_status === "disconnected") {
    throw new Error("QuickBooks is not connected");
  }

  const expiresAt = new Date(conn.token_expires_at).getTime();
  if (Date.now() > expiresAt - 300000) {
    return {
      token: await refreshAccessToken(adminClient, conn.id, conn.refresh_token),
      conn,
    };
  }
  return { token: conn.access_token, conn };
}

// ── QBO API Helpers ───────────────────────────────────────────────────

async function qboRequest(method: string, path: string, token: string, realmId: string, body?: any) {
  const qboBase = getQboBase();
  const url = `${qboBase}/v3/company/${realmId}${path}${path.includes("?") ? "&" : "?"}minorversion=65`;
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const resp = await fetch(url, opts);
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`QBO API error [${resp.status}]: ${JSON.stringify(data)}`);
  }
  return data;
}

// ── Entity Matching with Persistent Linkage ───────────────────────────

/**
 * Resolve QBO Customer ID for a BlueThread customer.
 * Priority: 1) persisted qbo_customer_id on customers table
 *           2) search QBO by DisplayName
 *           3) create new in QBO
 * Always persists the linkage back to customers table.
 */
async function resolveQboCustomer(
  token: string, realmId: string, 
  customerId: string, customerName: string, 
  namingTemplate: string,
  adminClient: any, agencyId: string
): Promise<string> {
  // 1) Check persisted linkage
  const { data: cust } = await adminClient.from("customers")
    .select("qbo_customer_id").eq("id", customerId).single();
  
  if (cust?.qbo_customer_id) {
    // Verify it still exists in QBO
    try {
      await qboRequest("GET", `/customer/${cust.qbo_customer_id}`, token, realmId);
      return cust.qbo_customer_id;
    } catch {
      // QBO entity deleted; clear linkage and re-create
      await adminClient.from("customers").update({ qbo_customer_id: null }).eq("id", customerId);
    }
  }

  // 2) Search by DisplayName
  const displayName = namingTemplate
    .replace("{customer_name}", customerName)
    .replace("{customer_id}", customerId.slice(0, 8));
  const safeName = displayName.replace(/'/g, "\\'");
  const query = encodeURIComponent(`DisplayName = '${safeName}'`);
  const searchResult = await qboRequest("GET", `/query?query=select * from Customer where ${query}`, token, realmId);

  let qboId: string;
  if (searchResult.QueryResponse?.Customer?.length > 0) {
    qboId = searchResult.QueryResponse.Customer[0].Id;
  } else {
    // 3) Create new
    const created = await qboRequest("POST", "/customer", token, realmId, { DisplayName: displayName });
    qboId = created.Customer.Id;
  }

  // Persist linkage
  await adminClient.from("customers").update({
    qbo_customer_id: qboId,
    qbo_last_synced_at: new Date().toISOString(),
  }).eq("id", customerId);

  return qboId;
}

/**
 * Resolve QBO Vendor ID for an interpreter.
 * Same priority pattern as resolveQboCustomer.
 */
async function resolveQboVendor(
  token: string, realmId: string,
  interpreterId: string, firstName: string, lastName: string,
  namingTemplate: string,
  adminClient: any
): Promise<string> {
  // 1) Check persisted linkage
  const { data: prof } = await adminClient.from("profiles")
    .select("qbo_vendor_id, email").eq("id", interpreterId).single();

  if (prof?.qbo_vendor_id) {
    try {
      await qboRequest("GET", `/vendor/${prof.qbo_vendor_id}`, token, realmId);
      return prof.qbo_vendor_id;
    } catch {
      await adminClient.from("profiles").update({ qbo_vendor_id: null }).eq("id", interpreterId);
    }
  }

  // 2) Search by DisplayName
  const displayName = namingTemplate
    .replace("{first_name}", firstName)
    .replace("{last_name}", lastName)
    .replace("{email}", prof?.email || "");
  const safeName = displayName.replace(/'/g, "\\'");
  const query = encodeURIComponent(`DisplayName = '${safeName}'`);
  const searchResult = await qboRequest("GET", `/query?query=select * from Vendor where ${query}`, token, realmId);

  let qboId: string;
  if (searchResult.QueryResponse?.Vendor?.length > 0) {
    qboId = searchResult.QueryResponse.Vendor[0].Id;
  } else {
    const created = await qboRequest("POST", "/vendor", token, realmId, { DisplayName: displayName });
    qboId = created.Vendor.Id;
  }

  // Persist linkage
  await adminClient.from("profiles").update({
    qbo_vendor_id: qboId,
    qbo_last_synced_at: new Date().toISOString(),
  }).eq("id", interpreterId);

  return qboId;
}

// ── Mapping Validation ────────────────────────────────────────────────

interface ValidatedMapping {
  type: string;
  itemRef: { value: string; name: string } | null;
  incomeAccountRef: { value: string; name: string } | null;
  expenseAccountRef: { value: string; name: string } | null;
}

async function loadAndValidateMappings(agencyId: string, adminClient: any): Promise<{
  mappings: Record<string, ValidatedMapping>;
  warnings: string[];
}> {
  const { data: raw } = await adminClient.from("qbo_item_mappings")
    .select("*").eq("agency_id", agencyId).eq("is_active", true);

  const mappings: Record<string, ValidatedMapping> = {};
  const warnings: string[] = [];

  for (const m of (raw || [])) {
    const vm: ValidatedMapping = {
      type: m.line_item_type,
      itemRef: null,
      incomeAccountRef: null,
      expenseAccountRef: null,
    };

    if (m.qbo_service_item_id && m.qbo_service_item_name) {
      vm.itemRef = { value: m.qbo_service_item_id, name: m.qbo_service_item_name };
    } else if (m.qbo_service_item_name) {
      warnings.push(`Mapping "${m.line_item_type}": service item "${m.qbo_service_item_name}" has no QBO ID. Sync will use name-only reference (may fail).`);
      vm.itemRef = { value: "", name: m.qbo_service_item_name };
    }

    if (m.qbo_income_account_id && m.qbo_income_account_name) {
      vm.incomeAccountRef = { value: m.qbo_income_account_id, name: m.qbo_income_account_name };
    }
    if (m.qbo_expense_account_id && m.qbo_expense_account_name) {
      vm.expenseAccountRef = { value: m.qbo_expense_account_id, name: m.qbo_expense_account_name };
    }

    mappings[m.line_item_type] = vm;
  }

  // Check required mapping: interpreting_base
  if (!mappings["interpreting_base"]) {
    warnings.push('Required mapping "interpreting_base" is missing or inactive.');
  }

  return { mappings, warnings };
}

// ── Billing Engine Type → QBO Mapping Type ────────────────────────────

const BILLING_TO_QBO_TYPE: Record<string, string> = {
  base: "interpreting_base",
  time: "interpreting_base",
  travel_mileage: "mileage",
  travel_time: "travel_time",
  after_hours: "after_hours_premium",
  weekend: "weekend_premium",
  holiday: "holiday_premium",
  same_day: "same_day_premium",
  same_day_fee: "same_day_premium",
  same_day_travel: "same_day_premium",
  overtime: "interpreting_base",
  parking: "mileage",
  cancellation: "cancellation_fee",
  minimum_adjustment: "manual_adjustment",
};

interface LineItem {
  type: string;
  description: string;
  qty: number;
  rate: number;
  amount: number;
}

/**
 * Build line items for QBO sync.
 * 
 * Priority:
 * 1. Pre-calculated billing_breakdown.line_items on the appointment (from billing engine)
 * 2. Fallback: legacy calculation from billing_rates + billing_rules tables
 * 
 * When using billing_breakdown, maps billing engine types to QBO mapping types.
 */
async function buildBillingLineItems(
  appointment: any, agencyId: string, adminClient: any
): Promise<LineItem[]> {
  // ── 1. Prefer pre-calculated billing_breakdown ──────────────────
  const breakdown = appointment.billing_breakdown;
  if (breakdown && typeof breakdown === "object" && Array.isArray(breakdown.line_items) && breakdown.line_items.length > 0) {
    return breakdown.line_items.map((li: any) => ({
      type: BILLING_TO_QBO_TYPE[li.type] || "manual_adjustment",
      description: li.description || "Service",
      qty: Number(li.quantity ?? li.qty ?? 1),
      rate: Number(li.unit_price ?? li.rate ?? 0),
      amount: Number(li.amount ?? 0),
    }));
  }

  // ── 2. Fallback: legacy inline calculation ──────────────────────
  const items: LineItem[] = [];
  const start = new Date(appointment.actual_start || appointment.scheduled_start);
  const end = new Date(appointment.actual_end || appointment.scheduled_end || start);
  const rawHours = (end.getTime() - start.getTime()) / 3600000;

  // Fetch applicable billing rate (customer-specific first, then default)
  const { data: rates } = await adminClient.from("billing_rates")
    .select("*").eq("agency_id", agencyId)
    .or(`customer_id.eq.${appointment.customer_id},is_default.eq.true`)
    .order("customer_id", { ascending: false, nullsFirst: false })
    .limit(1);

  const rate = rates?.[0];
  const hourlyRate = rate?.hourly_rate ?? 50;
  const minHours = rate?.minimum_hours ?? 1;
  const overtimeAfter = rate?.overtime_after_hours ?? 8;
  const overtimeMultiplier = rate?.overtime_multiplier ?? 1.5;
  const travelRatePerMile = rate?.travel_rate_per_mile ?? 0;
  const travelTimeRate = rate?.travel_time_rate ?? 0;
  const afterHoursMultiplier = rate?.after_hours_multiplier ?? 1.5;
  const weekendMultiplier = rate?.weekend_multiplier ?? 1.5;
  const cancellationWindowHours = rate?.cancellation_window_hours ?? 24;
  const cancellationFeePercent = rate?.cancellation_fee_percent ?? 100;
  const minimumCharge = rate?.minimum_charge ?? 0;
  const baseRate = rate?.base_rate ?? 0;
  const billingModel = rate?.billing_model ?? "hourly";

  const hours = Math.max(minHours, Math.round(rawHours * 4) / 4);

  // Handle cancellation/no-show
  if (appointment.status === "cancelled") {
    let feePercent = cancellationFeePercent;
    if (appointment.cancelled_at && appointment.scheduled_start) {
      const cancelledAt = new Date(appointment.cancelled_at).getTime();
      const scheduledAt = new Date(appointment.scheduled_start).getTime();
      const hoursBeforeAppt = (scheduledAt - cancelledAt) / 3600000;
      if (hoursBeforeAppt > cancellationWindowHours) {
        feePercent = 0;
      }
    }
    if (feePercent > 0) {
      const feeBase = billingModel === "per_appointment" ? baseRate : minHours * hourlyRate;
      const feeAmount = Math.round(feeBase * (feePercent / 100) * 100) / 100;
      items.push({ type: "cancellation_fee", description: `Cancellation Fee — ${appointment.title || "Service"}`, qty: 1, rate: feeAmount, amount: feeAmount });
    }
    return items;
  }

  // Late cancel / client no-show: billed at full scheduled duration
  if (appointment.status === "late_cancel_no_show_client") {
    const scheduledHours = Math.max(minHours, Math.round(rawHours * 4) / 4);
    const chargeRate = billingModel === "per_appointment" ? baseRate : hourlyRate;
    const chargeQty = billingModel === "per_appointment" ? 1 : scheduledHours;
    const amount = Math.round(chargeQty * chargeRate * 100) / 100;
    items.push({ type: "late_cancel_full_charge", description: `Late Cancel / No-Show (full scheduled duration) — ${appointment.title || "Service"}`, qty: chargeQty, rate: chargeRate, amount });
    return items;
  }

  // Base charge depending on billing model
  switch (billingModel) {
    case "per_appointment":
    case "flat":
      items.push({ type: "interpreting_base", description: `${billingModel === "flat" ? "Flat" : "Per-appointment"} rate — ${appointment.title || "Service"}`, qty: 1, rate: baseRate, amount: baseRate });
      break;
    case "hourly":
    default: {
      const regularHours = Math.min(hours, overtimeAfter);
      const overtimeHours = Math.max(0, hours - overtimeAfter);
      items.push({ type: "interpreting_base", description: `Interpreting — ${appointment.title || "Service"}`, qty: regularHours, rate: hourlyRate, amount: Math.round(regularHours * hourlyRate * 100) / 100 });
      if (overtimeHours > 0) {
        const otRate = hourlyRate * overtimeMultiplier;
        items.push({ type: "interpreting_base", description: `Overtime (${overtimeMultiplier}x) — ${appointment.title || "Service"}`, qty: overtimeHours, rate: otRate, amount: Math.round(overtimeHours * otRate * 100) / 100 });
      }
      break;
    }
  }

  // After-hours premium (time-based check)
  const startHour = start.getHours();
  if ((startHour < 8 || startHour >= 18) && afterHoursMultiplier > 1) {
    const premiumBase = items.reduce((s, i) => s + i.amount, 0);
    const premium = Math.round(premiumBase * (afterHoursMultiplier - 1) * 100) / 100;
    if (premium > 0) {
      items.push({ type: "after_hours_premium", description: `After-hours premium (${afterHoursMultiplier}x)`, qty: 1, rate: premium, amount: premium });
    }
  }

  // Weekend premium
  const dayOfWeek = start.getDay();
  if ((dayOfWeek === 0 || dayOfWeek === 6) && weekendMultiplier > 1) {
    const premiumBase = items.filter(i => i.type === "interpreting_base").reduce((s, i) => s + i.amount, 0);
    const premium = Math.round(premiumBase * (weekendMultiplier - 1) * 100) / 100;
    if (premium > 0) {
      items.push({ type: "weekend_premium", description: `Weekend premium (${weekendMultiplier}x)`, qty: 1, rate: premium, amount: premium });
    }
  }

  // Fetch billing rules for additional premiums
  const { data: rules } = await adminClient.from("billing_rules")
    .select("*").eq("agency_id", agencyId).eq("is_active", true).order("priority");

  for (const rule of (rules || [])) {
    const triggered = evaluateRule(rule, appointment, start);
    if (!triggered) continue;

    if (rule.modifier_type === "multiplier") {
      const regularHours = Math.min(hours, overtimeAfter);
      const premium = (regularHours * hourlyRate * (rule.modifier_value - 1));
      if (premium > 0) {
        items.push({ type: mapRuleType(rule.rule_type), description: `${rule.name} (${rule.modifier_value}x)`, qty: regularHours, rate: Math.round((hourlyRate * (rule.modifier_value - 1)) * 100) / 100, amount: Math.round(premium * 100) / 100 });
      }
    } else if (rule.modifier_type === "flat_fee") {
      items.push({ type: mapRuleType(rule.rule_type), description: rule.name, qty: 1, rate: rule.modifier_value, amount: rule.modifier_value });
    }
  }

  // Travel / mileage / parking
  const cf = appointment.custom_fields as any;
  if (cf?.mileage && travelRatePerMile > 0) {
    const mileageAmt = Math.round(cf.mileage * travelRatePerMile * 100) / 100;
    items.push({ type: "mileage", description: `Mileage — ${cf.mileage} miles`, qty: cf.mileage, rate: travelRatePerMile, amount: mileageAmt });
  }
  if (cf?.travel_hours && cf.travel_hours > 0 && travelTimeRate > 0) {
    const travelAmt = Math.round(cf.travel_hours * travelTimeRate * 100) / 100;
    items.push({ type: "travel_time", description: `Travel Time — ${cf.travel_hours}h`, qty: cf.travel_hours, rate: travelTimeRate, amount: travelAmt });
  }
  if (appointment.parking_cost && Number(appointment.parking_cost) > 0) {
    items.push({ type: "mileage", description: "Parking", qty: 1, rate: Number(appointment.parking_cost), amount: Number(appointment.parking_cost) });
  }

  // Manual adjustments from custom_fields
  if (cf?.manual_adjustment && Number(cf.manual_adjustment) !== 0) {
    items.push({ type: "manual_adjustment", description: cf.adjustment_note || "Manual Adjustment", qty: 1, rate: Number(cf.manual_adjustment), amount: Number(cf.manual_adjustment) });
  }

  // Minimum charge adjustment
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  if (minimumCharge > 0 && subtotal < minimumCharge) {
    const adj = Math.round((minimumCharge - subtotal) * 100) / 100;
    items.push({ type: "manual_adjustment", description: "Minimum charge adjustment", qty: 1, rate: adj, amount: adj });
  }

  return items;
}

function evaluateRule(rule: any, appointment: any, startTime: Date): boolean {
  const config = rule.trigger_config || {};
  switch (rule.rule_type) {
    case "after_hours": {
      const hour = startTime.getHours();
      const afterStart = config.start_hour ?? 18;
      const afterEnd = config.end_hour ?? 6;
      return hour >= afterStart || hour < afterEnd;
    }
    case "weekend": {
      const day = startTime.getDay();
      return day === 0 || day === 6;
    }
    case "holiday": {
      const dateStr = startTime.toISOString().split("T")[0];
      const holidays = config.dates || [];
      return holidays.includes(dateStr);
    }
    case "last_minute": {
      if (!appointment.created_at || !appointment.scheduled_start) return false;
      const created = new Date(appointment.created_at).getTime();
      const scheduled = new Date(appointment.scheduled_start).getTime();
      const hoursNotice = (scheduled - created) / 3600000;
      return hoursNotice < (config.threshold_hours ?? 24);
    }
    case "language": {
      return config.language_id === appointment.language_id;
    }
    default:
      return false;
  }
}

function mapRuleType(ruleType: string): string {
  const map: Record<string, string> = {
    after_hours: "after_hours_premium",
    weekend: "weekend_premium",
    holiday: "holiday_premium",
    last_minute: "rush_surcharge",
    language: "interpreting_base",
  };
  return map[ruleType] || "manual_adjustment";
}

// ── Main Router ───────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    const url = new URL(req.url);
    // Support both path-based (/qbo-auth/callback) and query-param (?action=callback)
    const pathAction = url.pathname.split("/").pop();
    const action = (pathAction && pathAction !== "qbo-auth") ? pathAction : (url.searchParams.get("action") || pathAction);

    if (action === "callback" && req.method === "GET") {
      return handleCallback(url);
    }

    const { userId, agencyId, roles, adminClient } = await authenticateCaller(req);
    if (!roles.includes("agency_admin")) {
      throw new AuthError("Only agency admins can manage QuickBooks integration", 403);
    }

    const body = req.method === "POST" ? await req.json() : {};

    switch (action) {
      case "initiate": return handleInitiate(agencyId, adminClient, corsHeaders);
      case "disconnect": return handleDisconnect(agencyId, userId, adminClient, corsHeaders);
      case "status": return handleStatus(agencyId, adminClient, corsHeaders);
      case "update-settings": return handleUpdateSettings(agencyId, body, adminClient, corsHeaders);
      case "sync-appointment": return handleSyncAppointment(agencyId, body, adminClient, corsHeaders);
      case "bulk-sync": return handleBulkSync(agencyId, body, adminClient, corsHeaders);
      case "bulk-sync-status": return handleBulkSyncStatus(agencyId, body, adminClient, corsHeaders);
      case "bulk-sync-continue": return handleBulkSyncContinue(agencyId, body, adminClient, corsHeaders);
      case "retry-failed": return handleRetryFailed(agencyId, body, adminClient, corsHeaders);
      case "fetch-qbo-items": return handleFetchQboItems(agencyId, adminClient, corsHeaders);
      case "reconcile": return handleReconcile(agencyId, adminClient, corsHeaders);
      case "validate-mappings": return handleValidateMappings(agencyId, adminClient, corsHeaders);
      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    return errorResponse(error, req);
  }
});

// ── OAuth ─────────────────────────────────────────────────────────────

async function handleInitiate(agencyId: string, adminClient: any, corsHeaders: Record<string, string>) {
  const clientId = Deno.env.get("QBO_CLIENT_ID");
  const redirectUri = Deno.env.get("QBO_REDIRECT_URI");
  if (!clientId || !redirectUri) {
    throw new Error("QuickBooks credentials are not configured yet. Please add QBO_CLIENT_ID and QBO_REDIRECT_URI secrets to enable OAuth.");
  }

  const state = btoa(JSON.stringify({ agencyId, ts: Date.now() }));
  const authUrl = new URL("https://appcenter.intuit.com/connect/oauth2");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "com.intuit.quickbooks.accounting");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  return new Response(JSON.stringify({ authUrl: authUrl.toString(), state }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleCallback(url: URL) {
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const appBaseUrl = Deno.env.get("APP_BASE_URL") || "https://app.bluethreadsolution.com";

  if (error) return Response.redirect(`${appBaseUrl}/settings?qbo_error=${encodeURIComponent(error)}`, 302);
  if (!code || !realmId || !state) return Response.redirect(`${appBaseUrl}/settings?qbo_error=missing_params`, 302);

  let parsed: any;
  try { parsed = JSON.parse(atob(state)); } catch {
    return Response.redirect(`${appBaseUrl}/settings?qbo_error=invalid_state`, 302);
  }

  // ── Platform-scoped callback → handle separately ──────────────
  if (parsed.scope === "platform") {
    return handlePlatformCallback(code, realmId, appBaseUrl);
  }

  // ── Agency-scoped callback (original flow) ────────────────────
  const agencyId = parsed.agencyId;
  if (!agencyId) return Response.redirect(`${appBaseUrl}/settings?qbo_error=invalid_state`, 302);

  const clientId = Deno.env.get("QBO_CLIENT_ID")!;
  const clientSecret = Deno.env.get("QBO_CLIENT_SECRET")!;
  const redirectUri = Deno.env.get("QBO_REDIRECT_URI")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const tokenResp = await fetch(`${OAUTH_BASE}/tokens/bearer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });

  if (!tokenResp.ok) {
    console.error("Token exchange failed:", await tokenResp.text());
    return Response.redirect(`${appBaseUrl}/settings?qbo_error=token_exchange_failed`, 302);
  }

  const tokens = await tokenResp.json();
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const adminClient = createClient(supabaseUrl, serviceKey);

  let companyName = "Unknown Company";
  try {
    const companyResp = await fetch(
      `${getQboBase()}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`,
      { headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" } }
    );
    if (companyResp.ok) {
      const companyData = await companyResp.json();
      companyName = companyData.CompanyInfo?.CompanyName || "Unknown Company";
    }
  } catch (e) { console.error("Failed to fetch company info:", e); }

  // Upsert connection — tokens stored server-side only
  await adminClient.from("qbo_connections").upsert({
    agency_id: agencyId,
    realm_id: realmId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    company_name: companyName,
    sync_enabled: true,
    connection_status: "connected",
    integration_mode: "both",
    updated_at: new Date().toISOString(),
  }, { onConflict: "agency_id" });

  // Seed default item mappings (covers both legacy and billing engine types)
  const defaultMappings = [
    "interpreting_base", "travel_time", "mileage", "after_hours_premium",
    "weekend_premium", "holiday_premium", "rush_surcharge",
    "cancellation_fee", "no_show_fee", "manual_adjustment",
  ];
  for (const type of defaultMappings) {
    await adminClient.from("qbo_item_mappings").upsert({
      agency_id: agencyId,
      line_item_type: type,
      qbo_service_item_name: type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    }, { onConflict: "agency_id,line_item_type" });
  }

  return Response.redirect(`${appBaseUrl}/settings?qbo_connected=true`, 302);
}

/**
 * Handle platform-scoped QBO OAuth callback.
 * Stores tokens in platform_qbo_connection (separate from agency qbo_connections).
 */
async function handlePlatformCallback(code: string, realmId: string, appBaseUrl: string) {
  const clientId = Deno.env.get("QBO_CLIENT_ID")!;
  const clientSecret = Deno.env.get("QBO_CLIENT_SECRET")!;
  const redirectUri = Deno.env.get("QBO_REDIRECT_URI")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const tokenResp = await fetch(`${OAUTH_BASE}/tokens/bearer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });

  if (!tokenResp.ok) {
    console.error("Platform QBO token exchange failed:", await tokenResp.text());
    return Response.redirect(`${appBaseUrl}/platform/settings?qbo_error=token_exchange_failed`, 302);
  }

  const tokens = await tokenResp.json();
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const adminClient = createClient(supabaseUrl, serviceKey);

  let companyName = "Unknown Company";
  try {
    const companyResp = await fetch(
      `${getQboBase()}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`,
      { headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" } }
    );
    if (companyResp.ok) {
      const companyData = await companyResp.json();
      companyName = companyData.CompanyInfo?.CompanyName || "Unknown Company";
    }
  } catch (e) { console.error("Failed to fetch company info:", e); }

  // Clear existing platform connection and insert new
  await adminClient.from("platform_qbo_connection").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await adminClient.from("platform_qbo_connection").insert({
    realm_id: realmId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    company_name: companyName,
    connection_status: "connected",
  });

  return Response.redirect(`${appBaseUrl}/platform/settings?qbo_connected=true`, 302);
}

// ── Status / Settings ─────────────────────────────────────────────────

async function handleDisconnect(agencyId: string, userId: string, adminClient: any, corsHeaders: Record<string, string>) {
  // Capture current state before clearing
  const { data: prevConn } = await adminClient.from("qbo_connections")
    .select("realm_id, company_name, connection_status")
    .eq("agency_id", agencyId).maybeSingle();

  await adminClient.from("qbo_connections").update({
    access_token: null, refresh_token: null, token_expires_at: null,
    realm_id: null, company_name: null,
    connection_status: "disconnected", sync_enabled: false,
    updated_at: new Date().toISOString(),
  }).eq("agency_id", agencyId);

  // Log to appointment_history as an audit entry
  await adminClient.from("appointment_history").insert({
    agency_id: agencyId,
    changed_by: userId,
    action: "QBO_DISCONNECT",
    old_data: prevConn ? { realm_id: prevConn.realm_id, company_name: prevConn.company_name, connection_status: prevConn.connection_status } : null,
    new_data: { connection_status: "disconnected" },
    changed_fields: ["qbo_connection_status"],
  });

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleStatus(agencyId: string, adminClient: any, corsHeaders: Record<string, string>) {
  const { data } = await adminClient.from("qbo_connections")
    .select("id, realm_id, company_name, sync_enabled, integration_mode, connection_status, auto_sync_on_completed, auto_sync_on_validated, require_manual_approval, default_customer_naming, default_vendor_naming, last_sync_at, token_expires_at, created_at, updated_at")
    .eq("agency_id", agencyId).maybeSingle();

  return new Response(JSON.stringify({ connection: data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleUpdateSettings(agencyId: string, body: any, adminClient: any, corsHeaders: Record<string, string>) {
  const allowedFields = [
    "integration_mode", "auto_sync_on_completed", "auto_sync_on_validated",
    "require_manual_approval", "default_customer_naming", "default_vendor_naming", "sync_enabled",
  ];
  const updates: any = { updated_at: new Date().toISOString() };
  for (const field of allowedFields) {
    if (body[field] !== undefined) updates[field] = body[field];
  }
  const { error } = await adminClient.from("qbo_connections").update(updates).eq("agency_id", agencyId);
  if (error) throw error;

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Sync Single Appointment (Create or Update) ───────────────────────

async function handleSyncAppointment(agencyId: string, body: any, adminClient: any, corsHeaders: Record<string, string>) {
  const { appointmentId } = body;
  if (!appointmentId) throw new Error("appointmentId required");

  const { token, conn } = await getValidAccessToken(agencyId, adminClient);

  // Fetch appointment with joins (including billing breakdown fields)
  const { data: appt, error: apptErr } = await adminClient.from("appointments")
    .select("*, customers(id, name, qbo_customer_id), profiles!appointments_interpreter_id_fkey(id, first_name, last_name, qbo_vendor_id), billed_amount, interpreter_pay_amount, billing_breakdown")
    .eq("id", appointmentId).eq("agency_id", agencyId).single();

  if (apptErr || !appt) throw new Error("Appointment not found");

  // Validate mappings before sync
  const { mappings, warnings: mappingWarnings } = await loadAndValidateMappings(agencyId, adminClient);

  // Determine if this is create or update
  const isUpdate = !!appt.qbo_invoice_id && appt.qbo_sync_status === "synced";
  const action = isUpdate ? "update" : "create";

  // Create sync log entry
  const { data: logEntry } = await adminClient.from("qbo_sync_log").insert({
    agency_id: agencyId,
    appointment_id: appointmentId,
    entity_type: "appointment",
    qbo_object_type: "Invoice+Bill",
    action,
    status: "pending",
  }).select("id").single();

  try {
    await adminClient.from("appointments").update({ qbo_sync_status: "pending" }).eq("id", appointmentId);

    // Resolve QBO Customer (with persistent linkage)
    const customerName = appt.customers?.name || "Unknown Customer";
    const customerId = appt.customer_id;
    let qboCustomerId: string;
    if (customerId) {
      qboCustomerId = await resolveQboCustomer(
        token, conn.realm_id, customerId, customerName,
        conn.default_customer_naming || "{customer_name}",
        adminClient, agencyId
      );
    } else {
      // No customer; use generic
      qboCustomerId = await resolveQboCustomer(
        token, conn.realm_id, "generic", "Unknown Customer",
        "{customer_name}", adminClient, agencyId
      );
    }

    // Build billing-driven line items
    const lineItems = await buildBillingLineItems(appt, agencyId, adminClient);

    // Build invoice lines with validated QBO item references
    const invoiceLines = lineItems.map((li) => {
      const mapping = mappings[li.type];
      const salesItemLine: any = {
        DetailType: "SalesItemLineDetail",
        Amount: li.amount,
        Description: li.description,
        SalesItemLineDetail: {
          Qty: li.qty,
          UnitPrice: li.rate,
        },
      };
      // Use mapped QBO item reference if available
      if (mapping?.itemRef) {
        salesItemLine.SalesItemLineDetail.ItemRef = mapping.itemRef.value
          ? { value: mapping.itemRef.value, name: mapping.itemRef.name }
          : { name: mapping.itemRef.name };
      }
      if (mapping?.incomeAccountRef) {
        salesItemLine.SalesItemLineDetail.IncomeAccountRef = mapping.incomeAccountRef;
      }
      return salesItemLine;
    });

    const txnDate = (appt.actual_start || appt.scheduled_start || new Date().toISOString()).split("T")[0];
    const docNumber = `BT-${appointmentId.slice(0, 8)}`;

    let invoice: any;
    if (isUpdate && appt.qbo_invoice_id) {
      // Fetch current invoice to get SyncToken for update
      const existing = await qboRequest("GET", `/invoice/${appt.qbo_invoice_id}`, token, conn.realm_id);
      invoice = await qboRequest("POST", "/invoice", token, conn.realm_id, {
        Id: appt.qbo_invoice_id,
        SyncToken: existing.Invoice.SyncToken,
        CustomerRef: { value: qboCustomerId },
        Line: invoiceLines,
        DocNumber: docNumber,
        TxnDate: txnDate,
        sparse: true,
      });
    } else {
      invoice = await qboRequest("POST", "/invoice", token, conn.realm_id, {
        CustomerRef: { value: qboCustomerId },
        Line: invoiceLines,
        DocNumber: docNumber,
        TxnDate: txnDate,
      });
    }

    let qboBillId = appt.qbo_bill_id || null;
    let qboVendorId = appt.qbo_vendor_id || null;

    // Create/update Bill if interpreter assigned
    if (appt.profiles?.first_name && appt.interpreter_id) {
      qboVendorId = await resolveQboVendor(
        token, conn.realm_id, appt.interpreter_id,
        appt.profiles.first_name, appt.profiles.last_name,
        conn.default_vendor_naming || "{first_name} {last_name}",
        adminClient
      );

      const billLines = lineItems.map((li) => {
        const mapping = mappings[li.type];
        const line: any = {
          DetailType: "AccountBasedExpenseLineDetail",
          Amount: li.amount,
          Description: li.description,
          AccountBasedExpenseLineDetail: {},
        };
        if (mapping?.expenseAccountRef) {
          line.AccountBasedExpenseLineDetail.AccountRef = mapping.expenseAccountRef;
        } else {
          // Fallback — will require admin to configure
          line.AccountBasedExpenseLineDetail.AccountRef = { name: "Interpreting Expense" };
        }
        return line;
      });

      if (isUpdate && qboBillId) {
        const existingBill = await qboRequest("GET", `/bill/${qboBillId}`, token, conn.realm_id);
        const bill = await qboRequest("POST", "/bill", token, conn.realm_id, {
          Id: qboBillId,
          SyncToken: existingBill.Bill.SyncToken,
          VendorRef: { value: qboVendorId },
          Line: billLines,
          DocNumber: `BT-BILL-${appointmentId.slice(0, 8)}`,
          TxnDate: txnDate,
          sparse: true,
        });
        qboBillId = bill.Bill.Id;
      } else {
        const bill = await qboRequest("POST", "/bill", token, conn.realm_id, {
          VendorRef: { value: qboVendorId },
          Line: billLines,
          DocNumber: `BT-BILL-${appointmentId.slice(0, 8)}`,
          TxnDate: txnDate,
        });
        qboBillId = bill.Bill.Id;
      }
    }

    // Compute totals from line items for storage
    const invoiceTotal = lineItems.reduce((s, li) => s + li.amount, 0);

    // Update appointment with QBO IDs and billed amounts
    await adminClient.from("appointments").update({
      qbo_invoice_id: invoice.Invoice.Id,
      qbo_bill_id: qboBillId,
      qbo_customer_id: qboCustomerId,
      qbo_vendor_id: qboVendorId,
      qbo_sync_status: "synced",
      qbo_last_synced_at: new Date().toISOString(),
      billed_amount: appt.billed_amount || invoiceTotal,
      interpreter_pay_amount: appt.interpreter_pay_amount || invoiceTotal,
      billing_breakdown: appt.billing_breakdown && Object.keys(appt.billing_breakdown).length > 0
        ? appt.billing_breakdown
        : { line_items: lineItems, total: invoiceTotal, source: "qbo_sync_fallback" },
    }).eq("id", appointmentId);

    // Update sync log with full details
    const bb = appt.billing_breakdown as Record<string, unknown> | null;
    const billingSource = (bb && Array.isArray((bb as any).line_items) && ((bb as any).line_items).length > 0) 
      ? "billing_engine" : "legacy_fallback";
    await adminClient.from("qbo_sync_log").update({
      status: "success",
      qbo_invoice_id: invoice.Invoice.Id,
      qbo_bill_id: qboBillId,
      qbo_customer_id: qboCustomerId,
      qbo_vendor_id: qboVendorId,
      completed_at: new Date().toISOString(),
      request_payload: {
        billing_source: billingSource,
        line_item_count: lineItems.length,
        invoice_total: lineItems.reduce((s: number, li: LineItem) => s + li.amount, 0),
        line_item_types: lineItems.map((li: LineItem) => li.type),
      },
    }).eq("id", logEntry?.id);

    await adminClient.from("qbo_connections").update({
      last_sync_at: new Date().toISOString(),
    }).eq("agency_id", agencyId);

    return new Response(JSON.stringify({
      success: true,
      action,
      qbo_invoice_id: invoice.Invoice.Id,
      qbo_bill_id: qboBillId,
      mapping_warnings: mappingWarnings,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    await adminClient.from("qbo_sync_log").update({
      status: "failed",
      error_details: error.message,
      completed_at: new Date().toISOString(),
    }).eq("id", logEntry?.id);

    await adminClient.from("appointments").update({ qbo_sync_status: "error" }).eq("id", appointmentId);
    throw error;
  }
}

// ── Bulk Sync (Cursor-Based, No Hard Limit) ──────────────────────────

const BULK_BATCH_SIZE = 200;
const RATE_LIMIT_DELAY_MS = 250; // ~4 QBO API calls/sec max per entity

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Start a bulk sync job. Counts total eligible records, creates a job,
 * processes the first batch, then returns the job ID for continuation.
 */
async function handleBulkSync(agencyId: string, body: any, adminClient: any, corsHeaders: Record<string, string>) {
  const { dateFrom, dateTo, batchSize } = body;
  const size = Math.min(batchSize || BULK_BATCH_SIZE, 500);

  // Count total eligible records (no limit)
  const { count: totalCount } = await adminClient.from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agencyId)
    .eq("is_deleted", false).eq("is_import_staged", false)
    .in("status", ["completed", "completed_last_minute", "late_cancel_no_show_client"])
    .in("qbo_sync_status", ["unsynced", "error"])
    .gte("scheduled_start", dateFrom || "1970-01-01")
    .lte("scheduled_start", dateTo || "2099-12-31");

  const total = totalCount || 0;
  if (total === 0) {
    return new Response(JSON.stringify({ jobId: null, total: 0, message: "No records to sync" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate mappings once
  const { warnings: mappingWarnings } = await loadAndValidateMappings(agencyId, adminClient);

  // Create sync job
  const { data: job } = await adminClient.from("qbo_sync_jobs").insert({
    agency_id: agencyId,
    status: "running",
    date_from: dateFrom || null,
    date_to: dateTo || null,
    total_records: total,
    batch_size: size,
    cursor_position: null,
    mapping_warnings: mappingWarnings,
    started_at: new Date().toISOString(),
  }).select("id").single();

  // Process first batch inline
  const result = await processBatch(agencyId, job.id, size, adminClient);

  return new Response(JSON.stringify({
    jobId: job.id,
    total,
    ...result,
    mapping_warnings: mappingWarnings,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/**
 * Continue processing a bulk sync job from its cursor position.
 */
async function handleBulkSyncContinue(agencyId: string, body: any, adminClient: any, corsHeaders: Record<string, string>) {
  const { jobId } = body;
  if (!jobId) throw new Error("jobId required");

  const { data: job } = await adminClient.from("qbo_sync_jobs")
    .select("*").eq("id", jobId).eq("agency_id", agencyId).single();

  if (!job) throw new Error("Sync job not found");
  if (job.status === "completed" || job.status === "cancelled") {
    return new Response(JSON.stringify({ done: true, ...job }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Resume
  await adminClient.from("qbo_sync_jobs").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", jobId);
  const result = await processBatch(agencyId, jobId, job.batch_size, adminClient);

  return new Response(JSON.stringify({ jobId, ...result }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Get current status of a bulk sync job.
 */
async function handleBulkSyncStatus(agencyId: string, body: any, adminClient: any, corsHeaders: Record<string, string>) {
  const { jobId } = body;
  if (!jobId) throw new Error("jobId required");

  const { data: job } = await adminClient.from("qbo_sync_jobs")
    .select("*").eq("id", jobId).eq("agency_id", agencyId).single();

  if (!job) throw new Error("Sync job not found");

  return new Response(JSON.stringify(job), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Process one batch of records from cursor position.
 * Updates job state after completion.
 */
async function processBatch(
  agencyId: string, jobId: string, batchSize: number, adminClient: any
): Promise<{ synced: number; failed: number; processed: number; done: boolean; errors: any[] }> {
  // Load job cursor
  const { data: job } = await adminClient.from("qbo_sync_jobs")
    .select("cursor_position, date_from, date_to, synced_count, failed_count, processed_records, total_records, errors")
    .eq("id", jobId).single();

  // Fetch next batch using cursor (ordered by created_at for deterministic pagination)
  let query = adminClient.from("appointments")
    .select("id, created_at")
    .eq("agency_id", agencyId)
    .eq("is_deleted", false).eq("is_import_staged", false)
    .in("status", ["completed", "completed_last_minute", "late_cancel_no_show_client"])
    .in("qbo_sync_status", ["unsynced", "error"])
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(batchSize);

  if (job.date_from) query = query.gte("scheduled_start", job.date_from);
  if (job.date_to) query = query.lte("scheduled_start", job.date_to);
  if (job.cursor_position) query = query.gt("created_at", job.cursor_position);

  const { data: batch } = await query;
  const records = batch || [];

  if (records.length === 0) {
    // All done
    await adminClient.from("qbo_sync_jobs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
    return { synced: 0, failed: 0, processed: 0, done: true, errors: [] };
  }

  let synced = 0, failed = 0;
  const batchErrors: any[] = [];
  let lastCursor = job.cursor_position;

  for (const record of records) {
    try {
      await handleSyncAppointment(agencyId, { appointmentId: record.id }, adminClient);
      synced++;
    } catch (e: any) {
      failed++;
      batchErrors.push({ appointmentId: record.id, error: e.message });
      // Increment retry count on the sync log
      await adminClient.from("qbo_sync_log")
        .update({ retry_count: adminClient.raw("retry_count + 1") })
        .eq("appointment_id", record.id).eq("agency_id", agencyId).eq("status", "failed");
    }
    lastCursor = record.created_at;
    // Rate limiting between records
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  const newProcessed = (job.processed_records || 0) + records.length;
  const newSynced = (job.synced_count || 0) + synced;
  const newFailed = (job.failed_count || 0) + failed;
  const existingErrors = Array.isArray(job.errors) ? job.errors : [];
  const allErrors = [...existingErrors, ...batchErrors].slice(-200); // Keep last 200 errors
  const done = records.length < batchSize;

  await adminClient.from("qbo_sync_jobs").update({
    cursor_position: lastCursor,
    processed_records: newProcessed,
    synced_count: newSynced,
    failed_count: newFailed,
    errors: allErrors,
    status: done ? "completed" : "running",
    completed_at: done ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", jobId);

  return { synced, failed, processed: records.length, done, errors: batchErrors };
}

// ── Retry Failed ──────────────────────────────────────────────────────

async function handleRetryFailed(agencyId: string, body: any, adminClient: any, corsHeaders: Record<string, string>) {
  const { logIds } = body;

  // Get failed logs that haven't exceeded max retries
  const { data: logs } = await adminClient.from("qbo_sync_log")
    .select("id, appointment_id, retry_count, max_retries")
    .eq("agency_id", agencyId).eq("status", "failed")
    .in("id", logIds || []);

  const retryable = (logs || []).filter((l: any) => l.appointment_id && l.retry_count < l.max_retries);

  if (!retryable.length) {
    return new Response(JSON.stringify({ retried: 0, message: "No retryable items" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Reset appointment sync status and increment retry count
  const ids = retryable.map((l: any) => l.appointment_id);
  await adminClient.from("appointments").update({ qbo_sync_status: "unsynced" })
    .eq("agency_id", agencyId).in("id", ids);

  for (const log of retryable) {
    await adminClient.from("qbo_sync_log").update({
      status: "retrying",
      retry_count: log.retry_count + 1,
    }).eq("id", log.id);
  }

  // Process retries individually with rate limiting
  let synced = 0, failed = 0;
  const errors: any[] = [];
  for (const id of ids) {
    try {
      await handleSyncAppointment(agencyId, { appointmentId: id }, adminClient, corsHeaders);
      synced++;
    } catch (e: any) {
      failed++;
      errors.push({ appointmentId: id, error: e.message });
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  return new Response(JSON.stringify({ synced, failed, total: ids.length, errors: errors.slice(0, 50) }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Fetch QBO Items/Accounts ──────────────────────────────────────────

async function handleFetchQboItems(agencyId: string, adminClient: any, corsHeaders: Record<string, string>) {
  try {
    const { token, conn } = await getValidAccessToken(agencyId, adminClient);
    const items = await qboRequest("GET", "/query?query=select * from Item MAXRESULTS 100", token, conn.realm_id);
    const accounts = await qboRequest("GET", "/query?query=select * from Account where AccountType in ('Income', 'Expense') MAXRESULTS 200", token, conn.realm_id);

    return new Response(JSON.stringify({
      items: items.QueryResponse?.Item || [],
      accounts: accounts.QueryResponse?.Account || [],
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ items: [], accounts: [], error: e.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

// ── Validate Mappings ─────────────────────────────────────────────────

async function handleValidateMappings(agencyId: string, adminClient: any, corsHeaders: Record<string, string>) {
  const { mappings, warnings } = await loadAndValidateMappings(agencyId, adminClient);
  const valid = warnings.length === 0 && Object.keys(mappings).length > 0;

  return new Response(JSON.stringify({
    valid,
    warnings,
    mapping_count: Object.keys(mappings).length,
    has_item_ids: Object.values(mappings).filter(m => m.itemRef?.value).length,
    missing_item_ids: Object.values(mappings).filter(m => m.itemRef && !m.itemRef.value).length,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ── Reconcile ─────────────────────────────────────────────────────────

async function handleReconcile(agencyId: string, adminClient: any, corsHeaders: Record<string, string>) {
  const { data: syncedAppts } = await adminClient.from("appointments")
    .select("id, qbo_invoice_id, qbo_bill_id, qbo_last_synced_at, title, status, updated_at")
    .eq("agency_id", agencyId).eq("qbo_sync_status", "synced").not("qbo_invoice_id", "is", null);

  const issues: any[] = [];
  const staleAppts: any[] = [];

  if (syncedAppts?.length) {
    try {
      const { token, conn } = await getValidAccessToken(agencyId, adminClient);

      for (const appt of syncedAppts.slice(0, 50)) {
        // Check if appointment was modified after last sync
        if (appt.qbo_last_synced_at && new Date(appt.updated_at) > new Date(appt.qbo_last_synced_at)) {
          staleAppts.push({ id: appt.id, title: appt.title, reason: "Modified after last sync" });
        }

        try {
          await qboRequest("GET", `/invoice/${appt.qbo_invoice_id}`, token, conn.realm_id);
        } catch {
          issues.push({
            appointmentId: appt.id, title: appt.title,
            issue: "Invoice not found in QuickBooks",
            qbo_invoice_id: appt.qbo_invoice_id,
          });
        }
      }
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message, issues: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const { data: unsyncedAppts } = await adminClient.from("appointments")
    .select("id, title, status")
    .eq("agency_id", agencyId).eq("is_deleted", false)
    .in("status", ["completed", "completed_last_minute", "late_cancel_no_show_client"]).eq("qbo_sync_status", "unsynced").limit(100);

  return new Response(JSON.stringify({
    issues,
    stale_appointments: staleAppts,
    unsynced_count: unsyncedAppts?.length || 0,
    synced_checked: syncedAppts?.length || 0,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
