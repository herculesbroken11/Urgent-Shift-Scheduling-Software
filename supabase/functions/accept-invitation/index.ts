import { getCorsHeaders, AuthError, errorResponse } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * accept-invitation: Links a newly signed-up user to the agency specified
 * in their pending invitation. All scoping is derived server-side from the
 * JWT and the invitation record — no client-supplied agency_id is trusted.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    // ── 1. Authenticate caller via JWT ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthError("Missing Authorization header", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      throw new AuthError("Invalid or expired token", 401);
    }
    const userId = claimsData.claims.sub as string;
    const userEmail = (claimsData.claims.email as string | undefined)?.toLowerCase();

    if (!userEmail) {
      throw new AuthError("Token does not contain an email claim", 401);
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // ── 2. Find pending invitation matching the authenticated user's email ──
    // Direct server-side case-insensitive query (no limit issues)
    const { data: pendingInvites, error: invErr } = await adminClient
      .from("invitations")
      .select("*")
      .ilike("email", userEmail)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (invErr) throw invErr;

    const matchedInvitation = pendingInvites?.[0] ?? null;

    // Check for revoked or expired match to give a better error
    if (!matchedInvitation) {
      const { data: anyInvites } = await adminClient
        .from("invitations")
        .select("status, expires_at")
        .ilike("email", userEmail)
        .order("created_at", { ascending: false })
        .limit(1);

      const anyMatch = anyInvites?.[0];
      if (anyMatch) {
        if (anyMatch.status === "revoked") {
          return new Response(JSON.stringify({ found: false, reason: "invitation_revoked" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (anyMatch.expires_at && new Date(anyMatch.expires_at) < new Date()) {
          return new Response(JSON.stringify({ found: false, reason: "invitation_expired" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    if (!matchedInvitation) {
      return new Response(JSON.stringify({ found: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 3. Guard: user must not already belong to an agency ──
    const { data: profile } = await adminClient
      .from("profiles")
      .select("agency_id")
      .eq("id", userId)
      .single();

    if (profile?.agency_id) {
      return new Response(JSON.stringify({ found: false, reason: "already_has_agency" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4. Guard: user must not already have roles (prevent duplicate on race) ──
    const { data: existingRoles } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .limit(1);

    if (existingRoles && existingRoles.length > 0) {
      return new Response(JSON.stringify({ found: false, reason: "roles_already_assigned" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 5. Guard: agency must exist and be active ──
    const invAgencyId = matchedInvitation.agency_id;
    const { data: invAgency } = await adminClient
      .from("agencies")
      .select("agency_status")
      .eq("id", invAgencyId)
      .single();
    if (!invAgency) {
      return new Response(JSON.stringify({ found: false, reason: "agency_not_found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (invAgency.agency_status === "suspended" || invAgency.agency_status === "cancelled") {
      return new Response(JSON.stringify({ found: false, reason: "agency_suspended" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 6. Link user to the invitation's agency ──

    const { error: profileErr } = await adminClient
      .from("profiles")
      .update({
        agency_id: invAgencyId,
        first_name: matchedInvitation.first_name || undefined,
        last_name: matchedInvitation.last_name || undefined,
        phone: matchedInvitation.phone || undefined,
        is_active: true,
      })
      .eq("id", userId);

    if (profileErr) throw profileErr;

    // ── 6. Assign role from invitation record ──
    const { error: roleErr } = await adminClient
      .from("user_roles")
      .insert({
        user_id: userId,
        role: matchedInvitation.role,
        agency_id: invAgencyId,
      });

    if (roleErr) throw roleErr;

    // ── 6b. For requesters: link to customer if customer_id present ──
    if (matchedInvitation.role === "requester" && matchedInvitation.customer_id) {
      // Set customer_id on profile
      await adminClient
        .from("profiles")
        .update({ customer_id: matchedInvitation.customer_id })
        .eq("id", userId);

      // Create customer_requestors linkage
      await adminClient
        .from("customer_requestors")
        .upsert({
          customer_id: matchedInvitation.customer_id,
          user_id: userId,
          agency_id: invAgencyId,
          access_all_locations: true,
          is_active: true,
        }, { onConflict: "customer_id,user_id" });
    }

    // ── 7. Mark invitation as accepted ──
    const { error: updateErr } = await adminClient
      .from("invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", matchedInvitation.id)
      .eq("status", "pending"); // optimistic lock: only update if still pending

    if (updateErr) throw updateErr;

    // Do NOT leak agency_id or internal identifiers to the client
    return new Response(
      JSON.stringify({
        found: true,
        accepted: true,
        role: matchedInvitation.role,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return errorResponse(error, req);
  }
});
