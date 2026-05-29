import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoData } from "@/contexts/DemoDataContext";
import { useAdaptedQuery } from "@/lib/data-adapter";

export interface PaginatedAppointmentFilters {
  status?: string;
  statuses?: string[];
  dateFrom?: string; // ISO timestamp
  dateTo?: string;   // ISO timestamp
  search?: string;
  assignment?: "all" | "assigned" | "unassigned";
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult {
  data: any[];
  totalCount: number;
}

export function usePaginatedAppointments(filters: PaginatedAppointmentFilters = {}) {
  const { profile } = useAuth();
  const { state } = useDemoData();
  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? 50;
  const status = filters.status && filters.status !== "all" ? filters.status : null;
  const statuses = filters.statuses && filters.statuses.length > 0 ? filters.statuses : null;

  return useAdaptedQuery<PaginatedResult>({
    queryKey: [
      "paginated-appointments",
      status,
      statuses,
      filters.dateFrom,
      filters.dateTo,
      filters.search,
      filters.assignment,
      page,
      pageSize,
    ],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_appointments" as any, {
        _status: statuses ? null : status,
        _statuses: statuses,
        _date_from: filters.dateFrom || null,
        _date_to: filters.dateTo || null,
        _search: filters.search || null,
        _assignment: filters.assignment || "all",
        _page_size: pageSize,
        _page: page,
      });
      if (error) throw error;
      const result = data as any;
      return {
        data: result?.data ?? [],
        totalCount: result?.total_count ?? 0,
      };
    },
    demoFn: () => {
      let list = [...state.appointments] as any[];

      // Status filter
      if (statuses) list = list.filter((a) => statuses.includes(a.status));
      else if (status) list = list.filter((a) => a.status === status);

      // Date range
      if (filters.dateFrom)
        list = list.filter((a) => a.scheduled_start && a.scheduled_start >= filters.dateFrom!);
      if (filters.dateTo)
        list = list.filter((a) => a.scheduled_start && a.scheduled_start <= filters.dateTo!);

      // Assignment
      if (filters.assignment === "assigned") list = list.filter((a) => !!a.interpreter_id);
      if (filters.assignment === "unassigned") list = list.filter((a) => !a.interpreter_id);

      // Search
      if (filters.search) {
        const s = filters.search.toLowerCase();
        list = list.filter(
          (a) =>
            a.title?.toLowerCase().includes(s) ||
            a.customers?.name?.toLowerCase().includes(s) ||
            a.languages?.name?.toLowerCase().includes(s) ||
            `${a.interpreter?.first_name ?? ""} ${a.interpreter?.last_name ?? ""}`
              .toLowerCase()
              .includes(s),
        );
      }

      // Sort descending
      list.sort((a, b) => {
        const da = a.scheduled_start ? new Date(a.scheduled_start).getTime() : 0;
        const db = b.scheduled_start ? new Date(b.scheduled_start).getTime() : 0;
        return db - da;
      });

      const totalCount = list.length;
      const start = page * pageSize;
      return { data: list.slice(start, start + pageSize), totalCount };
    },
    enabled: !!profile?.agency_id,
  });
}
