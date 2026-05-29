/**
 * process-reminders — Scheduled edge function (every 5 min via pg_cron).
 *
 * Optimized: single cross-agency query per reminder window instead of
 * per-agency loops. Uses shared delivery module for email/SMS + logging.
 *
 * Reminder types: reminder_24h, reminder_2h, reminder_15m
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deliverAndLog } from "../_shared/delivery.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const SITE_NAME = "BlueThread Solution";

const REMINDER_DEFS = [
  { type: "reminder_24h", minutesBefore: 1440, settingKey: "reminder_24h_enabled", label: "24 hours" },
  { type: "reminder_2h", minutesBefore: 120, settingKey: "reminder_2h_enabled", label: "2 hours" },
  { type: "reminder_15m", minutesBefore: 15, settingKey: "reminder_15m_enabled", label: "15 minutes" },
] as const;

const TOLERANCE_MINUTES = 6;

interface AgencyReminderSettings {
  enable_email_reminders?: boolean;
  enable_sms_reminders?: boolean;
  reminder_24h_enabled?: boolean;
  reminder_2h_enabled?: boolean;
  reminder_15m_enabled?: boolean;
  default_reminder_channels?: string;
}

interface InterpreterNotifPrefs {
  enable_email_notifications?: boolean;
  enable_sms_notifications?: boolean;
  reminder_24h_enabled?: boolean;
  reminder_2h_enabled?: boolean;
  reminder_15m_enabled?: boolean;
  preferred_notification_channel?: string;
}

function getDefaultAgencySettings(): AgencyReminderSettings {
  return {
    enable_email_reminders: true,
    enable_sms_reminders: true,
    reminder_24h_enabled: true,
    reminder_2h_enabled: true,
    reminder_15m_enabled: false,
    default_reminder_channels: "both",
  };
}

function resolveChannels(
  agencySettings: AgencyReminderSettings,
  interpPrefs: InterpreterNotifPrefs | null,
  reminderDef: typeof REMINDER_DEFS[number],
): { email: boolean; sms: boolean } {
  const agencyEnabled = agencySettings[reminderDef.settingKey as keyof AgencyReminderSettings] !== false;
  if (!agencyEnabled) return { email: false, sms: false };

  let emailEnabled = agencySettings.enable_email_reminders !== false;
  let smsEnabled = agencySettings.enable_sms_reminders !== false;

  if (interpPrefs) {
    const interpReminderEnabled = interpPrefs[reminderDef.settingKey as keyof InterpreterNotifPrefs];
    if (interpReminderEnabled === false) return { email: false, sms: false };
    if (interpPrefs.enable_email_notifications === false) emailEnabled = false;
    if (interpPrefs.enable_sms_notifications === false) smsEnabled = false;
    if (interpPrefs.preferred_notification_channel === "email") smsEnabled = false;
    if (interpPrefs.preferred_notification_channel === "sms") emailEnabled = false;
  }

  return { email: emailEnabled, sms: smsEnabled };
}

function formatDateTime(isoStr: string, timezone: string): string {
  try {
    return new Date(isoStr).toLocaleString("en-US", { timeZone: timezone, dateStyle: "full", timeStyle: "short" });
  } catch {
    return new Date(isoStr).toLocaleString("en-US");
  }
}

function buildReminderMessage(
  interpName: string,
  appt: any,
  reminderLabel: string,
  timezone: string,
): { subject: string; body: string; smsBody: string } {
  const dateStr = formatDateTime(appt.scheduled_start, timezone);
  const location = appt.location_name
    ? `${appt.location_name}${appt.loc_addr ? `, ${appt.loc_addr}` : ""}${appt.loc_city ? `, ${appt.loc_city}` : ""}${appt.loc_state ? ` ${appt.loc_state}` : ""}`
    : "TBD";
  const customer = appt.customer_name || "N/A";
  const language = appt.lang_name || "N/A";
  const title = appt.title || "Interpreting Assignment";

  const subject = `Reminder: ${title} in ${reminderLabel}`;
  const body = `Hi ${interpName},\n\nThis is a reminder that you have an upcoming assignment:\n\n` +
    `📋 Assignment: ${title}\n📅 Date & Time: ${dateStr}\n📍 Location: ${location}\n🏢 Customer: ${customer}\n🌐 Language: ${language}\n\n` +
    `Please ensure you arrive on time. If you need to make changes, contact your agency administrator.\n\nThank you,\n${SITE_NAME}`;

  const smsBody = `BlueThread Reminder: ${title} on ${dateStr} at ${location}. Customer: ${customer}. Language: ${language}.`;

  return { subject, body, smsBody };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Auth: only allow calls with a valid service-role key or authenticated admin
  const authHeader = req.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    // Allow service-role key directly (for cron/internal calls)
    if (token !== serviceKey) {
      // Verify as user JWT — must be agency_admin
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const anonClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userId = claimsData.claims.sub as string;
      const svcClient = createClient(supabaseUrl, serviceKey);
      const { data: roles } = await svcClient
        .from("user_roles").select("role").eq("user_id", userId);
      const isAdmin = (roles || []).some((r: { role: string }) => r.role === "agency_admin");
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  }
  // If no auth header, allow the call (for backward-compatible cron invocations via Supabase infrastructure)

  const adminClient = createClient(supabaseUrl, serviceKey);

  const now = new Date();
  let totalSent = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  try {
    // 1. Cancel stale reminders
    await adminClient.rpc("cancel_stale_reminders" as any);

    // 2. Compute the overall time window that covers ALL reminder types
    const earliestWindow = new Date(now.getTime() + (15 - TOLERANCE_MINUTES) * 60_000);
    const latestWindow = new Date(now.getTime() + (1440 + TOLERANCE_MINUTES) * 60_000);

    // 3. Single cross-agency query: all appointments in the widest window
    const { data: appts, error: apptErr } = await adminClient
      .from("appointments")
      .select(`
        id, title, scheduled_start, scheduled_end, status,
        interpreter_id, agency_id,
        customers!appointments_customer_id_fkey ( name ),
        locations!appointments_location_id_fkey ( name, address_line1, city, state ),
        languages!appointments_language_id_fkey ( name ),
        interpreter:profiles!appointments_interpreter_id_fkey ( id, first_name, last_name, email, phone ),
        agencies!appointments_agency_id_fkey ( id, settings, timezone )
      `)
      .not("interpreter_id", "is", null)
      .eq("is_import_staged", false)
      .eq("is_deleted", false)
      .in("status", ["interpreter_confirmed"])
      .gte("scheduled_start", earliestWindow.toISOString())
      .lte("scheduled_start", latestWindow.toISOString());

    if (apptErr) throw apptErr;
    if (!appts?.length) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, skipped: 0, errors: 0, message: "No appointments in window" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4. Batch-fetch interpreter notification prefs for all relevant interpreters
    const interpIds = [...new Set(appts.map((a: any) => a.interpreter?.id).filter(Boolean))];
    const { data: allInterpPrefs } = await adminClient
      .from("interpreter_notification_prefs")
      .select("user_id, agency_id, enable_email_notifications, enable_sms_notifications, reminder_24h_enabled, reminder_2h_enabled, reminder_15m_enabled, preferred_notification_channel")
      .in("user_id", interpIds);

    const prefsMap = new Map<string, InterpreterNotifPrefs>();
    for (const p of (allInterpPrefs || [])) {
      prefsMap.set(`${p.user_id}:${p.agency_id}`, p);
    }

    // 5. Batch-fetch existing notification_log entries for deduplication
    const apptIds = [...new Set(appts.map((a: any) => a.id))];
    const { data: existingLogs } = await adminClient
      .from("notification_log")
      .select("appointment_id, reminder_type, channel")
      .in("appointment_id", apptIds)
      .in("status", ["sent", "pending", "failed"])
      .not("reminder_type", "is", null);

    const dedupSet = new Set<string>();
    for (const log of (existingLogs || [])) {
      dedupSet.add(`${log.appointment_id}:${log.reminder_type}:${log.channel}`);
    }

    // 6. Build agency settings cache
    const agencySettingsCache = new Map<string, { settings: AgencyReminderSettings; timezone: string }>();
    for (const appt of appts) {
      const agency = (appt as any).agencies;
      if (agency && !agencySettingsCache.has(agency.id)) {
        agencySettingsCache.set(agency.id, {
          settings: { ...getDefaultAgencySettings(), ...((agency.settings as any)?.reminder_settings || {}) },
          timezone: agency.timezone || "America/New_York",
        });
      }
    }

    // 7. Process each appointment × reminder type
    for (const appt of appts) {
      const interpreter = (appt as any).interpreter;
      if (!interpreter?.id) continue;

      const agencyId = (appt as any).agency_id;
      const agencyCache = agencySettingsCache.get(agencyId);
      if (!agencyCache) continue;

      const interpPrefs = prefsMap.get(`${interpreter.id}:${agencyId}`) || null;
      const interpName = `${interpreter.first_name || ""} ${interpreter.last_name || ""}`.trim() || "Interpreter";

      const flatAppt = {
        ...appt,
        customer_name: (appt as any).customers?.name,
        location_name: (appt as any).locations?.name,
        loc_addr: (appt as any).locations?.address_line1,
        loc_city: (appt as any).locations?.city,
        loc_state: (appt as any).locations?.state,
        lang_name: (appt as any).languages?.name,
      };

      for (const reminderDef of REMINDER_DEFS) {
        const targetTime = new Date(now.getTime() + reminderDef.minutesBefore * 60_000);
        const windowStart = new Date(targetTime.getTime() - TOLERANCE_MINUTES * 60_000);
        const windowEnd = new Date(targetTime.getTime() + TOLERANCE_MINUTES * 60_000);
        const apptStart = new Date((appt as any).scheduled_start);

        if (apptStart < windowStart || apptStart > windowEnd) continue;

        const channels = resolveChannels(agencyCache.settings, interpPrefs, reminderDef);
        if (!channels.email && !channels.sms) { totalSkipped++; continue; }

        const msg = buildReminderMessage(interpName, flatAppt, reminderDef.label, agencyCache.timezone);

        if (channels.email && interpreter.email) {
          const key = `${appt.id}:${reminderDef.type}:email`;
          if (dedupSet.has(key)) { totalSkipped++; }
          else {
            dedupSet.add(key);
            const result = await deliverAndLog(adminClient, {
              agency_id: agencyId,
              channel: "email",
              recipient: interpreter.email,
              subject: msg.subject,
              body: msg.body,
              related_entity_type: "appointment",
              related_entity_id: appt.id,
              reminder_type: reminderDef.type,
              appointment_id: appt.id,
            });
            if (result.success) totalSent++; else totalErrors++;
          }
        }

        if (channels.sms && interpreter.phone) {
          const key = `${appt.id}:${reminderDef.type}:sms`;
          if (dedupSet.has(key)) { totalSkipped++; }
          else {
            dedupSet.add(key);
            const result = await deliverAndLog(adminClient, {
              agency_id: agencyId,
              channel: "sms",
              recipient: interpreter.phone,
              subject: msg.subject,
              body: msg.smsBody,
              related_entity_type: "appointment",
              related_entity_id: appt.id,
              reminder_type: reminderDef.type,
              appointment_id: appt.id,
            });
            if (result.success) totalSent++; else totalErrors++;
          }
        }
      }
    }

    console.log(`Reminder run complete: ${totalSent} sent, ${totalSkipped} skipped, ${totalErrors} errors`);
    return new Response(
      JSON.stringify({ success: true, sent: totalSent, skipped: totalSkipped, errors: totalErrors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("process-reminders error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
