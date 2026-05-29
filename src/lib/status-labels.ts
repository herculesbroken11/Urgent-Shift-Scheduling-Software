/**
 * Centralized status label system (v3).
 * 12 statuses across 3 tracks: Standard, Last-Minute, Terminal.
 */

/** Default admin-facing labels */
export const STATUS_LABELS: Record<string, string> = {
  requested:                      "Requested",
  requested_last_minute:          "Requested (Last Minute)",
  interpreter_assigned:           "Interpreter Assigned",
  interpreter_assigned_last_minute: "Assigned (Last Minute)",
  interpreter_confirmed:          "Interpreter Confirmed",
  reassignment_needed:            "Reassignment Needed",
  in_progress:                    "In Progress",
  completed:                      "Completed",
  completed_last_minute:          "Completed (Last Minute)",
  cancelled:                      "Cancelled",
  late_cancel_no_show_client:     "Late Cancel / No Show (Client)",
  no_show_interpreter:            "No Show (Interpreter)",
};

/** Interpreter-facing labels */
export const INTERPRETER_STATUS_LABELS: Record<string, string> = {
  ...STATUS_LABELS,
  interpreter_assigned:           "New Assignment",
  interpreter_assigned_last_minute: "New Assignment (Urgent)",
  interpreter_confirmed:          "Accepted",
  reassignment_needed:            "Reassignment Needed",
};

/** Requester-facing labels */
export const REQUESTER_STATUS_LABELS: Record<string, string> = {
  ...STATUS_LABELS,
  requested:                      "Submitted",
  requested_last_minute:          "Submitted (Urgent)",
};

/**
 * Get the appropriate label for a status based on viewer role.
 */
export function getStatusLabel(
  status: string,
  role?: "interpreter" | "requester" | "agency_admin" | "scheduler" | null,
  _interpreterId?: string | null,
): string {
  if (role === "interpreter") {
    return INTERPRETER_STATUS_LABELS[status] ?? status;
  }
  if (role === "requester") {
    return REQUESTER_STATUS_LABELS[status] ?? status;
  }
  return STATUS_LABELS[status] ?? status;
}
