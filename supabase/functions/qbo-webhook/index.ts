import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// ── Webhook Signature Verification ────────────────────────────────────

async function verifyWebhookSignature(payload: string, signature: string): Promise<boolean> {
  const webhookToken = Deno.env.get("QBO_WEBHOOK_VERIFIER_TOKEN");
  if (!webhookToken) {
    console.error("QBO_WEBHOOK_VERIFIER_TOKEN not configured");
    return false;
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(webhookToken),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
    return computed === signature;
  } catch (e) {
    console.error("Signature verification error:", e);
    return false;
  }
}

// ── Main Handler ──────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // QBO validation ping
  if (req.method === "GET") {
    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("intuit-signature") || "";

    const isValid = await verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      console.error("Invalid webhook signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.parse(rawBody);
    const notifications = payload.eventNotifications || [];

    for (const notification of notifications) {
      const realmId = notification.realmId;
      const entities = notification.dataChangeEvent?.entities || [];

      const { data: conn } = await adminClient.from("qbo_connections")
        .select("agency_id").eq("realm_id", realmId).single();

      if (!conn) {
        console.warn(`No connection found for realmId: ${realmId}`);
        continue;
      }

      for (const entity of entities) {
        const idempotencyKey = `${entity.name}-${entity.id}-${entity.operation}-${entity.lastUpdated || ""}`;

        const { data: existing } = await adminClient.from("qbo_webhook_events")
          .select("id")
          .eq("agency_id", conn.agency_id)
          .eq("entity_id", entity.id)
          .eq("event_type", entity.operation)
          .eq("entity_type", entity.name)
          .limit(1);

        if (existing?.length) {
          const dup = existing[0];
          const { data: dupRow } = await adminClient.from("qbo_webhook_events")
            .select("processed, payload").eq("id", dup.id).single();

          if (dupRow?.processed && JSON.stringify(dupRow.payload) === JSON.stringify(entity)) {
            console.log(`Skipping duplicate webhook event: ${idempotencyKey}`);
            continue;
          }
        }

        const { data: event } = await adminClient.from("qbo_webhook_events").insert({
          agency_id: conn.agency_id,
          realm_id: realmId,
          event_type: entity.operation,
          entity_type: entity.name,
          entity_id: entity.id,
          payload: entity,
        }).select("id").single();

        try {
          if (entity.name === "Invoice") {
            await processInvoiceEvent(adminClient, conn.agency_id, entity.id, entity.operation, event?.id);
          }
          if (entity.name === "Payment") {
            await processPaymentEvent(adminClient, conn.agency_id, entity.id, entity.operation, event?.id);
          }
        } catch (e: any) {
          console.error(`Error processing webhook entity ${entity.name}/${entity.id}:`, e);
          await adminClient.from("qbo_webhook_events").update({
            error: e.message,
          }).eq("id", event?.id);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Webhook processing error:", error);
    // Always return 200 to prevent QBO from retrying
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Invoice Event Processing ──────────────────────────────────────────

async function processInvoiceEvent(
  adminClient: any, agencyId: string, qboInvoiceId: string,
  operation: string, eventId?: string
) {
  const { data: appts } = await adminClient.from("appointments")
    .select("id, status, payment_status, qbo_sync_status")
    .eq("agency_id", agencyId)
    .eq("qbo_invoice_id", qboInvoiceId);

  if (!appts?.length) {
    console.log(`No appointment linked to QBO invoice ${qboInvoiceId}`);
    await markEventProcessed(adminClient, eventId, { note: "No linked appointment found" });
    return;
  }

  if (operation === "Delete") {
    for (const appt of appts) {
      await adminClient.from("appointments").update({
        qbo_invoice_id: null,
        qbo_sync_status: "unsynced",
      }).eq("id", appt.id);

      await logSyncEvent(adminClient, agencyId, appt.id,
        "webhook_invoice_deleted", `QBO Invoice ${qboInvoiceId} was deleted in QuickBooks`);
    }
  } else if (operation === "Void") {
    for (const appt of appts) {
      await adminClient.from("appointments").update({
        qbo_sync_status: "voided",
        payment_status: "voided",
      }).eq("id", appt.id);

      await logSyncEvent(adminClient, agencyId, appt.id,
        "webhook_invoice_voided", `QBO Invoice ${qboInvoiceId} was voided`);
    }
  } else if (operation === "Update") {
    try {
      const { data: conn } = await adminClient.from("qbo_connections")
        .select("access_token, realm_id, token_expires_at, id, refresh_token")
        .eq("agency_id", agencyId).single();

      if (conn?.access_token && conn?.realm_id) {
        let token = conn.access_token;
        const qboBase = Deno.env.get("QBO_ENVIRONMENT") === "production"
          ? "https://quickbooks.api.intuit.com"
          : "https://sandbox-quickbooks.api.intuit.com";

        const invoiceResp = await fetch(
          `${qboBase}/v3/company/${conn.realm_id}/invoice/${qboInvoiceId}?minorversion=65`,
          { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
        );

        if (invoiceResp.ok) {
          const invoiceData = await invoiceResp.json();
          const balance = invoiceData.Invoice?.Balance ?? null;
          const total = invoiceData.Invoice?.TotalAmt ?? 0;

          for (const appt of appts) {
            let paymentStatus = appt.payment_status;
            if (balance === 0 && total > 0) {
              paymentStatus = "paid";
            } else if (balance !== null && balance > 0 && balance < total) {
              paymentStatus = "partial";
            }

            if (paymentStatus !== appt.payment_status) {
              await adminClient.from("appointments").update({
                payment_status: paymentStatus,
              }).eq("id", appt.id);

              await logSyncEvent(adminClient, agencyId, appt.id,
                "webhook_payment_status_updated",
                `Payment status changed to "${paymentStatus}" (Balance: $${balance}, Total: $${total})`);
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch invoice for balance check:", e);
    }
  }

  await markEventProcessed(adminClient, eventId, { operation, linked_appointments: appts.map((a: any) => a.id) });
}

// ── Payment Event Processing ──────────────────────────────────────────

async function processPaymentEvent(
  adminClient: any, agencyId: string, qboPaymentId: string,
  operation: string, eventId?: string
) {
  if (operation === "Create" || operation === "Update") {
    try {
      const { data: conn } = await adminClient.from("qbo_connections")
        .select("access_token, realm_id")
        .eq("agency_id", agencyId).single();

      if (conn?.access_token && conn?.realm_id) {
        const qboBase = Deno.env.get("QBO_ENVIRONMENT") === "production"
          ? "https://quickbooks.api.intuit.com"
          : "https://sandbox-quickbooks.api.intuit.com";

        const paymentResp = await fetch(
          `${qboBase}/v3/company/${conn.realm_id}/payment/${qboPaymentId}?minorversion=65`,
          { headers: { Authorization: `Bearer ${conn.access_token}`, Accept: "application/json" } }
        );

        if (paymentResp.ok) {
          const paymentData = await paymentResp.json();
          const linkedInvoices = paymentData.Payment?.Line?.map((l: any) =>
            l.LinkedTxn?.filter((t: any) => t.TxnType === "Invoice").map((t: any) => t.TxnId)
          ).flat().filter(Boolean) || [];

          for (const invoiceId of linkedInvoices) {
            const { data: appts } = await adminClient.from("appointments")
              .select("id, payment_status")
              .eq("agency_id", agencyId)
              .eq("qbo_invoice_id", invoiceId);

            for (const appt of (appts || [])) {
              if (appt.payment_status !== "paid") {
                await adminClient.from("appointments").update({
                  payment_status: "paid",
                }).eq("id", appt.id);

                await logSyncEvent(adminClient, agencyId, appt.id,
                  "webhook_payment_received",
                  `Payment ${qboPaymentId} applied to Invoice ${invoiceId}`);
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to process payment event:", e);
    }
  }

  await markEventProcessed(adminClient, eventId, { operation, qbo_payment_id: qboPaymentId });
}

// ── Helpers ───────────────────────────────────────────────────────────

async function markEventProcessed(adminClient: any, eventId?: string, metadata?: any) {
  if (!eventId) return;
  await adminClient.from("qbo_webhook_events").update({
    processed: true,
    processed_at: new Date().toISOString(),
  }).eq("id", eventId);
}

async function logSyncEvent(
  adminClient: any, agencyId: string, appointmentId: string,
  action: string, details: string
) {
  await adminClient.from("qbo_sync_log").insert({
    agency_id: agencyId,
    appointment_id: appointmentId,
    entity_type: "webhook",
    qbo_object_type: action,
    action: "webhook_update",
    status: "success",
    error_details: details,
    completed_at: new Date().toISOString(),
  });
}
