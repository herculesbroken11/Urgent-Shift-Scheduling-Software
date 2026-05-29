import { useState } from "react";
import { useAgencySettings } from "@/hooks/useAgencySettings";
import { STATUS_LABELS } from "@/lib/status-labels";
import { usePaginatedAppointments } from "@/hooks/usePaginatedAppointments";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, Repeat } from "lucide-react";
import { statusBadgeColors as statusColors } from "@/lib/status-colors";
import { useAgencyTimezone } from "@/hooks/useAgencyTimezone";
import { formatDateTimeInTz } from "@/lib/agency-timezone";

export function AppointmentList() {
  const { getVisibleStatuses } = useAgencySettings();
  const visibleStatuses = getVisibleStatuses();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const agencyTz = useAgencyTimezone();
  const { data: result } = usePaginatedAppointments({
    status: statusFilter,
    search: search || undefined,
    pageSize: 100,
  });
  const appointments = result?.data ?? [];
  const isLoading = !result;

  const filtered = appointments;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 flex-1">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search appointments..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {visibleStatuses.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s] ?? s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date & Time</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Interpreter</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No appointments found</TableCell></TableRow>
              ) : filtered.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap">
                    {a.scheduled_start ? (
                      <div className="flex items-center gap-1.5">
                        <div>
                          <div className="font-medium">{formatDateTimeInTz(a.scheduled_start, agencyTz, { dateOnly: true })}</div>
                          <div className="text-xs text-muted-foreground" title={(a.actual_start || a.actual_end) ? "* indicates actual time recorded by interpreter" : undefined}>
                            {formatDateTimeInTz(a.actual_start || a.scheduled_start, agencyTz, { timeOnly: true })}{a.actual_start ? "*" : ""}
                            {(a.actual_end || a.scheduled_end) && ` – ${formatDateTimeInTz(a.actual_end || a.scheduled_end, agencyTz, { timeOnly: true })}${a.actual_end ? "*" : ""}`}
                          </div>
                        </div>
                        {(a.parent_recurring_id || a.recurrence_rule) && (
                          <Repeat className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">TBD</span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{a.title || a.languages?.name || "Appointment"}</TableCell>
                  <TableCell>{a.customers?.name ?? "—"}</TableCell>
                  <TableCell>{a.languages?.name ?? "—"}</TableCell>
                  <TableCell>
                    {a.interpreter ? `${a.interpreter.first_name} ${a.interpreter.last_name}` : <span className="text-muted-foreground">Unassigned</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColors[a.status] ?? ""}>
                      {a.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}