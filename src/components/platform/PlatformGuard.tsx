import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformAuth } from "@/hooks/usePlatformAuth";

export function PlatformGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isPlatformOwner, isLoading } = usePlatformAuth();

  if (loading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!isPlatformOwner) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}
