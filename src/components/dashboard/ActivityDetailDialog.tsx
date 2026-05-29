import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { statusBadgeColors as statusColors } from "@/lib/status-colors";
import { getStatusLabel } from "@/lib/status-labels";
import { useAuth } from "@/contexts/AuthContext";
import { Clock, MapPin, Globe, Building2, FileText, User, Phone, Navigation } from "lucide-react";
import { useAgencyTimezone } from "@/hooks/useAgencyTimezone";
import { formatDateTimeInTz } from "@/lib/agency-timezone";

const MODALITY_LABELS: Record<string, string> = {
  on_site: "On-Site",
  opi: "OPI (Phone)",
  vri: "VRI (Video)",
};

function DetailRow({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: React.ElementType }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 py-1.5">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div className="flex justify-between items-start flex-1 min-w-0">
        <span className="text-sm text-muted-foreground shrink-0">{label}</span>
        <span className="text-sm font-medium text-right max-w-[60%] break-words">{value}</span>
      </div>
    </div>
  );
}

interface ActivityDetailDialogProps {
  appointment: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ActivityDetailDialog({ appointment: a, open, onOpenChange }: ActivityDetailDialogProps) {
  const { hasRole, primaryRole } = useAuth();
  const isInterpreter = hasRole("interpreter") && !hasRole("agency_admin") && !hasRole("scheduler");
  const isRequester = hasRole("requester") && !hasRole("agency_admin") && !hasRole("scheduler");
  const viewerRole = isInterpreter ? "interpreter" : isRequester ? "requester" : primaryRole;
  const agencyTz = useAgencyTimezone();

  if (!a) return null;

  const cf = (a.custom_fields as Record<string, any>) || {};
  const loc = a.locations;
  const fullAddress = loc
    ? [loc.address_line1, loc.city, loc.state, loc.zip_code].filter(Boolean).join(", ")
    : null;
  const directionsUrl = fullAddress
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress)}`
    : null;

  const timeRange = a.scheduled_start
    ? `${formatDateTimeInTz(a.scheduled_start, agencyTz, { timeOnly: true })}${a.scheduled_end ? ` – ${formatDateTimeInTz(a.scheduled_end, agencyTz, { timeOnly: true })}` : ""}`
    : undefined;

  const interpreterName = a.interpreter
    ? `${a.interpreter.first_name ?? ""} ${a.interpreter.last_name ?? ""}`.trim()
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>{a.title || "Appointment Details"}</span>
            <Badge variant="outline" className={cn("text-xs", statusColors[a.status] ?? "")}>
              {getStatusLabel(a.status, viewerRole, a.interpreter_id)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          <DetailRow
            icon={Clock}
            label="Date"
            value={a.scheduled_start ? formatDateTimeInTz(a.scheduled_start, agencyTz, { dateOnly: true }) : undefined}
          />
          <DetailRow icon={Clock} label="Time" value={timeRange} />
          <DetailRow
            icon={Globe}
            label="Modality"
            value={a.modality ? MODALITY_LABELS[a.modality] ?? a.modality : undefined}
          />

          <Separator className="my-2" />

          <DetailRow icon={Building2} label="Customer" value={a.customers?.name} />
          {cf.client_name && <DetailRow icon={User} label="Patient/Client" value={cf.client_name} />}
          {cf.provider && <DetailRow icon={User} label="Provider" value={cf.provider} />}
          {cf.mrn && <DetailRow icon={FileText} label="Reference / MRN" value={cf.mrn} />}
          <DetailRow icon={Globe} label="Language" value={a.languages?.name} />
          {!isRequester && <DetailRow icon={User} label="Interpreter" value={interpreterName} />}

          <Separator className="my-2" />

          <DetailRow icon={MapPin} label="Location" value={loc?.name} />
          {fullAddress && (
            <DetailRow
              icon={Navigation}
              label="Address"
              value={
                directionsUrl ? (
                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2 hover:text-primary/80"
                  >
                    {fullAddress}
                  </a>
                ) : (
                  fullAddress
                )
              }
            />
          )}

          {(a.description || a.notes) && <Separator className="my-2" />}

          <DetailRow icon={FileText} label="Description" value={a.description} />
          <DetailRow icon={FileText} label="Notes" value={a.notes} />

          {(cf.include_travel || cf.include_mileage) && (
            <>
              <Separator className="my-2" />
              <div className="flex gap-2">
                {cf.include_travel && <Badge variant="outline" className="text-xs">Travel Included</Badge>}
                {cf.include_mileage && <Badge variant="outline" className="text-xs">Mileage Included</Badge>}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}