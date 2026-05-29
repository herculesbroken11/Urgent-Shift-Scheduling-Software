import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Globe, KeyRound } from "lucide-react";
import { toast } from "sonner";

export default function ResetPassword() {
  const { user, loading, isPasswordRecovery } = useAuth();
  
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  // Detect recovery context: PASSWORD_RECOVERY event, hash fragment, query param, or PKCE code
  const hasRecoveryContext = (() => {
    if (isPasswordRecovery) return true;
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    const hashParams = new URLSearchParams(hash);
    if (hashParams.get("type") === "recovery") return true;
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("type") === "recovery") return true;
    // PKCE flow: code param present on /reset-password route means recovery
    if (searchParams.get("code")) return true;
    return false;
  })();

  if (loading) return null;

  // Allow access if: recovery context detected OR user already authenticated (session from recovery token)
  if (!hasRecoveryContext && !user) return <Navigate to="/login" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setSubmitting(false);
      toast.error(error.message);
      return;
    }

    // Clear recovery flag before anything else
    try { sessionStorage.removeItem('pw_recovery'); } catch {}

    toast.success("Password updated successfully. Redirecting to sign in…");

    // Sign out so auth state change doesn't hijack navigation, then redirect
    await supabase.auth.signOut();
    setTimeout(() => {
      navigate("/login", { replace: true });
    }, 1500);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-primary">
            <Globe className="h-10 w-10" />
            <h1 className="text-3xl font-bold tracking-tight">BlueThread Solution</h1>
          </div>
          <p className="text-sm text-muted-foreground">Set your new password</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Reset password</CardTitle>
            <CardDescription>Create a secure password for your account.</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required placeholder="••••••••" />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={submitting}>
                <KeyRound className="mr-2 h-4 w-4" />
                {submitting ? "Updating password…" : "Update password"}
              </Button>
              <button
                type="button"
                onClick={() => navigate("/login", { replace: true })}
                className="text-sm text-muted-foreground hover:underline"
              >
                ← Back to Sign in
              </button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
