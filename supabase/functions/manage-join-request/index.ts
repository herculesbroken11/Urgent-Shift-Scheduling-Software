import { AuthError } from "../_shared/cors.ts";
import { withCors, json, jsonError } from "../_shared/handler.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * manage-join-request: Server-side handler for creating, approving, and rejecting join requests.
 * Modes: submit, approve, reject
 *
 * Submit: validates agency settings, prevents duplicates (by user_id AND email), handles auto-approval.
 * Approve: revalidates agency/role/customer, links existing user (no new auth user creation).
 * Reject: marks request as rejected.
 */
Deno.serve(withCors(async (req) => {
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
    const callerId = claimsData.claims.sub as string;
    const callerEmail = (claimsData.claims.email as string | undefined)?.toLowerCase();

    const adminClient = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const { mode } = body;

    // ─── SUBMIT: User submitting a join request ───
    if (mode === "submit") {
      const { agency_id, first_name, last_name, phone, requested_role, customer_id } = body;

      if (!agency_id || !requested_role) {
        return jsonError("agency_id and requested_role are required", 400);
      }

      // 1. Agency must exist and be active
      const { data: agency, error: agErr } = await adminClient
        .from("agencies")
        .select("id, name, settings, agency_status")
        .eq("id", agency_id)
        .single();
      if (agErr || !agency) return jsonError("Agency not found", 404);
      if (agency.agency_status !== "active") return jsonError("Agency is not active", 400);

      // 2. Self-join must be enabled
      const settings = (agency.settings as any) || {};
      if (!settings.allow_self_join) return jsonError("Self-join is not enabled for this agency", 403);

      // 3. Role must be allowed by self_join_roles AND be a valid role
      const validRoles = ["interpreter", "requester", "scheduler"];
      if (!validRoles.includes(requested_role)) {
        return jsonError(`Invalid role: ${requested_role}`, 400);
      }
      const allowedRoles: string[] = settings.self_join_roles || ["interpreter"];
      if (!allowedRoles.includes(requested_role)) {
        return jsonError(`Role '${requested_role}' is not available for self-join`, 400);
      }

      // 4. User must not already belong to an agency
      const { data: callerProfile } = await adminClient
        .from("profiles")
        .select("agency_id")
        .eq("id", callerId)
        .single();
      if (callerProfile?.agency_id) {
        return jsonError("You already belong to an agency", 400);
      }

      // 5. No duplicate pending request — check by user_id OR normalized email
      const { data: existingById } = await adminClient
        .from("join_requests")
        .select("id")
        .eq("agency_id", agency_id)
        .eq("user_id", callerId)
        .eq("status", "pending")
        .limit(1);
      if (existingById && existingById.length > 0) {
        return jsonError("You already have a pending request for this agency", 400);
      }
      if (callerEmail) {
        const { data: existingByEmail } = await adminClient
          .from("join_requests")
          .select("id")
          .eq("agency_id", agency_id)
          .ilike("email", callerEmail)
          .eq("status", "pending")
          .limit(1);
        if (existingByEmail && existingByEmail.length > 0) {
          return jsonError("A pending request already exists for this email", 400);
        }
      }

      // 6. Validate customer_id if requester
      if (requested_role === "requester" && customer_id) {
        const { data: cust } = await adminClient
          .from("customers")
          .select("id")
          .eq("id", customer_id)
          .eq("agency_id", agency_id)
          .single();
        if (!cust) return jsonError("Customer not found in this agency", 400);
      }

      // 7. Check auto-approval
      const requireApproval = settings.require_join_approval !== false;

      if (!requireApproval) {
        // Auto-approve: require valid email for audit record
        if (!callerEmail) {
          return jsonError("Your account does not have a verified email. Cannot submit a join request.", 400);
        }
        // Attach user immediately
        const linkResult = await linkUserToAgency(adminClient, {
          userId: callerId,
          agencyId: agency_id,
          role: requested_role,
          firstName: first_name,
          lastName: last_name,
          phone,
          customerId: requested_role === "requester" ? customer_id : undefined,
        });
        if (linkResult.error) return jsonError(linkResult.error, 400);

        // Record the auto-approved join request for audit
        await adminClient.from("join_requests").insert({
          agency_id,
          email: callerEmail || "",
          first_name: first_name || null,
          last_name: last_name || null,
          phone: phone || null,
          requested_role,
          user_id: callerId,
          customer_id: requested_role === "requester" ? customer_id || null : null,
          status: "approved",
          reviewed_at: new Date().toISOString(),
          reviewed_by: callerId, // self-approved
        });

        return json({ success: true, auto_approved: true });
      }

      // 8. Require a valid email for the join request record
      if (!callerEmail) {
        return jsonError("Your account does not have a verified email. Cannot submit a join request.", 400);
      }

      // 9. Create pending request
      const { error: insertErr } = await adminClient.from("join_requests").insert({
        agency_id,
        email: callerEmail,
        first_name: first_name || null,
        last_name: last_name || null,
        phone: phone || null,
        requested_role,
        user_id: callerId,
        customer_id: requested_role === "requester" ? customer_id || null : null,
        status: "pending",
      });
      if (insertErr) throw insertErr;

      // Notify agency admins (fire-and-forget)
      try {
        const { data: admins } = await adminClient
          .from("user_roles")
          .select("user_id")
          .eq("agency_id", agency_id)
          .eq("role", "agency_admin");
        if (admins && admins.length > 0) {
          for (const admin of admins) {
            await adminClient.from("notifications").insert({
              agency_id,
              user_id: admin.user_id,
              type: "info",
              title: "New Join Request",
              message: `${first_name || callerEmail || "A user"} has requested to join as ${requested_role}.`,
              related_entity_type: "join_request",
            });
          }
        }
      } catch (notifErr) {
        console.error("Non-fatal: admin notification failed", notifErr);
      }

      return json({ success: true, status: "pending" });
    }

    // ─── APPROVE / REJECT: Admin action ───
    if (mode === "approve" || mode === "reject") {
      const { request_id } = body;
      if (!request_id) return jsonError("request_id is required", 400);

      // Verify caller is admin
      const { data: callerProfile } = await adminClient
        .from("profiles")
        .select("agency_id")
        .eq("id", callerId)
        .single();
      if (!callerProfile?.agency_id) throw new AuthError("No agency association", 403);

      const { data: callerRoles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId)
        .eq("agency_id", callerProfile.agency_id);
      const isAdmin = (callerRoles || []).some((r: any) => r.role === "agency_admin");
      if (!isAdmin) throw new AuthError("Only agency admins can manage join requests", 403);

      // Fetch request
      const { data: joinReq, error: fetchErr } = await adminClient
        .from("join_requests")
        .select("*")
        .eq("id", request_id)
        .eq("agency_id", callerProfile.agency_id)
        .single();
      if (fetchErr || !joinReq) return jsonError("Join request not found", 404);
      if (joinReq.status !== "pending") {
        return jsonError(`Request is already ${joinReq.status}`, 400);
      }

      if (mode === "reject") {
        const { rejection_reason } = body;
        await adminClient.from("join_requests").update({
          status: "rejected",
          reviewed_by: callerId,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejection_reason || null,
        }).eq("id", request_id);

        return json({ success: true, status: "rejected" });
      }

      // ─── APPROVE ───
      const agencyId = callerProfile.agency_id;

      // Revalidate: agency must still be active
      const { data: agencyCheck } = await adminClient
        .from("agencies")
        .select("agency_status")
        .eq("id", agencyId)
        .single();
      if (!agencyCheck || agencyCheck.agency_status !== "active") {
        return jsonError("Agency is no longer active. Cannot approve.", 400);
      }

      // Revalidate: requested_role must be a valid role
      const validRoles = ["interpreter", "requester", "scheduler"];
      if (!validRoles.includes(joinReq.requested_role)) {
        return jsonError(`Invalid role on request: ${joinReq.requested_role}`, 400);
      }

      // Revalidate: requested_role must still be allowed by current self_join_roles
      const { data: agencyFull } = await adminClient
        .from("agencies")
        .select("settings")
        .eq("id", agencyId)
        .single();
      const currentSettings = (agencyFull?.settings as any) || {};
      const currentAllowedRoles: string[] = currentSettings.self_join_roles || ["interpreter"];
      if (!currentAllowedRoles.includes(joinReq.requested_role)) {
        return jsonError(
          `Role '${joinReq.requested_role}' is no longer allowed for self-join. Current allowed roles: ${currentAllowedRoles.join(", ")}`,
          400
        );
      }

      // Revalidate: if requester with customer_id, customer must still belong to agency
      if (joinReq.requested_role === "requester" && joinReq.customer_id) {
        const { data: cust } = await adminClient
          .from("customers")
          .select("id")
          .eq("id", joinReq.customer_id)
          .eq("agency_id", agencyId)
          .single();
        if (!cust) {
          return jsonError("Linked customer no longer belongs to this agency", 400);
        }
      }

      if (joinReq.user_id) {
        // Existing authenticated user — link them directly, do NOT create a new auth user
        const { data: existingProfile } = await adminClient
          .from("profiles")
          .select("agency_id")
          .eq("id", joinReq.user_id)
          .single();

        if (existingProfile?.agency_id && existingProfile.agency_id !== agencyId) {
          return jsonError("User already belongs to another agency. Cannot reassign.", 400);
        }

        if (existingProfile?.agency_id === agencyId) {
          // Already linked — just ensure role exists (idempotent)
          await upsertRole(adminClient, joinReq.user_id, joinReq.requested_role, agencyId);
          if (joinReq.requested_role === "requester" && joinReq.customer_id) {
            await linkRequester(adminClient, joinReq.user_id, joinReq.customer_id, agencyId);
          }
        } else {
          const linkResult = await linkUserToAgency(adminClient, {
            userId: joinReq.user_id,
            agencyId,
            role: joinReq.requested_role,
            firstName: joinReq.first_name,
            lastName: joinReq.last_name,
            phone: joinReq.phone,
            customerId: joinReq.requested_role === "requester" ? joinReq.customer_id : undefined,
          });
          if (linkResult.error) return jsonError(linkResult.error, 400);
        }
      } else {
        return jsonError("Join request has no associated user. Cannot approve without a user account.", 400);
      }

      await adminClient.from("join_requests").update({
        status: "approved",
        reviewed_by: callerId,
        reviewed_at: new Date().toISOString(),
      }).eq("id", request_id);

      return json({ success: true, status: "approved" });
    }

    return jsonError("Invalid mode. Use 'submit', 'approve', or 'reject'.", 400);
}));

// ─── Shared helpers (centralized requester linkage) ───

/** Idempotent role upsert with fallback */
async function upsertRole(adminClient: any, uid: string, role: string, agencyId: string) {
  const { error } = await adminClient
    .from("user_roles")
    .upsert(
      { user_id: uid, role, agency_id: agencyId },
      { onConflict: "user_id,role,agency_id" },
    );
  if (error) {
    const { error: insertErr } = await adminClient
      .from("user_roles")
      .insert({ user_id: uid, role, agency_id: agencyId });
    if (insertErr && !insertErr.message?.includes("duplicate")) {
      throw insertErr;
    }
  }
}

/** Idempotent requester linkage: profiles.customer_id + customer_requestors */
async function linkRequester(adminClient: any, uid: string, customerId: string, agencyId: string) {
  await adminClient
    .from("profiles")
    .update({ customer_id: customerId })
    .eq("id", uid);
  await adminClient
    .from("customer_requestors")
    .upsert(
      {
        customer_id: customerId,
        user_id: uid,
        agency_id: agencyId,
        access_all_locations: true,
        is_active: true,
      },
      { onConflict: "customer_id,user_id" },
    );
}

/**
 * Centralized helper to link an existing user to an agency.
 * Handles profile update, role assignment, and requester linkage.
 * Idempotent — safe to call multiple times.
 */
async function linkUserToAgency(
  adminClient: any,
  params: {
    userId: string;
    agencyId: string;
    role: string;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    customerId?: string | null;
  },
): Promise<{ error?: string }> {
  const { userId, agencyId, role, firstName, lastName, phone, customerId } = params;

  // Update profile
  const profileUpdate: Record<string, unknown> = {
    agency_id: agencyId,
    is_active: true,
  };
  if (firstName) profileUpdate.first_name = firstName;
  if (lastName) profileUpdate.last_name = lastName;
  if (phone) profileUpdate.phone = phone;
  if (role === "requester" && customerId) {
    profileUpdate.customer_id = customerId;
  }

  const { error: profErr } = await adminClient
    .from("profiles")
    .update(profileUpdate)
    .eq("id", userId);
  if (profErr) return { error: `Failed to update profile: ${profErr.message}` };

  // Idempotent role insertion
  try {
    await upsertRole(adminClient, userId, role, agencyId);
  } catch (e: any) {
    return { error: `Failed to assign role: ${e.message}` };
  }

  // Requester linkage
  if (role === "requester" && customerId) {
    await linkRequester(adminClient, userId, customerId, agencyId);
  }

  return {};
}

