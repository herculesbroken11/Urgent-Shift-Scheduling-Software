import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, CalendarDays, Repeat, CheckCircle, Users } from "lucide-react";
import {
  format, addDays, addMonths, subMonths, startOfWeek, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameDay, isSameMonth, isWithinInterval, parseISO, isToday, getDay,
} from "date-fns";
import { cn } from "@/lib/utils";
import { useTeamAvailability, type InterpreterBlock, type InterpreterInfo } from "@/hooks/useTeamAvailability";

type ViewMode = "day" | "week" | "month";

// Interpreter color palette — muted pastels
const INTERP_COLORS = [
  "bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-200",
  "bg-rose-100 border-rose-300 text-rose-800 dark:bg-rose-900/40 dark:border-rose-700 dark:text-rose-200",
  "bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-200",
  "bg-emerald-100 border-emerald-300 text-emerald-800 dark:bg-emerald-900/40 dark:border-emerald-700 dark:text-emerald-200",
  "bg-violet-100 border-violet-300 text-violet-800 dark:bg-violet-900/40 dark:border-violet-700 dark:text-violet-200",
  "bg-cyan-100 border-cyan-300 text-cyan-800 dark:bg-cyan-900/40 dark:border-cyan-700 dark:text-cyan-200",
  "bg-orange-100 border-orange-300 text-orange-800 dark:bg-orange-900/40 dark:border-orange-700 dark:text-orange-200",
  "bg-pink-100 border-pink-300 text-pink-800 dark:bg-pink-900/40 dark:border-pink-700 dark:text-pink-200",
];

function isBlockOnDay(block: InterpreterBlock, day: Date): boolean {
  if (block.is_recurring && block.day_of_week !== null) {
    return day.getDay() === block.day_of_week;
  }
  if (block.specific_date) {
    const start = parseISO(block.specific_date);
    if (block.end_date) {
      const end = parseISO(block.end_date);
      return isWithinInterval(day, { start, end });
    }
    return isSameDay(day, start);
  }
  return false;
}

function formatShortTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "p" : "a";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${ampm}` : `${hour}:${String(m).padStart(2, "0")}${ampm}`;
}

function formatTimeRange(start: string, end: string) {
  return `${formatShortTime(start)} – ${formatShortTime(end)}`;
}

function timeToHour(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h + m / 60;
}

function getUnavailableCount(day: Date, interpreterMap: Map<string, InterpreterInfo>): number {
  let count = 0;
  interpreterMap.forEach((interp) => {
    if (interp.blocks.some((b) => isBlockOnDay(b, day))) count++;
  });
  return count;
}

interface Props {
  interpreterMap: Map<string, InterpreterInfo>;
  myLanguages: { language_id: string; name: string }[];
  selectedLanguages: Set<string>;
  toggleLanguage: (langId: string) => void;
  isLoading: boolean;
}

export default function TeamAvailabilityCalendar({
  interpreterMap, myLanguages, selectedLanguages, toggleLanguage, isLoading,
}: Props) {
  const [view, setView] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());

  const totalInterpreters = interpreterMap.size;

  // Assign consistent colors to interpreters
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    let i = 0;
    interpreterMap.forEach((_, id) => {
      map.set(id, INTERP_COLORS[i % INTERP_COLORS.length]);
      i++;
    });
    return map;
  }, [interpreterMap]);

  const goToday = () => setCurrentDate(new Date());
  const navigate = (dir: number) => {
    if (view === "month") setCurrentDate((d) => dir > 0 ? addMonths(d, 1) : subMonths(d, 1));
    else if (view === "week") setCurrentDate((d) => addDays(d, dir * 7));
    else setCurrentDate((d) => addDays(d, dir));
  };

  const drillToDay = (day: Date) => {
    setCurrentDate(day);
    setView("day");
  };

  // ──────── Month View ────────
  const monthDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = addDays(startOfWeek(addDays(monthEnd, 6), { weekStartsOn: 1 }), -1);
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentDate]);

  function renderMonthView() {
    const weekDayHeaders = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return (
      <div>
        <div className="grid grid-cols-7 border-b">
          {weekDayHeaders.map((d) => (
            <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {monthDays.map((day, i) => {
            const inMonth = isSameMonth(day, currentDate);
            const today = isToday(day);
            const unavCount = getUnavailableCount(day, interpreterMap);
            const isCritical = totalInterpreters > 0 && unavCount > totalInterpreters * 0.5;

            return (
              <div
                key={i}
                className={cn(
                  "min-h-[70px] sm:min-h-[80px] border-b border-r p-1.5 cursor-pointer transition-colors hover:bg-muted/50",
                  !inMonth && "bg-muted/20",
                  i % 7 === 0 && "border-l",
                )}
                onClick={() => drillToDay(day)}
              >
                <div className={cn(
                  "text-xs font-medium mb-1",
                  !inMonth && "text-muted-foreground/50",
                  today && "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center",
                )}>
                  {format(day, "d")}
                </div>
                {inMonth && unavCount > 0 && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] px-1.5 py-0 font-medium border",
                      isCritical
                        ? "bg-destructive/10 text-destructive border-destructive/30"
                        : "bg-warning/10 text-warning border-warning/30"
                    )}
                  >
                    <span className="hidden sm:inline">{unavCount} off</span>
                    <span className="sm:hidden">{unavCount}</span>
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ──────── Week View ────────
  const weekDays = useMemo(() => {
    const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: ws, end: addDays(ws, 6) });
  }, [currentDate]);

  const HOUR_START = 7;
  const HOUR_END = 20;
  const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

  function renderWeekView() {
    return (
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Day headers */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b">
            <div className="p-2" />
            {weekDays.map((day, i) => (
              <div
                key={i}
                className={cn(
                  "p-2 text-center border-l cursor-pointer hover:bg-muted/50 transition-colors",
                  isToday(day) && "bg-primary/5",
                )}
                onClick={() => drillToDay(day)}
              >
                <div className={cn("text-xs font-medium text-muted-foreground", isToday(day) && "text-primary")}>
                  {format(day, "EEE")}
                </div>
                <div className={cn(
                  "text-sm font-semibold",
                  isToday(day) && "bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center mx-auto",
                )}>
                  {format(day, "d")}
                </div>
              </div>
            ))}
          </div>

          {/* All-day row */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b bg-muted/20">
            <div className="p-1 text-[10px] text-muted-foreground text-right pr-2 pt-2">All day</div>
            {weekDays.map((day, di) => {
              const allDayBlocks: { interpId: string; interp: InterpreterInfo; block: InterpreterBlock }[] = [];
              interpreterMap.forEach((interp, interpId) => {
                interp.blocks.forEach((b) => {
                  if (isBlockOnDay(b, day) && b.is_all_day) {
                    allDayBlocks.push({ interpId, interp, block: b });
                  }
                });
              });
              return (
                <div key={di} className="border-l p-0.5 min-h-[28px] space-y-0.5">
                  {allDayBlocks.map((ab) => (
                    <Tooltip key={ab.block.id}>
                      <TooltipTrigger asChild>
                        <div className={cn(
                          "rounded text-[10px] px-1 py-0.5 border truncate cursor-default",
                          colorMap.get(ab.interpId),
                          ab.block.is_recurring && "border-dashed",
                        )}>
                          {ab.block.is_recurring && <Repeat className="h-2.5 w-2.5 inline mr-0.5" />}
                          {ab.interp.name}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium">{ab.interp.name} — Unavailable</p>
                        <p className="text-xs text-muted-foreground">All day{ab.block.is_recurring ? " (weekly)" : ""}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="relative">
            {HOURS.map((hour) => (
              <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-b h-10">
                <div className="text-[10px] text-muted-foreground text-right pr-2 -mt-1.5">
                  {hour === 12 ? "12pm" : hour > 12 ? `${hour - 12}pm` : `${hour}am`}
                </div>
                {weekDays.map((day, di) => {
                  // Partial-day blocks that overlap this hour
                  const partialBlocks: { interpId: string; interp: InterpreterInfo; block: InterpreterBlock }[] = [];
                  interpreterMap.forEach((interp, interpId) => {
                    interp.blocks.forEach((b) => {
                      if (!b.is_all_day && isBlockOnDay(b, day)) {
                        const startH = timeToHour(b.start_time);
                        const endH = timeToHour(b.end_time);
                        if (startH <= hour && endH > hour) {
                          // Only render at start hour
                          if (Math.floor(startH) === hour || (startH < HOUR_START && hour === HOUR_START)) {
                            partialBlocks.push({ interpId, interp, block: b });
                          }
                        }
                      }
                    });
                  });
                  return (
                    <div key={di} className="border-l relative">
                      {partialBlocks.map((pb) => {
                        const startH = Math.max(timeToHour(pb.block.start_time), HOUR_START);
                        const endH = Math.min(timeToHour(pb.block.end_time), HOUR_END);
                        const topOffset = (startH - hour) * 40;
                        const height = (endH - startH) * 40;
                        return (
                          <Tooltip key={pb.block.id}>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  "absolute left-0.5 right-0.5 rounded text-[10px] px-1 border overflow-hidden cursor-default z-10",
                                  colorMap.get(pb.interpId),
                                  pb.block.is_recurring && "border-dashed",
                                )}
                                style={{ top: `${topOffset}px`, height: `${Math.max(height, 20)}px` }}
                              >
                                <div className="truncate font-medium">
                                  {pb.block.is_recurring && <Repeat className="h-2.5 w-2.5 inline mr-0.5" />}
                                  {pb.interp.name}
                                </div>
                                {height >= 30 && (
                                  <div className="truncate opacity-75">
                                    {formatShortTime(pb.block.start_time)}-{formatShortTime(pb.block.end_time)}
                                  </div>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-medium">{pb.interp.name} — Unavailable</p>
                              <p className="text-xs text-muted-foreground">
                                {formatTimeRange(pb.block.start_time, pb.block.end_time)}
                                {pb.block.is_recurring ? " (weekly)" : ""}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Coverage footer */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-t bg-muted/30">
            <div className="p-1.5 text-[10px] text-muted-foreground text-right pr-2">Coverage</div>
            {weekDays.map((day, i) => {
              const off = getUnavailableCount(day, interpreterMap);
              return (
                <div key={i} className="p-1.5 text-center border-l text-[10px] font-medium">
                  {off > 0 ? (
                    <span className={cn(off > totalInterpreters * 0.5 ? "text-destructive" : "text-muted-foreground")}>
                      {off}/{totalInterpreters} off
                    </span>
                  ) : (
                    <span className="text-success">✓</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ──────── Day View ────────
  function renderDayView() {
    const interpretersToday: { interpId: string; interp: InterpreterInfo; allDayBlocks: InterpreterBlock[]; timedBlocks: InterpreterBlock[] }[] = [];
    interpreterMap.forEach((interp, interpId) => {
      const dayBlocks = interp.blocks.filter((b) => isBlockOnDay(b, currentDate));
      if (dayBlocks.length > 0) {
        interpretersToday.push({
          interpId,
          interp,
          allDayBlocks: dayBlocks.filter((b) => b.is_all_day),
          timedBlocks: dayBlocks.filter((b) => !b.is_all_day),
        });
      }
    });

    const unavCount = interpretersToday.length;
    const activeLangNames = myLanguages
      .filter((l) => selectedLanguages.has(l.language_id))
      .map((l) => l.name)
      .join(", ");

    return (
      <div>
        {/* Summary */}
        <div className="px-4 py-3 border-b bg-muted/20">
          <p className="text-sm font-medium">
            {format(currentDate, "EEEE, MMMM d")}
            {" — "}
            {unavCount === 0 ? (
              <span className="text-success">All colleagues available</span>
            ) : (
              <span className={cn(unavCount > totalInterpreters * 0.5 ? "text-destructive" : "text-muted-foreground")}>
                {unavCount} of {totalInterpreters} {activeLangNames ? `(${activeLangNames})` : ""} interpreters unavailable
              </span>
            )}
          </p>
        </div>

        {interpretersToday.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-success" />
            <p className="font-medium">All colleagues available today</p>
            <p className="text-sm mt-1">No blocked time from interpreters sharing your languages.</p>
          </div>
        ) : (
          <div>
            {/* All-day section */}
            {interpretersToday.some((it) => it.allDayBlocks.length > 0) && (
              <div className="border-b">
                <div className="px-4 py-1.5 text-[10px] font-medium text-muted-foreground bg-muted/10">ALL DAY</div>
                <div className="px-4 py-2 space-y-1.5">
                  {interpretersToday
                    .filter((it) => it.allDayBlocks.length > 0)
                    .map((it) => (
                      <div key={it.interpId} className="flex items-center gap-2">
                        <div className={cn("rounded px-2 py-1 text-xs border flex items-center gap-1.5", colorMap.get(it.interpId))}>
                          {it.allDayBlocks.some((b) => b.is_recurring) && <Repeat className="h-3 w-3" />}
                          <span className="font-medium">{it.interp.name}</span>
                          <span className="opacity-60">— Unavailable all day</span>
                        </div>
                        <div className="flex gap-0.5">
                          {it.interp.languages.map((l) => (
                            <span key={l.id} className="text-[10px] bg-muted rounded px-1 text-muted-foreground">{l.name}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Timed grid */}
            {interpretersToday.some((it) => it.timedBlocks.length > 0) && (
              <div className="relative">
                {HOURS.map((hour) => (
                  <div key={hour} className="flex border-b h-12">
                    <div className="w-14 shrink-0 text-[10px] text-muted-foreground text-right pr-2 -mt-1.5">
                      {hour === 12 ? "12pm" : hour > 12 ? `${hour - 12}pm` : `${hour}am`}
                    </div>
                    <div className="flex-1 relative border-l">
                      {interpretersToday
                        .filter((it) => it.timedBlocks.length > 0)
                        .map((it, idx) => {
                          return it.timedBlocks.map((b) => {
                            const startH = timeToHour(b.start_time);
                            const endH = timeToHour(b.end_time);
                            if (!(Math.floor(startH) === hour || (startH < HOUR_START && hour === HOUR_START))) return null;
                            const topOffset = (Math.max(startH, HOUR_START) - hour) * 48;
                            const height = (Math.min(endH, HOUR_END) - Math.max(startH, HOUR_START)) * 48;
                            const leftPct = idx * (100 / Math.max(interpretersToday.filter((x) => x.timedBlocks.length > 0).length, 1));
                            const widthPct = 100 / Math.max(interpretersToday.filter((x) => x.timedBlocks.length > 0).length, 1);

                            return (
                              <Tooltip key={b.id}>
                                <TooltipTrigger asChild>
                                  <div
                                    className={cn(
                                      "absolute rounded border px-1.5 py-0.5 text-[11px] overflow-hidden cursor-default z-10",
                                      colorMap.get(it.interpId),
                                      b.is_recurring && "border-dashed",
                                    )}
                                    style={{
                                      top: `${topOffset}px`,
                                      height: `${Math.max(height, 24)}px`,
                                      left: `${leftPct}%`,
                                      width: `calc(${widthPct}% - 4px)`,
                                    }}
                                  >
                                    <div className="truncate font-medium flex items-center gap-0.5">
                                      {b.is_recurring && <Repeat className="h-2.5 w-2.5 shrink-0" />}
                                      {it.interp.name}
                                    </div>
                                    <div className="truncate opacity-75">{formatTimeRange(b.start_time, b.end_time)}</div>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-medium">{it.interp.name} — Unavailable</p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatTimeRange(b.start_time, b.end_time)}
                                    {b.is_recurring ? " (weekly)" : ""}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            );
                          });
                        })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ──────── Header label ────────
  const headerLabel = view === "month"
    ? format(currentDate, "MMMM yyyy")
    : view === "week"
      ? `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), "MMM d")} – ${format(addDays(startOfWeek(currentDate, { weekStartsOn: 1 }), 6), "MMM d, yyyy")}`
      : format(currentDate, "EEEE, MMMM d, yyyy");

  if (myLanguages.length === 0 && !isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Add your languages to see colleague availability.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarDays className="h-5 w-5" />
              Team Calendar
            </CardTitle>

            {/* View toggle */}
            <div className="flex rounded-lg border bg-muted/50 p-0.5">
              {(["day", "week", "month"] as ViewMode[]).map((v) => (
                <Button
                  key={v}
                  variant={view === v ? "default" : "ghost"}
                  size="sm"
                  className={cn("h-7 text-xs px-3 capitalize", view !== v && "hover:bg-background")}
                  onClick={() => setView(v)}
                >
                  {v}
                </Button>
              ))}
            </div>
          </div>

          {/* Language filter pills */}
          <div className="flex flex-wrap gap-1.5 pt-2">
            {myLanguages.map((lang) => (
              <Badge
                key={lang.language_id}
                variant={selectedLanguages.has(lang.language_id) ? "default" : "outline"}
                className={cn(
                  "cursor-pointer select-none transition-colors",
                  selectedLanguages.has(lang.language_id)
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "hover:bg-muted"
                )}
                onClick={() => toggleLanguage(lang.language_id)}
              >
                {lang.name}
              </Badge>
            ))}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Navigation */}
          <div className="flex items-center justify-between px-4 pb-2">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">{headerLabel}</span>
              <Button variant="outline" size="sm" className="h-6 text-xs" onClick={goToday}>Today</Button>
            </div>
            <Button variant="ghost" size="icon" onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Loading team availability…</div>
          ) : (
            <>
              {view === "month" && renderMonthView()}
              {view === "week" && renderWeekView()}
              {view === "day" && renderDayView()}
            </>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
