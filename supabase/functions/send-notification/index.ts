import { getCorsHeaders, authenticateCaller, AuthError, errorResponse } from "../_shared/cors.ts";
import { deliverAndLog, buildBrandedHtml } from "../_shared/delivery.ts";

interface NotificationRequest {
  channel: "sms" | "email" | "in_app";
  recipient?: string;
  target_user_id?: string;
  template_id?: string;
  variables?: Record<string, string>;
  title?: string;
  message?: string;
  subject?: string;
  type?: string;
  related_entity_type?: string;
  related_entity_id?: string;
}

function replaceVariables(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    const { userId, agencyId, roles, adminClient } = await authenticateCaller(req);

    const body: NotificationRequest = await req.json();

    const isPrivileged = roles.includes("agency_admin") || roles.includes("scheduler");
    const isInterpreter = roles.includes("interpreter");
    const isRequester = roles.includes("requester");

    // Privileged roles: any channel.
    // Interpreters & requesters: only in_app notifications (lifecycle alerts to admins).
    if (!isPrivileged && !((isInterpreter || isRequester) && body.channel === "in_app")) {
      throw new AuthError("Forbidden: insufficient role to send notifications", 403);
    }
    let finalSubject = body.subject || "";
    let finalBody = body.message || "";
    let finalTitle = body.title || "";

    // Template resolution
    if (body.template_id) {
      const { data: template, error: tplErr } = await adminClient
        .from("notification_templates")
        .select("*")
        .eq("id", body.template_id)
        .eq("agency_id", agencyId)
        .single();

      if (tplErr || !template) {
        return new Response(JSON.stringify({ error: "Template not found or access denied" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const vars = body.variables || {};
      finalBody = replaceVariables(template.body_template, vars);
      finalSubject = template.subject ? replaceVariables(template.subject, vars) : "";
      finalTitle = template.name;
    }

    // In-app notification
    if (body.channel === "in_app" && body.target_user_id) {
      const { data: targetProfile, error: tpErr } = await adminClient
        .from("profiles")
        .select("agency_id")
        .eq("id", body.target_user_id)
        .single();

      if (tpErr || !targetProfile || targetProfile.agency_id !== agencyId) {
        return new Response(JSON.stringify({ error: "Target user not found or cross-agency access denied" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await adminClient.from("notifications").insert({
        user_id: body.target_user_id,
        agency_id: agencyId,
        title: finalTitle || "Notification",
        message: finalBody,
        type: body.type || "info",
        related_entity_type: body.related_entity_type,
        related_entity_id: body.related_entity_id,
      });
      if (error) throw error;

      return new Response(JSON.stringify({ success: true, channel: "in_app" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Email or SMS — use shared delivery module
    if (body.channel === "email" || body.channel === "sms") {
      if (!body.recipient || !body.recipient.trim()) {
        return new Response(JSON.stringify({ error: "Recipient is required for email/SMS notifications" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!finalBody.trim()) {
        return new Response(JSON.stringify({ error: "Message body cannot be empty" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const emailSubject = finalSubject || finalTitle || "Notification from BlueThread";

      const result = await deliverAndLog(adminClient, {
        agency_id: agencyId,
        channel: body.channel,
        recipient: body.recipient,
        subject: emailSubject,
        body: finalBody,
        template_id: body.template_id,
        related_entity_type: body.related_entity_type,
        related_entity_id: body.related_entity_id,
      });

      return new Response(
        JSON.stringify({
          success: result.success,
          status: result.success ? "sent" : "failed",
          message_id: result.messageId,
          error: result.error,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "Invalid channel or missing recipient" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    return errorResponse(error, req);
  }
});
