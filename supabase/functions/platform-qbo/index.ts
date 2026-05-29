import { getCorsHeaders, AuthError, errorResponse } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const QBO_SANDBOX_BASE = "https://sandbox-quickbooks.api.intuit.com";
const QBO_PROD_BASE = "https://quickbooks.api.intuit.com";
const OAUTH_BASE = "https://oauth.platform.intuit.com/oauth2/v1";

function getQboBase() {
  const env = Deno.env.get("QBO_ENVIRONMENT") || "sandbox";
  return env === "production" ? QBO_PROD_BASE : QBO_SANDBOX_BASE;
}

function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function authenticatePlatformOwner(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing Authorization header", 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const anonClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error } = await anonClient.auth.getClaims(token);
  if (error || !claimsData?.claims?.sub) throw new AuthError("Invalid token", 401);

  const userId = claimsData.claims.sub as string;
  const adminClient = getAdminClient();

  const { data: role } = await adminClient
    .from("platform_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "platform_owner")
    .maybeSingle();

  if (!role) throw new AuthError("Not a platform owner", 403);

  return { userId, adminClient };
}

// ── Token Management ──────────────────────────────────────────────────

async function refreshPlatformToken(adminClient: any, connId: string, refreshToken: string) {
  const clientId = Deno.env.get("QBO_CLIENT_ID");
  const clientSecret = Deno.env.get("QBO_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("QBO credentials not configured");

  const resp = await fetch(`${OAUTH_BASE}/tokens/bearer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });

  if (!resp.ok) {
    await adminClient.from("platform_qbo_connection").update({
      connection_status: "expired",
    }).eq("id", connId);
    throw new Error("Platform QBO token refresh failed");
  }

  const tokens = await resp.json();
  await adminClient.from("platform_qbo_connection").update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || refreshToken,
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    connection_status: "connected",
  }).eq("id", connId);

  return tokens.access_token;
}

async function getPlatformQboToken(adminClient: any) {
  const { data: conn } = await adminClient
    .from("platform_qbo_connection")
    .select("*")
    .eq("connection_status", "connected")
    .limit(1)
    .maybeSingle();

  if (!conn) throw new Error("Platform QuickBooks is not connected");

  const expiresAt = new Date(conn.token_expires_at).getTime();
  if (Date.now() > expiresAt - 300000) {
    return {
      token: await refreshPlatformToken(adminClient, conn.id, conn.refresh_token),
      conn,
    };
  }
  return { token: conn.access_token, conn };
}

async function qboRequest(method: string, path: string, token: string, realmId: string, body?: any) {
  const url = `${getQboBase()}/v3/company/${realmId}${path}${path.includes("?") ? "&" : "?"}minorversion=65`;
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
  if (!resp.ok) throw new Error(`QBO API error [${resp.status}]: ${JSON.stringify(data)}`);
  return data;
}

// ── OAuth ─────────────────────────────────────────────────────────────

async function handleInitiate(corsHeaders: Record<string, string>) {
  const clientId = Deno.env.get("QBO_CLIENT_ID");
  const redirectUri = Deno.env.get("QBO_REDIRECT_URI");
  if (!clientId || !redirectUri) throw new Error("QBO credentials not configured");

  const state = btoa(JSON.stringify({ scope: "platform", ts: Date.now() }));
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

  if (error) return Response.redirect(`${appBaseUrl}/platform/settings?qbo_error=${encodeURIComponent(error)}`, 302);
  if (!code || !realmId || !state) return Response.redirect(`${appBaseUrl}/platform/settings?qbo_error=missing_params`, 302);

  let parsed: any;
  try { parsed = JSON.parse(atob(state)); } catch {
    return Response.redirect(`${appBaseUrl}/platform/settings?qbo_error=invalid_state`, 302);
  }

  if (parsed.scope !== "platform") {
    return Response.redirect(`${appBaseUrl}/platform/settings?qbo_error=wrong_scope`, 302);
  }

  const clientId = Deno.env.get("QBO_CLIENT_ID")!;
  const clientSecret = Deno.env.get("QBO_CLIENT_SECRET")!;
  const redirectUri = Deno.env.get("QBO_REDIRECT_URI")!;
  const adminClient = getAdminClient();

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

// ── Status / Disconnect ───────────────────────────────────────────────

async function handleStatus(adminClient: any, corsHeaders: Record<string, string>) {
  const { data } = await adminClient
    .from("platform_qbo_connection")
    .select("id, realm_id, company_name, connection_status, last_sync_at, created_at, updated_at")
    .limit(1)
    .maybeSingle();

  return new Response(JSON.stringify({ connection: data || null }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleDisconnect(userId: string, adminClient: any, corsHeaders: Record<string, string>) {
  await adminClient.from("platform_qbo_connection").update({
    access_token: null,
    refresh_token: null,
    token_expires_at: null,
    connection_status: "disconnected",
  }).neq("id", "00000000-0000-0000-0000-000000000000");

  await adminClient.from("platform_audit_log").insert({
    actor_id: userId,
    action: "platform_qbo_disconnect",
    target_type: "platform_qbo_connection",
    details: {},
  });

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Revenue Calculation Helper (mirrors RPC logic) ────────────────────

function calculateMonthRevenue(config: any, usageCount: number, usageFees: number): number {
  const baseFee = Number(config.monthly_base_fee || 0);
  const perAppt = Number(config.per_appointment_fee || 0);
  const included = Number(config.included_appointments || 0);
  const overageRate = Number(config.overage_rate || 0);
  const minFee = Number(config.min_monthly_fee || 0);
  const maxFee = Number(config.max_monthly_fee || 0);
  const model = config.billing_model || "per_appointment";

  let raw: number;
  switch (model) {
    case "flat":
      raw = baseFee;
      break;
    case "per_appointment":
      raw = baseFee + usageCount * perAppt;
      break;
    case "tiered":
      raw = baseFee + Math.max(0, usageCount - included) * overageRate;
      break;
    default:
      raw = usageFees;
  }

  // Apply min/max caps
  if (maxFee > 0 && raw > maxFee) return maxFee;
  if (minFee > 0 && raw < minFee) return minFee;
  return raw;
}

// ── Invoice Generation (with config traceability + min/max) ───────────

async function handleGenerateInvoices(userId: string, body: any, adminClient: any, corsHeaders: Record<string, string>) {
  const billingMonth = body.billing_month;
  if (!billingMonth || !/^\d{4}-\d{2}$/.test(billingMonth)) {
    throw new Error("billing_month is required (YYYY-MM)");
  }

  // Parse month boundaries
  const monthDate = new Date(`${billingMonth}-01T00:00:00Z`);
  const monthEndDate = new Date(monthDate);
  monthEndDate.setMonth(monthEndDate.getMonth() + 1);
  monthEndDate.setDate(monthEndDate.getDate() - 1);
  const monthStartStr = monthDate.toISOString().split("T")[0];
  const monthEndStr = monthEndDate.toISOString().split("T")[0];

  // Get all agencies
  const { data: agencies } = await adminClient
    .from("agencies")
    .select("id, name")
    .eq("agency_status", "active");

  if (!agencies || agencies.length === 0) {
    return new Response(JSON.stringify({ generated: 0, skipped: 0, errors: [], message: "No active agencies" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let generated = 0;
  let skipped = 0;
  const errors: any[] = [];

  for (const agency of agencies) {
    // Check duplicate prevention — allow regeneration if only voided invoices exist
    const { data: existingList } = await adminClient
      .from("platform_invoices")
      .select("id, status")
      .eq("agency_id", agency.id)
      .eq("billing_month", billingMonth);

    const activeExisting = (existingList || []).find((inv: any) => inv.status !== "void");
    if (activeExisting) {
      skipped++;
      errors.push({ agency: agency.name, error: `Invoice already exists (${activeExisting.status})` });
      continue;
    }

    // Find active config for this month
    const { data: configs } = await adminClient
      .from("platform_billing_config")
      .select("*")
      .eq("agency_id", agency.id)
      .eq("is_active", true)
      .lte("effective_start_date", monthEndStr)
      .or(`effective_end_date.is.null,effective_end_date.gte.${monthStartStr}`)
      .order("effective_start_date", { ascending: false })
      .limit(1);

    const config = configs?.[0];
    if (!config) {
      skipped++;
      continue; // No billing config for this agency/month
    }

    try {
      // Get usage for this month
      const { data: usage } = await adminClient
        .from("platform_usage_log")
        .select("fee_amount")
        .eq("agency_id", agency.id)
        .eq("billing_month", billingMonth);

      const usageCount = usage?.length || 0;
      const usageFees = (usage || []).reduce((sum: number, u: any) => sum + Number(u.fee_amount || 0), 0);

      const total = calculateMonthRevenue(config, usageCount, usageFees);
      const baseFee = Number(config.monthly_base_fee || 0);
      const perAppt = Number(config.per_appointment_fee || 0);
      const included = Number(config.included_appointments || 0);
      const overageRate = Number(config.overage_rate || 0);
      const overageCount = Math.max(0, usageCount - included);
      const minFee = Number(config.min_monthly_fee || 0);
      const maxFee = Number(config.max_monthly_fee || 0);

      const invoiceNumber = `BT-${billingMonth.replace("-", "")}-${agency.name.replace(/\s/g, "").slice(0, 6).toUpperCase()}`;

      // Determine if min/max cap was applied
      const rawTotal = config.billing_model === "flat" ? baseFee
        : config.billing_model === "tiered" ? baseFee + overageCount * overageRate
        : baseFee + usageCount * perAppt;
      const capApplied = (maxFee > 0 && rawTotal > maxFee) ? "max_cap"
        : (minFee > 0 && rawTotal < minFee) ? "min_cap" : null;

      const configSnapshot = {
        config_id: config.id,
        billing_model: config.billing_model,
        monthly_base_fee: baseFee,
        per_appointment_fee: perAppt,
        included_appointments: included,
        overage_rate: overageRate,
        min_monthly_fee: minFee,
        max_monthly_fee: maxFee,
        usage_billing_trigger: config.usage_billing_trigger,
        effective_start_date: config.effective_start_date,
        effective_end_date: config.effective_end_date,
        plan_name: config.plan_name,
      };

      const generationDetails = {
        usage_count: usageCount,
        usage_fees: usageFees,
        overage_count: overageCount,
        raw_total: rawTotal,
        cap_applied: capApplied,
        final_total: total,
        generated_at: new Date().toISOString(),
        generated_by: userId,
      };

      // Create invoice
      const { data: invoice, error: invErr } = await adminClient
        .from("platform_invoices")
        .insert({
          agency_id: agency.id,
          invoice_number: invoiceNumber,
          billing_month: billingMonth,
          status: "draft",
          subtotal: total,
          total,
          config_id: config.id,
          config_snapshot: configSnapshot,
          generation_details: generationDetails,
          issued_date: new Date().toISOString().split("T")[0],
          due_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
        })
        .select("id")
        .single();

      if (invErr) throw invErr;

      // Create line items
      const lineItems: any[] = [];
      if (baseFee > 0) {
        lineItems.push({
          invoice_id: invoice.id,
          config_id: config.id,
          line_type: "base_fee",
          description: `Monthly platform base fee — ${billingMonth}`,
          quantity: 1,
          unit_price: baseFee,
          amount: baseFee,
        });
      }

      if (config.billing_model === "per_appointment" && usageCount > 0) {
        lineItems.push({
          invoice_id: invoice.id,
          config_id: config.id,
          line_type: "usage_fee",
          description: `Per-appointment usage fee — ${usageCount} appointments @ $${perAppt}/ea`,
          quantity: usageCount,
          unit_price: perAppt,
          amount: usageCount * perAppt,
        });
      }

      if (config.billing_model === "tiered" && overageCount > 0) {
        lineItems.push({
          invoice_id: invoice.id,
          config_id: config.id,
          line_type: "overage_fee",
          description: `Overage — ${overageCount} appointments beyond ${included} included @ $${overageRate}/ea`,
          quantity: overageCount,
          unit_price: overageRate,
          amount: overageCount * overageRate,
        });
      }

      if (capApplied === "min_cap") {
        const adjustment = total - rawTotal;
        if (adjustment > 0) {
          lineItems.push({
            invoice_id: invoice.id,
            config_id: config.id,
            line_type: "min_cap_adjustment",
            description: `Minimum monthly fee adjustment (min: $${minFee})`,
            quantity: 1,
            unit_price: adjustment,
            amount: adjustment,
          });
        }
      } else if (capApplied === "max_cap") {
        const discount = rawTotal - total;
        if (discount > 0) {
          lineItems.push({
            invoice_id: invoice.id,
            config_id: config.id,
            line_type: "max_cap_discount",
            description: `Maximum monthly cap discount (cap: $${maxFee})`,
            quantity: 1,
            unit_price: -discount,
            amount: -discount,
          });
        }
      }

      if (lineItems.length > 0) {
        await adminClient.from("platform_invoice_line_items").insert(lineItems);
      }

      generated++;
    } catch (err: any) {
      errors.push({ agency: agency.name, error: err.message });
    }
  }

  await adminClient.from("platform_audit_log").insert({
    actor_id: userId,
    action: "generate_platform_invoices",
    target_type: "platform_invoices",
    details: { billing_month: billingMonth, generated, skipped, errors },
  });

  return new Response(JSON.stringify({ generated, skipped, errors }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── List Invoices ─────────────────────────────────────────────────────

async function handleListInvoices(body: any, adminClient: any, corsHeaders: Record<string, string>) {
  const { billing_month, status } = body || {};
  let query = adminClient
    .from("platform_invoices")
    .select("*, agencies:agency_id(name)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (billing_month) query = query.eq("billing_month", billing_month);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;

  return new Response(JSON.stringify({ invoices: data || [] }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Invoice Detail ────────────────────────────────────────────────────

async function handleInvoiceDetail(body: any, adminClient: any, corsHeaders: Record<string, string>) {
  const { invoice_id } = body;
  if (!invoice_id) throw new Error("invoice_id required");

  const { data: invoice, error } = await adminClient
    .from("platform_invoices")
    .select("*, agencies:agency_id(id, name, slug, plan_type, billing_model), line_items:platform_invoice_line_items(*)")
    .eq("id", invoice_id)
    .single();

  if (error || !invoice) throw new Error("Invoice not found");

  return new Response(JSON.stringify({ invoice }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Invoice Status Transitions ────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["issued", "void"],
  issued: ["synced", "paid", "void"],
  synced: ["paid", "void"],
  paid: ["void"],
  void: [],
};

async function handleUpdateInvoiceStatus(userId: string, body: any, adminClient: any, corsHeaders: Record<string, string>) {
  const { invoice_id, new_status } = body;
  if (!invoice_id || !new_status) throw new Error("invoice_id and new_status required");

  const { data: invoice } = await adminClient
    .from("platform_invoices")
    .select("id, status, invoice_number, agency_id")
    .eq("id", invoice_id)
    .single();

  if (!invoice) throw new Error("Invoice not found");

  const allowed = VALID_TRANSITIONS[invoice.status] || [];
  if (!allowed.includes(new_status)) {
    throw new Error(`Cannot transition from '${invoice.status}' to '${new_status}'. Allowed: ${allowed.join(", ") || "none"}`);
  }

  const updates: Record<string, any> = { status: new_status };
  if (new_status === "issued") {
    updates.issued_date = new Date().toISOString().split("T")[0];
  }

  await adminClient.from("platform_invoices").update(updates).eq("id", invoice_id);

  await adminClient.from("platform_audit_log").insert({
    actor_id: userId,
    action: "update_invoice_status",
    target_type: "platform_invoices",
    target_id: invoice_id,
    details: { invoice_number: invoice.invoice_number, from: invoice.status, to: new_status },
  });

  return new Response(JSON.stringify({ success: true, previous_status: invoice.status, new_status }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Sync Invoice to QBO ───────────────────────────────────────────────

async function handleSyncInvoice(userId: string, body: any, adminClient: any, corsHeaders: Record<string, string>) {
  const { invoice_id } = body;
  if (!invoice_id) throw new Error("invoice_id required");

  const { token, conn } = await getPlatformQboToken(adminClient);
  const realmId = conn.realm_id;

  const { data: invoice } = await adminClient
    .from("platform_invoices")
    .select("*, agencies:agency_id(id, name, platform_qbo_customer_id), line_items:platform_invoice_line_items(*)")
    .eq("id", invoice_id)
    .single();

  if (!invoice) throw new Error("Invoice not found");

  // Resolve agency as QBO Customer
  let qboCustomerId = invoice.agencies?.platform_qbo_customer_id;
  if (!qboCustomerId) {
    const displayName = `${invoice.agencies?.name || "Agency"} (BlueThread)`;
    const safeName = displayName.replace(/'/g, "\\'");
    const query = encodeURIComponent(`DisplayName = '${safeName}'`);
    const searchResult = await qboRequest("GET", `/query?query=select * from Customer where ${query}`, token, realmId);

    if (searchResult.QueryResponse?.Customer?.length > 0) {
      qboCustomerId = searchResult.QueryResponse.Customer[0].Id;
    } else {
      const created = await qboRequest("POST", "/customer", token, realmId, { DisplayName: displayName });
      qboCustomerId = created.Customer.Id;
    }

    await adminClient.from("agencies").update({
      platform_qbo_customer_id: qboCustomerId,
    }).eq("id", invoice.agencies?.id);
  }

  const qboLines = (invoice.line_items || []).map((li: any) => ({
    DetailType: "SalesItemLineDetail",
    Amount: Number(li.amount),
    Description: li.description,
    SalesItemLineDetail: {
      Qty: Number(li.quantity),
      UnitPrice: Number(li.unit_price),
    },
  }));

  let qboInvoice: any;
  const logEntry: any = {
    entity_type: "invoice",
    entity_id: invoice_id,
    synced_by: userId,
  };

  try {
    if (invoice.qbo_invoice_id) {
      const existing = await qboRequest("GET", `/invoice/${invoice.qbo_invoice_id}`, token, realmId);
      qboInvoice = await qboRequest("POST", "/invoice", token, realmId, {
        Id: invoice.qbo_invoice_id,
        SyncToken: existing.Invoice.SyncToken,
        CustomerRef: { value: qboCustomerId },
        DocNumber: invoice.invoice_number,
        TxnDate: invoice.issued_date,
        DueDate: invoice.due_date,
        Line: qboLines,
      });
      logEntry.action = "update";
    } else {
      qboInvoice = await qboRequest("POST", "/invoice", token, realmId, {
        CustomerRef: { value: qboCustomerId },
        DocNumber: invoice.invoice_number,
        TxnDate: invoice.issued_date,
        DueDate: invoice.due_date,
        Line: qboLines,
      });
      logEntry.action = "create";
    }

    const qboId = qboInvoice.Invoice.Id;
    const syncToken = qboInvoice.Invoice.SyncToken;

    await adminClient.from("platform_invoices").update({
      qbo_invoice_id: qboId,
      qbo_sync_token: syncToken,
      qbo_last_synced_at: new Date().toISOString(),
      status: "synced",
    }).eq("id", invoice_id);

    logEntry.status = "success";
    logEntry.qbo_entity_id = qboId;

    await adminClient.from("platform_qbo_connection").update({
      last_sync_at: new Date().toISOString(),
    }).eq("id", conn.id);
  } catch (err: any) {
    logEntry.status = "failed";
    logEntry.error_details = err.message;
  }

  await adminClient.from("platform_qbo_sync_log").insert(logEntry);

  if (logEntry.status === "failed") throw new Error(logEntry.error_details);

  return new Response(JSON.stringify({ success: true, qbo_invoice_id: logEntry.qbo_entity_id }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Sync Log ──────────────────────────────────────────────────────────

async function handleSyncLog(adminClient: any, corsHeaders: Record<string, string>) {
  const { data } = await adminClient
    .from("platform_qbo_sync_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  return new Response(JSON.stringify({ log: data || [] }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Orphan Detection ──────────────────────────────────────────────────

async function handleDetectOrphans(adminClient: any, corsHeaders: Record<string, string>) {
  const { data: invoices } = await adminClient
    .from("platform_invoices")
    .select("id, invoice_number, billing_month, agency_id, status, total, config_id, config_snapshot, generation_details, agencies:agency_id(name)")
    .neq("status", "void")
    .order("created_at", { ascending: false });

  const orphans: any[] = [];
  for (const inv of (invoices || [])) {
    const issues: string[] = [];
    if (!inv.config_snapshot) issues.push("missing_config_snapshot");
    if (!inv.generation_details) issues.push("missing_generation_details");
    if (!inv.config_id) issues.push("missing_config_id");
    if (Number(inv.total) === 0) issues.push("zero_total");

    // Check for missing line items
    const { count } = await adminClient
      .from("platform_invoice_line_items")
      .select("id", { count: "exact", head: true })
      .eq("invoice_id", inv.id);

    if (!count || count === 0) issues.push("no_line_items");

    if (issues.length > 0) {
      orphans.push({
        id: inv.id,
        invoice_number: inv.invoice_number,
        billing_month: inv.billing_month,
        agency_name: inv.agencies?.name || "Unknown",
        status: inv.status,
        total: inv.total,
        issues,
      });
    }
  }

  return new Response(JSON.stringify({ orphans }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Delete Invoice (for orphan cleanup) ───────────────────────────────

async function handleDeleteInvoice(userId: string, body: any, adminClient: any, corsHeaders: Record<string, string>) {
  const { invoice_id } = body;
  if (!invoice_id) throw new Error("invoice_id required");

  const { data: invoice } = await adminClient
    .from("platform_invoices")
    .select("id, status, invoice_number, qbo_invoice_id")
    .eq("id", invoice_id)
    .single();

  if (!invoice) throw new Error("Invoice not found");

  // Only allow deletion of draft or void invoices without QBO sync
  if (!["draft", "void"].includes(invoice.status)) {
    throw new Error(`Cannot delete invoice in '${invoice.status}' status. Void it first.`);
  }
  if (invoice.qbo_invoice_id) {
    throw new Error("Cannot delete an invoice that has been synced to QuickBooks. Void it instead.");
  }

  // Delete line items first, then invoice
  await adminClient.from("platform_invoice_line_items").delete().eq("invoice_id", invoice_id);
  await adminClient.from("platform_invoices").delete().eq("id", invoice_id);

  await adminClient.from("platform_audit_log").insert({
    actor_id: userId,
    action: "delete_platform_invoice",
    target_type: "platform_invoices",
    target_id: invoice_id,
    details: { invoice_number: invoice.invoice_number, previous_status: invoice.status },
  });

  return new Response(JSON.stringify({ success: true, deleted: invoice.invoice_number }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Retry Helper ──────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelayMs = 500): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, baseDelayMs * (attempt + 1)));
    }
  }
  throw new Error("Unreachable");
}

// ── Concurrency Lock Helper ──────────────────────────────────────────

async function acquireBulkLock(adminClient: any, action: string, billingMonth: string): Promise<string> {
  const lockId = `bulk_${action}_${billingMonth}`;
  // Use platform_audit_log to detect in-flight operations (created in last 10 min)
  const { data: recent } = await adminClient
    .from("platform_audit_log")
    .select("id, created_at")
    .eq("action", `bulk_${action}_invoices_started`)
    .eq("target_id", billingMonth)
    .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .limit(1);

  if (recent && recent.length > 0) {
    throw new Error(`A bulk ${action} operation for ${billingMonth} is already in progress. Please wait.`);
  }
  return lockId;
}

// ── Pre-flight Validation Helper ─────────────────────────────────────

interface PreflightIssue {
  invoice_number: string;
  invoice_id: string;
  issues: string[];
}

async function preflightIssueValidation(adminClient: any, drafts: any[]): Promise<PreflightIssue[]> {
  const warnings: PreflightIssue[] = [];
  for (const inv of drafts) {
    const issues: string[] = [];

    // Load full data
    const { data: full } = await adminClient
      .from("platform_invoices")
      .select("config_snapshot, generation_details, total, line_items:platform_invoice_line_items(id)")
      .eq("id", inv.id)
      .single();

    if (!full) { issues.push("Invoice not found"); }
    else {
      if (!full.config_snapshot) issues.push("Missing config snapshot");
      if (!full.generation_details) issues.push("Missing generation details");
      if (!full.line_items || full.line_items.length === 0) issues.push("No line items");
      if (Number(full.total) === 0) issues.push("Zero total");
    }

    if (issues.length > 0) {
      warnings.push({ invoice_number: inv.invoice_number, invoice_id: inv.id, issues });
    }
  }
  return warnings;
}

async function preflightSyncValidation(adminClient: any, issued: any[]): Promise<PreflightIssue[]> {
  const warnings: PreflightIssue[] = [];
  for (const inv of issued) {
    const issues: string[] = [];

    const { data: full } = await adminClient
      .from("platform_invoices")
      .select("line_items:platform_invoice_line_items(id)")
      .eq("id", inv.id)
      .single();

    if (!full || !full.line_items || full.line_items.length === 0) {
      issues.push("No line items — cannot create QBO invoice");
    }

    if (issues.length > 0) {
      warnings.push({ invoice_number: inv.invoice_number, invoice_id: inv.id, issues });
    }
  }
  return warnings;
}

// ── Bulk Issue Drafts ─────────────────────────────────────────────────

async function handleBulkIssue(userId: string, body: any, adminClient: any, corsHeaders: Record<string, string>) {
  const { billing_month, dry_run = false } = body;
  if (!billing_month || !/^\d{4}-\d{2}$/.test(billing_month)) {
    throw new Error("billing_month is required (YYYY-MM)");
  }

  const { data: drafts } = await adminClient
    .from("platform_invoices")
    .select("id, invoice_number, agency_id, status")
    .eq("billing_month", billing_month)
    .eq("status", "draft");

  if (!drafts || drafts.length === 0) {
    return new Response(JSON.stringify({
      processed: 0, succeeded: 0, failed: 0, failures: [], warnings: [],
      remaining_draft: 0, remaining_issued: 0, elapsed_ms: 0,
      message: "No draft invoices for this month",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Pre-flight validation
  const warnings = await preflightIssueValidation(adminClient, drafts);

  if (dry_run) {
    const eligible = drafts.length - warnings.length;
    return new Response(JSON.stringify({
      dry_run: true,
      total: drafts.length,
      eligible,
      warnings,
      message: `Dry run: ${eligible} of ${drafts.length} drafts would be issued`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Concurrency lock
  await acquireBulkLock(adminClient, "issue", billing_month);

  // Mark started
  await adminClient.from("platform_audit_log").insert({
    actor_id: userId,
    action: "bulk_issue_invoices_started",
    target_type: "platform_invoices",
    target_id: billing_month,
    details: { total: drafts.length, warnings: warnings.length },
  });

  const startTime = Date.now();
  let succeeded = 0;
  const failures: any[] = [];

  for (const inv of drafts) {
    try {
      await adminClient.from("platform_invoices").update({
        status: "issued",
        issued_date: new Date().toISOString().split("T")[0],
      }).eq("id", inv.id);
      succeeded++;
    } catch (err: any) {
      failures.push({ invoice_number: inv.invoice_number, error: err.message });
    }
  }

  const elapsedMs = Date.now() - startTime;

  // Count remaining statuses for this month
  const { data: remaining } = await adminClient
    .from("platform_invoices")
    .select("status")
    .eq("billing_month", billing_month)
    .neq("status", "void");

  const remainingDraft = (remaining || []).filter((r: any) => r.status === "draft").length;
  const remainingIssued = (remaining || []).filter((r: any) => r.status === "issued").length;

  await adminClient.from("platform_audit_log").insert({
    actor_id: userId,
    action: "bulk_issue_invoices",
    target_type: "platform_invoices",
    target_id: billing_month,
    details: { billing_month, processed: drafts.length, succeeded, failed: failures.length, failures, warnings, elapsed_ms: elapsedMs },
  });

  return new Response(JSON.stringify({
    processed: drafts.length, succeeded, failed: failures.length, failures, warnings,
    remaining_draft: remainingDraft, remaining_issued: remainingIssued,
    elapsed_ms: elapsedMs,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ── Bulk Sync to QBO ──────────────────────────────────────────────────

async function handleBulkSync(userId: string, body: any, adminClient: any, corsHeaders: Record<string, string>) {
  const { billing_month, dry_run = false } = body;
  if (!billing_month || !/^\d{4}-\d{2}$/.test(billing_month)) {
    throw new Error("billing_month is required (YYYY-MM)");
  }

  const { data: issued } = await adminClient
    .from("platform_invoices")
    .select("id, invoice_number, qbo_invoice_id")
    .eq("billing_month", billing_month)
    .eq("status", "issued");

  if (!issued || issued.length === 0) {
    return new Response(JSON.stringify({
      processed: 0, succeeded: 0, failed: 0, failures: [], warnings: [],
      remaining_draft: 0, remaining_issued: 0, elapsed_ms: 0,
      message: "No issued invoices for this month",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Check QBO connection before anything
  let token: string, conn: any, realmId: string;
  try {
    const qbo = await getPlatformQboToken(adminClient);
    token = qbo.token;
    conn = qbo.conn;
    realmId = conn.realm_id;
  } catch (err: any) {
    throw new Error("QuickBooks not connected: " + err.message);
  }

  // Pre-flight validation
  const warnings = await preflightSyncValidation(adminClient, issued);
  const syncable = issued.filter((inv: any) => !warnings.find(w => w.invoice_id === inv.id));

  if (dry_run) {
    return new Response(JSON.stringify({
      dry_run: true,
      total: issued.length,
      eligible: syncable.length,
      blocked: warnings.length,
      warnings,
      message: `Dry run: ${syncable.length} of ${issued.length} invoices would be synced`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Concurrency lock
  await acquireBulkLock(adminClient, "sync", billing_month);

  await adminClient.from("platform_audit_log").insert({
    actor_id: userId,
    action: "bulk_sync_invoices_started",
    target_type: "platform_invoices",
    target_id: billing_month,
    details: { total: issued.length, syncable: syncable.length, warnings: warnings.length },
  });

  const startTime = Date.now();
  let succeeded = 0;
  const failures: any[] = [];

  // Skip invoices that failed pre-flight
  for (const w of warnings) {
    failures.push({ invoice_number: w.invoice_number, error: `Pre-flight: ${w.issues.join(", ")}` });
  }

  for (const inv of syncable) {
    try {
      const { data: fullInv } = await adminClient
        .from("platform_invoices")
        .select("*, agencies:agency_id(id, name, platform_qbo_customer_id), line_items:platform_invoice_line_items(*)")
        .eq("id", inv.id)
        .single();

      if (!fullInv) throw new Error("Invoice not found");

      // Resolve QBO customer (with retry)
      let qboCustomerId = fullInv.agencies?.platform_qbo_customer_id;
      if (!qboCustomerId) {
        const displayName = `${fullInv.agencies?.name || "Agency"} (BlueThread)`;
        const safeName = displayName.replace(/'/g, "\\'");
        const query = encodeURIComponent(`DisplayName = '${safeName}'`);
        const searchResult = await withRetry(() =>
          qboRequest("GET", `/query?query=select * from Customer where ${query}`, token, realmId)
        );

        if (searchResult.QueryResponse?.Customer?.length > 0) {
          qboCustomerId = searchResult.QueryResponse.Customer[0].Id;
        } else {
          const created = await withRetry(() =>
            qboRequest("POST", "/customer", token, realmId, { DisplayName: displayName })
          );
          qboCustomerId = created.Customer.Id;
        }
        await adminClient.from("agencies").update({ platform_qbo_customer_id: qboCustomerId }).eq("id", fullInv.agencies?.id);
      }

      const qboLines = (fullInv.line_items || []).map((li: any) => ({
        DetailType: "SalesItemLineDetail",
        Amount: Number(li.amount),
        Description: li.description,
        SalesItemLineDetail: { Qty: Number(li.quantity), UnitPrice: Number(li.unit_price) },
      }));

      let qboInvoice: any;
      const logEntry: any = { entity_type: "invoice", entity_id: inv.id, synced_by: userId };

      if (inv.qbo_invoice_id) {
        const existing = await withRetry(() =>
          qboRequest("GET", `/invoice/${inv.qbo_invoice_id}`, token, realmId)
        );
        qboInvoice = await withRetry(() =>
          qboRequest("POST", "/invoice", token, realmId, {
            Id: inv.qbo_invoice_id, SyncToken: existing.Invoice.SyncToken,
            CustomerRef: { value: qboCustomerId }, DocNumber: fullInv.invoice_number,
            TxnDate: fullInv.issued_date, DueDate: fullInv.due_date, Line: qboLines,
          })
        );
        logEntry.action = "update";
      } else {
        qboInvoice = await withRetry(() =>
          qboRequest("POST", "/invoice", token, realmId, {
            CustomerRef: { value: qboCustomerId }, DocNumber: fullInv.invoice_number,
            TxnDate: fullInv.issued_date, DueDate: fullInv.due_date, Line: qboLines,
          })
        );
        logEntry.action = "create";
      }

      const qboId = qboInvoice.Invoice.Id;
      await adminClient.from("platform_invoices").update({
        qbo_invoice_id: qboId, qbo_sync_token: qboInvoice.Invoice.SyncToken,
        qbo_last_synced_at: new Date().toISOString(), status: "synced",
      }).eq("id", inv.id);

      logEntry.status = "success";
      logEntry.qbo_entity_id = qboId;
      await adminClient.from("platform_qbo_sync_log").insert(logEntry);

      succeeded++;

      // Rate limit: 250ms between QBO API calls
      await new Promise(r => setTimeout(r, 250));
    } catch (err: any) {
      failures.push({ invoice_number: inv.invoice_number, error: err.message });
      await adminClient.from("platform_qbo_sync_log").insert({
        entity_type: "invoice", entity_id: inv.id, synced_by: userId,
        action: "create", status: "failed", error_details: err.message,
      });
    }
  }

  const elapsedMs = Date.now() - startTime;

  await adminClient.from("platform_qbo_connection").update({
    last_sync_at: new Date().toISOString(),
  }).eq("id", conn.id);

  // Count remaining statuses
  const { data: remaining } = await adminClient
    .from("platform_invoices")
    .select("status")
    .eq("billing_month", billing_month)
    .neq("status", "void");

  const remainingDraft = (remaining || []).filter((r: any) => r.status === "draft").length;
  const remainingIssued = (remaining || []).filter((r: any) => r.status === "issued").length;

  await adminClient.from("platform_audit_log").insert({
    actor_id: userId,
    action: "bulk_sync_invoices",
    target_type: "platform_invoices",
    target_id: billing_month,
    details: { billing_month, processed: issued.length, succeeded, failed: failures.length, failures, warnings, elapsed_ms: elapsedMs },
  });

  return new Response(JSON.stringify({
    processed: issued.length, succeeded, failed: failures.length, failures, warnings,
    remaining_draft: remainingDraft, remaining_issued: remainingIssued,
    elapsed_ms: elapsedMs,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ── Router ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    const url = new URL(req.url);
    const pathAction = url.pathname.split("/").pop();
    const action = (pathAction && pathAction !== "platform-qbo") ? pathAction : url.searchParams.get("action");

    if (action === "callback" && req.method === "GET") {
      return handleCallback(url);
    }

    const { userId, adminClient } = await authenticatePlatformOwner(req);
    const body = req.method === "POST" ? await req.json() : {};

    switch (action) {
      case "initiate": return handleInitiate(corsHeaders);
      case "status": return handleStatus(adminClient, corsHeaders);
      case "disconnect": return handleDisconnect(userId, adminClient, corsHeaders);
      case "generate-invoices": return handleGenerateInvoices(userId, body, adminClient, corsHeaders);
      case "list-invoices": return handleListInvoices(body, adminClient, corsHeaders);
      case "invoice-detail": return handleInvoiceDetail(body, adminClient, corsHeaders);
      case "update-invoice-status": return handleUpdateInvoiceStatus(userId, body, adminClient, corsHeaders);
      case "sync-invoice": return handleSyncInvoice(userId, body, adminClient, corsHeaders);
      case "sync-log": return handleSyncLog(adminClient, corsHeaders);
      case "detect-orphans": return handleDetectOrphans(adminClient, corsHeaders);
      case "delete-invoice": return handleDeleteInvoice(userId, body, adminClient, corsHeaders);
      case "bulk-issue": return handleBulkIssue(userId, body, adminClient, corsHeaders);
      case "bulk-sync": return handleBulkSync(userId, body, adminClient, corsHeaders);
      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    return errorResponse(error, req);
  }
});
