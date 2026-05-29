import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdaptedQuery } from "@/lib/data-adapter";
import { useDemoData } from "@/contexts/DemoDataContext";

export interface AgencyMember {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  roles: string[];
}

/**
 * Fetches all active members within the current user's agency,
 * excluding the current user and platform owners.
 * Used for the messaging people picker.
 */
export function useAgencyMembers() {
  const { profile, user, primaryRole, hasRole } = useAuth();
  const { state } = useDemoData();

  return useAdaptedQuery<AgencyMember[]>({
    queryKey: ["agency-members", profile?.agency_id],
    queryFn: async () => {
      if (!profile?.agency_id) return [];

      // Get all active profiles in agency
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("agency_id", profile.agency_id)
        .eq("is_active", true)
        .eq("is_deleted", false);

      if (profileError) throw profileError;
      if (!profiles?.length) return [];

      // Get roles for these users
      const userIds = profiles.map((p) => p.id);
      const { data: roles, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("agency_id", profile.agency_id)
        .in("user_id", userIds);

      if (roleError) throw roleError;

      // Exclude platform owners
      const { data: platformRoles } = await supabase
        .from("platform_roles" as any)
        .select("user_id")
        .eq("role", "platform_owner");

      const platformUserIds = new Set((platformRoles || []).map((r: any) => r.user_id));

      // Build role map
      const roleMap = new Map<string, string[]>();
      for (const r of roles || []) {
        const arr = roleMap.get(r.user_id) || [];
        arr.push(r.role);
        roleMap.set(r.user_id, arr);
      }

      // Role-based contact restrictions:
      // - Interpreters: can only contact admins/schedulers (not requesters or other interpreters)
      // - Requesters: can only contact admins/schedulers and other requesters within their own customer
      // - Admins/Schedulers: can contact everyone
      const isInterpreter = hasRole("interpreter") && !hasRole("agency_admin") && !hasRole("scheduler");
      const isRequester = hasRole("requester") && !hasRole("agency_admin") && !hasRole("scheduler");

      let allowedRequesterIds: Set<string> | null = null;
      if (isRequester) {
        // Find current user's customer_id(s), then sibling requesters under same customer(s)
        const { data: myCustomers } = await supabase
          .from("customer_requestors")
          .select("customer_id")
          .eq("user_id", user!.id)
          .eq("agency_id", profile.agency_id)
          .eq("is_active", true)
          .eq("is_deleted", false);
        const customerIds = (myCustomers || []).map((c: any) => c.customer_id);
        if (customerIds.length > 0) {
          const { data: siblings } = await supabase
            .from("customer_requestors")
            .select("user_id")
            .in("customer_id", customerIds)
            .eq("agency_id", profile.agency_id)
            .eq("is_active", true)
            .eq("is_deleted", false);
          allowedRequesterIds = new Set((siblings || []).map((s: any) => s.user_id));
        } else {
          allowedRequesterIds = new Set();
        }
      }

      return profiles
        .filter((p) => p.id !== user?.id && !platformUserIds.has(p.id))
        .filter((p) => {
          const userRoles = roleMap.get(p.id) || [];
          if (userRoles.length === 0) return false;
          const isAdminOrScheduler = userRoles.includes("agency_admin") || userRoles.includes("scheduler");

          if (isInterpreter) {
            // Interpreters only see admins/schedulers
            return isAdminOrScheduler;
          }
          if (isRequester) {
            // Requesters see admins/schedulers + sibling requesters under same customer
            if (isAdminOrScheduler) return true;
            if (userRoles.includes("requester") && allowedRequesterIds?.has(p.id)) return true;
            return false;
          }
          return true;
        })
        .map((p) => ({
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          email: p.email,
          roles: roleMap.get(p.id) || [],
        }))
        .sort((a, b) => {
          const nameA = `${a.first_name || ""} ${a.last_name || ""}`.trim().toLowerCase();
          const nameB = `${b.first_name || ""} ${b.last_name || ""}`.trim().toLowerCase();
          return nameA.localeCompare(nameB);
        });
    },
    demoFn: () => {
      const interpreters = (state.interpreters || []).map((i: any) => ({
        id: i.id,
        first_name: i.first_name,
        last_name: i.last_name,
        email: i.email,
        roles: ["interpreter"],
      }));
      return interpreters as AgencyMember[];
    },
    enabled: !!profile?.agency_id,
    staleTime: 60_000,
  });
}
