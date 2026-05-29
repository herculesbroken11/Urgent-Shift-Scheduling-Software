/**
 * Schedule Wizard — production dispatch board.
 *
 * Layout:
 *   ┌─ Toolbar (date nav, view switcher, search, dispatch hours, refresh)
 *   ├─ Job Queue sidebar  │  DispatchTimeline grid
 *
 * Responsive:
 *   ≥1024px  3-pane (toolbar / 320px JobQueue / Timeline)
 *   <1024px  Toolbar + Timeline; JobQueue lives in a Sheet drawer
 *   <768px   Stacked: Toolbar → horizontal job strip → simplified Day timeline.
 *            Drag-drop disabled below 768px (tap-to-select + tap-cell flow).
 *
 * Preserved from previous Phases (do not regress):
 *   • Patient-continuity scoring (useInterpreterScoring + usePatientHistory)
 *   • Conflict-override audit: writes BOTH custom_fields.override_log AND
 *     appointment_history (action: "override_conflict") via useAssignAppointment.
 *   • Notifications fire from useAssignAppointment.
 *   • Undo via useUndoAssignment.
 *   • Role gating to agency_admin / scheduler via ROUTE_ROLES.
 *   • Every query is .eq('agency_id', agencyId) scoped (delegated to hooks).
 */
import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock, Clock, ChevronLeft, ChevronRight, CalendarIcon,
  RefreshCw, Inbox, X, LayoutGrid, ListFilter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";

import { useAuth } from "@/contexts/AuthContext";
import { useAgencyTimezone } from "@/hooks/useAgencyTimezone";
import { useAgencySettings } from "@/hooks/useAgencySettings";
import { useLanguages } from "@/hooks/useAgencyData";
import {
  useUnassignedAppointments, useWizardInterpreters, useInterpreterSchedulesBatch,
  useAssignAppointment, useUndoAssignment,
  type WizardInterpreter, type ConflictInfo,
} from "@/hooks/useScheduleWizard";
import { useInterpreterScoring } from "@/hooks/useInterpreterScoring";
import { usePatientHistory } from "@/hooks/usePatientHistory";

import { JobQueue } from "@/components/scheduleWizard/JobQueue";
import { DispatchTimeline, type CellTarget } from "@/components/scheduleWizard/DispatchTimeline";
import { AssignmentConfirmDialog } from "@/components/scheduleWizard/AssignmentConfirmDialog";
import {
  buildDays, computeWindow, readDispatchHours, todayInTz, shiftDate, utcToTzDateStr, viewSpan,
  rangesOverlap,
  type ConflictHit, type DispatchView,
} from "@/components/scheduleWizard/dispatch-utils";
import { formatDateTimeInTz } from "@/lib/agency-timezone";

type WizardMode = "board" | "job-first";

/* -------------------- Helpers -------------------- */

function interpreterRejectedThis(custom_fields: any, interpreterId: string): boolean {
  const history = custom_fields?.rejection_history;
  if (!Array.isArray(history)) return false;
  return history.some((r: any) => r?.interpreter_id === interpreterId);
}

function useViewport() {
  const [vp, setVp] = useState<{ w: number; h: number }>(() =>
    typeof window === "undefined"
      ? { w: 1280, h: 800 }
      : { w: window.innerWidth, h: window.innerHeight },
  );
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return vp;
}

/* -------------------- Page -------------------- */

export default function ScheduleWizard() {
  const { profile } = useAuth();
  const tz = useAgencyTimezone();
  const { settings, regionsEnabled } = useAgencySettings();
  const dispatchHours = useMemo(() => readDispatchHours(settings), [settings]);

  const vp = useViewport();
  const isDesktop = vp.w >= 1024;
  const isTabletUp = vp.w >= 768;
  const dragEnabled = isTabletUp;

  // Mode toggle: Assignment Board (default) vs legacy Job-First
  const [mode, setMode] = useState<WizardMode>("board");

  // View / date state
  const [view, setView] = useState<DispatchView>("day");
  const [anchorDate, setAnchorDate] = useState<string>(() => todayInTz(tz));

  // Assignment Board: language filter (id) — required to populate the grid
  const [boardLanguageId, setBoardLanguageId] = useState<string>("");

  // Mobile/tablet drawer state for the Job Queue
  const [queueSheetOpen, setQueueSheetOpen] = useState(false);

  // Selection state (used in both modes for click-to-assign)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Assignment dialog state
  const [confirmTarget, setConfirmTarget] = useState<{
    interpreter: WizardInterpreter;
    conflict: ConflictHit | null;
  } | null>(null);

  // DnD active state
  const [activeDragJobId, setActiveDragJobId] = useState<string | null>(null);

  /* --------- Data --------- */
  const {
    data: jobs = [], isLoading: jobsLoading, refetch: refetchJobs,
  } = useUnassignedAppointments();
  const {
    data: interpreters = [], isLoading: interpretersLoading, refetch: refetchInterps,
  } = useWizardInterpreters();
  const { data: languages = [] } = useLanguages();

  // Board mode jobs: filtered by the selected language so the queue, the
  // grid, and the unassigned strip all stay in sync with one filter.
  const visibleJobs = useMemo(() => {
    if (mode !== "board" || !boardLanguageId) return jobs;
    return jobs.filter((j) => j.language_id === boardLanguageId || j.language_id == null);
  }, [jobs, mode, boardLanguageId]);

  // Auto-pick the first language with unassigned jobs the first time we land
  // on the board so dispatchers don't see an empty grid.
  useEffect(() => {
    if (mode !== "board" || boardLanguageId) return;
    const firstWithJobs = jobs.find((j) => j.language_id);
    if (firstWithJobs?.language_id) setBoardLanguageId(firstWithJobs.language_id);
  }, [mode, boardLanguageId, jobs]);

  // Board mode supports Day/Week only (per spec). Snap "3day" → "day".
  useEffect(() => {
    if (mode === "board" && view === "3day") setView("day");
  }, [mode, view]);

  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  );
  const draggedJob = useMemo(
    () => jobs.find((j) => j.id === activeDragJobId) ?? null,
    [jobs, activeDragJobId],
  );

  // Force Day view on mobile to keep it readable
  const effectiveView: DispatchView = isTabletUp ? view : "day";

  const days = useMemo(() => buildDays(anchorDate, effectiveView), [anchorDate, effectiveView]);
  // Fetch schedule entries across the full day window (00:00–24:00) so off-hours
  // appointments are available for the timeline's auto-extend logic. The
  // dispatchHours setting still drives the default visible slot range.
  const { startUtc, endUtc } = useMemo(
    () => computeWindow(days, { start: "00:00", end: "24:00" }, tz),
    [days, tz],
  );

  const interpreterIds = useMemo(() => interpreters.map((i) => i.id), [interpreters]);
  const { data: schedules, isLoading: schedulesLoading } = useInterpreterSchedulesBatch(
    interpreterIds, startUtc, endUtc,
  );

  /* --------- Scoring (depends on selected job) --------- */
  const { data: patientHistory } = usePatientHistory({
    agencyId: profile?.agency_id,
    customerId: selectedJob?.customer_id ?? null,
    patientName: selectedJob?.patient_client_name ?? null,
  });

  // For scoring / row sorting we feed all interpreters (the scoring hook
  // filters incompatible ones internally and returns ranked output).
  const rejectedIds = useMemo(() => {
    const set = new Set<string>();
    if (!selectedJob) return set;
    for (const interp of interpreters) {
      if (interpreterRejectedThis(selectedJob.custom_fields, interp.id)) {
        set.add(interp.id);
      }
    }
    return set;
  }, [interpreters, selectedJob]);

  const { recommended, others } = useInterpreterScoring({
    interpreters,
    selectedJob,
    schedules,
    regionsEnabled: !!regionsEnabled,
    agencyTz: tz,
    rejectedInterpreterIds: rejectedIds,
    patientHistory,
  });

  // Build the row order: recommended first, then others, then incompatible at the bottom.
  const incompatibleIds = useMemo(() => {
    if (!selectedJob?.language_id) return new Set<string>();
    const set = new Set<string>();
    for (const i of interpreters) {
      const ok = i.languages.some((l) => l.language_id === selectedJob.language_id);
      if (!ok) set.add(i.id);
    }
    return set;
  }, [interpreters, selectedJob]);

  const recommendedIds = useMemo(
    () => new Set(recommended.map((s) => s.interpreter.id)),
    [recommended],
  );

  const scoreById = useMemo(() => {
    const m = new Map<string, (typeof recommended)[number]>();
    for (const s of [...recommended, ...others]) m.set(s.interpreter.id, s);
    return m;
  }, [recommended, others]);

  const orderedInterpreters = useMemo(() => {
    // Assignment Board: rows = only interpreters who speak the chosen language
    if (mode === "board") {
      if (!boardLanguageId) return [];
      const filtered = interpreters.filter((i) =>
        i.languages.some((l) => l.language_id === boardLanguageId),
      );
      // If a job is selected, prefer the recommended/others ordering for that job
      if (selectedJob) {
        const langSet = new Set(filtered.map((i) => i.id));
        const rec = recommended.map((s) => s.interpreter).filter((i) => langSet.has(i.id));
        const oth = others.map((s) => s.interpreter).filter((i) => langSet.has(i.id));
        const used = new Set([...rec, ...oth].map((i) => i.id));
        const rest = filtered.filter((i) => !used.has(i.id));
        return [...rec, ...oth, ...rest];
      }
      return filtered.sort((a, b) => {
        const an = `${a.first_name ?? ""} ${a.last_name ?? ""}`;
        const bn = `${b.first_name ?? ""} ${b.last_name ?? ""}`;
        return an.localeCompare(bn);
      });
    }

    // Job-First (legacy): rank everyone, push incompatibles to the bottom
    if (!selectedJob) {
      return [...interpreters].sort((a, b) => {
        const an = `${a.first_name ?? ""} ${a.last_name ?? ""}`;
        const bn = `${b.first_name ?? ""} ${b.last_name ?? ""}`;
        return an.localeCompare(bn);
      });
    }
    const recommendedRows = recommended.map((s) => s.interpreter);
    const otherRows = others.map((s) => s.interpreter);
    const incompatibleRows = interpreters.filter((i) => incompatibleIds.has(i.id))
      .sort((a, b) => {
        const an = `${a.first_name ?? ""} ${a.last_name ?? ""}`;
        const bn = `${b.first_name ?? ""} ${b.last_name ?? ""}`;
        return an.localeCompare(bn);
      });
    return [...recommendedRows, ...otherRows, ...incompatibleRows];
  }, [mode, boardLanguageId, interpreters, recommended, others, incompatibleIds, selectedJob]);

  /* --------- Side effects --------- */

  // Jump anchorDate to the selected job's date
  useEffect(() => {
    if (!selectedJob?.scheduled_start) return;
    setAnchorDate(utcToTzDateStr(selectedJob.scheduled_start, tz));
  }, [selectedJob?.id, selectedJob?.scheduled_start, tz]);

  // Esc deselects
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedJobId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* --------- Assignment flow --------- */
  const assignMutation = useAssignAppointment();
  const undoMutation = useUndoAssignment();

  const handleCellClick = (target: CellTarget) => {
    if (!selectedJob) {
      toast.info("Select a job from the queue first.");
      return;
    }
    if (incompatibleIds.has(target.interpreter.id)) return;
    setConfirmTarget({ interpreter: target.interpreter, conflict: target.conflict });
  };

  const performAssign = async (input: { overrideReason?: string; conflict: ConflictInfo | null }) => {
    if (!confirmTarget || !selectedJob) return;
    const interp = confirmTarget.interpreter;
    const mode: "offer" | "confirm" = interp.admin_confirms ? "confirm" : "offer";
    const priorStatus = selectedJob.status;
    const priorInterpreterId = null;

    try {
      await assignMutation.mutateAsync({
        appointmentId: selectedJob.id,
        interpreterId: interp.id,
        mode,
        priorStatus,
        priorInterpreterId,
        overrideReason: input.overrideReason,
        conflict: input.conflict,
      });

      const interpName = `${interp.first_name ?? ""} ${interp.last_name ?? ""}`.trim();
      toast.success(
        `Assigned ${interpName} to ${selectedJob.languages?.name ?? selectedJob.title ?? "appointment"}`,
        {
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                await undoMutation.mutateAsync({
                  appointmentId: selectedJob.id,
                  priorStatus,
                  priorInterpreterId,
                });
                toast.success("Assignment reverted");
              } catch (e: any) {
                toast.error(e?.message ?? "Failed to undo");
              }
            },
          },
          duration: 8000,
        },
      );
      setConfirmTarget(null);
      setSelectedJobId(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to assign");
    }
  };

  /* --------- DnD --------- */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    if (id.startsWith("job:")) {
      const jobId = id.slice("job:".length);
      setActiveDragJobId(jobId);
      setSelectedJobId(jobId);
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id);
    setActiveDragJobId(null);
    if (!activeId.startsWith("job:")) return;
    const jobId = activeId.slice("job:".length);
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    const over = e.over;
    if (!over) return;
    const data = over.data.current as any;
    if (!data || data.kind !== "timeline-cell") return;

    const interp = interpreters.find((i) => i.id === data.interpreterId);
    if (!interp) return;

    // Recompute compatibility on drop
    if (incompatibleIds.has(interp.id)) {
      toast.error(`Interpreter does not speak ${job.languages?.name ?? "the required language"}.`);
      return;
    }

    // Recompute conflict on drop using fresh schedules — use the JOB's window,
    // not the cell's, to surface the actual booking conflict.
    const entries = schedules?.get(interp.id) ?? [];
    let conflict: ConflictHit | null = null;
    if (job.scheduled_start && job.scheduled_end) {
      for (const en of entries) {
        if (rangesOverlap(job.scheduled_start, job.scheduled_end, en.start, en.end)) {
          conflict = {
            type: en.type,
            conflicting_entity_id: en.appointment_id ?? en.availability_id ?? null,
            start: en.start,
            end: en.end,
          };
          break;
        }
      }
    }

    setSelectedJobId(jobId);
    setConfirmTarget({ interpreter: interp, conflict });
  };

  /* --------- Render --------- */

  const totalUnassigned = visibleJobs.length;

  const handleNav = (direction: -1 | 1) => {
    setAnchorDate(shiftDate(anchorDate, direction * viewSpan(effectiveView)));
  };

  // Pretty heading for the selected anchor date — full weekday + month + day + year.
  const headingDate = useMemo(() => {
    const [y, m, d] = anchorDate.split("-").map(Number);
    if (!y || !m || !d) return anchorDate;
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: tz,
    }).format(dt);
  }, [anchorDate, tz]);

  const queue = (
    <JobQueue
      jobs={visibleJobs}
      selectedJobId={selectedJobId}
      onSelect={(id) => {
        setSelectedJobId(id);
        if (!isDesktop) setQueueSheetOpen(false);
      }}
      tz={tz}
      isLoading={jobsLoading}
      dragDisabled={!dragEnabled}
      onClose={!isDesktop ? () => setQueueSheetOpen(false) : undefined}
    />
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragJobId(null)}
    >
      <div className="flex h-[calc(100vh-3.5rem)] flex-col">
        {/* Toolbar — row 1: title, mode toggle, refresh */}
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 sm:px-4">
          <CalendarClock className="h-5 w-5 text-primary shrink-0" />
          <h1 className="text-base sm:text-lg font-semibold">Schedule Wizard</h1>
          <Badge variant="outline" className="hidden sm:inline-flex gap-1 text-xs">
            <Clock className="h-3 w-3" />
            PST
          </Badge>

          {/* Mode toggle */}
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) => v && setMode(v as WizardMode)}
            size="sm"
            className="ml-2"
          >
            <ToggleGroupItem value="board" className="h-7 px-2 text-xs gap-1">
              <LayoutGrid className="h-3.5 w-3.5" /> Assignment Board
            </ToggleGroupItem>
            <ToggleGroupItem value="job-first" className="h-7 px-2 text-xs gap-1">
              <ListFilter className="h-3.5 w-3.5" /> Job-First
            </ToggleGroupItem>
          </ToggleGroup>

          {!isDesktop && (
            <Button
              variant="outline" size="sm"
              className="ml-1 gap-1.5 h-7"
              onClick={() => setQueueSheetOpen(true)}
            >
              <Inbox className="h-3.5 w-3.5" />
              Jobs <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{totalUnassigned}</Badge>
            </Button>
          )}

          {selectedJob && (
            <Badge className="gap-1 bg-primary/10 text-primary border-primary/30 hover:bg-primary/15 max-w-[260px]">
              <span className="truncate">
                {selectedJob.languages?.name ?? "—"} · {formatDateTimeInTz(selectedJob.scheduled_start, tz)}
              </span>
              <button onClick={() => setSelectedJobId(null)} className="ml-1 hover:text-foreground" aria-label="Clear selection">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          <Button
            variant="ghost" size="sm"
            className="ml-auto"
            onClick={() => { refetchJobs(); refetchInterps(); }}
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Toolbar — row 2: date heading + nav + view + (board) language filter */}
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 sm:px-4 bg-muted/20">
          <h2 className="text-base sm:text-xl font-semibold tracking-tight">
            {headingDate}
          </h2>

          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleNav(-1)} aria-label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setAnchorDate(todayInTz(tz))}>
              Today
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{anchorDate}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarPicker
                  mode="single"
                  selected={(() => { const [y,m,d] = anchorDate.split("-").map(Number); return new Date(y, m - 1, d); })()}
                  onSelect={(d) => {
                    if (!d) return;
                    const ys = d.getFullYear();
                    const ms = String(d.getMonth() + 1).padStart(2, "0");
                    const ds = String(d.getDate()).padStart(2, "0");
                    setAnchorDate(`${ys}-${ms}-${ds}`);
                  }}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleNav(1)} aria-label="Next">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {isTabletUp && (
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(v) => v && setView(v as DispatchView)}
              size="sm"
              className="ml-1"
            >
              <ToggleGroupItem value="day" className="h-7 px-2 text-xs">Day</ToggleGroupItem>
              {mode === "job-first" && (
                <ToggleGroupItem value="3day" className="h-7 px-2 text-xs">3-Day</ToggleGroupItem>
              )}
              <ToggleGroupItem value="week" className="h-7 px-2 text-xs">Week</ToggleGroupItem>
            </ToggleGroup>
          )}

          {mode === "board" && (
            <Select value={boardLanguageId} onValueChange={setBoardLanguageId}>
              <SelectTrigger className="h-7 w-[180px] text-xs ml-1">
                <SelectValue placeholder="Filter by language…" />
              </SelectTrigger>
              <SelectContent>
                {languages.map((l: any) => (
                  <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Workspace */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Desktop sidebar */}
          {isDesktop && (
            <div className="w-[320px] shrink-0 border-r">
              {queue}
            </div>
          )}

          {/* Tablet/mobile drawer */}
          {!isDesktop && (
            <Sheet open={queueSheetOpen} onOpenChange={setQueueSheetOpen}>
              <SheetContent side="left" className="p-0 w-[90vw] sm:w-[360px]">
                <SheetHeader className="sr-only">
                  <SheetTitle>Job Queue</SheetTitle>
                </SheetHeader>
                {queue}
              </SheetContent>
            </Sheet>
          )}

          {/* Timeline */}
          <div className="flex-1 min-w-0">
            <DispatchTimeline
              view={effectiveView}
              anchorDate={anchorDate}
              hours={dispatchHours}
              tz={tz}
              interpreters={orderedInterpreters}
              schedules={schedules}
              selectedJob={selectedJob}
              scoreById={scoreById}
              incompatibleIds={incompatibleIds}
              recommendedIds={recommendedIds}
              onCellClick={handleCellClick}
              isLoading={schedulesLoading || interpretersLoading}
              dragActive={!!activeDragJobId}
              unassignedJobs={mode === "board" ? visibleJobs : []}
              showUnassignedLane={mode === "board"}
              selectedJobId={selectedJobId}
              activeDragJobId={activeDragJobId}
              onSelectUnassigned={(id) =>
                setSelectedJobId(selectedJobId === id ? null : id)
              }
            />
          </div>
        </div>

        {/* Assignment dialog */}
        <AssignmentConfirmDialog
          open={!!confirmTarget}
          onOpenChange={(open) => { if (!open) setConfirmTarget(null); }}
          job={selectedJob}
          interpreter={confirmTarget?.interpreter ?? null}
          conflict={confirmTarget?.conflict ?? null}
          score={confirmTarget ? scoreById.get(confirmTarget.interpreter.id) : undefined}
          tz={tz}
          isSubmitting={assignMutation.isPending}
          onConfirm={performAssign}
        />
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {draggedJob ? (
          <div className="rounded-md border bg-card shadow-lg p-2.5 max-w-[260px]">
            <p className="text-sm font-medium truncate">
              {draggedJob.languages?.name} · {draggedJob.customers?.name}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {formatDateTimeInTz(draggedJob.scheduled_start, tz)}
            </p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
