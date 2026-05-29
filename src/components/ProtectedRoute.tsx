import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformAuth } from "@/hooks/usePlatformAuth";
import { useAgencyStatus } from "@/hooks/useAgencyStatus";
import { AppRole } from "@/lib/supabase-helpers";

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

  // Demo mode bypasses real auth
  if (isDemoMode) {
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

  if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.some((r) => roles.some((ur) => ur.role === r))) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
