import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoData } from "@/contexts/DemoDataContext";
import { DEMO_AGENCY_ID } from "@/contexts/DemoContext";
import { useAdaptedQuery, useAdaptedMutation } from "@/lib/data-adapter";
import { calculateAppointmentBilling, type BillingRateRecord, type AppointmentForBilling, type BillingContext } from "@/lib/billing-engine";
import type { Database } from "@/integrations/supabase/types";

type BillingRateInsert = Database["public"]["Tables"]["billing_rates"]["Insert"];
type BillingRateUpdate = Database["public"]["Tables"]["billing_rates"]["Update"];
type InvoiceInsert = Database["public"]["Tables"]["invoices"]["Insert"];
type InvoiceLineItemInsert = Database["public"]["Tables"]["invoice_line_items"]["Insert"];

export interface BillingRate {
  id: string; agency_id: string; customer_id: string | null; name: string;
  billing_model: string; base_rate: number;
  hourly_rate: number; minimum_hours: number; minimum_charge: number;
  monthly_minimum: number; travel_rate_per_mile: number; travel_time_rate: number;
  after_hours_multiplier: number; weekend_multiplier: number;
  overtime_multiplier: number; overtime_after_hours: number;
  cancellation_window_hours: number; cancellation_fee_percent: number;
  tier_config: any[]; effective_start_date: string | null; effective_end_date: string | null;
  is_default: boolean; created_at: string; updated_at: string;
  // Bundle fields
  same_day_threshold_hours: number;
  same_day_fee: number;
  same_day_multiplier: number;
  after_hours_start: string;
  after_hours_end: string;
  holiday_multiplier: number;
  // Advanced billing fields
  rounding_direction: string;
  rounding_interval_minutes: number;
  stack_premiums: boolean;
  apply_lastminute_to_travel: boolean;
  ignore_requested_duration: boolean;
}

export interface Invoice {
  id: string; agency_id: string; customer_id: string; invoice_number: string;
  status: string; issued_date: string | null; due_date: string | null;
  subtotal: number; tax_rate: number; tax_amount: number; total: number;
  notes: string | null; created_at: string; updated_at: string;
  customers?: { name: string } | null;
}

export interface InvoiceLineItem {
  id: string; invoice_id: string; appointment_id: string | null;
  description: string; quantity: number; unit_price: number;
  amount: number; line_type: string; created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Billing rates                                                      */
/* ------------------------------------------------------------------ */

export function useBillingRates() {
  const { profile } = useAuth();
  const { state } = useDemoData();
  return useAdaptedQuery<BillingRate[]>({
    queryKey: ["billing_rates", profile?.agency_id],
    queryFn: async () => {
      if (!profile?.agency_id) return [];
      const { data, error } = await supabase
        .from("billing_rates").select("*").eq("agency_id", profile.agency_id).eq("is_deleted", false).order("name");
      if (error) throw error;
      return data as BillingRate[];
    },
    demoFn: () => state.billingRates as BillingRate[],
    enabled: !!profile?.agency_id,
  });
}

export function useBillingRateMutations() {
  const { profile } = useAuth();
  const { addItem, updateItem, deleteItem, genId } = useDemoData();

  const create = useAdaptedMutation<Partial<BillingRate>>({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from("billing_rates").insert({ ...input, agency_id: profile!.agency_id! } as BillingRateInsert).select().single();
      if (error) throw error;
      return data;
    },
    demoFn: (input) => {
      const item = { id: genId("demo-rate"), agency_id: DEMO_AGENCY_ID, ...input, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      addItem("billingRates", item);
      return item;
    },
    invalidateKeys: [["billing_rates"]],
    successMessage: "Billing rate created",
  });

  const update = useAdaptedMutation<Partial<BillingRate> & { id: string }>({
    mutationFn: async ({ id, ...input }) => {
      const { data, error } = await supabase.from("billing_rates").update(input as BillingRateUpdate).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    demoFn: ({ id, ...input }) => { updateItem("billingRates", id, input); return { id, ...input }; },
    invalidateKeys: [["billing_rates"]],
    successMessage: "Billing rate updated",
  });

  const remove = useAdaptedMutation<string>({
    mutationFn: async (id) => {
      const { error } = await supabase.from("billing_rates").update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      } as any).eq("id", id);
      if (error) throw error;
    },
    demoFn: (id) => { deleteItem("billingRates", id); },
    invalidateKeys: [["billing_rates"]],
    successMessage: "Billing rate archived",
  });

  return { create, update, remove };
}

/* ------------------------------------------------------------------ */
/*  Invoices                                                           */
/* ------------------------------------------------------------------ */

export function useInvoices() {
  const { profile } = useAuth();
  const { state } = useDemoData();
  return useAdaptedQuery<Invoice[]>({
    queryKey: ["invoices", profile?.agency_id],
    queryFn: async () => {
      if (!profile?.agency_id) return [];
      const { data, error } = await supabase
        .from("invoices").select("*, customers(name)").eq("agency_id", profile.agency_id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Invoice[];
    },
    demoFn: () => state.invoices as Invoice[],
    enabled: !!profile?.agency_id,
  });
}

export function useInvoiceLineItems(invoiceId?: string) {
  const { state } = useDemoData();
  return useAdaptedQuery<InvoiceLineItem[]>({
    queryKey: ["invoice_line_items", invoiceId],
    queryFn: async () => {
      if (!invoiceId) return [];
      const { data, error } = await supabase
        .from("invoice_line_items").select("*").eq("invoice_id", invoiceId).order("created_at");
      if (error) throw error;
      return data as InvoiceLineItem[];
    },
    demoFn: () => (state.invoiceLineItems[invoiceId ?? ""] ?? []) as InvoiceLineItem[],
    enabled: !!invoiceId,
  });
}

export function useInvoiceMutations() {
  const { profile } = useAuth();
  const { state, addItem, updateItem, deleteItem, setInvoiceLineItems, genId } = useDemoData();

  const generateInvoice = useAdaptedMutation<
    { customerId: string; dateFrom: string; dateTo: string; agencyTimezone?: string; holidayDates?: string[] }
  >({
    mutationFn: async ({ customerId, dateFrom, dateTo, agencyTimezone, holidayDates }) => {
      if (!profile?.agency_id) throw new Error("No agency");

      // Fetch appointments
      const { data: appointments, error: apptErr } = await supabase
        .from("appointments")
        .select("*, languages(name), interpreter:profiles!appointments_interpreter_id_fkey(first_name, last_name)")
        .eq("agency_id", profile.agency_id).eq("customer_id", customerId)
        .in("status", ["completed", "completed_last_minute", "cancelled", "late_cancel_no_show_client"])
        .eq("is_import_staged", false).eq("is_deleted", false)
        .gte("scheduled_start", dateFrom).lte("scheduled_start", dateTo);
      if (apptErr) throw apptErr;
      if (!appointments?.length) throw new Error("No billable appointments found in this date range");

      // Fetch billing rates
      const { data: rates } = await supabase
        .from("billing_rates").select("*").eq("agency_id", profile.agency_id);

      const allRates = (rates ?? []) as unknown as BillingRateRecord[];
      const billingContext: BillingContext = { agencyTimezone, holidayDates };

      const lineItems: Omit<InvoiceLineItemInsert, "invoice_id">[] = [];
      for (const appt of appointments) {
        const interp = appt.interpreter as { first_name?: string; last_name?: string } | null;
        const interpName = interp ? `${interp.first_name ?? ""} ${interp.last_name ?? ""}`.trim() : "Unassigned";
        const langObj = appt.languages as { name?: string } | null;
        const langName = langObj?.name || "";

        try {
          const breakdown = calculateAppointmentBilling(appt as unknown as AppointmentForBilling, allRates, billingContext);
          if (breakdown.total <= 0) continue;

          for (const bLine of breakdown.line_items) {
            lineItems.push({
              appointment_id: appt.id,
              description: `${appt.title || "Interpretation"} — ${langName} — ${interpName} — ${new Date(appt.scheduled_start!).toLocaleDateString()} [${bLine.description}]`,
              quantity: bLine.quantity,
              unit_price: bLine.unit_price,
              amount: bLine.amount,
              line_type: bLine.type,
            });
          }
        } catch {
          // No rate found for this appointment — skip
        }
      }

      if (lineItems.length === 0) throw new Error("No billable appointments found in this date range");

      const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
      const invNum = `INV-${Date.now().toString(36).toUpperCase()}`;
      const { data: invoice, error: invErr } = await supabase
        .from("invoices").insert({ agency_id: profile.agency_id, customer_id: customerId, invoice_number: invNum, status: "draft", issued_date: new Date().toISOString().split("T")[0], due_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0], subtotal, total: subtotal } as InvoiceInsert).select().single();
      if (invErr) throw invErr;
      const { error: liErr } = await supabase
        .from("invoice_line_items").insert(lineItems.map(li => ({ ...li, invoice_id: invoice.id, description: li.description })) as InvoiceLineItemInsert[]);
      if (liErr) throw liErr;
      return invoice;
    },
    demoFn: ({ customerId, dateFrom, dateTo }) => {
      const billable = state.appointments.filter((a: any) => {
        if (a.customer_id !== customerId) return false;
        if (!["completed", "completed_last_minute", "cancelled", "late_cancel_no_show_client"].includes(a.status)) return false;
        if (!a.scheduled_start) return false;
        const d = a.scheduled_start.split("T")[0];
        return d >= dateFrom && d <= dateTo;
      });
      const allRates = state.billingRates as unknown as BillingRateRecord[];
      const lineItems: any[] = [];
      for (const appt of billable) {
        try {
          const breakdown = calculateAppointmentBilling(appt as unknown as AppointmentForBilling, allRates);
          if (breakdown.total <= 0) continue;
          for (const bLine of breakdown.line_items) {
            lineItems.push({
              id: genId("demo-li"),
              appointment_id: appt.id,
              description: bLine.description,
              quantity: bLine.quantity,
              unit_price: bLine.unit_price,
              amount: bLine.amount,
              line_type: bLine.type,
              created_at: new Date().toISOString(),
            });
          }
        } catch {
          // skip
        }
      }
      if (lineItems.length === 0) throw new Error("No billable appointments found in this date range");
      const subtotal = lineItems.reduce((s, li) => s + li.amount, 0);
      const invId = genId("demo-inv");
      const customer = state.customers.find((c: any) => c.id === customerId);
      const invoice = {
        id: invId, agency_id: DEMO_AGENCY_ID, customer_id: customerId,
        invoice_number: `INV-${Date.now().toString(36).toUpperCase()}`,
        status: "draft", issued_date: new Date().toISOString().split("T")[0],
        due_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
        subtotal, tax_rate: 0, tax_amount: 0, total: subtotal,
        notes: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        customers: customer ? { name: customer.name } : null,
      };
      lineItems.forEach(li => li.invoice_id = invId);
      addItem("invoices", invoice);
      setInvoiceLineItems(invId, lineItems);
      return invoice;
    },
    invalidateKeys: [["invoices"]],
    successMessage: "Invoice generated",
  });

  const updateStatus = useAdaptedMutation<{ id: string; status: string }>({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase.from("invoices").update({ status }).eq("id", id);
      if (error) throw error;
    },
    demoFn: ({ id, status }) => { updateItem("invoices", id, { status }); },
    invalidateKeys: [["invoices"]],
    successMessage: "Invoice updated",
  });

  const remove = useAdaptedMutation<string>({
    mutationFn: async (id) => {
      const { error } = await supabase.from("invoices").update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      } as any).eq("id", id);
      if (error) throw error;
    },
    demoFn: (id) => { deleteItem("invoices", id); },
    invalidateKeys: [["invoices"]],
    successMessage: "Invoice archived",
  });

  return { generateInvoice, updateStatus, remove };
}
