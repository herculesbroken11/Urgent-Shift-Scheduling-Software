/**
 * AssignmentConfirmDialog
 *
 * Single dialog covering both the no-conflict assignment and the conflict-
 * override flow. When `conflict` is non-null, an `overrideReason` textarea
 * is required (≥3 chars) — its value is forwarded to useAssignAppointment
 * which writes BOTH custom_fields.override_log and an appointment_history
 * `override_conflict` row.
 */
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldCheck, Sparkles } from "lucide-react";
import { formatDateTimeInTz } from "@/lib/agency-timezone";
import type { UnassignedAppointment, WizardInterpreter, ConflictInfo } from "@/hooks/useScheduleWizard";
import type { ConflictHit } from "@/components/scheduleWizard/dispatch-utils";
import type { ScoredInterpreter } from "@/hooks/useInterpreterScoring";
import { formatScoreBreakdown } from "@/hooks/useInterpreterScoring";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: UnassignedAppointment | null;
  interpreter: WizardInterpreter | null;
  conflict: ConflictHit | null;
  score: ScoredInterpreter | undefined;
  tz: string;
  isSubmitting: boolean;
  onConfirm: (input: { overrideReason?: string; conflict: ConflictInfo | null }) => void;
}

export function AssignmentConfirmDialog({
  open, onOpenChange, job, interpreter, conflict, score, tz, isSubmitting, onConfirm,
}: Props) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  if (!job || !interpreter) return null;

  const hasConflict = !!conflict;
  const adminConfirms = !!interpreter.admin_confirms;
  const interpName = `${interpreter.first_name ?? ""} ${interpreter.last_name ?? ""}`.trim();
  const reasonValid = !hasConflict || reason.trim().length >= 3;

  const breakdown =
    score
      ? formatScoreBreakdown(score, job.languages?.name, undefined)
      : [];

  const handleConfirm = () => {
    if (!reasonValid) return;
    const payload: ConflictInfo | null = conflict
      ? {
          type: conflict.type,
          conflicting_entity_id: conflict.conflicting_entity_id,
          start: conflict.start,
          end: conflict.end,
        }
      : null;
    onConfirm({
      overrideReason: hasConflict ? reason.trim() : undefined,
      conflict: payload,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {hasConflict
              ? "Override conflict & assign"
              : adminConfirms
              ? "Assign & confirm"
              : "Offer to interpreter"}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1.5 text-sm">
              <div>
                <strong>{interpName}</strong> →{" "}
                <strong>{job.languages?.name ?? job.title ?? "this appointment"}</strong>
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDateTimeInTz(job.scheduled_start, tz)} – {formatDateTimeInTz(job.scheduled_end, tz, { timeOnly: true })}
                {job.customers?.name ? ` · ${job.customers.name}` : ""}
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* Score breakdown */}
        {breakdown.length > 0 && (
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold">Match score: {score?.score}%</span>
            </div>
            <ul className="space-y-0.5 text-[11px] text-muted-foreground font-mono">
              {breakdown.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        {adminConfirms && !hasConflict && (
          <div className="flex items-start gap-2 rounded-md bg-primary/5 p-2.5 text-xs">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Admin Confirms is on</p>
              <p className="text-muted-foreground">
                Assignment will be auto-confirmed — interpreter does not need to accept.
              </p>
            </div>
          </div>
        )}

        {hasConflict && (
          <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Scheduling conflict
            </div>
            <p className="text-xs text-muted-foreground">
              {conflict?.type === "availability"
                ? "Interpreter has time blocked off during this slot."
                : "Interpreter has another appointment overlapping this slot."}{" "}
              Assigning will override the conflict and write an audit entry.
            </p>
            <div className="text-xs">
              <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/5">
                {formatDateTimeInTz(conflict!.start, tz, { timeOnly: true })} – {formatDateTimeInTz(conflict!.end, tz, { timeOnly: true })}
              </Badge>
            </div>
            <Textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for overriding the conflict (required)"
              rows={3}
              className="text-xs"
            />
            {!reasonValid && reason.length > 0 && (
              <p className="text-xs text-destructive">Please enter at least 3 characters.</p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting || !reasonValid}
            variant={hasConflict ? "destructive" : "default"}
          >
            {isSubmitting
              ? "Assigning…"
              : hasConflict
              ? "Override & assign"
              : adminConfirms
              ? "Assign & confirm"
              : "Send offer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
