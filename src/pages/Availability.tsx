import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoData } from "@/contexts/DemoDataContext";
import { DEMO_AGENCY_ID } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Clock, CalendarDays, Repeat, Ban, Palmtree, Stethoscope, CalendarOff, Users } from "lucide-react";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";
import { useAdaptedQuery, useAdaptedMutation } from "@/lib/data-adapter";
import SharedAvailabilityCalendar from "@/components/availability/SharedAvailabilityCalendar";
import TeamAvailabilityCalendar from "@/components/availability/TeamAvailabilityCalendar";
import { useTeamAvailability } from "@/hooks/useTeamAvailability";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { List, CalendarDays as CalendarViewIcon } from "lucide-react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type BlockMode = "single" | "range" | "recurring";

export default function Availability() {
  const { user, profile } = useAuth();
  const { state, addItem, deleteItem, genId } = useDemoData();
  const [open, setOpen] = useState(false);
  const [teamSubView, setTeamSubView] = useState<string>("calendar");

  const [mode, setMode] = useState<BlockMode>("single");
  const [isAllDay, setIsAllDay] = useState(true);
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [singleDate, setSingleDate] = useState<Date | undefined>(new Date());
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(),
    to: addDays(new Date(), 6),
  });
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setMode("single");
    setIsAllDay(true);
    setDayOfWeek("1");
    setStartTime("09:00");
    setEndTime("17:00");
    setSingleDate(new Date());
    setDateRange({ from: new Date(), to: addDays(new Date(), 6) });
    setNotes("");
  };

  const { data: slots = [], isLoading } = useAdaptedQuery<any[]>({
    queryKey: ["interpreter-availability", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interpreter_availability")
        .select("*")
        .eq("interpreter_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    demoFn: () => state.availability.filter((s: any) => s.interpreter_id === user?.id),
    enabled: !!user,
  });

  const addBlock = useAdaptedMutation<void>({
    mutationFn: async () => {
      const agencyId = profile!.agency_id!;
      const base = {
        interpreter_id: user!.id,
        agency_id: agencyId,
        notes: notes || null,
        is_all_day: isAllDay,
      };

      if (mode === "recurring") {
        const { error } = await supabase.from("interpreter_availability").insert({
          ...base, is_recurring: true, day_of_week: parseInt(dayOfWeek),
          start_time: isAllDay ? "00:00" : startTime, end_time: isAllDay ? "23:59" : endTime,
          specific_date: null, end_date: null,
        });
        if (error) throw error;
      } else if (mode === "single") {
        if (!singleDate) throw new Error("Please select a date");
        const { error } = await supabase.from("interpreter_availability").insert({
          ...base, is_recurring: false, day_of_week: null,
          start_time: isAllDay ? "00:00" : startTime, end_time: isAllDay ? "23:59" : endTime,
          specific_date: format(singleDate, "yyyy-MM-dd"), end_date: null,
        });
        if (error) throw error;
      } else {
        if (!dateRange?.from || !dateRange?.to) throw new Error("Please select start and end dates");
        const { error } = await supabase.from("interpreter_availability").insert({
          ...base, is_recurring: false, day_of_week: null,
          start_time: isAllDay ? "00:00" : startTime, end_time: isAllDay ? "23:59" : endTime,
          specific_date: format(dateRange.from, "yyyy-MM-dd"), end_date: format(dateRange.to, "yyyy-MM-dd"),
        });
        if (error) throw error;
      }
    },
    demoFn: () => {
      const base = {
        interpreter_id: user!.id,
        agency_id: DEMO_AGENCY_ID,
        notes: notes || null,
        is_all_day: isAllDay,
      };

      if (mode === "recurring") {
        addItem("availability", {
          id: genId("demo-avail"), created_at: new Date().toISOString(), ...base,
          is_recurring: true, day_of_week: parseInt(dayOfWeek),
          start_time: isAllDay ? "00:00" : startTime, end_time: isAllDay ? "23:59" : endTime,
          specific_date: null, end_date: null,
        });
      } else if (mode === "single") {
        if (!singleDate) throw new Error("Please select a date");
        addItem("availability", {
          id: genId("demo-avail"), created_at: new Date().toISOString(), ...base,
          is_recurring: false, day_of_week: null,
          start_time: isAllDay ? "00:00" : startTime, end_time: isAllDay ? "23:59" : endTime,
          specific_date: format(singleDate, "yyyy-MM-dd"), end_date: null,
        });
      } else {
        if (!dateRange?.from || !dateRange?.to) throw new Error("Please select start and end dates");
        addItem("availability", {
          id: genId("demo-avail"), created_at: new Date().toISOString(), ...base,
          is_recurring: false, day_of_week: null,
          start_time: isAllDay ? "00:00" : startTime, end_time: isAllDay ? "23:59" : endTime,
          specific_date: format(dateRange.from, "yyyy-MM-dd"), end_date: format(dateRange.to, "yyyy-MM-dd"),
        });
      }
    },
    invalidateKeys: [["interpreter-availability"]],
    successMessage: "Unavailable time blocked",
    onSuccess: () => { setOpen(false); resetForm(); },
  });

  const deleteSlot = useAdaptedMutation<string>({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("interpreter_availability").delete().eq("id", id);
      if (error) throw error;
    },
    demoFn: (id: string) => { deleteItem("availability", id); },
    invalidateKeys: [["interpreter-availability"]],
    successMessage: "Block removed",
  });

  const recurring = slots.filter((s: any) => s.is_recurring);
  const oneTime = slots.filter((s: any) => !s.is_recurring && !s.end_date);
  const ranges = slots.filter((s: any) => !s.is_recurring && s.end_date);

  const formatTimeRange = (s: any) => {
    if (s.is_all_day) return "All day";
    return `${s.start_time?.slice(0, 5)} – ${s.end_time?.slice(0, 5)}`;
  };

  const quickBlocks = [
    {
      label: "Block today", icon: CalendarOff,
      action: () => { setMode("single"); setIsAllDay(true); setSingleDate(new Date()); setNotes(""); setOpen(true); },
    },
    {
      label: "Vacation / time off", icon: Palmtree,
      action: () => { setMode("range"); setIsAllDay(true); setDateRange({ from: new Date(), to: addDays(new Date(), 6) }); setNotes("Vacation"); setOpen(true); },
    },
    {
      label: "Weekly commitment", icon: Repeat,
      action: () => { setMode("recurring"); setIsAllDay(false); setStartTime("12:00"); setEndTime("16:00"); setNotes(""); setOpen(true); },
    },
    {
      label: "Appointment / errand", icon: Stethoscope,
      action: () => { setMode("single"); setIsAllDay(false); setSingleDate(new Date()); setStartTime("10:00"); setEndTime("12:00"); setNotes("Doctor appointment"); setOpen(true); },
    },
  ];

  const TeamAvailabilityCalendarWrapper = () => {
    const teamData = useTeamAvailability();
    return (
      <TeamAvailabilityCalendar
        interpreterMap={teamData.interpreterMap}
        myLanguages={teamData.myLanguages}
        selectedLanguages={teamData.selectedLanguages}
        toggleLanguage={teamData.toggleLanguage}
        isLoading={teamData.isLoading}
      />
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Availability</h1>
          <p className="text-muted-foreground">Manage your unavailable time and see team coverage</p>
        </div>
      </div>

      <Tabs defaultValue="my-availability" className="space-y-4">
        <TabsList>
          <TabsTrigger value="my-availability" className="gap-1.5">
            <CalendarOff className="h-4 w-4" />
            Your Availability
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5">
            <Users className="h-4 w-4" />
            Team Availability
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my-availability" className="space-y-6">
          <div className="flex justify-end">
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
              <DialogTrigger asChild>
                <Button><Ban className="mr-2 h-4 w-4" />Block Time</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Block Unavailable Time</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: "single" as BlockMode, label: "Single Day", icon: CalendarDays },
                      { value: "range" as BlockMode, label: "Date Range", icon: Palmtree },
                      { value: "recurring" as BlockMode, label: "Weekly", icon: Repeat },
                    ]).map((m) => (
                      <Button
                        key={m.value}
                        type="button"
                        variant={mode === m.value ? "default" : "outline"}
                        className="flex flex-col h-auto py-3 gap-1"
                        onClick={() => setMode(m.value)}
                      >
                        <m.icon className="h-4 w-4" />
                        <span className="text-xs">{m.label}</span>
                      </Button>
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <Switch checked={isAllDay} onCheckedChange={setIsAllDay} id="allday" />
                    <Label htmlFor="allday">All day</Label>
                  </div>

                  {!isAllDay && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label>From</Label>
                        <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Until</Label>
                        <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                      </div>
                    </div>
                  )}

                  {mode === "recurring" && (
                    <div className="space-y-1">
                      <Label>Every</Label>
                      <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {mode === "single" && (
                    <div className="space-y-1">
                      <Label>Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !singleDate && "text-muted-foreground")}>
                            <CalendarDays className="mr-2 h-4 w-4" />
                            {singleDate ? format(singleDate, "PPP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar mode="single" selected={singleDate} onSelect={setSingleDate} />
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}

                  {mode === "range" && (
                    <div className="space-y-1">
                      <Label>Date range</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateRange?.from && "text-muted-foreground")}>
                            <CalendarDays className="mr-2 h-4 w-4" />
                            {dateRange?.from ? (
                              dateRange.to ? (
                                `${format(dateRange.from, "MMM d")} – ${format(dateRange.to, "MMM d, yyyy")}`
                              ) : format(dateRange.from, "PPP")
                            ) : "Pick dates"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={2} />
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label>Reason (optional)</Label>
                    <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Vacation, Doctor visit, class" />
                  </div>

                  <Button className="w-full" onClick={() => addBlock.mutate()} disabled={addBlock.isPending}>
                    {addBlock.isPending ? "Saving..." : "Block This Time"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {quickBlocks.map((q) => (
              <Card key={q.label} className="cursor-pointer hover:border-primary/50 transition-colors h-full" onClick={q.action}>
                <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-2 h-full">
                  <div className="rounded-lg bg-destructive/10 p-2">
                    <q.icon className="h-5 w-5 text-destructive" />
                  </div>
                  <span className="text-sm font-medium leading-tight">{q.label}</span>
                </CardContent>
              </Card>
            ))}
          </div>

          {ranges.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Palmtree className="h-5 w-5" />Time Off / Vacations</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {ranges.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Badge variant="destructive" className="font-normal">
                          {format(new Date(s.specific_date + "T00:00:00"), "MMM d")} – {format(new Date(s.end_date + "T00:00:00"), "MMM d, yyyy")}
                        </Badge>
                        <span className="text-sm text-muted-foreground">{formatTimeRange(s)}</span>
                        {s.notes && <span className="text-xs text-muted-foreground italic">({s.notes})</span>}
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => deleteSlot.mutate(s.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Repeat className="h-5 w-5" />Weekly Blocks</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-muted-foreground text-sm">Loading...</p>
              ) : recurring.length === 0 ? (
                <p className="text-muted-foreground text-sm">No recurring blocks — add one for regular commitments</p>
              ) : (
                <div className="space-y-2">
                  {recurring.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary">{DAYS[s.day_of_week]}</Badge>
                        <span className="text-sm font-medium flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          {formatTimeRange(s)}
                        </span>
                        {s.notes && <span className="text-xs text-muted-foreground italic">({s.notes})</span>}
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => deleteSlot.mutate(s.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><CalendarOff className="h-5 w-5" />Single-Day Blocks</CardTitle></CardHeader>
            <CardContent>
              {oneTime.length === 0 ? (
                <p className="text-muted-foreground text-sm">No single-day blocks</p>
              ) : (
                <div className="space-y-2">
                  {oneTime.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-3">
                        <Badge variant="destructive" className="font-normal">
                          {s.specific_date ? format(new Date(s.specific_date + "T00:00:00"), "EEE, MMM d, yyyy") : "—"}
                        </Badge>
                        <span className="text-sm font-medium flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          {formatTimeRange(s)}
                        </span>
                        {s.notes && <span className="text-xs text-muted-foreground italic">({s.notes})</span>}
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => deleteSlot.mutate(s.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="space-y-4">
          <div className="flex justify-end">
            <ToggleGroup type="single" value={teamSubView} onValueChange={(v) => v && setTeamSubView(v)} size="sm">
              <ToggleGroupItem value="calendar" aria-label="Calendar view" className="gap-1.5 text-xs">
                <CalendarViewIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Calendar</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="List view" className="gap-1.5 text-xs">
                <List className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">List</span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          {teamSubView === "calendar" ? (
            <TeamAvailabilityCalendarWrapper />
          ) : (
            <SharedAvailabilityCalendar />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
