/**
 * Shared notification delivery module.
 * Centralizes email (Resend), SMS (Twilio), branded HTML, and notification_log writing.
 */

const SITE_NAME = "BlueThread Solution";
const FROM_ADDRESS = "BlueThread Solution <noreply@notify.bluethreadsolution.com>";

// ─── Branded HTML ────────────────────────────────────────────────────────────

export function buildBrandedHtml(subject: string, bodyText: string): string {
  const htmlBody = bodyText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:40px 32px;">
    <p style="font-size:20px;font-weight:bold;font-family:'Space Grotesk',Arial,sans-serif;color:#2952a3;margin:0 0 24px;">⬡ BlueThread</p>
    <h1 style="font-size:24px;font-weight:bold;font-family:'Space Grotesk',Arial,sans-serif;color:#121820;margin:0 0 16px;">${subject}</h1>
    <p style="font-size:15px;color:#676c73;line-height:1.6;margin:0 0 20px;">${htmlBody}</p>
    <p style="font-size:12px;color:#999999;margin:32px 0 0;">This is an automated notification from ${SITE_NAME}.</p>
  </div>
</body>
</html>`;
}

// ─── Email via Resend ────────────────────────────────────────────────────────

export interface DeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail(
  to: string,
  subject: string,
  bodyText: string,
): Promise<DeliveryResult> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) return { success: false, error: "RESEND_API_KEY not configured" };

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [to],
        subject,
        html: buildBrandedHtml(subject, bodyText),
        text: bodyText,
      }),
    });
    const body = await resp.text();
    if (!resp.ok) return { success: false, error: `Resend ${resp.status}: ${body}` };
    let result: any = {};
    try { result = JSON.parse(body); } catch { /* ok */ }
    return { success: true, messageId: result.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── SMS via Twilio ──────────────────────────────────────────────────────────

export async function sendSms(
  to: string,
  body: string,
): Promise<DeliveryResult> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_PHONE_NUMBER");
  if (!sid || !token || !from) return { success: false, error: "Twilio credentials not configured" };

  try {
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${sid}:${token}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      },
    );
    const result = await resp.json();
    if (!resp.ok) return { success: false, error: result.message || "Twilio error" };
    return { success: true, messageId: result.sid };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Notification log writer ─────────────────────────────────────────────────

export interface LogEntry {
  agency_id: string;
  channel: "email" | "sms";
  recipient: string;
  subject?: string | null;
  body: string;
  template_id?: string | null;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  reminder_type?: string | null;
  appointment_id?: string | null;
}

/**
 * Send via the appropriate channel and write the result to notification_log.
 * Returns the delivery result.
 */
export async function deliverAndLog(
  adminClient: any,
  entry: LogEntry,
): Promise<DeliveryResult> {
  let result: DeliveryResult;

  if (entry.channel === "email") {
    result = await sendEmail(entry.recipient, entry.subject || "Notification", entry.body);
  } else {
    result = await sendSms(entry.recipient, entry.body);
  }

  const { error: logErr } = await adminClient.from("notification_log").insert({
    agency_id: entry.agency_id,
    channel: entry.channel,
    recipient: entry.recipient,
    subject: entry.subject || null,
    body: entry.body,
    status: result.success ? "sent" : "failed",
    error_message: result.error || null,
    sent_at: result.success ? new Date().toISOString() : null,
    template_id: entry.template_id || null,
    related_entity_type: entry.related_entity_type || null,
    related_entity_id: entry.related_entity_id || null,
    reminder_type: entry.reminder_type || null,
    appointment_id: entry.appointment_id || null,
    provider_message_id: result.messageId || null,
  });

  if (logErr) {
    console.error("Failed to write notification_log", logErr);
  }

  return result;
}
