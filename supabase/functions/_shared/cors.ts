const ALLOWED_ORIGINS = [
  "https://app.bluethreadsolution.com",
  "https://bluethreadsolutions.lovable.app",
  "https://id-preview--d0952371-3a5c-4259-988b-d3abe6a36d03.lovable.app",
  "https://d0952371-3a5c-4259-988b-d3abe6a36d03.lovableproject.com",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow any *.lovable.app or *.lovableproject.com preview domain
  if (/^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(origin)) return true;
  return false;
}

function getOriginHeader(req?: Request): string {
  if (!req) return ALLOWED_ORIGINS[0];
  const origin = req.headers?.get("origin") || "";
  return isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
}

export function getCorsHeaders(req?: Request) {
  return {
    "Access-Control-Allow-Origin": getOriginHeader(req),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Vary": "Origin",
  };
}

/** @deprecated Use getCorsHeaders(req) for origin-aware CORS. Kept for backward compat. */
export const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Authenticate the caller via JWT and resolve their identity server-side.
 * Returns userId, agencyId, and a service-role client for privileged ops.
 * Throws on any auth failure.
 */
export async function authenticateCaller(req: Request): Promise<{
  userId: string;
  agencyId: string;
  roles: string[];
  adminClient: SupabaseClient;
}> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing or invalid Authorization header", 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Verify JWT via getClaims
  const anonClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) {
    throw new AuthError("Invalid or expired token", 401);
  }
  const userId = claimsData.claims.sub as string;

  // Service-role client for privileged queries
  const adminClient = createClient(supabaseUrl, serviceKey);

  // Fetch caller's agency from profiles (server-side, never trust client)
  const { data: profile, error: profileErr } = await adminClient
    .from("profiles")
    .select("agency_id")
    .eq("id", userId)
    .single();

  if (profileErr || !profile?.agency_id) {
    throw new AuthError("User has no agency association", 403);
  }

  // Fetch caller's roles (server-side)
  const { data: roleRows } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("agency_id", profile.agency_id);

  const roles = (roleRows || []).map((r: any) => r.role);

  return { userId, agencyId: profile.agency_id, roles, adminClient };
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export function errorResponse(error: unknown, req?: Request) {
  const headers = { ...(req ? getCorsHeaders(req) : corsHeaders), "Content-Type": "application/json" };
  if (error instanceof AuthError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.status,
      headers,
    });
  }
  const msg = error instanceof Error ? error.message : "Internal error";
  console.error("Edge function error:", error);
  return new Response(JSON.stringify({ error: msg }), {
    status: 500,
    headers,
  });
}
