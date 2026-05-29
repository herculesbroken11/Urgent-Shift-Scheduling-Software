import { useAuth } from "@/contexts/AuthContext";
import { useAgencySettings } from "@/hooks/useAgencySettings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Link2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const JOINABLE_ROLES = [
  { value: "interpreter", label: "Interpreter" },
  { value: "requester", label: "Requester" },
  { value: "scheduler", label: "Scheduler" },
];

export function JoinSettings() {
  const { profile } = useAuth();
  const { settings, updateSettings } = useAgencySettings();

  const { data: agency } = useQuery({
    queryKey: ["agency-slug", profile?.agency_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("agencies")
        .select("slug")
        .eq("id", profile!.agency_id!)
        .single();
      return data;
    },
    enabled: !!profile?.agency_id,
  });

  const allowSelfJoin = settings.allow_self_join === true;
  const selfJoinRoles: string[] = (settings as any).self_join_roles || ["interpreter"];
  const requireApproval = settings.require_join_approval !== false;

  const joinUrl = agency?.slug
    ? `${window.location.origin}/join/${agency.slug}`
    : null;

  const toggleRole = (role: string) => {
    const current = [...selfJoinRoles];
    if (current.includes(role)) {
      const updated = current.filter(r => r !== role);
      if (updated.length === 0) return;
      updateSettings.mutate({ self_join_roles: updated } as any);
    } else {
      updateSettings.mutate({ self_join_roles: [...current, role] } as any);
    }
  };

  const copyUrl = () => {
    if (joinUrl) {
      navigator.clipboard.writeText(joinUrl);
      toast.success("Join link copied to clipboard");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Join Link Settings
        </CardTitle>
        <CardDescription>
          Allow users to request membership via a public join link
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label>Enable Self-Join</Label>
            <p className="text-sm text-muted-foreground">
              Allow users to request to join your agency via a shareable link.
            </p>
          </div>
          <Switch
            checked={allowSelfJoin}
            onCheckedChange={checked => updateSettings.mutate({ allow_self_join: checked } as any)}
            disabled={updateSettings.isPending}
          />
        </div>

        {allowSelfJoin && (
          <>
            <Separator />

            {joinUrl && (
              <div className="space-y-2">
                <Label>Join Link</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md break-all">
                    {joinUrl}
                  </code>
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={copyUrl}
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            <Separator />

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label>Require Admin Approval</Label>
                <p className="text-sm text-muted-foreground">
                  {requireApproval
                    ? "Join requests must be manually approved by an admin."
                    : "Users will be automatically approved and added to the agency."}
                </p>
              </div>
              <Switch
                checked={requireApproval}
                onCheckedChange={checked => updateSettings.mutate({ require_join_approval: checked } as any)}
                disabled={updateSettings.isPending}
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>Allowed Roles</Label>
              <p className="text-sm text-muted-foreground">Select which roles users can request when joining.</p>
              <div className="space-y-2">
                {JOINABLE_ROLES.map(r => (
                  <label key={r.value} className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={selfJoinRoles.includes(r.value)}
                      onCheckedChange={() => toggleRole(r.value)}
                    />
                    <span className="text-sm">{r.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
