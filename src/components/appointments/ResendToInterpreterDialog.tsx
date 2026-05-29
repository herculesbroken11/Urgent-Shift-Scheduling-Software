import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw } from "lucide-react";
import { useAgencyInterpreters, useAppointmentMutations, sendAppointmentNotifications } from "@/hooks/useAgencyData";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const RESEND_STATUSES = [
  { value: "interpreter_assigned", label: "Interpreter Assigned (must accept)" },
  { value: "interpreter_confirmed", label: "Interpreter Confirmed (skip confirmation)" },
];

interface ResendToInterpreterDialogProps {
  appointment: Record<string, unknown> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ResendToInterpreterDialog({
  appointment,
  open,
  onOpenChange,
  onSuccess,
}: ResendToInterpreterDialogProps) {
  const { data: interpreters = [] } = useAgencyInterpreters();
  const { update } = useAppointmentMutations();
  const { profile, isDemoMode } = useAuth();

  const [interpreterId, setInterpreterId] = useState("");
  const [targetStatus, setTargetStatus] = useState("interpreter_assigned");
  const [note, setNote] = useState("");

  // Pre-fill interpreter if the appointment still has one (e.g. no_show case)
  const effectiveInterpreterId = interpreterId || (appointment?.interpreter_id as string) || "";

  const handleResend = () => {
    if (!appointment || !effectiveInterpreterId) return;

    const updatePayload: Record<string, unknown> = {
      id: appointment.id as string,
      interpreter_id: effectiveInterpreterId,
      status: targetStatus,
    };

    // Append admin note if provided
    if (note.trim()) {
      const existingNotes = (appointment.notes as string) || "";
      const timestamp = new Date().toLocaleDateString();
      const adminNote = `[${timestamp} — Admin resend] ${note.trim()}`;
      updatePayload.notes = existingNotes ? `${existingNotes}\n${adminNote}` : adminNote;
    }

    // Clear cancellation fields if resending a cancelled/no_show
    const status = appointment.status as string;
    if (status === "cancelled" || status === "late_cancel_no_show_client" || status === "no_show_interpreter") {
      updatePayload.cancellation_reason = null;
      updatePayload.cancelled_at = null;
    }

    update.mutate(updatePayload as any, {
      onSuccess: (data: any) => {
        toast.success("Appointment resent to interpreter");
        // Send notification
        if (!isDemoMode && profile?.agency_id) {
          sendAppointmentNotifications(data ?? updatePayload, profile.agency_id, "updated").catch(console.error);
        }
        setInterpreterId("");
        setTargetStatus("interpreter_assigned");
        setNote("");
        onOpenChange(false);
        onSuccess?.();
      },
    });
  };

  if (!appointment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Resend to Interpreter
          </DialogTitle>
          <DialogDescription>
            Re-assign this appointment to an interpreter after an accidental rejection, no-show, or other mistake.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Interpreter selection */}
          <div className="space-y-2">
            <Label>Interpreter *</Label>
            <Select value={effectiveInterpreterId} onValueChange={setInterpreterId}>
              <SelectTrigger>
                <SelectValue placeholder="Select interpreter" />
              </SelectTrigger>
              <SelectContent>
                {(interpreters as Array<{ id: string; first_name: string; last_name: string }>).map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.first_name} {i.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Target status */}
          <div className="space-y-2">
            <Label>Set Status To</Label>
            <Select value={targetStatus} onValueChange={setTargetStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESEND_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Optional note */}
          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Interpreter accidentally rejected — re-sending"
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleResend}
            disabled={!effectiveInterpreterId || update.isPending}
          >
            {update.isPending ? "Resending…" : "Resend & Notify"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
