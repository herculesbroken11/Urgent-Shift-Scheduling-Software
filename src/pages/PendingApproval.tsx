import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAgencyStatus } from "@/hooks/useAgencyStatus";
import { usePlatformAuth } from "@/hooks/usePlatformAuth";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Building2, LogOut, RefreshCw } from "lucide-react";

export default function PendingApproval() {
  const { user, profile, loading, signOut } = useAuth();
  const { isPlatformOwner } = usePlatformAuth();
  const { agencyStatus, isLoading } = useAgencyStatus();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);

  const handleCheckStatus = async () => {
    setChecking(true);
    setCheckMessage(null);
    // Fresh fetch bypassing React Query cache entirely
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase
      .from("agencies")
      .select("agency_status")
      .eq("id", profile!.agency_id!)
      .single();
    const result = data?.agency_status as string | null;
    // Also invalidate the cached query so ProtectedRoute picks up the change
    await queryClient.invalidateQueries({ queryKey: ["agency-status", profile?.agency_id] });

    if (result === "active" || result === "trial") {
      navigate("/dashboard", { replace: true });
    } else {
      setCheckMessage("Still under review — we'll notify you when your agency is approved.");
    }
    setChecking(false);
  };

  if (loading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (isPlatformOwner) return <Navigate to="/platform/dashboard" replace />;
  if (!profile?.agency_id) return <Navigate to="/onboarding" replace />;
  if (agencyStatus === "active" || agencyStatus === "trial") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Clock className="h-8 w-8 text-muted-foreground" />
          </div>
           <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
             Your agency is under review
           </h1>
           <p className="mt-2 text-muted-foreground">
             We&apos;re reviewing your application. You&apos;ll receive an email and gain full access once your agency is approved by our team.
           </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              Application Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Email</span>
              <span className="text-foreground">{profile?.email}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Status</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Pending Approval
              </span>
            </div>
          </CardContent>
        </Card>

        {checkMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" />
            {checkMessage}
          </div>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Questions? Contact us at{" "}
          <a href="mailto:support@bluethreadsolution.com" className="text-primary hover:underline">
            support@bluethreadsolution.com
          </a>
        </p>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={handleCheckStatus} disabled={checking}>
            {checking ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Check Status
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => signOut()}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
