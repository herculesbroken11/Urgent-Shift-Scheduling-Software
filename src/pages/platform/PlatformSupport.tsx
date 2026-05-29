import { useState } from "react";
import { usePlatformAgencies, usePlatformAction, usePlatformAuditLog } from "@/hooks/usePlatformData";
import { useSupportSession } from "@/hooks/useSupportSession";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Headphones, X } from "lucide-react";
import { format } from "date-fns";

export default function PlatformSupport() {
  const { data: agencies = [] } = usePlatformAgencies();
  const { data: auditData } = usePlatformAuditLog(0, undefined, undefined);
  const action = usePlatformAction();
  const { activeSession, invalidate } = useSupportSession();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAgency, setSelectedAgency] = useState("");
  const [reason, setReason] = useState("");

  const supportEvents = (auditData?.data || []).filter((e: any) =>
    e.action.includes('support_session')
  );

  const startSession = () => {
    if (!selectedAgency || !reason.trim()) return;
    action.mutate(
      { action: 'support.start', agency_id: selectedAgency, reason },
      { onSuccess: () => invalidate() },
    );
    setDialogOpen(false);
    setSelectedAgency("");
    setReason("");
  };

  const endCurrentSession = () => {
    if (!activeSession) return;
    action.mutate(
      { action: 'support.end', session_id: activeSession.id },
      { onSuccess: () => invalidate() },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Support & Troubleshooting</h1>
        <div className="flex gap-2">
          {activeSession && (
            <Button variant="outline" onClick={endCurrentSession} disabled={action.isPending}>
              <X className="h-4 w-4 mr-2" /> End Active Session
            </Button>
          )}
          <Button onClick={() => setDialogOpen(true)} disabled={!!activeSession}>
            <Headphones className="h-4 w-4 mr-2" /> New Support Session
          </Button>
        </div>
      </div>

      {/* Active session card */}
      {activeSession && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Headphones className="h-8 w-8 text-amber-600" />
              <div className="flex-1">
                <p className="font-semibold text-foreground">
                  Active Support Session — {activeSession.agency_name}
                </p>
                <p className="text-sm text-muted-foreground mt-1">{activeSession.reason}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Started {format(new Date(activeSession.started_at), "MMM d, yyyy 'at' HH:mm")}
                </p>
              </div>
              <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/40">
                Agency Admin Access Granted
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-lg">Support Session History</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operator</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {supportEvents.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.actor_name}</TableCell>
                  <TableCell>
                    <Badge variant={e.action.includes('start') ? 'default' : 'secondary'}>
                      {e.action.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{e.target_type} {e.target_id?.slice(0, 8)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate" title={e.details?.reason || JSON.stringify(e.details)}>
                    {e.details?.reason || JSON.stringify(e.details).slice(0, 60)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(e.created_at), "MMM d, yyyy HH:mm")}
                  </TableCell>
                </TableRow>
              ))}
              {supportEvents.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No support sessions yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Start Support Session</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will grant you temporary <strong>agency admin</strong> access to the selected agency. All actions will be audit-logged.
            </p>
            <Select value={selectedAgency} onValueChange={setSelectedAgency}>
              <SelectTrigger><SelectValue placeholder="Select agency..." /></SelectTrigger>
              <SelectContent>
                {(agencies as any[]).map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for support session (required)..." rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={startSession} disabled={!selectedAgency || !reason.trim()}>Start Session</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
