/**
 * Centralized status color system (v3).
 * 12 statuses, each visually distinct at a glance:
 *   requested                    → Amber/Yellow
 *   requested_last_minute        → Orange
 *   interpreter_assigned         → Blue
 *   interpreter_assigned_last_minute → Teal
 *   interpreter_confirmed        → Cyan
 *   reassignment_needed          → Rose
 *   in_progress                  → Fuchsia
 *   completed                    → Emerald
 *   completed_last_minute        → Lime
 *   cancelled                    → Red
 *   late_cancel_no_show_client   → Slate
 *   no_show_interpreter          → Stone
 */

/** Dashboard tile backgrounds + border — BOLD */
export const statusTileColors: Record<string, string> = {
  requested:                      "bg-amber-200 border-amber-500 dark:bg-amber-900/60 dark:border-amber-500",
  requested_last_minute:          "bg-orange-200 border-orange-500 dark:bg-orange-900/60 dark:border-orange-500",
  interpreter_assigned:           "bg-blue-200 border-blue-500 dark:bg-blue-900/60 dark:border-blue-500",
  interpreter_assigned_last_minute: "bg-teal-200 border-teal-500 dark:bg-teal-900/60 dark:border-teal-500",
  interpreter_confirmed:          "bg-cyan-200 border-cyan-500 dark:bg-cyan-900/60 dark:border-cyan-500",
  reassignment_needed:            "bg-rose-200 border-rose-500 dark:bg-rose-900/60 dark:border-rose-500",
  in_progress:                    "bg-fuchsia-200 border-fuchsia-500 dark:bg-fuchsia-900/60 dark:border-fuchsia-500",
  completed:                      "bg-emerald-200 border-emerald-500 dark:bg-emerald-900/60 dark:border-emerald-500",
  completed_last_minute:          "bg-lime-200 border-lime-500 dark:bg-lime-900/60 dark:border-lime-500",
  cancelled:                      "bg-red-200 border-red-500 dark:bg-red-900/60 dark:border-red-500",
  late_cancel_no_show_client:     "bg-slate-300 border-slate-500 dark:bg-slate-800/60 dark:border-slate-500",
  no_show_interpreter:            "bg-stone-200 border-stone-500 dark:bg-stone-900/60 dark:border-stone-500",
};

/** Dashboard tile number text color — HIGH CONTRAST */
export const statusTileTextColors: Record<string, string> = {
  requested:                      "text-amber-900 dark:text-amber-200",
  requested_last_minute:          "text-orange-900 dark:text-orange-200",
  interpreter_assigned:           "text-blue-900 dark:text-blue-200",
  interpreter_assigned_last_minute: "text-teal-900 dark:text-teal-200",
  interpreter_confirmed:          "text-cyan-900 dark:text-cyan-200",
  reassignment_needed:            "text-rose-900 dark:text-rose-200",
  in_progress:                    "text-fuchsia-900 dark:text-fuchsia-200",
  completed:                      "text-emerald-900 dark:text-emerald-200",
  completed_last_minute:          "text-lime-900 dark:text-lime-200",
  cancelled:                      "text-red-900 dark:text-red-200",
  late_cancel_no_show_client:     "text-slate-900 dark:text-slate-200",
  no_show_interpreter:            "text-stone-900 dark:text-stone-200",
};

/** Badges — BOLD bg + strong text for instant recognition */
export const statusBadgeColors: Record<string, string> = {
  requested:                      "bg-amber-200 text-amber-900 border-amber-400 dark:bg-amber-800 dark:text-amber-100 dark:border-amber-600",
  requested_last_minute:          "bg-orange-200 text-orange-900 border-orange-400 dark:bg-orange-800 dark:text-orange-100 dark:border-orange-600",
  interpreter_assigned:           "bg-blue-200 text-blue-900 border-blue-400 dark:bg-blue-800 dark:text-blue-100 dark:border-blue-600",
  interpreter_assigned_last_minute: "bg-teal-200 text-teal-900 border-teal-400 dark:bg-teal-800 dark:text-teal-100 dark:border-teal-600",
  interpreter_confirmed:          "bg-cyan-200 text-cyan-900 border-cyan-400 dark:bg-cyan-800 dark:text-cyan-100 dark:border-cyan-600",
  reassignment_needed:            "bg-rose-200 text-rose-900 border-rose-400 dark:bg-rose-800 dark:text-rose-100 dark:border-rose-600",
  in_progress:                    "bg-fuchsia-200 text-fuchsia-900 border-fuchsia-400 dark:bg-fuchsia-800 dark:text-fuchsia-100 dark:border-fuchsia-600",
  completed:                      "bg-emerald-200 text-emerald-900 border-emerald-400 dark:bg-emerald-800 dark:text-emerald-100 dark:border-emerald-600",
  completed_last_minute:          "bg-lime-200 text-lime-900 border-lime-400 dark:bg-lime-800 dark:text-lime-100 dark:border-lime-600",
  cancelled:                      "bg-red-200 text-red-900 border-red-400 dark:bg-red-800 dark:text-red-100 dark:border-red-600",
  late_cancel_no_show_client:     "bg-slate-300 text-slate-900 border-slate-400 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-500",
  no_show_interpreter:            "bg-stone-200 text-stone-900 border-stone-400 dark:bg-stone-800 dark:text-stone-100 dark:border-stone-600",
};

/** Row highlights (activity feed, list items) — tinted background */
export const statusRowColors: Record<string, string> = {
  requested:                      "bg-amber-100 border-amber-400 dark:bg-amber-950/50 dark:border-amber-600",
  requested_last_minute:          "bg-orange-100 border-orange-400 dark:bg-orange-950/50 dark:border-orange-600",
  interpreter_assigned:           "bg-blue-100 border-blue-400 dark:bg-blue-950/50 dark:border-blue-600",
  interpreter_assigned_last_minute: "bg-teal-100 border-teal-400 dark:bg-teal-950/50 dark:border-teal-600",
  interpreter_confirmed:          "bg-cyan-100 border-cyan-400 dark:bg-cyan-950/50 dark:border-cyan-600",
  reassignment_needed:            "bg-rose-100 border-rose-400 dark:bg-rose-950/50 dark:border-rose-600",
  in_progress:                    "bg-fuchsia-100 border-fuchsia-400 dark:bg-fuchsia-950/50 dark:border-fuchsia-600",
  completed:                      "bg-emerald-100 border-emerald-400 dark:bg-emerald-950/50 dark:border-emerald-600",
  completed_last_minute:          "bg-lime-100 border-lime-400 dark:bg-lime-950/50 dark:border-lime-600",
  cancelled:                      "bg-red-100 border-red-400 dark:bg-red-950/50 dark:border-red-600",
  late_cancel_no_show_client:     "bg-slate-200 border-slate-400 dark:bg-slate-900/50 dark:border-slate-600",
  no_show_interpreter:            "bg-stone-100 border-stone-400 dark:bg-stone-950/50 dark:border-stone-600",
};

/** Card left-border accent (MySchedule cards) — border-l-4 style */
export const statusCardBorderColors: Record<string, string> = {
  requested:                      "border-l-amber-500",
  requested_last_minute:          "border-l-orange-500",
  interpreter_assigned:           "border-l-blue-500",
  interpreter_assigned_last_minute: "border-l-teal-500",
  interpreter_confirmed:          "border-l-cyan-500",
  reassignment_needed:            "border-l-rose-500",
  in_progress:                    "border-l-fuchsia-500",
  completed:                      "border-l-emerald-500",
  completed_last_minute:          "border-l-lime-500",
  cancelled:                      "border-l-red-500",
  late_cancel_no_show_client:     "border-l-slate-500",
  no_show_interpreter:            "border-l-stone-500",
};

/** Calendar event chips — bg + text + border for inline calendar events */
export const statusCalendarColors: Record<string, string> = {
  requested:                      "bg-amber-200/80 text-amber-900 border-amber-400 dark:bg-amber-900/50 dark:text-amber-100 dark:border-amber-600",
  requested_last_minute:          "bg-orange-200/80 text-orange-900 border-orange-400 dark:bg-orange-900/50 dark:text-orange-100 dark:border-orange-600",
  interpreter_assigned:           "bg-blue-200/80 text-blue-900 border-blue-400 dark:bg-blue-900/50 dark:text-blue-100 dark:border-blue-600",
  interpreter_assigned_last_minute: "bg-teal-200/80 text-teal-900 border-teal-400 dark:bg-teal-900/50 dark:text-teal-100 dark:border-teal-600",
  interpreter_confirmed:          "bg-cyan-200/80 text-cyan-900 border-cyan-400 dark:bg-cyan-900/50 dark:text-cyan-100 dark:border-cyan-600",
  reassignment_needed:            "bg-rose-200/80 text-rose-900 border-rose-400 dark:bg-rose-900/50 dark:text-rose-100 dark:border-rose-600",
  in_progress:                    "bg-fuchsia-200/80 text-fuchsia-900 border-fuchsia-400 dark:bg-fuchsia-900/50 dark:text-fuchsia-100 dark:border-fuchsia-600",
  completed:                      "bg-emerald-200/80 text-emerald-900 border-emerald-400 dark:bg-emerald-900/50 dark:text-emerald-100 dark:border-emerald-600",
  completed_last_minute:          "bg-lime-200/80 text-lime-900 border-lime-400 dark:bg-lime-900/50 dark:text-lime-100 dark:border-lime-600",
  cancelled:                      "bg-red-200/80 text-red-900 border-red-400 dark:bg-red-900/50 dark:text-red-100 dark:border-red-600",
  late_cancel_no_show_client:     "bg-slate-300/80 text-slate-900 border-slate-400 dark:bg-slate-800/50 dark:text-slate-100 dark:border-slate-500",
  no_show_interpreter:            "bg-stone-200/80 text-stone-900 border-stone-400 dark:bg-stone-900/50 dark:text-stone-100 dark:border-stone-600",
};
