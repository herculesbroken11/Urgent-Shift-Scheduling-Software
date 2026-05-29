import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoData } from "@/contexts/DemoDataContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clock, MapPin, Play, Square } from "lucide-react";
import { format } from "date-fns";
import { useAdaptedQuery, useAdaptedMutation } from "@/lib/data-adapter";
import { useAgencyTimezone } from "@/hooks/useAgencyTimezone";
import { formatDateTimeInTz } from "@/lib/agency-timezone";
import { utcToLocalParts } from "@/lib/agency-timezone";

export default function TimeTracking() {
  const { user, profile } = useAuth();
  const { state, updateItem, enrichAppointment } = useDemoData();
  const [editId, setEditId] = useState<string | null>(null);
  const [actualStart, setActualStart] = useState("");
  const [actualEnd, setActualEnd] = useState("");
  const [mileage, setMileage] = useState("");
  const agencyTz = useAgencyTimezone();

  const { data: appointments = [], isLoading } = useAdaptedQuery<any[]>({
    queryKey: ["time-tracking", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, customers(name), languages(name)")
        .eq("agency_id", profile!.agency_id!)
        .eq("interpreter_id", user!.id)
        .eq("is_import_staged", false).eq("is_deleted", false)
        .in("status", ["interpreter_assigned", "interpreter_assigned_last_minute", "interpreter_confirmed", "in_progress", "completed", "completed_last_minute"])
        .order("scheduled_start", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    demoFn: () => {
      return state.appointments
        .filter((a: any) => a.interpreter_id === user?.id && ["interpreter_confirmed", "in_progress", "completed", "completed_last_minute", "interpreter_assigned", "interpreter_assigned_last_minute"].includes(a.status))
        .map((a: any) => enrichAppointment(a));
    },
    enabled: !!user && !!profile?.agency_id,
  });

  const updateTime = useAdaptedMutation<void>({
    mutationFn: async () => {
      const updates: any = {};
      if (actualStart) updates.actual_start = new Date(actualStart).toISOString();
      if (actualEnd) {
        updates.actual_end = new Date(actualEnd).toISOString();
        updates.status = "completed";
      } else if (actualStart) {
        updates.status = "in_progress";
      }
      if (mileage) {
        const appt = appointments.find((a: any) => a.id === editId);
        const existing = (appt?.custom_fields as Record<string, any>) || {};
        updates.custom_fields = { ...existing, mileage: parseFloat(mileage) };
      }
      const { error } = await supabase.from("appointments").update(updates).eq("id", editId!);
      if (error) throw error;
    },
    demoFn: () => {
      const updates: any = {};
      if (actualStart) updates.actual_start = new Date(actualStart).toISOString();
      if (actualEnd) {
        updates.actual_end = new Date(actualEnd).toISOString();
        updates.status = "completed";
      } else if (actualStart) {
        updates.status = "in_progress";
      }
      if (mileage) {
        const appt = state.appointments.find((a: any) => a.id === editId);
        const existing = (appt?.custom_fields as Record<string, any>) || {};
        updates.custom_fields = { ...existing, mileage: parseFloat(mileage) };
      }
      updateItem("appointments", editId!, updates);
    },
    invalidateKeys: [["time-tracking"]],
    successMessage: "Time updated",
    onSuccess: () => { setEditId(null); },
  });

  const openEdit = (appt: any) => {
    setEditId(appt.id);
    // Convert UTC to agency-local for the datetime-local inputs
    if (appt.actual_start) {
      const parts = utcToLocalParts(appt.actual_start, agencyTz);
      setActualStart(parts.date && parts.time ? `${parts.date}T${parts.time}` : "");
    } else {
      setActualStart("");
    }
    if (appt.actual_end) {
      const parts = utcToLocalParts(appt.actual_end, agencyTz);
      setActualEnd(parts.date && parts.time ? `${parts.date}T${parts.time}` : "");
    } else {
      setActualEnd("");
    }
    setMileage((appt.custom_fields as any)?.mileage?.toString() || "");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Time & Mileage</h1>
        <p className="text-muted-foreground">Record actual times and travel for your appointments</p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : appointments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No appointments to track yet
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {appointments.map((appt: any) => {
            const miles = (appt.custom_fields as any)?.mileage;
            return (
              <Card key={appt.id} className="transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{appt.title || "Appointment"}</h3>
                        <Badge variant={appt.status === "completed" ? "default" : "secondary"}>
                          {appt.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {appt.scheduled_start && formatDateTimeInTz(appt.scheduled_start, agencyTz)}
                        {appt.languages?.name && ` · ${appt.languages.name}`}
                        {appt.customers?.name && ` · ${appt.customers.name}`}
                      </p>
                      <div className="flex gap-4 pt-1 text-xs text-muted-foreground">
                        {appt.actual_start && (
                          <span className="flex items-center gap-1">
                            <Play className="h-3 w-3" /> In: {formatDateTimeInTz(appt.actual_start, agencyTz, { timeOnly: true })}
                          </span>
                        )}
                        {appt.actual_end && (
                          <span className="flex items-center gap-1">
                            <Square className="h-3 w-3" /> Out: {formatDateTimeInTz(appt.actual_end, agencyTz, { timeOnly: true })}
                          </span>
                        )}
                        {miles != null && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {miles} mi
                          </span>
                        )}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openEdit(appt)}>
                      <Clock className="mr-1.5 h-3.5 w-3.5" />Log
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editId} onOpenChange={() => setEditId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log Time & Mileage</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>Actual Start</Label>
              <Input type="datetime-local" value={actualStart} onChange={(e) => setActualStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Actual End</Label>
              <Input type="datetime-local" value={actualEnd} onChange={(e) => setActualEnd(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Mileage (miles)</Label>
              <Input type="number" step="0.1" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="0.0" />
            </div>
            <Button className="w-full" onClick={() => updateTime.mutate()} disabled={updateTime.isPending}>
              {updateTime.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}