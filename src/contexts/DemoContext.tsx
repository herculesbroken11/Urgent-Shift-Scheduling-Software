import React, { createContext, useContext, useState, useCallback, forwardRef, useEffect } from "react";
import { AppRole, UserProfile, UserRole } from "@/lib/supabase-helpers";
import {
  clearDemoSessionStorage,
  DEMO_SESSION_KEY,
  isDemoFeatureEnabled,
} from "@/lib/demo-config";

interface DemoContextType {
  isDemoMode: boolean;
  demoRole: AppRole | null;
  startDemo: (role: AppRole) => void;
  exitDemo: () => void;
  switchRole: () => void;
  isSwitchingRole: boolean;
  demoProfile: UserProfile | null;
  demoRoles: UserRole[];
}

const DEMO_AGENCY_ID = "demo-agency-00000000-0000-0000-0000-000000000000";

const demoProfiles: Record<AppRole, UserProfile> = {
  agency_admin: {
    id: "demo-admin-id",
    agency_id: DEMO_AGENCY_ID,
    customer_id: null,
    first_name: "Sarah",
    last_name: "Mitchell",
    email: "sarah@demo-agency.com",
    phone: "(555) 100-0001",
    avatar_url: null,
    is_active: true,
  },
  scheduler: {
    id: "demo-scheduler-id",
    agency_id: DEMO_AGENCY_ID,
    customer_id: null,
    first_name: "David",
    last_name: "Park",
    email: "david@demo-agency.com",
    phone: "(555) 100-0002",
    avatar_url: null,
    is_active: true,
  },
  requester: {
    id: "demo-requester-id",
    agency_id: DEMO_AGENCY_ID,
    customer_id: "demo-cust-1",
    first_name: "Lisa",
    last_name: "Chen",
    email: "lisa@demo-customer.com",
    phone: "(555) 200-0001",
    avatar_url: null,
    is_active: true,
  },
  interpreter: {
    id: "demo-interp-1",
    agency_id: DEMO_AGENCY_ID,
    customer_id: null,
    first_name: "Carlos",
    last_name: "Rivera",
    email: "carlos@interpreter.com",
    phone: "(555) 300-0001",
    avatar_url: null,
    is_active: true,
  },
};

const DemoContext = createContext<DemoContextType | undefined>(undefined);

export const DemoProvider = forwardRef<HTMLElement, { children: React.ReactNode }>(
  function DemoProvider({ children }, _ref) {
  const [demoRole, setDemoRole] = useState<AppRole | null>(() => {
    if (!isDemoFeatureEnabled()) {
      clearDemoSessionStorage();
      return null;
    }
    const stored = sessionStorage.getItem(DEMO_SESSION_KEY);
    return stored as AppRole | null;
  });
  const [isSwitchingRole, setIsSwitchingRole] = useState(false);

  // Clear stale demo session if feature was disabled (e.g. production build).
  useEffect(() => {
    if (!isDemoFeatureEnabled()) {
      clearDemoSessionStorage();
      setDemoRole(null);
      setIsSwitchingRole(false);
    }
  }, []);

  const isDemoMode =
    isDemoFeatureEnabled() && (demoRole !== null || isSwitchingRole);

  const startDemo = useCallback((role: AppRole) => {
    if (!isDemoFeatureEnabled()) return;
    sessionStorage.setItem(DEMO_SESSION_KEY, role);
    setDemoRole(role);
    setIsSwitchingRole(false);
  }, []);

  const exitDemo = useCallback(() => {
    clearDemoSessionStorage();
    setIsSwitchingRole(false);
    setDemoRole(null);
  }, []);

  const switchRole = useCallback(() => {
    if (!isDemoFeatureEnabled()) return;
    clearDemoSessionStorage();
    setIsSwitchingRole(true);
    setDemoRole(null);
  }, []);

  const demoProfile = demoRole ? demoProfiles[demoRole] : null;
  const demoRoles: UserRole[] = demoRole
    ? [{ role: demoRole, agency_id: DEMO_AGENCY_ID }]
    : [];

  return (
    <DemoContext.Provider value={{ isDemoMode, demoRole, startDemo, exitDemo, switchRole, isSwitchingRole, demoProfile, demoRoles }}>
      {children}
    </DemoContext.Provider>
  );
});

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used within DemoProvider");
  return ctx;
}

export { DEMO_AGENCY_ID };
