import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAgencyTimezone } from "@/hooks/useAgencyTimezone";
import { formatDateTimeInTz } from "@/lib/agency-timezone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, History, Loader2 } from "lucide-react";
import { getStatusLabel } from "@/lib/status-labels";

interface Props {
  appointmentId: string;
  agencyId: string;
  appointment: any;
}

const FIELD_LABELS: Record<string, string> = {
  status: "Status",
  scheduled_start: "Scheduled Start",
  scheduled_end: "Scheduled End",
  actual_start: "Actual Start",
  actual_end: "Actual End",
  interpreter_id: "Interpreter",
  location_id: "Location",
  customer_id: "Customer",
  language_id: "Language",
  requester_id: "Requester",
  modality: "Modality",
  title: "Title",
  description: "Description",
  requester_notes: "Requester Notes",
  interpreter_notes: "Interpreter Notes",
  agency_notes: "Agency Notes",
  cancellation_reason: "Cancellation Reason",
  is_self_claimable: "Self-Claimable",
  parking_cost: "Parking Cost",
  patient_client_name: "Patient/Client Name",
  client_reference: "Reference",
};

const HIDDEN_FIELDS = new Set([
  "updated_at",
  "billing_breakdown",
  "billed_amount",
  "interpreter_pay_amount",
  "gcal_event_id",
  "gcal_sync_status",
  "gcal_last_synced_at",
  "gcal_sync_error",
  "qbo_sync_status",
  "qbo_last_synced_at",
  "source_hash",
  "interpreter_notes_history",
]);

const TIMESTAMP_FIELDS = new Set([
  "scheduled_start",
  "scheduled_end",
  "actual_start",
  "actual_end",
  "cancelled_at",
  "late_cancel_detected_at",
]);

function formatDuration(startIso?: string | null, endIso?: string | null): string | null {
  if (!startIso || !endIso) return null;
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  if (mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}`.trim() : `${m}m`;
}

export function AppointmentAuditLog({ appointmentId, agencyId, appointment }: Props) {
  const tz = useAgencyTimezone();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["appointment-audit", appointmentId],
    enabled: open && !!appointmentId,
    queryFn: async () => {
      const { data: history, error } = await supabase
        .from("appointment_history" as any)
        .select("*")
        .eq("appointment_id", appointmentId)
        .eq("agency_id", agencyId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (history ?? []) as any[];

      // Collect all referenced IDs to resolve names
      const userIds = new Set<string>();
      const interpreterIds = new Set<string>();
      const locationIds = new Set<string>();
      for (const r of rows) {
        if (r.changed_by) userIds.add(r.changed_by);
        for (const snap of [r.old_data, r.new_data]) {
          if (snap?.interpreter_id) interpreterIds.add(snap.interpreter_id);
          if (snap?.location_id) locationIds.add(snap.location_id);
          if (snap?.requester_id) userIds.add(snap.requester_id);
        }
      }
      const allUserIds = [...new Set([...userIds, ...interpreterIds])];

      const [profilesRes, locationsRes] = await Promise.all([
        allUserIds.length
          ? supabase.from("profiles").select("id, first_name, last_name").in("id", allUserIds)
          : Promise.resolve({ data: [] as any[] }),
        locationIds.size
          ? supabase.from("locations").select("id, name").in("id", [...locationIds])
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const userMap: Record<string, string> = {};
      for (const p of (profilesRes.data ?? []) as any[]) {
        userMap[p.id] = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unknown";
      }
      const locationMap: Record<string, string> = {};
      for (const l of (locationsRes.data ?? []) as any[]) {
        locationMap[l.id] = l.name;
      }

      return { rows, userMap, locationMap };
    },
  });

  const rows = data?.rows ?? [];
  const userMap = data?.userMap ?? {};
  const locationMap = data?.locationMap ?? {};

  const formatValue = (field: string, val: any): string => {
    if (val === null || val === undefined || val === "") return "—";
    if (field === "status") return getStatusLabel(val, "agency_admin");
    if (field === "interpreter_id" || field === "requester_id") return userMap[val] || val.slice(0, 8);
    if (field === "location_id") return locationMap[val] || val.slice(0, 8);
    if (TIMESTAMP_FIELDS.has(field)) return formatDateTimeInTz(val, tz);
    if (typeof val === "boolean") return val ? "Yes" : "No";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  };

  // Duration summary
  const originalDuration = formatDuration(appointment?.scheduled_start, appointment?.scheduled_end);
  const actualDuration = formatDuration(appointment?.actual_start, appointment?.actual_end);

  // Detect if actual times were revised by admin (>1 entry touching actual_start/end after first set)
  const actualTimeEdits = rows.filter((r: any) =>
    r.changed_fields?.some((f: string) => f === "actual_start" || f === "actual_end")
  );
  const wasRevised = actualTimeEdits.length > 1;

  return (
    <Card className="border">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                Audit Log
                {rows.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{rows.length}</Badge>
                )}
              </CardTitle>
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            {/* Duration summary */}
            <div className="grid grid-cols-3 gap-2 text-xs bg-muted/30 rounded-md p-2">
              <div>
                <div className="text-muted-foreground">Original Duration</div>
                <div className="font-medium">{originalDuration ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Actual Duration</div>
                <div className="font-medium">{actualDuration ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Revised Actual</div>
                <div className="font-medium">{wasRevised ? "Yes" : "No"}</div>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading history…
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center py-4 text-sm text-muted-foreground">No audit entries yet.</div>
            ) : (
              <div className="space-y-2">
                {rows.map((entry: any) => {
                  const fields: string[] = (entry.changed_fields ?? []).filter(
                    (f: string) => !HIDDEN_FIELDS.has(f)
                  );
                  const isExpanded = expanded[entry.id] ?? false;
                  const userName = entry.changed_by ? userMap[entry.changed_by] || "Unknown" : "System";

                  return (
                    <div key={entry.id} className="border rounded-md p-2.5 text-xs space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                              {entry.action}
                            </Badge>
                            <span className="font-medium">{userName}</span>
                          </div>
                          <div className="text-muted-foreground mt-0.5">
                            {formatDateTimeInTz(entry.created_at, tz)}
                          </div>
                        </div>
                        {fields.length > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setExpanded((p) => ({ ...p, [entry.id]: !isExpanded }));
                            }}
                          >
                            {isExpanded ? "Hide" : `${fields.length} change${fields.length > 1 ? "s" : ""}`}
                          </Button>
                        )}
                      </div>

                      {isExpanded && fields.length > 0 && (
                        <div className="pt-1.5 border-t space-y-1">
                          {fields.map((field) => {
                            const oldVal = entry.old_data?.[field];
                            const newVal = entry.new_data?.[field];
                            const label = FIELD_LABELS[field] ?? field;
                            return (
                              <div key={field} className="grid grid-cols-[110px_1fr] gap-2 items-start">
                                <span className="text-muted-foreground">{label}</span>
                                <div className="break-words">
                                  <span className="line-through text-muted-foreground">
                                    {formatValue(field, oldVal)}
                                  </span>
                                  <span className="mx-1.5 text-muted-foreground">→</span>
                                  <span className="font-medium">{formatValue(field, newVal)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
