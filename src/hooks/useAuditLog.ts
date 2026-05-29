import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdaptedQuery } from "@/lib/data-adapter";

export interface AuditEntry {
  id: string;
  appointment_id: string | null;
  agency_id: string;
  changed_by: string | null;
  action: string;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  changed_fields: string[] | null;
  created_at: string;
  changed_by_name?: string;
  appointment_title?: string;
}

export interface AuditLogFilters {
  action?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export function useAuditLog(filters?: AuditLogFilters) {
  const { profile } = useAuth();
  const agencyId = profile?.agency_id;
  const page = filters?.page ?? 0;
  const pageSize = filters?.pageSize ?? 50;

  return useAdaptedQuery<{ rows: AuditEntry[]; totalCount: number }>({
    queryKey: [
      "audit-log",
      agencyId,
      filters?.action,
      filters?.search,
      filters?.dateFrom,
      filters?.dateTo,
      page,
      pageSize,
    ],
    queryFn: async () => {
      // Helper to apply shared filters to a query builder
      const applyFilters = (q: any) => {
        if (filters?.action) q = q.eq("action", filters.action);
        if (filters?.dateFrom) q = q.gte("created_at", filters.dateFrom);
        if (filters?.dateTo) {
          const end = new Date(filters.dateTo);
          end.setHours(23, 59, 59, 999);
          q = q.lte("created_at", end.toISOString());
        }
        // Server-side JSONB title search
        if (filters?.search) {
          const s = `%${filters.search}%`;
          q = q.or(`new_data->>title.ilike.${s},old_data->>title.ilike.${s}`);
        }
        return q;
      };

      // Count query
      let countQ = supabase
        .from("appointment_history" as any)
        .select("*", { count: "exact", head: true })
        .eq("agency_id", agencyId!);
      countQ = applyFilters(countQ);

      // Data query
      let dataQ = supabase
        .from("appointment_history" as any)
        .select("*")
        .eq("agency_id", agencyId!)
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      dataQ = applyFilters(dataQ);

      const [countResult, dataResult] = await Promise.all([countQ, dataQ]);
      if (dataResult.error) throw dataResult.error;

      const filtered = (dataResult.data ?? []) as any[];

      // Resolve profile names
      const userIds = [...new Set(filtered.map((e: any) => e.changed_by).filter(Boolean))];
      let profileMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", userIds);
        for (const p of profiles ?? []) {
          profileMap[p.id] = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unknown";
        }
      }

      const rows = filtered.map((e: any) => ({
        ...e,
        changed_by_name: e.changed_by ? profileMap[e.changed_by] || "System" : "System",
        appointment_title: e.new_data?.title || e.old_data?.title || "—",
      })) as AuditEntry[];

      return { rows, totalCount: (countResult as any).count ?? 0 };
    },
    demoFn: () => ({ rows: [], totalCount: 0 }),
    enabled: !!agencyId,
  });
}
