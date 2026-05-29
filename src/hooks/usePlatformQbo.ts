import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

async function invokePlatformQbo(action: string, body?: any) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const resp = await fetch(
    `https://${projectId}.supabase.co/functions/v1/platform-qbo/${action}`,
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

export interface PlatformQboConnection {
  id: string;
  realm_id: string | null;
  company_name: string | null;
  connection_status: string;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformInvoice {
  id: string;
  agency_id: string;
  invoice_number: string;
  billing_month: string;
  status: string;
  subtotal: number;
  total: number;
  issued_date: string | null;
  due_date: string | null;
  qbo_invoice_id: string | null;
  qbo_last_synced_at: string | null;
  config_id: string | null;
  config_snapshot: any;
  generation_details: any;
  created_at: string;
  agencies?: { name: string };
  line_items?: any[];
}

export function usePlatformQbo() {
  const qc = useQueryClient();

  const connectionQuery = useQuery<PlatformQboConnection | null>({
    queryKey: ["platform-qbo-connection"],
    queryFn: async () => {
      const result = await invokePlatformQbo("status");
      return result.connection || null;
    },
  });

  const invoicesQuery = useQuery<PlatformInvoice[]>({
    queryKey: ["platform-invoices"],
    queryFn: async () => {
      const result = await invokePlatformQbo("list-invoices", {});
      return result.invoices || [];
    },
  });

  const syncLogQuery = useQuery({
    queryKey: ["platform-qbo-sync-log"],
    queryFn: async () => {
      const result = await invokePlatformQbo("sync-log");
      return result.log || [];
    },
  });

  const initiateOAuth = useMutation({
    mutationFn: async () => {
      const result = await invokePlatformQbo("initiate");
      return result.authUrl;
    },
    onSuccess: (authUrl: string) => { window.location.href = authUrl; },
    onError: (err: Error) => toast.error("Failed to initiate: " + err.message),
  });

  const disconnect = useMutation({
    mutationFn: () => invokePlatformQbo("disconnect"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-qbo-connection"] });
      toast.success("Platform QuickBooks disconnected");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const generateInvoices = useMutation({
    mutationFn: (billingMonth: string) => invokePlatformQbo("generate-invoices", { billing_month: billingMonth }),
    onSuccess: (result: any) => {
      qc.invalidateQueries({ queryKey: ["platform-invoices"] });
      toast.success(`Generated ${result.generated} invoice(s)`);
      if (result.skipped > 0) {
        toast.info(`${result.skipped} skipped (already exist)`);
      }
      if (result.errors?.length) {
        toast.warning(`${result.errors.length} agency(ies) had errors`);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const syncInvoice = useMutation({
    mutationFn: (invoiceId: string) => invokePlatformQbo("sync-invoice", { invoice_id: invoiceId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-invoices"] });
      qc.invalidateQueries({ queryKey: ["platform-qbo-sync-log"] });
      toast.success("Invoice synced to QuickBooks");
    },
    onError: (err: Error) => toast.error("Sync failed: " + err.message),
  });

  const getInvoiceDetail = useMutation({
    mutationFn: async (invoiceId: string) => {
      const result = await invokePlatformQbo("invoice-detail", { invoice_id: invoiceId });
      return result.invoice;
    },
    onError: (err: Error) => toast.error("Failed to load invoice: " + err.message),
  });

  const updateInvoiceStatus = useMutation({
    mutationFn: (params: { invoice_id: string; new_status: string }) =>
      invokePlatformQbo("update-invoice-status", params),
    onSuccess: (result: any) => {
      qc.invalidateQueries({ queryKey: ["platform-invoices"] });
      toast.success(`Invoice status updated to ${result.new_status}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const detectOrphans = useMutation({
    mutationFn: async () => {
      const result = await invokePlatformQbo("detect-orphans", {});
      return result.orphans || [];
    },
    onError: (err: Error) => toast.error("Orphan detection failed: " + err.message),
  });

  const deleteInvoice = useMutation({
    mutationFn: (invoiceId: string) => invokePlatformQbo("delete-invoice", { invoice_id: invoiceId }),
    onSuccess: (result: any) => {
      qc.invalidateQueries({ queryKey: ["platform-invoices"] });
      toast.success(`Invoice ${result.deleted} deleted`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkIssue = useMutation({
    mutationFn: (params: { billing_month: string; dry_run?: boolean }) =>
      invokePlatformQbo("bulk-issue", params),
    onSuccess: (result: any) => {
      if (!result.dry_run) qc.invalidateQueries({ queryKey: ["platform-invoices"] });
    },
    onError: (err: Error) => toast.error("Bulk issue failed: " + err.message),
  });

  const bulkSync = useMutation({
    mutationFn: (params: { billing_month: string; dry_run?: boolean }) =>
      invokePlatformQbo("bulk-sync", params),
    onSuccess: (result: any) => {
      if (!result.dry_run) {
        qc.invalidateQueries({ queryKey: ["platform-invoices"] });
        qc.invalidateQueries({ queryKey: ["platform-qbo-sync-log"] });
      }
    },
    onError: (err: Error) => toast.error("Bulk sync failed: " + err.message),
  });

  return {
    connection: connectionQuery.data,
    isLoading: connectionQuery.isLoading,
    invoices: invoicesQuery.data || [],
    invoicesLoading: invoicesQuery.isLoading,
    syncLog: syncLogQuery.data || [],
    syncLogLoading: syncLogQuery.isLoading,
    initiateOAuth,
    disconnect,
    generateInvoices,
    syncInvoice,
    getInvoiceDetail,
    updateInvoiceStatus,
    detectOrphans,
    deleteInvoice,
    bulkIssue,
    bulkSync,
  };
}
