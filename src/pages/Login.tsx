import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformAuth } from "@/hooks/usePlatformAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Globe, LogIn, Mail, ArrowLeft } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

export default function Login() {
  const { user, loading, isPasswordRecovery } = useAuth();
  const { isPlatformOwner, isLoading: platformLoading } = usePlatformAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetting, setResetting] = useState(false);

  if (loading || platformLoading) return null;
  // If this is a password recovery session, redirect to reset-password instead of dashboard
  if (user && isPasswordRecovery) return <Navigate to="/reset-password" replace />;
  if (user) return <Navigate to={isPlatformOwner ? "/platform/dashboard" : "/dashboard"} replace />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(`Login failed: ${error.message}`);
    }
    setSubmitting(false);
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetting(false);
    if (error) {
      toast.error(`Error: ${error.message}`);
      return;
    }
    setResetSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-primary">
            <Globe className="h-10 w-10" />
            <h1 className="text-3xl font-bold tracking-tight">BlueThread Solution</h1>
          </div>
          <p className="text-sm text-muted-foreground">Interpreter Management Platform</p>
        </div>

        {showForgot ? (
          <Card>
            <CardHeader>
              <CardTitle>Reset password</CardTitle>
              <CardDescription>
                {resetSent
                  ? "Check your inbox for a password reset link."
                  : "Enter your email and we'll send you a reset link."}
              </CardDescription>
            </CardHeader>
            {!resetSent ? (
              <form onSubmit={handleResetRequest}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="resetEmail">Email</Label>
                    <Input
                      id="resetEmail"
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                      placeholder="you@company.com"
                    />
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                  <Button type="submit" className="w-full" disabled={resetting}>
                    <Mail className="mr-2 h-4 w-4" />
                    {resetting ? "Sending…" : "Send reset link"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => { setShowForgot(false); setResetSent(false); }}
                    className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
                  >
                    <ArrowLeft className="h-3 w-3" /> Back to sign in
                  </button>
                </CardFooter>
              </form>
            ) : (
              <CardFooter className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground text-center">
                  If an account exists for <strong>{resetEmail}</strong>, you'll receive an email shortly.
                </p>
                <button
                  type="button"
                  onClick={() => { setShowForgot(false); setResetSent(false); }}
                  className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
                >
                  <ArrowLeft className="h-3 w-3" /> Back to sign in
                </button>
              </CardFooter>
            )}
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>Enter your credentials to access your portal</CardDescription>
            </CardHeader>
            <form onSubmit={handleLogin}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => { setShowForgot(true); setResetEmail(email); }}
                      className="text-xs text-primary underline-offset-4 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <Button type="submit" className="w-full" disabled={submitting}>
                  <LogIn className="mr-2 h-4 w-4" />
                  {submitting ? "Signing in…" : "Sign in"}
                </Button>
                <div className="flex items-center gap-3 w-full">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <Separator className="flex-1" />
                </div>
                <GoogleSignInButton />
                <p className="text-sm text-muted-foreground">
                  Don't have an account?{" "}
                  <Link to="/signup" className="text-primary underline-offset-4 hover:underline">Sign up</Link>
                </p>
              </CardFooter>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
