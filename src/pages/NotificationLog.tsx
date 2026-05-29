import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoData } from "@/contexts/DemoDataContext";
import { useAdaptedQuery } from "@/lib/data-adapter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, formatDistanceToNow } from "date-fns";
import { Mail, MessageSquare, CalendarIcon, X, Filter, AlertCircle, User, RefreshCw, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgencyTimezone } from "@/hooks/useAgencyTimezone";
import { formatDateTimeInTz } from "@/lib/agency-timezone";

const REMINDER_TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "reminder_24h", label: "24-hour reminder" },
  { value: "reminder_2h", label: "2-hour reminder" },
  { value: "reminder_15m", label: "15-minute reminder" },
  { value: "none", label: "Non-reminder only" },
];

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  reminder_24h: "24h Reminder",
  reminder_2h: "2h Reminder",
  reminder_15m: "15m Reminder",
  interpreter_confirmed: "Interpreter Confirmed",
  interpreter_rejected: "Interpreter Rejected",
  reassignment_needed: "Reassignment Needed",
  location_changed: "Location Changed",
  interpreter_no_show_self_report: "Interpreter No-Show (Self)",
  client_no_show: "Client No-Show",
  late_cancel_auto_detected: "Late Cancel (Auto)",
};

const CHANNEL_OPTIONS = [
  { value: "all", label: "All channels" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "sent", label: "Sent" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

const PAGE_SIZE = 50;

export default function NotificationLog() {
  const { profile } = useAuth();
  const { state } = useDemoData();
  const agencyTz = useAgencyTimezone();

  // Filter state
  const [reminderType, setReminderType] = useState("all");
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [appointmentIdSearch, setAppointmentIdSearch] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  // Committed filter state (applied on search / filter change)
  const [committed, setCommitted] = useState({
    reminderType: "all",
    channel: "all",
    status: "all",
    recipientSearch: "",
    appointmentIdSearch: "",
    dateFrom: undefined as Date | undefined,
    dateTo: undefined as Date | undefined,
  });

  const [page, setPage] = useState(0);

  const applyFilters = () => {
    setPage(0);
    setCommitted({
      reminderType,
      channel,
      status,
      recipientSearch,
      appointmentIdSearch,
      dateFrom,
      dateTo,
    });
  };

  const hasActiveFilters =
    committed.reminderType !== "all" ||
    committed.channel !== "all" ||
    committed.status !== "all" ||
    committed.recipientSearch ||
    committed.appointmentIdSearch ||
    committed.dateFrom ||
    committed.dateTo;

  const clearFilters = () => {
    setReminderType("all");
    setChannel("all");
    setStatus("all");
    setRecipientSearch("");
    setAppointmentIdSearch("");
    setDateFrom(undefined);
    setDateTo(undefined);
    setPage(0);
    setCommitted({
      reminderType: "all",
      channel: "all",
      status: "all",
      recipientSearch: "",
      appointmentIdSearch: "",
      dateFrom: undefined,
      dateTo: undefined,
    });
  };

  const { data, isFetching } = useAdaptedQuery<{ rows: any[]; totalCount: number }>({
    queryKey: [
      "notification-log",
      profile?.agency_id,
      committed.reminderType,
      committed.channel,
      committed.status,
      committed.recipientSearch,
      committed.appointmentIdSearch,
      committed.dateFrom?.toISOString(),
      committed.dateTo?.toISOString(),
      page,
    ],
    queryFn: async () => {
      if (!profile?.agency_id) return { rows: [], totalCount: 0 };

      // Build count query and data query in parallel
      let baseBuilder = () => {
        let q = supabase
          .from("notification_log")
          .select("*", { count: "exact", head: true })
          .eq("agency_id", profile.agency_id!);

        if (committed.channel !== "all") q = q.eq("channel", committed.channel);
        if (committed.status !== "all") q = q.eq("status", committed.status);
        if (committed.reminderType === "none") q = q.is("reminder_type", null);
        else if (committed.reminderType !== "all") q = q.eq("reminder_type", committed.reminderType);
        if (committed.recipientSearch) q = q.ilike("recipient", `%${committed.recipientSearch}%`);
        if (committed.appointmentIdSearch) q = q.eq("appointment_id", committed.appointmentIdSearch);
        if (committed.dateFrom) q = q.gte("created_at", committed.dateFrom.toISOString());
        if (committed.dateTo) {
          const end = new Date(committed.dateTo);
          end.setHours(23, 59, 59, 999);
          q = q.lte("created_at", end.toISOString());
        }
        return q;
      };

      let dataQuery = supabase
        .from("notification_log")
        .select(`
          id, channel, recipient, subject, body, status, sent_at, created_at,
          reminder_type, related_entity_type, appointment_id, error_message,
          retry_count, last_retry_at, next_retry_at, provider_message_id,
          appointments!notification_log_appointment_id_fkey (
            interpreter:profiles!appointments_interpreter_id_fkey ( first_name, last_name )
          )
        `)
        .eq("agency_id", profile.agency_id!)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      // Apply same filters to data query
      if (committed.channel !== "all") dataQuery = dataQuery.eq("channel", committed.channel);
      if (committed.status !== "all") dataQuery = dataQuery.eq("status", committed.status);
      if (committed.reminderType === "none") dataQuery = dataQuery.is("reminder_type", null);
      else if (committed.reminderType !== "all") dataQuery = dataQuery.eq("reminder_type", committed.reminderType);
      if (committed.recipientSearch) dataQuery = dataQuery.ilike("recipient", `%${committed.recipientSearch}%`);
      if (committed.appointmentIdSearch) dataQuery = dataQuery.eq("appointment_id", committed.appointmentIdSearch);
      if (committed.dateFrom) dataQuery = dataQuery.gte("created_at", committed.dateFrom.toISOString());
      if (committed.dateTo) {
        const end = new Date(committed.dateTo);
        end.setHours(23, 59, 59, 999);
        dataQuery = dataQuery.lte("created_at", end.toISOString());
      }

      const [countResult, dataResult] = await Promise.all([baseBuilder(), dataQuery]);

      if (dataResult.error) throw dataResult.error;

      const rows = (dataResult.data || []).map((row: any) => ({
        ...row,
        interpreter_name: row.appointments?.interpreter
          ? `${row.appointments.interpreter.first_name || ""} ${row.appointments.interpreter.last_name || ""}`.trim()
          : null,
      }));

      return { rows, totalCount: countResult.count ?? 0 };
    },
    demoFn: () => ({ rows: state.notificationLog ?? [], totalCount: (state.notificationLog ?? []).length }),
    enabled: !!profile?.agency_id,
  });

  const logs = data?.rows ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const statusColor: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    sent: "default",
    pending: "secondary",
    failed: "destructive",
    cancelled: "outline",
  };

  const reminderLabel = (type: string | null) => {
    if (!type) return null;
    return NOTIFICATION_TYPE_LABELS[type] || type;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notification Log</h1>
          <p className="text-muted-foreground">Audit trail of all SMS and email notifications sent</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters</span>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto h-7 text-xs gap-1">
                <X className="h-3 w-3" /> Clear all
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Select value={reminderType} onValueChange={(v) => { setReminderType(v); }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Reminder type" />
              </SelectTrigger>
              <SelectContent>
                {REMINDER_TYPE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={channel} onValueChange={(v) => { setChannel(v); }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={(v) => { setStatus(v); }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              placeholder="Search recipient…"
              value={recipientSearch}
              onChange={e => setRecipientSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && applyFilters()}
              className="h-9 text-sm"
            />

            <Input
              placeholder="Appointment ID…"
              value={appointmentIdSearch}
              onChange={e => setAppointmentIdSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && applyFilters()}
              className="h-9 text-sm"
            />

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-9 text-sm justify-start font-normal", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {dateFrom ? format(dateFrom, "MMM d, yyyy") : "From date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-9 text-sm justify-start font-normal", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {dateTo ? format(dateTo, "MMM d, yyyy") : "To date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>

            <Button onClick={applyFilters} size="sm" className="h-9">
              Apply Filters
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {totalCount} total {totalCount === 1 ? "entry" : "entries"}{hasActiveFilters ? " matching filters" : ""}
          </p>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-30 bg-background">Channel</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Interpreter</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead className="hidden lg:table-cell">Subject / Preview</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Retries</TableHead>
                  <TableHead className="hidden xl:table-cell">Last Retry</TableHead>
                  <TableHead className="hidden xl:table-cell">Next Retry</TableHead>
                  <TableHead className="hidden sm:table-cell">Sent At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      {isFetching ? "Loading…" : hasActiveFilters ? "No notifications match your filters" : "No notifications sent yet"}
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log: any) => {
                    const isFailed = log.status === "failed";
                    const hasRetries = log.retry_count > 0;

                    return (
                      <TableRow key={log.id} className={cn(isFailed && "bg-destructive/5")}>
                        <TableCell className="sticky left-0 z-10 bg-card">
                          <Badge variant="outline" className="gap-1">
                            {log.channel === "sms" ? <MessageSquare className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                            {log.channel}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {log.reminder_type ? (
                            <Badge variant="secondary" className="text-xs">
                              {reminderLabel(log.reminder_type)}
                            </Badge>
                          ) : log.related_entity_type && NOTIFICATION_TYPE_LABELS[log.related_entity_type] ? (
                            <Badge variant="outline" className="text-xs">
                              {NOTIFICATION_TYPE_LABELS[log.related_entity_type]}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">{log.related_entity_type || "—"}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.interpreter_name ? (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground" />
                              {log.interpreter_name}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm max-w-[160px] truncate">{log.recipient}</TableCell>
                        <TableCell className="max-w-xs truncate hidden lg:table-cell">
                          {log.subject || log.body?.slice(0, 60)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Badge variant={statusColor[log.status] || "secondary"}>
                              {log.status}
                            </Badge>
                            {isFailed && log.error_message && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-5 w-5">
                                    <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80 text-xs" side="left">
                                  <p className="font-medium mb-1 text-destructive">Error Details</p>
                                  <p className="text-muted-foreground break-all">{log.error_message}</p>
                                  {log.provider_message_id && (
                                    <p className="mt-2 text-muted-foreground">
                                      <span className="font-medium text-foreground">Provider ID:</span>{" "}
                                      <span className="font-mono">{log.provider_message_id}</span>
                                    </p>
                                  )}
                                  {hasRetries && (
                                    <p className="mt-1 text-muted-foreground">
                                      <span className="font-medium text-foreground">Attempts:</span> {log.retry_count + 1}
                                    </p>
                                  )}
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="hidden md:table-cell">
                          {hasRetries ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant={isFailed ? "destructive" : "secondary"} className="gap-1 text-xs">
                                  <RefreshCw className="h-3 w-3" />
                                  {log.retry_count}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                {log.retry_count} retry attempt{log.retry_count > 1 ? "s" : ""}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell className="hidden xl:table-cell text-sm text-muted-foreground whitespace-nowrap">
                          {log.last_retry_at ? (
                            <Tooltip>
                              <TooltipTrigger className="cursor-default flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDistanceToNow(new Date(log.last_retry_at), { addSuffix: true })}
                              </TooltipTrigger>
                              <TooltipContent>
                                {formatDateTimeInTz(log.last_retry_at, agencyTz)}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-xs">—</span>
                          )}
                        </TableCell>

                        <TableCell className="hidden xl:table-cell text-sm whitespace-nowrap">
                          {log.next_retry_at && log.status !== "sent" ? (
                            <Tooltip>
                              <TooltipTrigger className="cursor-default flex items-center gap-1 text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {formatDistanceToNow(new Date(log.next_retry_at), { addSuffix: true })}
                              </TooltipTrigger>
                              <TooltipContent>
                                {formatDateTimeInTz(log.next_retry_at, agencyTz)}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell className="text-sm text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                          {log.sent_at ? formatDateTimeInTz(log.sent_at, agencyTz) : log.created_at ? formatDateTimeInTz(log.created_at, agencyTz) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TooltipProvider>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0 || isFetching}
                  onClick={() => setPage(p => p - 1)}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1 || isFetching}
                  onClick={() => setPage(p => p + 1)}
                  className="gap-1"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
