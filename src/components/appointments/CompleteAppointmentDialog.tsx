import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPin, Clock, PenLine, Car, Loader2, Timer } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { sendCompletionNotification } from "@/hooks/useAgencyData";
import { useAgencyTimezone } from "@/hooks/useAgencyTimezone";
import { utcToLocalParts, localToUtcIso, formatDateTimeInTz } from "@/lib/agency-timezone";

interface Props {
  appointment: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CompleteAppointmentDialog({ appointment, open, onOpenChange }: Props) {
  const sigRef = useRef<SignatureCanvas | null>(null);
  const qc = useQueryClient();
  const { profile } = useAuth();
  const tz = useAgencyTimezone();

  const [parkingCost, setParkingCost] = useState(
    appointment?.parking_cost ? String(appointment.parking_cost) : "0"
  );
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);
  const [canvasWidth, setCanvasWidth] = useState(400);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // ── Actual time inputs (defaults preserve previous behavior: start = scheduled_start, end = now) ──
  const startDefaults = useMemo(() => {
    const src = appointment?.actual_start || appointment?.scheduled_start || null;
    return utcToLocalParts(src, tz);
  }, [appointment?.actual_start, appointment?.scheduled_start, tz, open]);

  const endDefaults = useMemo(() => {
    const src = appointment?.actual_end || appointment?.scheduled_end || new Date().toISOString();
    return utcToLocalParts(src, tz);
  }, [appointment?.actual_end, appointment?.scheduled_end, tz, open]);

  const [actualStartDate, setActualStartDate] = useState(startDefaults.date);
  const [actualStartTime, setActualStartTime] = useState(startDefaults.time);
  const [actualEndDate, setActualEndDate] = useState(endDefaults.date);
  const [actualEndTime, setActualEndTime] = useState(endDefaults.time);

  // Reset fields when dialog re-opens for a new appointment
  useEffect(() => {
    if (!open) return;
    setActualStartDate(startDefaults.date);
    setActualStartTime(startDefaults.time);
    setActualEndDate(endDefaults.date);
    setActualEndTime(endDefaults.time);
    setParkingCost(appointment?.parking_cost ? String(appointment.parking_cost) : "0");
  }, [open, appointment?.id]);

  const scheduledLabel = useMemo(() => {
    if (!appointment?.scheduled_start) return null;
    const start = formatDateTimeInTz(appointment.scheduled_start, tz);
    const end = appointment.scheduled_end ? formatDateTimeInTz(appointment.scheduled_end, tz, { timeOnly: true }) : null;
    return end ? `${start} – ${end}` : start;
  }, [appointment?.scheduled_start, appointment?.scheduled_end, tz]);

  useEffect(() => {
    if (!open) return;
    const measure = () => {
      if (canvasContainerRef.current) {
        setCanvasWidth(canvasContainerRef.current.offsetWidth);
      }
    };
    // Delay to let dialog render
    const timer = setTimeout(measure, 100);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  const captureLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoStatus("error");
      return;
    }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoStatus("done");
      },
      () => setGeoStatus("error"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const clearSignature = () => sigRef.current?.clear();

  // Statuses from which completion is allowed
  const COMPLETABLE_STATUSES = ["in_progress", "interpreter_confirmed", "interpreter_assigned", "interpreter_assigned_last_minute"];

  const handleSubmit = async () => {
    // Ref-based guard prevents double-submit even if state hasn't flushed
    if (submittingRef.current) return;
    if (!sigRef.current || sigRef.current.isEmpty()) {
      toast.error("Please provide a signature before completing.");
      return;
    }

    // Resolve actual start/end from inputs (fallback preserves prior behavior)
    const actualStartIso = actualStartDate && actualStartTime
      ? localToUtcIso(actualStartDate, actualStartTime, tz)
      : (appointment.actual_start || appointment.scheduled_start || null);
    const actualEndIso = actualEndDate && actualEndTime
      ? localToUtcIso(actualEndDate, actualEndTime, tz)
      : new Date().toISOString();

    if (!actualStartIso || !actualEndIso) {
      toast.error("Please provide both an actual start and actual end time.");
      return;
    }
    if (new Date(actualEndIso).getTime() <= new Date(actualStartIso).getTime()) {
      toast.error("Actual end time must be after the actual start time.");
      return;
    }

    submittingRef.current = true;
    setSaving(true);
    try {
      const signatureData = sigRef.current.toDataURL("image/png");
      const now = new Date().toISOString();

      const cf = (appointment.custom_fields as any) || {};
      const updatedCustomFields = { ...cf };

      // Preserve last-minute track on completion
      const isLastMinute = cf.is_last_minute === true ||
        appointment.status === "interpreter_assigned_last_minute" ||
        appointment.status === "requested_last_minute";
      const completedStatus = isLastMinute ? "completed_last_minute" : "completed";

      const updatePayload: any = {
        status: completedStatus as any,
        signature_data: signatureData,
        signature_timestamp: now,
        parking_cost: parseFloat(parkingCost) || 0,
        custom_fields: updatedCustomFields,
        actual_start: actualStartIso,
        actual_end: actualEndIso,
      };

      if (coords) {
        updatePayload.signature_lat = coords.lat;
        updatePayload.signature_lng = coords.lng;
      }

      const { data, error } = await supabase
        .from("appointments")
        .update(updatePayload)
        .eq("id", appointment.id)
        .in("status", COMPLETABLE_STATUSES as any)
        .select("id");

      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error("This appointment was updated by someone else (e.g. cancelled). Please refresh and try again.");
        onOpenChange(false);
        qc.invalidateQueries({ queryKey: ["appointments"] });
        qc.invalidateQueries({ queryKey: ["my-schedule"] });
        return;
      }

      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["my-schedule"] });

      // Notify agency admins
      if (profile?.agency_id) {
        const interpreterName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "An interpreter";
        sendCompletionNotification(appointment, profile.agency_id, interpreterName);
      }

      toast.success("Appointment completed successfully");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to complete appointment");
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  // Live duration display (minutes/hours) based on current inputs
  const durationLabel = useMemo(() => {
    const s = actualStartDate && actualStartTime ? localToUtcIso(actualStartDate, actualStartTime, tz) : null;
    const e = actualEndDate && actualEndTime ? localToUtcIso(actualEndDate, actualEndTime, tz) : null;
    if (!s || !e) return null;
    const mins = Math.round((new Date(e).getTime() - new Date(s).getTime()) / 60000);
    if (mins <= 0) return "Invalid duration";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }, [actualStartDate, actualStartTime, actualEndDate, actualEndTime, tz]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="h-5 w-5" />
            Complete Appointment
          </DialogTitle>
        </DialogHeader>

        {/* Appointment summary */}
        <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
          <p className="font-medium text-sm">{appointment?.title || "Appointment"}</p>
          <p className="text-xs text-muted-foreground">
            {appointment?.customers?.name} • {appointment?.languages?.name}
          </p>
          {scheduledLabel && (
            <p className="text-xs text-muted-foreground">
              Scheduled: {scheduledLabel}
            </p>
          )}
          {appointment?.interpreter && (
            <p className="text-xs text-muted-foreground">
              Interpreter: {appointment.interpreter.first_name} {appointment.interpreter.last_name}
            </p>
          )}
        </div>

        {/* Actual Time Worked */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Timer className="h-4 w-4" />
            Actual Time Worked
          </Label>
          <p className="text-xs text-muted-foreground">
            Adjust if the appointment ran over or under the scheduled time. This drives billing and pay.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Actual Start</Label>
              <div className="flex gap-1">
                <Input
                  type="date"
                  value={actualStartDate}
                  onChange={(e) => setActualStartDate(e.target.value)}
                  className="text-xs"
                />
                <Input
                  type="time"
                  value={actualStartTime}
                  onChange={(e) => setActualStartTime(e.target.value)}
                  className="text-xs w-24"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Actual End</Label>
              <div className="flex gap-1">
                <Input
                  type="date"
                  value={actualEndDate}
                  onChange={(e) => setActualEndDate(e.target.value)}
                  className="text-xs"
                />
                <Input
                  type="time"
                  value={actualEndTime}
                  onChange={(e) => setActualEndTime(e.target.value)}
                  className="text-xs w-24"
                />
              </div>
            </div>
          </div>
          {durationLabel && (
            <p className="text-xs text-muted-foreground">
              Duration: <span className="font-medium text-foreground">{durationLabel}</span>
              <span className="ml-1">(rounded per the customer's billing bundle when invoiced)</span>
            </p>
          )}
        </div>

        <Separator />

        {/* Parking Cost */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Car className="h-4 w-4" />
            Parking Cost ($)
          </Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={parkingCost}
            onChange={(e) => setParkingCost(e.target.value)}
            placeholder="0.00"
          />
        </div>


        <Separator />

        {/* Geolocation */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Location Verification
          </Label>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={captureLocation}
              disabled={geoStatus === "loading"}
            >
              {geoStatus === "loading" ? (
                <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Locating...</>
              ) : geoStatus === "done" ? (
                <><MapPin className="h-3 w-3 mr-1 text-green-500" /> Captured</>
              ) : (
                "Capture Location"
              )}
            </Button>
            {coords && (
              <span className="text-xs text-muted-foreground">
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </span>
            )}
            {geoStatus === "error" && (
              <span className="text-xs text-destructive">Location unavailable</span>
            )}
          </div>
        </div>

        <Separator />

        {/* Signature Pad */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <PenLine className="h-4 w-4" />
              Signature *
            </Label>
            <Button type="button" variant="ghost" size="sm" onClick={clearSignature} className="text-xs h-7">
              Clear
            </Button>
          </div>
          <div ref={canvasContainerRef} className="border rounded-lg bg-background overflow-hidden">
            <SignatureCanvas
              ref={sigRef}
              canvasProps={{
                width: canvasWidth,
                height: 150,
                style: { width: canvasWidth, height: 150 },
              }}
              penColor="hsl(var(--foreground))"
              backgroundColor="hsl(var(--background))"
            />
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Timestamp will be recorded automatically upon submission
          </p>
        </div>

        <Separator />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Saving...</> : "Complete & Sign"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
