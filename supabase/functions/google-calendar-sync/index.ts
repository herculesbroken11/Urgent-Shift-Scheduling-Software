import { getCorsHeaders, authenticateCaller, AuthError, errorResponse } from "../_shared/cors.ts";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

interface CalendarConnection {
  id: string;
  user_id: string;
  agency_id: string;
  google_email: string | null;
  access_token: string | null;
  refresh_token: string;
  token_expires_at: string | null;
  calendar_id: string;
  timezone: string;
  sync_enabled: boolean;
}

/**
 * Resolve the effective timezone for an appointment:
 *   appointment-level (from connection user) > user profile > agency > fallback
 */
async function resolveTimezone(
  adminClient: any,
  userId: string,
  agencyId: string
): Promise<string> {
  // Check user's calendar connection timezone first
  const { data: conn } = await adminClient
    .from("google_calendar_connections")
    .select("timezone")
    .eq("user_id", userId)
    .single();
  if (conn?.timezone) return conn.timezone;

  // User profile timezone
  const { data: profile } = await adminClient
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .single();
  if (profile?.timezone) return profile.timezone;

  // Agency timezone
  const { data: agency } = await adminClient
    .from("agencies")
    .select("timezone")
    .eq("id", agencyId)
    .single();
  if (agency?.timezone) return agency.timezone;

  return "America/New_York";
}

/**
 * Refresh the Google OAuth access token using the stored refresh token.
 * Updates the connection record with the new access token.
 */
async function getAccessToken(
  adminClient: any,
  connection: CalendarConnection
): Promise<string> {
  // Check if current token is still valid
  if (
    connection.access_token &&
    connection.token_expires_at &&
    new Date(connection.token_expires_at) > new Date(Date.now() + 60_000)
  ) {
    return connection.access_token;
  }

  const clientId = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new AuthError("Google Calendar OAuth credentials not configured on server", 500);
  }

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    // Update connection with error status
    await adminClient
      .from("google_calendar_connections")
      .update({
        last_sync_status: "auth_error",
        last_sync_error: data.error_description || data.error || "Token refresh failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);
    throw new Error(`Google token refresh failed: ${data.error_description || data.error}`);
  }

  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();

  await adminClient
    .from("google_calendar_connections")
    .update({
      access_token: data.access_token,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    const { userId, agencyId, roles, adminClient } = await authenticateCaller(req);

    const body = await req.json();
    const { action } = body;

    // ─── ACTION: oauth-callback ───
    // Exchange authorization code for tokens and store the connection
    if (action === "oauth-callback") {
      const { code, redirect_uri, timezone } = body;
      if (!code || !redirect_uri) {
        return new Response(JSON.stringify({ error: "code and redirect_uri required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const clientId = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID");
      const clientSecret = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET");
      if (!clientId || !clientSecret) {
        return new Response(JSON.stringify({ error: "Google OAuth not configured on server" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Exchange code for tokens
      const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri,
          grant_type: "authorization_code",
        }),
      });
      const tokenData = await tokenResp.json();
      if (!tokenResp.ok) {
        return new Response(JSON.stringify({
          error: "Failed to exchange auth code",
          details: tokenData.error_description || tokenData.error,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Get Google email
      let googleEmail: string | null = null;
      try {
        const infoResp = await fetch(GOOGLE_USERINFO_URL, {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (infoResp.ok) {
          const info = await infoResp.json();
          googleEmail = info.email || null;
        }
      } catch { /* non-fatal */ }

      const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();
      const effectiveTz = timezone || await resolveTimezone(adminClient, userId, agencyId);

      // Upsert connection
      const { data: conn, error: upsertErr } = await adminClient
        .from("google_calendar_connections")
        .upsert({
          user_id: userId,
          agency_id: agencyId,
          google_email: googleEmail,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: expiresAt,
          timezone: effectiveTz,
          sync_enabled: true,
          last_sync_status: "connected",
          last_sync_error: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" })
        .select()
        .single();
      if (upsertErr) throw upsertErr;

      return new Response(JSON.stringify({ success: true, connection: conn }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: status ───
    if (action === "status") {
      const clientId = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID");
      const clientSecret = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET");
      const serverConfigured = !!(clientId && clientSecret);

      const { data: conn } = await adminClient
        .from("google_calendar_connections")
        .select("*")
        .eq("user_id", userId)
        .single();

      return new Response(JSON.stringify({
        server_configured: serverConfigured,
        // OAuth client IDs are public — safe to expose to authenticated callers
        client_id: serverConfigured ? clientId : null,
        connection: conn || null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── ACTION: disconnect ───
    if (action === "disconnect") {
      await adminClient
        .from("google_calendar_connections")
        .delete()
        .eq("user_id", userId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: update-settings ───
    if (action === "update-settings") {
      const { timezone: newTz, calendar_id, sync_enabled } = body;
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (newTz) updates.timezone = newTz;
      if (calendar_id) updates.calendar_id = calendar_id;
      if (typeof sync_enabled === "boolean") updates.sync_enabled = sync_enabled;

      const { error } = await adminClient
        .from("google_calendar_connections")
        .update(updates)
        .eq("user_id", userId);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: sync / delete ───
    // Requires admin, scheduler, interpreter, or requester role (requesters trigger sync when creating their own appointments)
    const isAdminOrScheduler = roles.includes("agency_admin") || roles.includes("scheduler");
    const isInterpreter = roles.includes("interpreter");
    const isRequester = roles.includes("requester");
    if (!isAdminOrScheduler && !isInterpreter && !isRequester) {
      return new Response(JSON.stringify({ error: "Forbidden: insufficient role" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { appointment_id } = body;
    if (!appointment_id) {
      return new Response(JSON.stringify({ error: "appointment_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify appointment belongs to caller's agency
    const { data: apptCheck, error: apptCheckErr } = await adminClient
      .from("appointments")
      .select("id, agency_id, interpreter_id")
      .eq("id", appointment_id)
      .single();
    if (apptCheckErr || !apptCheck || apptCheck.agency_id !== agencyId) {
      return new Response(JSON.stringify({ error: "Appointment not found or access denied" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Interpreters can only sync their own assigned appointments
    if (isInterpreter && !isAdminOrScheduler && apptCheck.interpreter_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden: interpreters can only sync their own appointments" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's calendar connection
    const { data: connection, error: connErr } = await adminClient
      .from("google_calendar_connections")
      .select("*")
      .eq("user_id", userId)
      .single();
    if (connErr || !connection) {
      return new Response(JSON.stringify({ success: false, skipped: true, reason: "no_connection", message: "No Google Calendar connection found. Sync skipped." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getAccessToken(adminClient, connection as CalendarConnection);
    const tz = await resolveTimezone(adminClient, userId, agencyId);

    if (action === "sync") {
      const { data: appt, error: apptErr } = await adminClient
        .from("appointments")
        .select("*, languages(name), customers(name), locations(name, address_line1, city), gcal_event_id")
        .eq("id", appointment_id)
        .eq("agency_id", agencyId)
        .single();
      if (apptErr || !appt) {
        return new Response(JSON.stringify({ error: "Appointment not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const event = {
        summary: appt.title || `Interpreting - ${appt.languages?.name || ""}`,
        description: [
          appt.description,
          `Customer: ${appt.customers?.name || "N/A"}`,
          `Status: ${appt.status}`,
        ].filter(Boolean).join("\n"),
        start: { dateTime: appt.scheduled_start, timeZone: tz },
        end: { dateTime: appt.scheduled_end, timeZone: tz },
        location: appt.locations
          ? `${appt.locations.name}, ${appt.locations.address_line1 || ""}, ${appt.locations.city || ""}`
          : undefined,
      };

      let result;
      let syncError: string | null = null;
      const calendarId = (connection as any).calendar_id || "primary";

      try {
        if (appt.gcal_event_id) {
          const resp = await fetch(
            `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${appt.gcal_event_id}`,
            {
              method: "PUT",
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify(event),
            }
          );
          result = await resp.json();
          if (!resp.ok) syncError = result.error?.message || "Update failed";
        } else {
          const resp = await fetch(
            `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify(event),
            }
          );
          result = await resp.json();
          if (!resp.ok) syncError = result.error?.message || "Create failed";
        }
      } catch (e: any) {
        syncError = e.message;
      }

      // Update appointment sync tracking
      const now = new Date().toISOString();
      await adminClient
        .from("appointments")
        .update({
          gcal_event_id: syncError ? appt.gcal_event_id : (result?.id || appt.gcal_event_id),
          gcal_sync_status: syncError ? "error" : "synced",
          gcal_last_synced_at: syncError ? appt.gcal_last_synced_at : now,
          gcal_sync_error: syncError,
        })
        .eq("id", appointment_id);

      // Update connection last_synced_at
      await adminClient
        .from("google_calendar_connections")
        .update({
          last_synced_at: now,
          last_sync_status: syncError ? "error" : "ok",
          last_sync_error: syncError,
          updated_at: now,
        })
        .eq("id", (connection as any).id);

      if (syncError) {
        const isAuthError = syncError.includes("invalid_grant") || syncError.includes("Token") || syncError.includes("unauthorized") || syncError.includes("401");
        const isRateLimit = syncError.includes("rate") || syncError.includes("429") || syncError.includes("quota");
        const userMessage = isAuthError
          ? "Google Calendar connection has expired. Please reconnect in Calendar Settings."
          : isRateLimit
          ? "Google Calendar API rate limit reached. Please try again in a few minutes."
          : `Calendar sync failed: ${syncError}`;
        return new Response(JSON.stringify({ success: false, error: userMessage, error_type: isAuthError ? "auth" : isRateLimit ? "rate_limit" : "sync" }), {
          status: isAuthError ? 401 : isRateLimit ? 429 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, event_id: result.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const { data: appt } = await adminClient
        .from("appointments")
        .select("gcal_event_id")
        .eq("id", appointment_id)
        .eq("agency_id", agencyId)
        .single();

      if (appt?.gcal_event_id) {
        const calendarId = (connection as any).calendar_id || "primary";
        await fetch(
          `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${appt.gcal_event_id}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
        );
        await adminClient
          .from("appointments")
          .update({
            gcal_event_id: null,
            gcal_sync_status: "unsynced",
            gcal_last_synced_at: null,
            gcal_sync_error: null,
          })
          .eq("id", appointment_id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: bulk-sync ───
    if (action === "bulk-sync") {
      const { data: appts } = await adminClient
        .from("appointments")
        .select("id")
        .eq("agency_id", agencyId)
        .in("status", ["interpreter_assigned", "interpreter_assigned_last_minute", "interpreter_confirmed", "in_progress"])
        .gte("scheduled_start", new Date().toISOString())
        .is("gcal_event_id", null)
        .limit(50);

      const results = { synced: 0, errors: 0 };
      for (const a of (appts || [])) {
        try {
          // Recursive call via fetch to reuse sync logic
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
          const authHeader = req.headers.get("Authorization")!;
          const resp = await fetch(`${supabaseUrl}/functions/v1/google-calendar-sync`, {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
              apikey: anonKey,
            },
            body: JSON.stringify({ action: "sync", appointment_id: a.id }),
          });
          const d = await resp.json();
          if (d.success) results.synced++; else results.errors++;
        } catch {
          results.errors++;
        }
      }

      return new Response(JSON.stringify({ success: true, ...results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    return errorResponse(error, req);
  }
});
