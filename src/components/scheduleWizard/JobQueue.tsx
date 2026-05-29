/**
 * Categorized job queue sidebar for the dispatch board.
 *
 * Lists unassigned appointments grouped by v3 status priority:
 *   1. Reassignment Needed
 *   2. Last-Minute Requests
 *   3. New Requests
 * Each card is selectable (single-click) and draggable (desktop) onto the
 * timeline grid. All times are formatted in the agency timezone (PST).
 */
import { useMemo, useState } from "react";
import { Search, RefreshCw, Zap, Inbox, X } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import type { UnassignedAppointment } from "@/hooks/useScheduleWizard";
import { parseISO } from "date-fns";

interface JobQueueProps {
  jobs: UnassignedAppointment[];
  selectedJobId: string | null;
  onSelect: (id: string | null) => void;
  tz: string;
  isLoading: boolean;
  /** Disables drag handles on touch devices to keep tap-to-select snappy. */
  dragDisabled?: boolean;
  /** Optional close button for the mobile/tablet sheet variant. */
  onClose?: () => void;
}

/* -------------------- v3 status grouping -------------------- */

type StatusBucket = "reassignment_needed" | "requested_last_minute" | "requested";

const BUCKET_ORDER: StatusBucket[] = [
  "reassignment_needed",
  "requested_last_minute",
  "requested",
];

const BUCKET_META: Record<StatusBucket, { label: string; icon: any; tone: string; border: string }> = {
  reassignment_needed:    { label: "Reassignment Needed", icon: RefreshCw,  tone: "text-destructive",       border: "border-l-destructive" },
  requested_last_minute:  { label: "Last-Minute Requests", icon: Zap,        tone: "text-warning",            border: "border-l-warning" },
  requested:              { label: "New Requests",         icon: Inbox,      tone: "text-primary",            border: "border-l-primary" },
};

function bucketOf(status: string): StatusBucket {
  if (status === "reassignment_needed") return "reassignment_needed";
  if (status === "requested_last_minute") return "requested_last_minute";
  return "requested";
}

/* -------------------- Time helpers (agency tz) -------------------- */

function timeRange(start: string | null, end: string | null, tz: string): string {
  if (!start || !end) return "—";
  try {
    const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", timeZone: tz };
    return `${new Intl.DateTimeFormat(undefined, opts).format(parseISO(start))} – ${new Intl.DateTimeFormat(undefined, opts).format(parseISO(end))}`;
  } catch { return "—"; }
}

function dateChip(start: string | null, tz: string): string {
  if (!start) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", weekday: "short", timeZone: tz }).format(parseISO(start));
  } catch { return "—"; }
}

function modalityIcon(m: string | null): string {
  if (m === "opi") return "📞";
  if (m === "vri") return "🎥";
  return "📍";
}

/* -------------------- Card -------------------- */

function JobCard({
  job, selected, onSelect, tz, dragDisabled,
}: {
  job: UnassignedAppointment;
  selected: boolean;
  onSelect: () => void;
  tz: string;
  dragDisabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `job:${job.id}`,
    disabled: dragDisabled,
  });

  const bucket = bucketOf(job.status);
  const lang = job.languages?.name ?? "—";
  const customer = job.customers?.name ?? "—";
  const loc = job.modality === "opi" || job.modality === "vri" ? "Remote" : (job.locations?.name ?? "");

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...(dragDisabled ? {} : listeners)}
      onClick={onSelect}
      className={[
        "w-full text-left rounded-md border-l-2 border bg-card hover:bg-accent/50",
        "p-2.5 transition-colors",
        BUCKET_META[bucket].border,
        selected ? "ring-2 ring-primary border-primary/40" : "",
        isDragging ? "opacity-50" : "",
      ].join(" ")}
      aria-pressed={selected}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{lang} • {customer}</p>
          <p className="mt-0.5 text-xs text-muted-foreground truncate">
            {dateChip(job.scheduled_start, tz)} · {timeRange(job.scheduled_start, job.scheduled_end, tz)}
          </p>
          {job.patient_client_name && (
            <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
              Patient: {job.patient_client_name}
            </p>
          )}
          {loc && (
            <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
              {modalityIcon(job.modality)} {loc}
            </p>
          )}
        </div>
        {bucket === "requested_last_minute" && (
          <Badge variant="outline" className="shrink-0 border-warning/40 bg-warning/10 text-warning text-[10px] px-1.5 py-0 h-5">
            LM
          </Badge>
        )}
      </div>
    </button>
  );
}

/* -------------------- Queue -------------------- */

export function JobQueue({
  jobs, selectedJobId, onSelect, tz, isLoading, dragDisabled, onClose,
}: JobQueueProps) {
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = jobs.filter((j) => {
      if (!q) return true;
      const hay = [
        j.title, j.patient_client_name, j.customers?.name, j.languages?.name, j.locations?.name,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });

    const buckets: Record<StatusBucket, UnassignedAppointment[]> = {
      reassignment_needed: [],
      requested_last_minute: [],
      requested: [],
    };
    for (const j of filtered) buckets[bucketOf(j.status)].push(j);

    // Each bucket sorted by scheduled_start ascending (nulls last)
    for (const k of Object.keys(buckets) as StatusBucket[]) {
      buckets[k].sort((a, b) => {
        if (!a.scheduled_start) return 1;
        if (!b.scheduled_start) return -1;
        return a.scheduled_start.localeCompare(b.scheduled_start);
      });
    }
    return buckets;
  }, [jobs, search]);

  const totalShown =
    grouped.reassignment_needed.length +
    grouped.requested_last_minute.length +
    grouped.requested.length;

  return (
    <TooltipProvider delayDuration={300}>
      <aside className="flex h-full w-full flex-col bg-muted/20">
        <div className="border-b px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Inbox className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold truncate">Job Queue</h2>
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{totalShown}</Badge>
            </div>
            {onClose && (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose} aria-label="Close job queue">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search language, customer, patient…"
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-4">
            {isLoading && (
              <p className="text-center text-xs text-muted-foreground py-8">Loading…</p>
            )}
            {!isLoading && totalShown === 0 && (
              <div className="rounded-md border border-dashed p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {search ? "No jobs match your search." : "Nothing to assign right now. 🎉"}
                </p>
              </div>
            )}

            {BUCKET_ORDER.map((bucket) => {
              const list = grouped[bucket];
              if (list.length === 0) return null;
              const meta = BUCKET_META[bucket];
              const Icon = meta.icon;
              return (
                <section key={bucket} className="space-y-1.5">
                  <div className="flex items-center gap-1.5 px-1">
                    <Icon className={`h-3.5 w-3.5 ${meta.tone}`} />
                    <h3 className={`text-[11px] font-semibold uppercase tracking-wide ${meta.tone}`}>
                      {meta.label}
                    </h3>
                    <span className="text-[10px] text-muted-foreground">{list.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {list.map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        selected={selectedJobId === job.id}
                        onSelect={() => onSelect(selectedJobId === job.id ? null : job.id)}
                        tz={tz}
                        dragDisabled={dragDisabled}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </ScrollArea>
      </aside>
    </TooltipProvider>
  );
}
