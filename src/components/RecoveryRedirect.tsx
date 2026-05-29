import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Global component that detects password recovery state and redirects
 * to /reset-password from ANY route. This handles the case where Supabase
 * redirects recovery traffic to the root "/" instead of "/reset-password"
 * (e.g. when the custom domain isn't in the allowed redirect URLs).
 */
export function RecoveryRedirect() {
  const { user, loading, isPasswordRecovery } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    // Already on reset-password page — nothing to do
    if (location.pathname === "/reset-password") return;

    // Check for recovery indicators:
    // 1. AuthContext detected PASSWORD_RECOVERY event
    // 2. sessionStorage flag persisted across redirect
    // 3. URL has recovery code/type params (Supabase redirected here with code)
    const searchParams = new URLSearchParams(location.search);
    const hashParams = new URLSearchParams(
      location.hash.startsWith("#") ? location.hash.slice(1) : location.hash
    );

    const hasRecoverySignal =
      isPasswordRecovery ||
      hashParams.get("type") === "recovery" ||
      searchParams.get("type") === "recovery";

    if (hasRecoverySignal && user) {
      navigate("/reset-password", { replace: true });
    }
  }, [loading, user, isPasswordRecovery, location, navigate]);

  return null;
}