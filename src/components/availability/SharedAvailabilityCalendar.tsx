import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoData } from "@/contexts/DemoDataContext";
import { supabase } from "@/integrations/supabase/client";
import { useAdaptedQuery } from "@/lib/data-adapter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Users, Repeat } from "lucide-react";
import { format, addDays, startOfWeek, isSameDay, isWithinInterval, parseISO, eachDayOfInterval } from "date-fns";
import { cn } from "@/lib/utils";

interface InterpreterBlock {
  id: string;
  interpreter_id: string;
  first_name: string;
  last_name: string;
  languages: { id: string; name: string }[];
  is_recurring: boolean;
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  specific_date: string | null;
  end_date: string | null;
  is_all_day: boolean;
}

function formatShortTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "p" : "a";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${ampm}` : `${hour}:${String(m).padStart(2, "0")}${ampm}`;
}

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

export default function SharedAvailabilityCalendar() {
  const { user } = useAuth();
  const { state } = useDemoData();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  const days = useMemo(() => eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) }), [weekStart]);

  // Fetch current user's languages
  const { data: myLanguages = [] } = useAdaptedQuery<{ language_id: string; name: string }[]>({
    queryKey: ["my-languages-for-shared", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interpreter_languages")
        .select("language_id, languages(name)")
        .eq("interpreter_id", user!.id);
      if (error) throw error;
      return (data || []).map((d: any) => ({ language_id: d.language_id, name: d.languages?.name || "" }));
    },
    demoFn: () => {
      return state.interpreterLanguages
        .filter((il: any) => il.interpreter_id === user?.id)
        .map((il: any) => {
          const lang = state.languages.find((l: any) => l.id === il.language_id);
          return { language_id: il.language_id, name: lang?.name || "" };
        });
    },
    enabled: !!user,
  });

  // Initialize language selection once data loads
  if (myLanguages.length > 0 && !initialized) {
    setSelectedLanguages(new Set(myLanguages.map((l) => l.language_id)));
    setInitialized(true);
  }

  // Fetch colleague availability with language filtering
  const { data: colleagues = [], isLoading } = useAdaptedQuery<InterpreterBlock[]>({
    queryKey: ["shared-availability", user?.id, Array.from(selectedLanguages).sort().join(",")],
    queryFn: async () => {
      if (selectedLanguages.size === 0) return [];
      // Get interpreters who share languages
      const { data: sharedInterps, error: interpErr } = await supabase
        .from("interpreter_languages")
        .select("interpreter_id, language_id, languages(name)")
        .in("language_id", Array.from(selectedLanguages))
        .neq("interpreter_id", user!.id);
      if (interpErr) throw interpErr;
      if (!sharedInterps?.length) return [];

      const interpIds = [...new Set(sharedInterps.map((i: any) => i.interpreter_id))];

      // Get profiles for these interpreters
      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", interpIds);
      if (profErr) throw profErr;

      // Get their availability blocks — NEVER select notes
      const { data: blocks, error: blockErr } = await supabase
        .from("interpreter_availability")
        .select("id, interpreter_id, is_recurring, day_of_week, start_time, end_time, specific_date, end_date, is_all_day")
        .in("interpreter_id", interpIds);
      if (blockErr) throw blockErr;

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      const langMap = new Map<string, { id: string; name: string }[]>();
      (sharedInterps || []).forEach((si: any) => {
        const existing = langMap.get(si.interpreter_id) || [];
        if (!existing.find((l) => l.id === si.language_id)) {
          existing.push({ id: si.language_id, name: si.languages?.name || "" });
        }
        langMap.set(si.interpreter_id, existing);
      });

      return (blocks || []).map((b: any) => {
        const profile = profileMap.get(b.interpreter_id);
        return {
          ...b,
          first_name: profile?.first_name || "Unknown",
          last_name: profile?.last_name || "",
          languages: langMap.get(b.interpreter_id) || [],
        };
      });
    },
    demoFn: () => {
      if (selectedLanguages.size === 0) return [];
      const myId = user?.id;
      // Find interpreters sharing selected languages
      const sharedInterpIds = new Set<string>();
      const interpLangMap = new Map<string, { id: string; name: string }[]>();

      state.interpreterLanguages.forEach((il: any) => {
        if (il.interpreter_id !== myId && selectedLanguages.has(il.language_id)) {
          sharedInterpIds.add(il.interpreter_id);
          const existing = interpLangMap.get(il.interpreter_id) || [];
          const lang = state.languages.find((l: any) => l.id === il.language_id);
          if (lang && !existing.find((l) => l.id === il.language_id)) {
            existing.push({ id: il.language_id, name: lang.name });
          }
          interpLangMap.set(il.interpreter_id, existing);
        }
      });

      return state.availability
        .filter((a: any) => sharedInterpIds.has(a.interpreter_id))
        .map((a: any) => {
          const interp = state.interpreters.find((i: any) => i.id === a.interpreter_id);
          return {
            id: a.id,
            interpreter_id: a.interpreter_id,
            first_name: interp?.first_name || "Unknown",
            last_name: interp?.last_name || "",
            languages: interpLangMap.get(a.interpreter_id) || [],
            is_recurring: a.is_recurring,
            day_of_week: a.day_of_week,
            start_time: a.start_time,
            end_time: a.end_time,
            specific_date: a.specific_date,
            end_date: a.end_date,
            is_all_day: a.is_all_day ?? false,
          };
        });
    },
    enabled: !!user && initialized,
  });

  // Group blocks by interpreter
  const interpreterMap = useMemo(() => {
    const map = new Map<string, { name: string; languages: { id: string; name: string }[]; blocks: InterpreterBlock[] }>();
    colleagues.forEach((b) => {
      const key = b.interpreter_id;
      if (!map.has(key)) {
        map.set(key, {
          name: `${b.first_name} ${b.last_name.charAt(0)}.`,
          languages: b.languages,
          blocks: [],
        });
      }
      map.get(key)!.blocks.push(b);
    });
    return map;
  }, [colleagues]);

  // Coverage: count unavailable interpreters per day
  const coverageCounts = useMemo(() => {
    const totalInterpreters = interpreterMap.size;
    return days.map((day) => {
      const unavailable = new Set<string>();
      interpreterMap.forEach((interp, interpId) => {
        if (interp.blocks.some((b) => isBlockOnDay(b, day))) {
          unavailable.add(interpId);
        }
      });
      return { total: totalInterpreters, unavailable: unavailable.size };
    });
  }, [days, interpreterMap]);

  const toggleLanguage = (langId: string) => {
    setSelectedLanguages((prev) => {
      const next = new Set(prev);
      if (next.has(langId)) next.delete(langId);
      else next.add(langId);
      return next;
    });
  };

  const goThisWeek = () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const goNextWeek = () => setWeekStart(startOfWeek(addDays(new Date(), 7), { weekStartsOn: 1 }));

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
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            Team Availability
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={goThisWeek}>This Week</Button>
            <Button variant="outline" size="sm" onClick={goNextWeek}>Next Week</Button>
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
          <Button variant="ghost" size="icon" onClick={() => setWeekStart((prev) => addDays(prev, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-muted-foreground">
            {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
          </span>
          <Button variant="ghost" size="icon" onClick={() => setWeekStart((prev) => addDays(prev, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-muted-foreground text-sm">Loading team availability…</div>
        ) : interpreterMap.size === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            No colleagues share your selected languages, or none have blocked time.
          </div>
        ) : (
          <TooltipProvider delayDuration={200}>
            {/* Desktop wallchart */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-t">
                    <th className="text-left p-2 pl-4 w-40 border-r text-muted-foreground font-medium">Interpreter</th>
                    {days.map((day, i) => (
                      <th key={i} className="p-2 text-center border-r last:border-r-0 min-w-[90px]">
                        <div className={cn("text-xs font-medium", isSameDay(day, new Date()) && "text-primary")}>
                          {format(day, "EEE")}
                        </div>
                        <div className={cn("text-sm", isSameDay(day, new Date()) && "text-primary font-bold")}>
                          {format(day, "MMM d")}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from(interpreterMap.entries()).map(([interpId, interp]) => (
                    <tr key={interpId} className="border-t">
                      <td className="p-2 pl-4 border-r align-top">
                        <div className="font-medium text-sm">{interp.name}</div>
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {interp.languages.map((l) => (
                            <span key={l.id} className="text-[10px] text-muted-foreground bg-muted rounded px-1">
                              {l.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      {days.map((day, i) => {
                        const blocksOnDay = interp.blocks.filter((b) => isBlockOnDay(b, day));
                        if (blocksOnDay.length === 0) {
                          return <td key={i} className="p-1 border-r last:border-r-0" />;
                        }
                        return (
                          <td key={i} className="p-1 border-r last:border-r-0">
                            {blocksOnDay.map((b) => (
                              <Tooltip key={b.id}>
                                <TooltipTrigger asChild>
                                  <div
                                    className={cn(
                                      "rounded px-1.5 py-0.5 text-[11px] text-center mb-0.5 cursor-default",
                                      b.is_all_day
                                        ? "bg-destructive/15 text-destructive border border-destructive/20"
                                        : "bg-warning/15 text-warning-foreground border border-warning/20",
                                      b.is_recurring && "border-dashed"
                                    )}
                                  >
                                    {b.is_all_day ? (
                                      <span className="flex items-center justify-center gap-0.5">
                                        {b.is_recurring && <Repeat className="h-2.5 w-2.5" />}
                                        Off
                                      </span>
                                    ) : (
                                      <span className="flex items-center justify-center gap-0.5">
                                        {b.is_recurring && <Repeat className="h-2.5 w-2.5" />}
                                        {formatShortTime(b.start_time)}-{formatShortTime(b.end_time)}
                                      </span>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-medium">{interp.name} — Unavailable</p>
                                  <p className="text-xs text-muted-foreground">
                                    {b.is_all_day ? "All day" : `${b.start_time?.slice(0, 5)} – ${b.end_time?.slice(0, 5)}`}
                                    {b.is_recurring ? " (weekly)" : ""}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {/* Coverage row */}
                  <tr className="border-t bg-muted/30">
                    <td className="p-2 pl-4 border-r text-xs font-medium text-muted-foreground">Coverage</td>
                    {coverageCounts.map((c, i) => (
                      <td key={i} className="p-2 text-center border-r last:border-r-0">
                        {c.unavailable > 0 ? (
                          <span className={cn(
                            "text-xs font-medium",
                            c.unavailable >= c.total ? "text-destructive" : "text-warning"
                          )}>
                            {c.unavailable}/{c.total} off
                          </span>
                        ) : (
                          <span className="text-xs text-success">All available</span>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Mobile stacked view */}
            <div className="sm:hidden space-y-3 p-4">
              {days.map((day, i) => {
                const dayBlocks: { name: string; blocks: InterpreterBlock[] }[] = [];
                interpreterMap.forEach((interp) => {
                  const blocksOnDay = interp.blocks.filter((b) => isBlockOnDay(b, day));
                  if (blocksOnDay.length > 0) {
                    dayBlocks.push({ name: interp.name, blocks: blocksOnDay });
                  }
                });

                return (
                  <div key={i} className="rounded-lg border p-3">
                    <div className={cn(
                      "text-sm font-medium mb-2",
                      isSameDay(day, new Date()) && "text-primary"
                    )}>
                      {format(day, "EEEE, MMM d")}
                      {coverageCounts[i].unavailable > 0 && (
                        <span className="ml-2 text-xs text-destructive">
                          ({coverageCounts[i].unavailable} off)
                        </span>
                      )}
                    </div>
                    {dayBlocks.length === 0 ? (
                      <p className="text-xs text-muted-foreground">All colleagues available</p>
                    ) : (
                      <div className="space-y-1">
                        {dayBlocks.map((db, j) => (
                          <div key={j} className="flex items-center gap-2 text-xs">
                            <span className="font-medium">{db.name}</span>
                            <span className="text-muted-foreground">
                              {db.blocks.map((b) =>
                                b.is_all_day ? "All day" : `${formatShortTime(b.start_time)}-${formatShortTime(b.end_time)}`
                              ).join(", ")}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}
