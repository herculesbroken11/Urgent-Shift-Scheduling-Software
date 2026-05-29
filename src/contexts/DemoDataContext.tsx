import React, { createContext, useContext, useState, useCallback, useEffect, useRef, forwardRef } from "react";
import { useDemo, DEMO_AGENCY_ID } from "./DemoContext";
import {
  demoCustomers, demoInterpreters, demoLanguages, demoLocations,
  demoAppointments, demoBillingRates, demoInvoices, demoInvoiceLineItems,
  demoNotificationLog, demoNotifications, demoMessages,
  demoMyLanguages, demoReportAppointments, demoSharedAvailability,
} from "@/lib/demo-data";

type Collection =
  | "appointments" | "customers" | "locations" | "languages"
  | "interpreters" | "billingRates" | "invoices"
  | "notifications" | "notificationLog" | "notificationTemplates"
  | "messages" | "availability" | "interpreterLanguages";

interface DemoDataState {
  appointments: any[];
  customers: any[];
  locations: any[];
  languages: any[];
  interpreters: any[];
  billingRates: any[];
  invoices: any[];
  invoiceLineItems: Record<string, any[]>;
  notifications: any[];
  notificationLog: any[];
  notificationTemplates: any[];
  messages: any[];
  availability: any[];
  interpreterLanguages: any[];
  reportAppointments: any[];
  // Track which IDs are seed vs user-added
  _seedIds: Set<string>;
}

interface DemoDataContextType {
  state: DemoDataState;
  addItem: (collection: Collection, item: any) => void;
  updateItem: (collection: Collection, id: string, updates: any) => void;
  deleteItem: (collection: Collection, id: string) => void;
  setInvoiceLineItems: (invoiceId: string, items: any[]) => void;
  enrichAppointment: (raw: any) => any;
  genId: (prefix?: string) => string;
  resetUserData: () => void;
}

const DemoDataContext = createContext<DemoDataContextType | null>(null);

let idCounter = 0;

function buildSeedState(): DemoDataState {
  const apptMap = new Map<string, any>();
  demoAppointments.forEach(a => apptMap.set(a.id, a));

  // Merge report appointments that aren't already in main list
  demoReportAppointments.forEach((a: any) => {
    if (!apptMap.has(a.id)) apptMap.set(a.id, a);
  });

  const seedIds = new Set<string>();
  
  const allAppts = Array.from(apptMap.values());
  allAppts.forEach(a => seedIds.add(a.id));

  const customers = [...demoCustomers];
  customers.forEach(c => seedIds.add(c.id));

  const locations = [...demoLocations];
  locations.forEach(l => seedIds.add(l.id));

  const languages = [...demoLanguages];
  languages.forEach(l => seedIds.add(l.id));

  const interpreters = [...demoInterpreters];
  interpreters.forEach(i => seedIds.add(i.id));

  const billingRates = [...demoBillingRates];
  billingRates.forEach(r => seedIds.add(r.id));

  const invoices = [...demoInvoices];
  invoices.forEach(i => seedIds.add(i.id));

  const notifications = [...demoNotifications];
  notifications.forEach(n => seedIds.add(n.id));

  const notificationLog = [...demoNotificationLog];
  notificationLog.forEach(n => seedIds.add(n.id));

  const interpreterLanguages = [...demoMyLanguages];
  interpreterLanguages.forEach(l => seedIds.add(l.id));

  const notificationTemplates = [
    {
      id: "demo-tmpl-1", agency_id: DEMO_AGENCY_ID,
      name: "Appointment Confirmation Email",
      event_type: "appointment_confirmed", channel: "email",
      subject: "Your appointment has been confirmed",
      body_template: "Hello {{interpreter_name}}, your appointment on {{date}} at {{time}} at {{location}} has been confirmed. Language: {{language}}.",
      is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
    {
      id: "demo-tmpl-2", agency_id: DEMO_AGENCY_ID,
      name: "Appointment Reminder SMS",
      event_type: "appointment_reminder", channel: "sms",
      subject: null,
      body_template: "Reminder: You have an appointment on {{date}} at {{time}}. Location: {{location}}.",
      is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
    {
      id: "demo-tmpl-3", agency_id: DEMO_AGENCY_ID,
      name: "Job Available Notification",
      event_type: "job_available", channel: "email",
      subject: "New job available",
      body_template: "Hi {{interpreter_name}}, a new {{language}} job is available on {{date}} at {{location}}. Log in to claim it!",
      is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
    {
      id: "demo-tmpl-4", agency_id: DEMO_AGENCY_ID,
      name: "Cancellation Notice",
      event_type: "appointment_cancelled", channel: "email",
      subject: "Appointment Cancelled",
      body_template: "Your appointment on {{date}} at {{time}} has been cancelled. Reason: {{cancellation_reason}}.",
      is_active: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
    {
      id: "demo-tmpl-5", agency_id: DEMO_AGENCY_ID,
      name: "Invoice Created",
      event_type: "invoice_created", channel: "email",
      subject: "Invoice {{invoice_number}} Ready",
      body_template: "Dear {{customer_name}}, your invoice {{invoice_number}} for ${{total}} is ready for review.",
      is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
  ];
  notificationTemplates.forEach(t => seedIds.add(t.id));

  const availability = [
    { id: "demo-avail-slot-1", interpreter_id: "demo-interp-1", agency_id: DEMO_AGENCY_ID, is_recurring: true, day_of_week: 1, start_time: "08:00", end_time: "17:00", specific_date: null, notes: null, created_at: new Date().toISOString() },
    { id: "demo-avail-slot-2", interpreter_id: "demo-interp-1", agency_id: DEMO_AGENCY_ID, is_recurring: true, day_of_week: 2, start_time: "08:00", end_time: "17:00", specific_date: null, notes: null, created_at: new Date().toISOString() },
    { id: "demo-avail-slot-3", interpreter_id: "demo-interp-1", agency_id: DEMO_AGENCY_ID, is_recurring: true, day_of_week: 3, start_time: "09:00", end_time: "15:00", specific_date: null, notes: "Half day", created_at: new Date().toISOString() },
    { id: "demo-avail-slot-4", interpreter_id: "demo-interp-1", agency_id: DEMO_AGENCY_ID, is_recurring: true, day_of_week: 4, start_time: "08:00", end_time: "17:00", specific_date: null, notes: null, created_at: new Date().toISOString() },
    { id: "demo-avail-slot-5", interpreter_id: "demo-interp-1", agency_id: DEMO_AGENCY_ID, is_recurring: true, day_of_week: 5, start_time: "08:00", end_time: "12:00", specific_date: null, notes: "Morning only", created_at: new Date().toISOString() },
    ...demoSharedAvailability,
  ];
  availability.forEach(a => seedIds.add(a.id));

  return {
    appointments: allAppts,
    customers,
    locations,
    languages,
    interpreters,
    billingRates,
    invoices,
    invoiceLineItems: Object.fromEntries(
      Object.entries(demoInvoiceLineItems).map(([k, v]) => [k, [...v]])
    ),
    notifications,
    notificationLog,
    notificationTemplates,
    messages: [...demoMessages],
    availability,
    interpreterLanguages,
    reportAppointments: [...demoReportAppointments],
    _seedIds: seedIds,
  };
}

export const DemoDataProvider = forwardRef<HTMLElement, { children: React.ReactNode }>(
  function DemoDataProvider({ children }, _ref) {
  const { isDemoMode } = useDemo();
  const [state, setState] = useState<DemoDataState>(buildSeedState);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Reset to seed when exiting demo
  useEffect(() => {
    if (!isDemoMode) {
      setState(buildSeedState());
      idCounter = 0;
    }
  }, [isDemoMode]);

  const genId = useCallback((prefix = "demo") => {
    idCounter++;
    return `${prefix}-${Date.now()}-${idCounter}`;
  }, []);

  const addItem = useCallback((collection: Collection, item: any) => {
    setState(prev => ({
      ...prev,
      [collection]: [...(prev as any)[collection], item],
    }));
  }, []);

  const updateItem = useCallback((collection: Collection, id: string, updates: any) => {
    setState(prev => ({
      ...prev,
      [collection]: (prev as any)[collection].map((item: any) =>
        item.id === id ? { ...item, ...updates, updated_at: new Date().toISOString() } : item
      ),
    }));
  }, []);

  const deleteItem = useCallback((collection: Collection, id: string) => {
    setState(prev => ({
      ...prev,
      [collection]: (prev as any)[collection].filter((item: any) => item.id !== id),
    }));
  }, []);

  const setInvoiceLineItems = useCallback((invoiceId: string, items: any[]) => {
    setState(prev => ({
      ...prev,
      invoiceLineItems: { ...prev.invoiceLineItems, [invoiceId]: items },
    }));
  }, []);

  // Synchronous enrichment using ref
  const enrichAppointment = useCallback((raw: any) => {
    const prev = stateRef.current;
    const customer = prev.customers.find(c => c.id === raw.customer_id);
    const location = prev.locations.find(l => l.id === raw.location_id);
    const language = prev.languages.find(l => l.id === raw.language_id);
    const interp = prev.interpreters.find(i => i.id === raw.interpreter_id);
    const reqMap: Record<string, any> = {
      "demo-requester-id": { first_name: "Lisa", last_name: "Chen" },
      "demo-admin-id": { first_name: "Sarah", last_name: "Mitchell" },
      "demo-scheduler-id": { first_name: "David", last_name: "Park" },
    };
    return {
      ...raw,
      customers: customer ? { name: customer.name } : null,
      locations: location ? {
        name: location.name, address_line1: location.address_line1,
        city: location.city, state: location.state, zip_code: location.zip_code,
      } : null,
      languages: language ? { name: language.name, code: language.code } : null,
      interpreter: interp ? { first_name: interp.first_name, last_name: interp.last_name } : null,
      requester: reqMap[raw.requester_id] || null,
    };
  }, []);

  // Reset only user-added data, keeping seed data intact and reverting any updates to seed items
  const resetUserData = useCallback(() => {
    setState(buildSeedState());
    idCounter = 0;
  }, []);

  return (
    <DemoDataContext.Provider value={{ state, addItem, updateItem, deleteItem, setInvoiceLineItems, enrichAppointment, genId, resetUserData }}>
      {children}
    </DemoDataContext.Provider>
  );
});

export function useDemoData() {
  const ctx = useContext(DemoDataContext);
  if (!ctx) throw new Error("useDemoData must be used within DemoDataProvider");
  return ctx;
}
