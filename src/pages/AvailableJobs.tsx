import { useAuth } from "@/contexts/AuthContext";
import { useDemoData } from "@/contexts/DemoDataContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Briefcase, MapPin, Clock, Globe, CheckCircle, ShieldOff } from "lucide-react";
import { useAgencySettings } from "@/hooks/useAgencySettings";
import { useInterpreterRegions } from "@/hooks/useRegionsData";
import { useAdaptedQuery, useAdaptedMutation } from "@/lib/data-adapter";
import { useAgencyTimezone } from "@/hooks/useAgencyTimezone";
import { formatDateTimeInTz } from "@/lib/agency-timezone";
import { getStatusLabel } from "@/lib/status-labels";

export default function AvailableJobs() {
  const { user, profile } = useAuth();
  const { state, updateItem, enrichAppointment } = useDemoData();
  const { regionsEnabled, selfClaimEnabled } = useAgencySettings();
  const agencyTz = useAgencyTimezone();
  const { data: myRegionAssignments = [] } = useInterpreterRegions(user?.id);
  const myRegionIds = myRegionAssignments.map((r: any) => r.region_id);

  // Fetch interpreter's language qualifications to filter jobs
  const { data: myLanguages = [] } = useAdaptedQuery<any[]>({
    queryKey: ["my-languages-ids", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interpreter_languages")
        .select("language_id")
        .eq("interpreter_id", user!.id);
      if (error) throw error;
      return data;
    },
    demoFn: () => {
      return state.interpreterLanguages
        ?.filter((l: any) => l.interpreter_id === user?.id)
        .map((l: any) => ({ language_id: l.language_id })) ?? [];
    },
    enabled: !!user,
  });
  const myLanguageIds = myLanguages.map((l: any) => l.language_id);

  const { data: jobs = [], isLoading } = useAdaptedQuery<any[]>({
    queryKey: ["available-jobs", profile?.agency_id, regionsEnabled, myRegionIds, myLanguageIds],
    queryFn: async () => {
      let query = supabase
        .from("appointments")
        .select("*, customers(name), locations(name, address_line1, city, region_id), languages(name)")
        .eq("agency_id", profile!.agency_id!)
        .eq("is_import_staged", false).eq("is_deleted", false)
        .is("interpreter_id", null)
        .in("status", ["requested", "requested_last_minute", "reassignment_needed"])
        .order("scheduled_start", { ascending: true });

      // Filter by interpreter's languages if they have any
      if (myLanguageIds.length > 0) {
        query = query.in("language_id", myLanguageIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (regionsEnabled && myRegionIds.length > 0) {
        return (data ?? []).filter((job: any) => {
          if (!job.location_id || !job.locations?.region_id) return true;
          return myRegionIds.includes(job.locations.region_id);
        });
      }
      return data;
    },
    demoFn: () => {
      const myLangIds = new Set(myLanguageIds);
      return state.appointments
        .filter((a: any) => !a.interpreter_id && ["requested", "requested_last_minute", "reassignment_needed"].includes(a.status))
        .filter((a: any) => myLangIds.size === 0 || myLangIds.has(a.language_id))
        .map((a: any) => enrichAppointment(a));
    },
    enabled: !!profile?.agency_id,
  });

  const claimJob = useAdaptedMutation<string>({
    mutationFn: async (appointmentId: string) => {
      const { data, error, count } = await supabase
        .from("appointments")
        .update({ interpreter_id: user!.id, status: "interpreter_confirmed" as any, assignment_method: "self_claim" as any })
        .eq("id", appointmentId)
        .is("interpreter_id", null)
        .in("status", ["requested", "requested_last_minute", "reassignment_needed"])
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("This job was already claimed or assigned. Refreshing list.");
      }
    },
    demoFn: (appointmentId: string) => {
      const appt = state.appointments.find((a: any) => a.id === appointmentId);
      if (appt?.interpreter_id) {
        throw new Error("This job was already claimed or assigned.");
      }
      updateItem("appointments", appointmentId, {
        interpreter_id: user!.id,
        status: "interpreter_confirmed",
        assignment_method: "self_claim",
      });
    },
    invalidateKeys: [["available-jobs"], ["my-schedule"]],
    successMessage: "Job claimed successfully!",
  });

  // When self-claim is disabled agency-wide, or interpreter is inactive, don't show claimable jobs
  const interpreterInactive = profile?.is_active === false;

  if (!selfClaimEnabled || interpreterInactive) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Available Jobs</h1>
          <p className="text-muted-foreground">Open appointments matching your qualifications</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <ShieldOff className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">
              {interpreterInactive
                ? "Your account is currently inactive. Please contact your agency administrator."
                : "Self-claim is not enabled for your agency. All assignments are handled by agency staff."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selfClaim = jobs.filter((j: any) => j.is_self_claimable);
  const offers = jobs.filter((j: any) => !j.is_self_claimable);

  const JobCard = ({ job, canClaim }: { job: any; canClaim: boolean }) => (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{job.title || job.languages?.name || "Interpreting Assignment"}</h3>
              <Badge variant="outline" className="text-xs">{getStatusLabel(job.status, "interpreter")}</Badge>
            </div>
            {job.scheduled_start && (
              <p className="text-sm flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {formatDateTimeInTz(job.scheduled_start, agencyTz)}
                {job.scheduled_end && ` – ${formatDateTimeInTz(job.scheduled_end, agencyTz, { timeOnly: true })}`}
              </p>
            )}
            {job.languages?.name && (
              <p className="text-sm flex items-center gap-1.5 text-muted-foreground">
                <Globe className="h-3.5 w-3.5" />{job.languages.name}
              </p>
            )}
            {job.customers?.name && (
              <p className="text-sm text-muted-foreground">{job.customers.name}</p>
            )}
            {job.locations ? (
              <p className="text-sm flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {job.locations.name}{job.locations.city ? `, ${job.locations.city}` : ""}
              </p>
            ) : (job.modality === "opi" || job.modality === "vri") && (
              <p className="text-sm flex items-center gap-1.5 text-muted-foreground italic">
                <MapPin className="h-3.5 w-3.5" />
                {job.modality === "opi" ? "Virtual (Phone)" : "Virtual (Video)"}
              </p>
            )}
            {job.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">{job.description}</p>
            )}
          </div>
          {canClaim && (
            <Button size="sm" onClick={() => claimJob.mutate(job.id)} disabled={claimJob.isPending}>
              <CheckCircle className="mr-1.5 h-4 w-4" />Claim
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Available Jobs</h1>
        <p className="text-muted-foreground">Open appointments matching your qualifications</p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading jobs...</p>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Briefcase className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No available jobs right now. Check back later!</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {selfClaim.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-accent" />
                Self-Claim Queue
                <Badge variant="secondary">{selfClaim.length}</Badge>
              </h2>
              <div className="grid gap-3">
                {selfClaim.map((job: any) => <JobCard key={job.id} job={job} canClaim />)}
              </div>
            </div>
          )}
          {offers.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">
                Job Offers
                <Badge variant="secondary" className="ml-2">{offers.length}</Badge>
              </h2>
              <div className="grid gap-3">
                {offers.map((job: any) => <JobCard key={job.id} job={job} canClaim={false} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
