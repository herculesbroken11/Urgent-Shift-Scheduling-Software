import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface QboConnection {
  id: string;
  realm_id: string | null;
  company_name: string | null;
  sync_enabled: boolean;
  integration_mode: "csv_only" | "direct_sync" | "both";
  connection_status: "connected" | "disconnected" | "expired" | "error";
  auto_sync_on_completed: boolean;
  auto_sync_on_validated: boolean;
  require_manual_approval: boolean;
  default_customer_naming: string;
  default_vendor_naming: string;
  last_sync_at: string | null;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QboSyncLogEntry {
  id: string;
  appointment_id: string | null;
  entity_type: string;
  qbo_object_type: string;
  action: string;
  status: string;
  error_details: string | null;
  qbo_invoice_id: string | null;
  qbo_bill_id: string | null;
  qbo_customer_id: string | null;
  qbo_vendor_id: string | null;
  retry_count: number;
  created_at: string;
  completed_at: string | null;
}

export interface QboItemMapping {
  id: string;
  line_item_type: string;
  qbo_service_item_name: string | null;
  qbo_service_item_id: string | null;
  qbo_income_account_name: string | null;
  qbo_income_account_id: string | null;
  qbo_expense_account_name: string | null;
  qbo_expense_account_id: string | null;
  is_active: boolean;
}

export interface QboSyncJob {
  id: string;
  status: string;
  total_records: number;
  processed_records: number;
  synced_count: number;
  failed_count: number;
  skipped_count: number;
  batch_size: number;
  cursor_position: string | null;
  errors: any[];
  mapping_warnings: string[];
  started_at: string | null;
  completed_at: string | null;
}

async function invokeQboAuth(action: string, body?: any) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const resp = await fetch(
    `https://${projectId}.supabase.co/functions/v1/qbo-auth/${action}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: body ? JSON.stringify(body) : undefined,
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Request failed");
  }

  return resp.json();
}

export function useQboConnection() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const connectionQuery = useQuery<QboConnection | null>({
    queryKey: ["qbo-connection", profile?.agency_id],
    queryFn: async () => {
      const result = await invokeQboAuth("status");
      return result.connection || null;
    },
    enabled: !!profile?.agency_id,
  });

  const syncLogQuery = useQuery<QboSyncLogEntry[]>({
    queryKey: ["qbo-sync-log", profile?.agency_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qbo_sync_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as QboSyncLogEntry[];
    },
    enabled: !!profile?.agency_id,
  });

  const mappingsQuery = useQuery<QboItemMapping[]>({
    queryKey: ["qbo-item-mappings", profile?.agency_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qbo_item_mappings")
        .select("*")
        .order("line_item_type");
      if (error) throw error;
      return (data || []) as unknown as QboItemMapping[];
    },
    enabled: !!profile?.agency_id,
  });

  const initiateOAuth = useMutation({
    mutationFn: async () => {
      const result = await invokeQboAuth("initiate");
      return result.authUrl;
    },
    onSuccess: (authUrl: string) => {
      window.location.href = authUrl;
    },
    onError: (err: Error) => {
      toast.error("Failed to initiate QuickBooks connection: " + err.message);
    },
  });

  const disconnect = useMutation({
    mutationFn: () => invokeQboAuth("disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbo-connection"] });
      toast.success("QuickBooks disconnected");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateSettings = useMutation({
    mutationFn: (settings: Partial<QboConnection>) => invokeQboAuth("update-settings", settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbo-connection"] });
      toast.success("Settings updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const syncAppointment = useMutation({
    mutationFn: (appointmentId: string) => invokeQboAuth("sync-appointment", { appointmentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbo-sync-log"] });
      toast.success("Appointment synced to QuickBooks");
    },
    onError: (err: Error) => toast.error("Sync failed: " + err.message),
  });

  // Bulk sync: starts a job and returns jobId
  const bulkSync = useMutation({
    mutationFn: (params: { dateFrom?: string; dateTo?: string; batchSize?: number }) =>
      invokeQboAuth("bulk-sync", params),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["qbo-sync-log"] });
      if (result.jobId) {
        toast.success(`Bulk sync started: ${result.total} records to process`);
      } else {
        toast.info("No records to sync");
      }
    },
    onError: (err: Error) => toast.error("Bulk sync failed: " + err.message),
  });

  // Continue processing an existing job
  const bulkSyncContinue = useMutation({
    mutationFn: (jobId: string) => invokeQboAuth("bulk-sync-continue", { jobId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbo-sync-log"] });
    },
    onError: (err: Error) => toast.error("Batch failed: " + err.message),
  });

  // Get job status
  const bulkSyncStatus = useMutation({
    mutationFn: (jobId: string) => invokeQboAuth("bulk-sync-status", { jobId }),
  });

  const retryFailed = useMutation({
    mutationFn: (logIds: string[]) => invokeQboAuth("retry-failed", { logIds }),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["qbo-sync-log"] });
      toast.success(`Retried: ${result.synced} succeeded, ${result.failed} failed`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMapping = useMutation({
    mutationFn: async (mapping: Partial<QboItemMapping> & { id: string }) => {
      const { id, ...updates } = mapping;
      const { error } = await supabase
        .from("qbo_item_mappings")
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbo-item-mappings"] });
      toast.success("Mapping updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reconcile = useMutation({
    mutationFn: () => invokeQboAuth("reconcile"),
    onError: (err: Error) => toast.error(err.message),
  });

  const validateMappings = useMutation({
    mutationFn: () => invokeQboAuth("validate-mappings"),
    onError: (err: Error) => toast.error(err.message),
  });

  const fetchQboItems = useMutation({
    mutationFn: () => invokeQboAuth("fetch-qbo-items"),
    onError: (err: Error) => toast.error(err.message),
  });

  return {
    connection: connectionQuery.data,
    isLoading: connectionQuery.isLoading,
    syncLog: syncLogQuery.data || [],
    syncLogLoading: syncLogQuery.isLoading,
    mappings: mappingsQuery.data || [],
    mappingsLoading: mappingsQuery.isLoading,
    initiateOAuth,
    disconnect,
    updateSettings,
    syncAppointment,
    bulkSync,
    bulkSyncContinue,
    bulkSyncStatus,
    retryFailed,
    updateMapping,
    reconcile,
    validateMappings,
    fetchQboItems,
  };
}
