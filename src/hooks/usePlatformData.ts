import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function usePlatformStats() {
  return useQuery({
    queryKey: ['platform-stats'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_platform_stats');
      if (error) throw error;
      return data;
    },
  });
}

export function usePlatformAgencies() {
  return useQuery({
    queryKey: ['platform-agencies'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_platform_agencies');
      if (error) throw error;
      return data || [];
    },
  });
}

export function usePlatformUsers(search?: string, agencyId?: string, role?: string, page = 0) {
  return useQuery({
    queryKey: ['platform-users', search, agencyId, role, page],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('search_platform_users', {
        _search: search || null,
        _agency_id: agencyId || null,
        _role: role || null,
        _page: page,
      });
      if (error) throw error;
      return data;
    },
  });
}

export function usePlatformRevenue(dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ['platform-revenue', dateFrom, dateTo],
    queryFn: async () => {
      const params: Record<string, any> = {};
      if (dateFrom) params._date_from = dateFrom;
      if (dateTo) params._date_to = dateTo;
      const { data, error } = await (supabase as any).rpc('get_platform_revenue', params);
      if (error) throw error;
      return data;
    },
  });
}

export function usePlatformDiagnostics() {
  return useQuery({
    queryKey: ['platform-diagnostics'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_platform_diagnostics');
      if (error) throw error;
      return data;
    },
  });
}

export function usePlatformAgencyDetail(agencyId: string) {
  return useQuery({
    queryKey: ['platform-agency-detail', agencyId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_platform_agency_detail', {
        _agency_id: agencyId,
      });
      if (error) throw error;
      return data;
    },
    enabled: !!agencyId,
  });
}

export function usePlatformAuditLog(page = 0, actionFilter?: string, targetTypeFilter?: string) {
  return useQuery({
    queryKey: ['platform-audit-log', page, actionFilter, targetTypeFilter],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_platform_audit_log', {
        _page: page,
        _action_filter: actionFilter || null,
        _target_type_filter: targetTypeFilter || null,
      });
      if (error) throw error;
      return data;
    },
  });
}

export function usePlatformAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { action: string; [key: string]: any }) => {
      const { data, error } = await supabase.functions.invoke('platform-admin', {
        body: params,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
      queryClient.invalidateQueries({ queryKey: ['platform-agencies'] });
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      queryClient.invalidateQueries({ queryKey: ['platform-audit-log'] });
      queryClient.invalidateQueries({ queryKey: ['platform-revenue'] });
      queryClient.invalidateQueries({ queryKey: ['platform-diagnostics'] });
      queryClient.invalidateQueries({ queryKey: ['platform-agency-detail'] });
      toast.success('Action completed successfully');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
