/**
 * Demo mode is opt-in only. Set VITE_ENABLE_DEMO_MODE=true for local sales demos.
 * Production builds must leave this unset or false so fake sessions and role
 * switching cannot bypass Lovable Cloud / Supabase Auth.
 */
const DEMO_ENABLED = import.meta.env.VITE_ENABLE_DEMO_MODE === "true";

export function isDemoFeatureEnabled(): boolean {
  return DEMO_ENABLED;
}

export const DEMO_SESSION_KEY = "demo_role";

/** Remove persisted demo role selection (e.g. when feature is disabled). */
export function clearDemoSessionStorage(): void {
  try {
    sessionStorage.removeItem(DEMO_SESSION_KEY);
  } catch {
    // ignore storage errors (private browsing, etc.)
  }
}
