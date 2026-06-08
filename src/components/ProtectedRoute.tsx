import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformAuth } from "@/hooks/usePlatformAuth";
import { useAgencyStatus } from "@/hooks/useAgencyStatus";
import { AppRole } from "@/lib/supabase-helpers";
import { isDemoFeatureEnabled } from "@/lib/demo-config";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: AppRole[];
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { user, loading, roles, profile, isDemoMode } = useAuth();
  const { isPlatformOwner, isLoading: platformLoading } = usePlatformAuth();
  const { agencyStatus, isLoading: statusLoading } = useAgencyStatus();
  const location = useLocation();

  if (loading || platformLoading || statusLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Demo bypass requires explicit VITE_ENABLE_DEMO_MODE=true (never default in production).
  if (isDemoMode && isDemoFeatureEnabled()) {
    if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.some((r) => roles.some((ur) => ur.role === r))) {
      return <Navigate to="/dashboard" replace />;
    }
    return <>{children}</>;
  }

  if (!user) return <Navigate to="/login" replace />;

  const isOnboarding = location.pathname === "/onboarding";
  const isPendingPage = location.pathname === "/pending-approval";

  // Platform owners without an agency should go to platform console, not onboarding
  if (!isOnboarding && !isPendingPage && (!profile?.agency_id || roles.length === 0)) {
    if (isPlatformOwner) {
      return <Navigate to="/platform/dashboard" replace />;
    }
    return <Navigate to="/onboarding" replace />;
  }

  // Agency status gating — block pending_approval agencies from app access
  if (!isOnboarding && !isPendingPage && agencyStatus === "pending_approval") {
    return <Navigate to="/pending-approval" replace />;
  }

  // Block suspended or cancelled agencies (frontend guard; RLS/Edge still need hardening per CP4/CP5)
  if (
    !isOnboarding &&
    !isPendingPage &&
    profile?.agency_id &&
    (agencyStatus === "suspended" || agencyStatus === "cancelled" || agencyStatus === "archived")
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">Agency access restricted</h1>
          <p className="text-muted-foreground text-sm">
            Your agency account is not currently active. Contact your administrator or{" "}
            <a href="mailto:support@bluethreadsolution.com" className="text-primary hover:underline">
              support@bluethreadsolution.com
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  // Block deactivated user profiles while session remains valid
  if (!isOnboarding && !isPendingPage && profile && profile.is_active === false) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">Account deactivated</h1>
          <p className="text-muted-foreground text-sm">
            Your account has been deactivated. Contact your agency administrator if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.some((r) => roles.some((ur) => ur.role === r))) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
