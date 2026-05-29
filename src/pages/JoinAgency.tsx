import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Building2, CheckCircle2, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";

type JoinStep = "loading" | "form" | "submitted" | "auto_approved" | "error" | "disabled";

export default function JoinAgency() {
  const { agencySlug } = useParams<{ agencySlug: string }>();
  const navigate = useNavigate();
  const [step, setStep] = useState<JoinStep>("loading");
  const [agency, setAgency] = useState<any>(null);
  const [joinSettings, setJoinSettings] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "", role: "interpreter" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadAgency();
  }, [agencySlug]);

  const loadAgency = async () => {
    if (!agencySlug) { setStep("error"); return; }

    const { data: agencyData, error } = await supabase
      .from("agencies")
      .select("id, name, slug, settings, agency_status")
      .eq("slug", agencySlug)
      .single();

    if (error || !agencyData) { setStep("error"); return; }
    if (agencyData.agency_status !== "active") { setStep("error"); return; }

    const settings = (agencyData.settings as any) || {};
    if (!settings.allow_self_join) { setStep("disabled"); return; }

    setAgency(agencyData);
    setJoinSettings(settings);

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, phone, agency_id")
        .eq("id", session.user.id)
        .single();

      if (profile?.agency_id) {
        toast.info("You already belong to an agency");
        navigate("/dashboard");
        return;
      }

      if (profile) {
        setForm(f => ({
          ...f,
          first_name: profile.first_name || "",
          last_name: profile.last_name || "",
          phone: profile.phone || "",
        }));
      }
    }

    const allowedRoles = settings.self_join_roles || ["interpreter"];
    setForm(f => ({ ...f, role: allowedRoles[0] || "interpreter" }));
    setStep("form");
  };

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!agency || !user) {
      navigate(`/signup?redirect=/join/${agencySlug}`);
      return;
    }

    setSubmitting(true);
    try {
      // Use server-side edge function for all validation
      const { data, error } = await supabase.functions.invoke("manage-join-request", {
        body: {
          mode: "submit",
          agency_id: agency.id,
          first_name: form.first_name,
          last_name: form.last_name,
          phone: form.phone,
          requested_role: form.role,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.auto_approved) {
        setStep("auto_approved");
        toast.success("You've been approved to join!");
      } else {
        setStep("submitted");
      }
    } catch (err: any) {
      const msg = err.message || "Failed to submit request";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const allowedRoles = joinSettings?.self_join_roles || ["interpreter"];

  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <XCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Agency Not Found</h2>
            <p className="text-muted-foreground mb-4">
              This join link is invalid or the agency is no longer accepting members.
              Please check the link or contact your agency administrator for an invitation.
            </p>
            <Button onClick={() => navigate("/")}>Go Home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "disabled") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Self-Join Disabled</h2>
            <p className="text-muted-foreground mb-4">This agency is not accepting join requests. Please contact an administrator for an invitation.</p>
            <Button onClick={() => navigate("/")}>Go Home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "auto_approved") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-primary mb-4" />
            <h2 className="text-xl font-semibold mb-2">Welcome!</h2>
            <p className="text-muted-foreground mb-4">
              You've been approved to join <strong>{agency.name}</strong>. You can now access the dashboard.
            </p>
            <Button onClick={() => navigate("/dashboard")}>Go to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "submitted") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-primary mb-4" />
            <h2 className="text-xl font-semibold mb-2">Request Submitted</h2>
            <p className="text-muted-foreground mb-4">
              Your request to join <strong>{agency.name}</strong> has been submitted.
              An administrator will review and approve your request.
            </p>
            <Badge variant="secondary" className="gap-1 mb-4">
              <Clock className="h-3 w-3" /> Pending Review
            </Badge>
            <div className="mt-4">
              <Button variant="outline" onClick={() => navigate("/")}>Go Home</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Building2 className="mx-auto h-10 w-10 text-primary mb-2" />
          <CardTitle>Join {agency?.name}</CardTitle>
          <CardDescription>
            {joinSettings?.require_join_approval !== false
              ? "Request to join this agency. An administrator will review your request."
              : "Join this agency to get started."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!user && (
              <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
                You need an account first. You'll be redirected to sign up.
              </div>
            )}
            {errorMsg && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {errorMsg}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="join_fn">First name</Label>
                <Input id="join_fn" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="join_ln">Last name</Label>
                <Input id="join_ln" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="join_phone">Phone</Label>
              <Input id="join_phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              {allowedRoles.length > 1 ? (
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allowedRoles.map((r: string) => (
                      <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground capitalize">
                  You will join as: <strong>{allowedRoles[0]}</strong>
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Submitting..." : user ? "Submit Request" : "Sign Up & Join"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
