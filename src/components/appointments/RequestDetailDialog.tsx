import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Navigation, MapPin, MessageSquare, XCircle } from "lucide-react";
import { statusBadgeColors as statusColors } from "@/lib/status-colors";
import { getStatusLabel } from "@/lib/status-labels";
import { useAgencyTimezone } from "@/hooks/useAgencyTimezone";
import { formatDateTimeInTz } from "@/lib/agency-timezone";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TERMINAL_STATUSES = ["cancelled", "late_cancel_no_show_client", "completed", "completed_last_minute"];

interface RequestDetailDialogProps {
  appointment: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateStatus: (id: string, status: string) => void;
  isUpdating?: boolean;
  onCancelClick?: (appt: any) => void;
  onLocationClick?: (appt: any) => void;
  onNotesClick?: (appt: any) => void;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%]">{value ?? "—"}</span>
    </div>
  );
}

export function RequestDetailDialog({ appointment: a, open, onOpenChange, onUpdateStatus, isUpdating, onCancelClick, onLocationClick, onNotesClick }: RequestDetailDialogProps) {
  const agencyTz = useAgencyTimezone();
  const queryClient = useQueryClient();
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  if (!a) return null;

  const handleOpenChange = (val: boolean) => {
    if (!val) {
      setEditingNotes(false);
    }
    onOpenChange(val);
  };

  const handleStartEditNotes = () => {
    setNotesValue(a.requester_notes ?? "");
    setEditingNotes(true);
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      let query = supabase
        .from("appointments")
        .update({ requester_notes: notesValue || null })
        .eq("id", a.id);
      // Defense-in-depth: scope by customer_id (shared across requesters in same org)
      if (a.customer_id) {
        query = query.eq("customer_id", a.customer_id);
      }
      const { error } = await query;
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Notes saved");
      setEditingNotes(false);
    } catch {
      toast.error("Failed to save notes");
    } finally {
      setSavingNotes(false);
    }
  };

  const interpreterName = a.interpreter
    ? `${a.interpreter.first_name ?? ""} ${a.interpreter.last_name ?? ""}`.trim() || "Assigned"
    : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Request Details</span>
            <span className="text-xs text-muted-foreground font-mono">{a.id.slice(0, 6).toUpperCase()}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          <div className="flex justify-between items-center py-1.5">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant="outline" className={`text-xs ${statusColors[a.status] ?? ""}`}>
              {getStatusLabel(a.status, "requester")}
            </Badge>
          </div>
          <DetailRow label="Date" value={a.scheduled_start ? formatDateTimeInTz(a.scheduled_start, agencyTz, { dateOnly: true }) : undefined} />
          <div className="flex justify-between items-start py-1.5">
            <div className="flex-1">
              <span className="text-sm text-muted-foreground">Start Time</span>
              <p className="text-sm font-medium" title={a.actual_start ? "Actual time recorded by interpreter" : undefined}>
                {a.actual_start
                  ? formatDateTimeInTz(a.actual_start, agencyTz, { timeOnly: true })
                  : a.scheduled_start
                  ? formatDateTimeInTz(a.scheduled_start, agencyTz, { timeOnly: true })
                  : "—"}
                {a.actual_start ? <span className="text-muted-foreground ml-0.5">*</span> : null}
              </p>
            </div>
            <div className="flex-1 text-center">
              <span className="text-sm text-muted-foreground">End Time</span>
              <p className="text-sm font-medium" title={a.actual_end ? "Actual time recorded by interpreter" : undefined}>
                {a.actual_end
                  ? formatDateTimeInTz(a.actual_end, agencyTz, { timeOnly: true })
                  : a.scheduled_end
                  ? formatDateTimeInTz(a.scheduled_end, agencyTz, { timeOnly: true })
                  : "—"}
                {a.actual_end ? <span className="text-muted-foreground ml-0.5">*</span> : null}
              </p>
            </div>
            <div className="flex-1 text-right">
              <span className="text-sm text-muted-foreground">Duration</span>
              <p className="text-sm font-medium">
                {(() => {
                  const startSrc = a.actual_start || a.scheduled_start;
                  const endSrc = a.actual_end || a.scheduled_end;
                  if (!startSrc || !endSrc) return "—";
                  const mins = Math.round((new Date(endSrc).getTime() - new Date(startSrc).getTime()) / 60000);
                  const h = Math.floor(mins / 60);
                  const m = mins % 60;
                  const label = h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}` : `${m}m`;
                  return (a.actual_start || a.actual_end) ? `${label}*` : label;
                })()}
              </p>
            </div>
          </div>
          {(a.actual_start || a.actual_end) && (
            <p className="text-xs text-muted-foreground italic -mt-1">* actual time recorded by interpreter</p>
          )}
          <DetailRow label="Customer" value={a.customers?.name} />
          {interpreterName && <DetailRow label="Interpreter" value={interpreterName} />}
          {(a.custom_fields as any)?.client_name && <DetailRow label="Patient/Client" value={(a.custom_fields as any).client_name} />}
          {(a.custom_fields as any)?.provider && <DetailRow label="Provider" value={(a.custom_fields as any).provider} />}
          {(a.custom_fields as any)?.mrn && <DetailRow label="Reference / MRN" value={(a.custom_fields as any).mrn} />}
          <DetailRow
            label="Location"
            value={
              a.locations?.name ? (
                <span className="flex items-center gap-1">
                  {a.locations.name}
                  {a.locations?.address_line1 && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([a.locations.address_line1, a.locations.city].filter(Boolean).join(", "))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary"
                    >
                      <Navigation className="h-3 w-3" />
                    </a>
                  )}
                </span>
              ) : undefined
            }
          />
          <DetailRow label="Language" value={a.languages?.name} />
          <DetailRow label="Modality" value={a.modality ? a.modality.replace("_", " ") : undefined} />
          {a.title && <DetailRow label="Title" value={a.title} />}
          {a.description && <DetailRow label="Description" value={a.description} />}
        </div>

        <Separator />

        {/* Requester Notes — editable */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Your Notes</Label>
            {!editingNotes && (
              <Button variant="ghost" size="sm" className="text-xs h-6" onClick={handleStartEditNotes}>
                Edit
              </Button>
            )}
          </div>
          {editingNotes ? (
            <div className="space-y-2">
              <Textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                placeholder="Add notes visible to interpreter & agency..."
                className="min-h-[60px]"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingNotes(false)}>Cancel</Button>
                <Button size="sm" onClick={handleSaveNotes} disabled={savingNotes}>
                  {savingNotes ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {a.requester_notes || <span className="italic">No notes added</span>}
            </p>
          )}
          <p className="text-xs text-muted-foreground">Visible to interpreter & agency</p>
        </div>

        {!TERMINAL_STATUSES.includes(a.status) && !(a.scheduled_start && new Date(a.scheduled_start).getTime() < Date.now()) && (
          <div className="flex flex-wrap gap-2 pt-2">
            {onLocationClick && (
              <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => { onLocationClick(a); handleOpenChange(false); }}>
                <MapPin className="h-3.5 w-3.5" /> Change Location
              </Button>
            )}
            {onNotesClick && (
              <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => { onNotesClick(a); handleOpenChange(false); }}>
                <MessageSquare className="h-3.5 w-3.5" /> Edit Notes
              </Button>
            )}
            {onCancelClick && (
              <Button variant="outline" size="sm" className="gap-1 text-xs text-destructive hover:text-destructive" onClick={() => { onCancelClick(a); handleOpenChange(false); }}>
                <XCircle className="h-3.5 w-3.5" /> Cancel Request
              </Button>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
