import { getCorsHeaders, authenticateCaller, errorResponse } from "../_shared/cors.ts";

/**
 * invite-user: Generalized invitation function supporting interpreter, requester, and scheduler roles.
 * Modes: invite, create, resend, revoke
 *
 * Email resolution: Uses auth.admin.listUsers for authoritative email lookup (not profiles.email).
 * Requester linkage: Centralized via linkRequester helper.
 * Idempotent: role upsert, customer_requestors upsert, duplicate invite checks.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const { userId, agencyId, roles, adminClient } = await authenticateCaller(req);

    const body = await req.json();
    const { mode, role, customer_id, preflight_only } = body;

    const isAdmin = roles.includes("agency_admin");
    const isScheduler = roles.includes("scheduler");

    if (mode === "resend" || mode === "revoke") {
      if (!isAdmin && !isScheduler) {
        return jsonResp(req, { error: "Forbidden: insufficient role" }, 403);
      }
    } else if (!isAdmin) {
      return jsonResp(req, { error: "Forbidden: only agency admins can perform this action" }, 403);
    }

    const validRoles = ["interpreter", "requester", "scheduler"];
    const targetRole = role || "interpreter";
    if (!validRoles.includes(targetRole)) {
      return jsonResp(req, { error: `Invalid role: ${targetRole}. Must be one of: ${validRoles.join(", ")}` }, 400);
    }

    const { email, first_name, last_name, phone } = body;

    if (!email || typeof email !== "string") {
      return jsonResp(req, { error: "email is required" }, 400);
    }
    const normalizedEmail = email.trim().toLowerCase();

    // Validate customer_id for requesters
    if (targetRole === "requester" && customer_id) {
      const { data: cust } = await adminClient
        .from("customers")
        .select("id")
        .eq("id", customer_id)
        .eq("agency_id", agencyId)
        .single();
      if (!cust) return jsonResp(req, { error: "Customer not found in this agency" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const appBaseUrl = Deno.env.get("APP_BASE_URL") || "https://app.bluethreadsolution.com";
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const roleLabels: Record<string, string> = {
      interpreter: "an interpreter",
      requester: "a requester",
      scheduler: "a scheduler",
    };
    const roleLabel = roleLabels[targetRole] || targetRole;

    /**
     * Resolve an email to an existing auth user + profile using the authoritative
     * auth.admin source. Uses paginated lookup to handle >1000 users.
     */
    async function resolveExistingUser(em: string) {
      let authUser = null;
      let page = 1;
      const perPage = 1000;
      while (!authUser) {
        const { data: listData, error: listErr } = await adminClient.auth.admin.listUsers({ page, perPage });
        if (listErr || !listData?.users?.length) break;
        authUser = listData.users.find((u: any) => u.email?.toLowerCase() === em) || null;
        if (listData.users.length < perPage) break;
        page++;
      }
      if (!authUser) return null;

      const { data: prof } = await adminClient
        .from("profiles")
        .select("id, agency_id, first_name, last_name, phone")
        .eq("id", authUser.id)
        .single();

      return prof
        ? { ...prof, authId: authUser.id }
        : { id: authUser.id, authId: authUser.id, agency_id: null, first_name: null, last_name: null, phone: null };
    }

    // ─── INVITE ───
    if (mode === "invite") {
      const existing = await resolveExistingUser(normalizedEmail);

      // User exists and is already in this agency
      if (existing?.agency_id === agencyId) {
        // Check if they have this role already
        const { data: existingRole } = await adminClient
          .from("user_roles")
          .select("id")
          .eq("user_id", existing.id)
          .eq("agency_id", agencyId)
          .eq("role", targetRole as any)
          .maybeSingle();
        if (existingRole) {
          return jsonResp(req, { error: "This user is already a member of your agency with this role" }, 409);
        }
        // Same agency but different role — add the role
        await upsertRole(adminClient, existing.id, targetRole, agencyId);
        if (targetRole === "requester" && customer_id) {
          await linkRequester(adminClient, existing.id, customer_id, agencyId);
        }
        return jsonResp(req, {
          success: true, mode: "invite", linked_existing: true, user_id: existing.id,
          message: `User already in your agency — added ${targetRole} role.`,
        });
      }

      // User exists in Auth but belongs to a different agency
      if (existing?.agency_id && existing.agency_id !== agencyId) {
        return jsonResp(req, { error: "This email is already associated with another organization. The user must leave that organization first, or use a different email address." }, 409);
      }

      // User exists in Auth but has no agency — link them directly
      if (existing && !existing.agency_id) {
        const profileUpdate: Record<string, unknown> = {
          agency_id: agencyId,
          first_name: first_name || existing.first_name || null,
          last_name: last_name || existing.last_name || null,
          phone: phone || existing.phone || null,
          is_active: true,
        };
        if (targetRole === "requester" && customer_id) {
          profileUpdate.customer_id = customer_id;
        }
        await adminClient.from("profiles").update(profileUpdate).eq("id", existing.id);
        await upsertRole(adminClient, existing.id, targetRole, agencyId);
        if (targetRole === "requester" && customer_id) {
          await linkRequester(adminClient, existing.id, customer_id, agencyId);
        }

        // Send recovery link so they can set/reset password
        const { data: recoveryData } = await adminClient.auth.admin.generateLink({
          type: "recovery",
          email: normalizedEmail,
          options: { redirectTo: `${appBaseUrl}/login` },
        });
        const recoveryLink = recoveryData?.properties?.action_link || null;

        // Record an invitation for audit trail
        await adminClient.from("invitations").insert({
          agency_id: agencyId,
          email: normalizedEmail,
          first_name: first_name || existing.first_name || null,
          last_name: last_name || existing.last_name || null,
          phone: phone || existing.phone || null,
          role: targetRole,
          invited_by: userId,
          setup_link: recoveryLink,
          expires_at: expiresAt,
          status: "accepted",
          accepted_at: new Date().toISOString(),
        });

        sendNotifications(req, supabaseUrl, normalizedEmail, phone || existing.phone,
          `You've been added to an agency as ${roleLabel}`,
          `Hello ${first_name || existing.first_name || ""}!\n\nYou've been added as ${roleLabel}. Click the link below to access your account:\n\n${recoveryLink}\n\nThis link expires in 24 hours.`,
          recoveryLink ? `You've been added as ${roleLabel}. Access your account: ${recoveryLink}` : null,
          "account_setup", existing.id
        );

        return jsonResp(req, {
          success: true, mode: "invite", linked_existing: true, user_id: existing.id,
          message: "Existing account linked to your agency.",
        });
      }

      // Check for pending invitation
      const { data: pendingInvites } = await adminClient
        .from("invitations")
        .select("id")
        .eq("agency_id", agencyId)
        .ilike("email", normalizedEmail)
        .eq("status", "pending")
        .limit(1);
      if (pendingInvites && pendingInvites.length > 0) {
        return jsonResp(req, { error: "A pending invitation already exists for this email. Use 'Resend' to send again." }, 400);
      }

      if (preflight_only) {
        return jsonResp(req, { preflight: "ok", email: normalizedEmail });
      }

      // Brand new user — generate invite link
      const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: "invite",
        email: normalizedEmail,
        options: {
          data: {
            agency_id: agencyId,
            role: targetRole,
            first_name,
            last_name,
            customer_id: customer_id || undefined,
          },
          redirectTo: `${appBaseUrl}/onboarding`,
        },
      });
      if (linkErr) {
        // Handle case where generateLink also reports user exists (race condition)
        if (linkErr.message?.includes("already been registered") || linkErr.message?.includes("already exists")) {
          return jsonResp(req, {
            error: "An account with this email already exists. Try using 'Create' mode instead to link them to your agency.",
          }, 409);
        }
        throw linkErr;
      }

      const setupLink = linkData?.properties?.action_link || null;

      const insertData: Record<string, unknown> = {
        agency_id: agencyId,
        email: normalizedEmail,
        first_name: first_name || null,
        last_name: last_name || null,
        phone: phone || null,
        role: targetRole,
        invited_by: userId,
        setup_link: setupLink,
        expires_at: expiresAt,
      };
      if (targetRole === "requester" && customer_id) {
        insertData.customer_id = customer_id;
      }

      const { data: invitation, error: invErr } = await adminClient
        .from("invitations")
        .insert(insertData)
        .select()
        .single();
      if (invErr) throw invErr;

      sendNotifications(req, supabaseUrl, normalizedEmail, phone,
        `You've been invited to join as ${roleLabel}`,
        `Hello ${first_name || ""}!\n\nYou've been invited to join as ${roleLabel}. Click the link below to set up your account:\n\n${setupLink}\n\nThis link expires in 7 days.`,
        setupLink ? `You've been invited as ${roleLabel}. Set up your account: ${setupLink}` : null,
        "invitation", invitation.id
      );

      return jsonResp(req, {
        success: true, mode: "invite", invitation_id: invitation.id, setup_link: setupLink,
      });
    }

    // ─── CREATE ───
    if (mode === "create") {
      const existing = await resolveExistingUser(normalizedEmail);

      if (existing) {
        if (existing.agency_id === agencyId) {
          // Check if they already have this specific role
          const { data: existingRole } = await adminClient
            .from("user_roles")
            .select("id")
            .eq("user_id", existing.id)
            .eq("agency_id", agencyId)
            .eq("role", targetRole as any)
            .maybeSingle();
          if (existingRole) {
            return jsonResp(req, { error: "This user is already a member of your agency with this role" }, 409);
          }
          // Add new role to existing agency member
          await upsertRole(adminClient, existing.id, targetRole, agencyId);
          if (targetRole === "requester" && customer_id) {
            await linkRequester(adminClient, existing.id, customer_id, agencyId);
          }
          return jsonResp(req, {
            success: true, mode: "create", user_id: existing.id, linked_existing: true,
            message: `User already in your agency — added ${targetRole} role.`,
          });
        }
        if (existing.agency_id && existing.agency_id !== agencyId) {
          return jsonResp(req, { error: "This email is already associated with another organization. The user must leave that organization first, or use a different email address." }, 409);
        }

        // Exists in Auth but no agency — link to this one
        const profileUpdate: Record<string, unknown> = {
          agency_id: agencyId,
          first_name: first_name || existing.first_name || null,
          last_name: last_name || existing.last_name || null,
          phone: phone || existing.phone || null,
          is_active: true,
        };
        if (targetRole === "requester" && customer_id) {
          profileUpdate.customer_id = customer_id;
        }

        await adminClient.from("profiles").update(profileUpdate).eq("id", existing.id);

        await upsertRole(adminClient, existing.id, targetRole, agencyId);
        if (targetRole === "requester" && customer_id) {
          await linkRequester(adminClient, existing.id, customer_id, agencyId);
        }

        const { data: recoveryData } = await adminClient.auth.admin.generateLink({
          type: "recovery",
          email: normalizedEmail,
          options: { redirectTo: `${appBaseUrl}/login` },
        });
        const recoveryLink = recoveryData?.properties?.action_link || null;

        sendNotifications(req, supabaseUrl, normalizedEmail, phone,
          `Your ${targetRole} account has been set up`,
          `Hello ${first_name || ""}!\n\nYour ${targetRole} account has been set up. Click the link below to set your password:\n\n${recoveryLink}\n\nThis link expires in 24 hours.`,
          recoveryLink ? `Your ${targetRole} account is ready. Set your password: ${recoveryLink}` : null,
          "account_setup", existing.id
        );

        return jsonResp(req, {
          success: true, mode: "create", user_id: existing.id, linked_existing: true,
        });
      }

      // No existing user found — create new
      const tempPassword = crypto.randomUUID().slice(0, 16) + "Aa1!";
      const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { first_name, last_name, agency_id: agencyId, role: targetRole },
      });
      if (createErr) {
        // Race condition: resolveExistingUser missed but createUser found them
        if (createErr.message?.includes("already been registered") || createErr.message?.includes("already exists")) {
          // Retry: try to find and link them
          const retryUser = await resolveExistingUser(normalizedEmail);
          if (retryUser) {
            const profileUpdate: Record<string, unknown> = {
              agency_id: agencyId,
              first_name: first_name || retryUser.first_name || null,
              last_name: last_name || retryUser.last_name || null,
              phone: phone || retryUser.phone || null,
              is_active: true,
            };
            if (targetRole === "requester" && customer_id) {
              profileUpdate.customer_id = customer_id;
            }
            await adminClient.from("profiles").update(profileUpdate).eq("id", retryUser.id);
            await upsertRole(adminClient, retryUser.id, targetRole, agencyId);
            if (targetRole === "requester" && customer_id) {
              await linkRequester(adminClient, retryUser.id, customer_id, agencyId);
            }

            const { data: recoveryData } = await adminClient.auth.admin.generateLink({
              type: "recovery",
              email: normalizedEmail,
              options: { redirectTo: `${appBaseUrl}/login` },
            });
            const recoveryLink = recoveryData?.properties?.action_link || null;

            sendNotifications(req, supabaseUrl, normalizedEmail, phone,
              `Your ${targetRole} account has been set up`,
              `Hello ${first_name || ""}!\n\nYour ${targetRole} account has been set up. Click the link below to set your password:\n\n${recoveryLink}\n\nThis link expires in 24 hours.`,
              recoveryLink ? `Your ${targetRole} account is ready. Set your password: ${recoveryLink}` : null,
              "account_setup", retryUser.id
            );

            return jsonResp(req, {
              success: true, mode: "create", user_id: retryUser.id, linked_existing: true,
              message: "Existing account found and linked to your agency.",
            });
          }
          return jsonResp(req, { error: "An account with this email already exists but could not be linked. Please try 'Invite' mode instead." }, 409);
        }
        throw createErr;
      }

      const profileUpdate: Record<string, unknown> = {
        agency_id: agencyId,
        first_name: first_name || null,
        last_name: last_name || null,
        phone: phone || null,
        is_active: true,
      };
      if (targetRole === "requester" && customer_id) {
        profileUpdate.customer_id = customer_id;
      }

      await adminClient.from("profiles").update(profileUpdate).eq("id", newUser.user.id);

      await upsertRole(adminClient, newUser.user.id, targetRole, agencyId);
      if (targetRole === "requester" && customer_id) {
        await linkRequester(adminClient, newUser.user.id, customer_id, agencyId);
      }

      const { data: recoveryData } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: normalizedEmail,
        options: { redirectTo: `${appBaseUrl}/login` },
      });
      const recoveryLink = recoveryData?.properties?.action_link || null;

      sendNotifications(req, supabaseUrl, normalizedEmail, phone,
        `Your ${targetRole} account has been created`,
        `Hello ${first_name || ""}!\n\nA ${targetRole} account has been created for you. Click the link below to set your password:\n\n${recoveryLink}\n\nThis link expires in 24 hours.`,
        recoveryLink ? `Your ${targetRole} account is ready. Set your password: ${recoveryLink}` : null,
        "account_setup", newUser.user.id
      );

      return jsonResp(req, {
        success: true, mode: "create", user_id: newUser.user.id,
      });
    }

    // ─── RESEND ───
    if (mode === "resend") {
      const invitationId = body.invitation_id;
      if (!invitationId) return jsonResp(req, { error: "invitation_id required for resend" }, 400);

      const { data: existing, error: fetchErr } = await adminClient
        .from("invitations").select("*").eq("id", invitationId).eq("agency_id", agencyId).single();
      if (fetchErr || !existing) return jsonResp(req, { error: "Invitation not found" }, 404);
      if (existing.status === "accepted") return jsonResp(req, { error: "Invitation already accepted" }, 400);
      if (existing.status === "revoked") return jsonResp(req, { error: "Invitation has been revoked" }, 400);

      const invRole = existing.role || "interpreter";
      const invRoleLabel = roleLabels[invRole] || invRole;

      // Check if the user already exists and is already in this agency
      const existingUser = await resolveExistingUser(existing.email.toLowerCase());
      if (existingUser?.agency_id === agencyId) {
        // Auto-accept the invitation since they're already in the agency
        await adminClient.from("invitations").update({
          status: "accepted", accepted_at: new Date().toISOString(),
        }).eq("id", invitationId);
        return jsonResp(req, {
          success: true, mode: "resend",
          message: "This user has already joined your agency. Invitation marked as accepted.",
        });
      }

      const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: "invite",
        email: existing.email,
        options: {
          data: {
            agency_id: agencyId, role: invRole,
            first_name: existing.first_name, last_name: existing.last_name,
            customer_id: existing.customer_id || undefined,
          },
          redirectTo: `${appBaseUrl}/onboarding`,
        },
      });
      if (linkErr) {
        // If generateLink fails because user exists, try recovery link instead
        if (linkErr.message?.includes("already been registered") || linkErr.message?.includes("already exists")) {
          // User exists in Auth — link them directly
          if (existingUser && !existingUser.agency_id) {
            const profileUpdate: Record<string, unknown> = {
              agency_id: agencyId,
              first_name: existing.first_name || existingUser.first_name || null,
              last_name: existing.last_name || existingUser.last_name || null,
              phone: existing.phone || existingUser.phone || null,
              is_active: true,
            };
            await adminClient.from("profiles").update(profileUpdate).eq("id", existingUser.id);
            await upsertRole(adminClient, existingUser.id, invRole, agencyId);

            await adminClient.from("invitations").update({
              status: "accepted", accepted_at: new Date().toISOString(),
            }).eq("id", invitationId);

            const { data: recoveryData } = await adminClient.auth.admin.generateLink({
              type: "recovery",
              email: existing.email,
              options: { redirectTo: `${appBaseUrl}/login` },
            });
            const recoveryLink = recoveryData?.properties?.action_link || null;

            sendNotifications(req, supabaseUrl, existing.email, existing.phone,
              `You've been added as ${invRoleLabel}`,
              `Hello ${existing.first_name || ""}!\n\nYou've been added as ${invRoleLabel}. Click the link below to access your account:\n\n${recoveryLink}`,
              recoveryLink ? `You've been added as ${invRoleLabel}. Access your account: ${recoveryLink}` : null,
              "account_setup", existingUser.id
            );

            return jsonResp(req, {
              success: true, mode: "resend", linked_existing: true,
              message: "User already had an account — linked to your agency and invitation accepted.",
            });
          }
          return jsonResp(req, {
            error: "This email belongs to an existing account that could not be automatically linked. Try 'Create' mode instead.",
          }, 409);
        }
        throw linkErr;
      }

      const newSetupLink = linkData?.properties?.action_link || null;
      const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await adminClient.from("invitations").update({
        setup_link: newSetupLink, expires_at: newExpiresAt, status: "pending",
      }).eq("id", invitationId);

      sendNotifications(req, supabaseUrl, existing.email, existing.phone,
        `Reminder: You've been invited to join as ${invRoleLabel}`,
        `Hello ${existing.first_name || ""}!\n\nThis is a reminder that you've been invited to join as ${invRoleLabel}. Click the link below to set up your account:\n\n${newSetupLink}\n\nThis link expires in 7 days.`,
        newSetupLink ? `Reminder: You've been invited as ${invRoleLabel}. Set up your account: ${newSetupLink}` : null,
        "invitation", invitationId
      );

      return jsonResp(req, {
        success: true, mode: "resend", invitation_id: invitationId, setup_link: newSetupLink,
      });
    }

    // ─── REVOKE ───
    if (mode === "revoke") {
      const invitationId = body.invitation_id;
      if (!invitationId) return jsonResp(req, { error: "invitation_id required for revoke" }, 400);

      const { data: existing, error: fetchErr } = await adminClient
        .from("invitations").select("*").eq("id", invitationId).eq("agency_id", agencyId).single();
      if (fetchErr || !existing) return jsonResp(req, { error: "Invitation not found" }, 404);
      if (existing.status === "accepted") return jsonResp(req, { error: "Cannot revoke an accepted invitation" }, 400);
      if (existing.status === "revoked") return jsonResp(req, { error: "Invitation is already revoked" }, 400);

      await adminClient.from("invitations").update({ status: "revoked" }).eq("id", invitationId);

      return jsonResp(req, { success: true, mode: "revoke", invitation_id: invitationId });
    }

    return jsonResp(req, { error: "Invalid mode. Use 'invite', 'create', 'resend', or 'revoke'." }, 400);
  } catch (err: unknown) {
    return errorResponse(err, req);
  }
});

// ─── Shared helpers ───

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

/** Request-scoped JSON response with dynamic CORS headers */
function jsonResp(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

/** Fire-and-forget notification sending */
function sendNotifications(
  req: Request, supabaseUrl: string,
  email: string, phone: string | null | undefined,
  emailSubject: string, emailBody: string,
  smsBody: string | null,
  entityType: string, entityId: string,
) {
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization")!;

  (async () => {
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json", apikey: anonKey },
        body: JSON.stringify({
          channel: "email", recipient: email,
          subject: emailSubject, message: emailBody,
          related_entity_type: entityType, related_entity_id: entityId,
        }),
      });

      if (phone && smsBody) {
        await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json", apikey: anonKey },
          body: JSON.stringify({
            channel: "sms", recipient: phone,
            message: smsBody,
            related_entity_type: entityType, related_entity_id: entityId,
          }),
        });
      }
    } catch (err) {
      console.error("Non-fatal: notification delivery failed", err);
    }
  })();
}
