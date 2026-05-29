import { useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { createAgencyWithAdmin } from "@/lib/supabase-helpers";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformAuth } from "@/hooks/usePlatformAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Building2, ArrowRight, Loader2, CheckCircle2, Link2, Users } from "lucide-react";

type OnboardingIntent = null | "new_agency" | "invited";

const PLANS = [
  { value: "starter", label: "Starter", desc: "Fixed monthly fee — best for smaller agencies" },
  { value: "professional", label: "Professional", desc: "Per-appointment billing — scales with volume" },
  { value: "enterprise", label: "Enterprise", desc: "Custom pricing — our team will reach out" },
] as const;

export default function Onboarding() {
  const { user, profile, roles, loading, refreshProfile, signOut } = useAuth();
  const { isPlatformOwner, isLoading: platformLoading } = usePlatformAuth();
  const navigate = useNavigate();
  const [intent, setIntent] = useState<OnboardingIntent>(null);
  const [agencyName, setAgencyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("starter");
  const [submitting, setSubmitting] = useState(false);
  const [checkingInvite, setCheckingInvite] = useState(true);
  const [acceptingInvite, setAcceptingInvite] = useState(false);

  // Check for pending invitation on mount
  useEffect(() => {
    if (!user || loading || platformLoading) return;
    if (isPlatformOwner) {
      setCheckingInvite(false);
      navigate("/platform/dashboard", { replace: true });
      return;
    }
    if (profile?.agency_id && roles.length > 0) return;

    const checkInvitation = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setCheckingInvite(false); return; }

        const { data, error } = await supabase.functions.invoke("accept-invitation", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (error) { setCheckingInvite(false); return; }

        if (data?.found && data?.accepted) {
          setAcceptingInvite(true);
          toast.success(`Invitation accepted! You've been added as ${data.role.replace("_", " ")}.`);
          await refreshProfile();
          navigate("/dashboard", { replace: true });
          return;
        }
      } catch {
        // Silently fall through to manual onboarding
      }
      setCheckingInvite(false);
    };

    checkInvitation();
  }, [user, loading, platformLoading, isPlatformOwner, profile?.agency_id, roles.length, navigate, refreshProfile, toast]);

  if (loading || platformLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (isPlatformOwner) return <Navigate to="/platform/dashboard" replace />;
  if (profile?.agency_id && roles.length > 0) return <Navigate to="/dashboard" replace />;

  if (checkingInvite || acceptingInvite) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center space-y-4">
          {acceptingInvite ? (
            <>
              <CheckCircle2 className="h-10 w-10 text-primary mx-auto animate-pulse" />
              <p className="text-lg font-medium">Setting up your account…</p>
            </>
          ) : (
            <>
              <Loader2 className="h-10 w-10 text-muted-foreground mx-auto animate-spin" />
              <p className="text-muted-foreground">Checking for invitation…</p>
            </>
          )}
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const slug = agencyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      await createAgencyWithAdmin(user.id, agencyName, slug, firstName, lastName, selectedPlan, "pending_approval");
      await refreshProfile();
      navigate("/pending-approval", { replace: true });
    } catch (err: any) {
      toast.error(`Setup failed: ${err.message}`);
    }
    setSubmitting(false);
  };

  // Intent selection screen
  if (intent === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-lg space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Welcome to BlueThread Solution</h1>
            <p className="mt-2 text-muted-foreground">How would you like to get started?</p>
          </div>

          <div className="grid gap-4">
            <Card
              className="cursor-pointer transition-colors hover:border-primary"
              onClick={() => setIntent("new_agency")}
            >
              <CardContent className="flex items-start gap-4 pt-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Set up a new agency</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Create your interpreting agency and invite your team to start scheduling.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer transition-colors hover:border-primary"
              onClick={() => setIntent("invited")}
            >
              <CardContent className="flex items-start gap-4 pt-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Link2 className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">I was invited to join an agency</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your agency admin should have sent you an invite link. Check your email.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Invited user — no invitation found
  if (intent === "invited") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">No pending invitation found</h1>
          <p className="text-muted-foreground">
            We couldn&apos;t find a pending invitation for <strong className="text-foreground">{user.email}</strong>.
          </p>
          <p className="text-sm text-muted-foreground">
            Ask your agency administrator to send you an invitation, then click the setup link in that email.
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => setIntent(null)}>
              Back
            </Button>
            <Button variant="outline" onClick={() => signOut()}>
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Agency setup form with plan selection
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Set up your agency</h1>
          <p className="mt-2 text-muted-foreground">Tell us about your organization</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Agency Details
            </CardTitle>
            <CardDescription>Submit your agency for review — you'll get access once approved</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First name</Label>
                  <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required placeholder="Jane" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required placeholder="Doe" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="agencyName">Agency name</Label>
                <Input id="agencyName" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} required placeholder="Acme Interpreting Services" />
              </div>

              {/* Plan selection */}
              <div className="space-y-3">
                <Label>Select a plan</Label>
                <div className="grid gap-2">
                  {PLANS.map((plan) => (
                    <div
                      key={plan.value}
                      className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                        selectedPlan === plan.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => setSelectedPlan(plan.value)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">{plan.label}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{plan.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setIntent(null)} className="shrink-0">
                  Back
                </Button>
                <Button type="submit" className="flex-1" disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit for Approval"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </form>
        </Card>
      </div>
    </div>
  );
}
