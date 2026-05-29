import { useState, useEffect, useCallback, useMemo } from "react";
import { useAgencyInterpreters } from "@/hooks/useAgencyData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AddInterpreterDialog } from "@/components/interpreters/AddInterpreterDialog";
import { InviteUserDialog } from "@/components/invitations/InviteUserDialog";
import { BulkInviteDialog } from "@/components/invitations/BulkInviteDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAgencySettings } from "@/hooks/useAgencySettings";
import { useAllInterpreterRegions, useRegions, useInterpreterRegionMutations } from "@/hooks/useRegionsData";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  MapPin, Mail, Phone, StickyNote, RefreshCw, Clock, CheckCircle2, XCircle,
  Ban, Users, UserPlus2, Upload, ChevronLeft, ChevronRight, UserX, UserCheck, Archive, Eye, ShieldCheck
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow, isPast } from "date-fns";
import { Input } from "@/components/ui/input";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PAGE_SIZE = 25;

export default function Interpreters() {
  const [showInactive, setShowInactive] = useState(false);
  const { data: interpreters = [], isLoading } = useAgencyInterpreters(showInactive);
  const { hasRole, profile } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = hasRole("agency_admin");
  const { regionsEnabled } = useAgencySettings();
  const { data: allInterpreterRegions = [] } = useAllInterpreterRegions();
  const { data: regions = [] } = useRegions();

  const [selectedInterpreter, setSelectedInterpreter] = useState<any>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<any>(null);
  const [archiveTarget, setArchiveTarget] = useState<any>(null);

  // Fetch invitations for admins
  const { data: invitations = [] } = useQuery({
    queryKey: ["agency-invitations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const regionsByInterpreter: Record<string, string[]> = {};
  const regionIdsByInterpreter: Record<string, string[]> = {};
  allInterpreterRegions.forEach((ir: any) => {
    if (!regionsByInterpreter[ir.interpreter_id]) regionsByInterpreter[ir.interpreter_id] = [];
    if (!regionIdsByInterpreter[ir.interpreter_id]) regionIdsByInterpreter[ir.interpreter_id] = [];
    if (ir.regions?.name) regionsByInterpreter[ir.interpreter_id].push(ir.regions.name);
    if (ir.regions?.id) regionIdsByInterpreter[ir.interpreter_id].push(ir.regions.id);
  });

  const pendingInvitations = invitations.filter((inv: any) => inv.status === "pending");
  const activeCount = interpreters.filter((i: any) => i.is_active).length;
  const inactiveCount = interpreters.filter((i: any) => !i.is_active).length;

  // Inline lifecycle: active appointment count for deactivate/archive targets
  const lifecycleTargetId = deactivateTarget?.id || archiveTarget?.id;
  const { data: lifecycleApptCount = 0 } = useQuery({
    queryKey: ["interpreter-active-appts", lifecycleTargetId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("interpreter_id", lifecycleTargetId!)
        .eq("is_deleted", false)
        .in("status", ["interpreter_assigned", "interpreter_assigned_last_minute", "interpreter_confirmed", "reassignment_needed", "in_progress", "requested", "requested_last_minute"] as any[]);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!lifecycleTargetId,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, newActive }: { id: string; newActive: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_active: newActive }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { newActive }) => {
      queryClient.invalidateQueries({ queryKey: ["agency-interpreters"] });
      toast.success(newActive ? "Interpreter reactivated" : "Interpreter deactivated");
      setDeactivateTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("profiles").update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: profile?.id ?? null,
        is_active: false,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agency-interpreters"] });
      toast.success("Interpreter removed from agency");
      setArchiveTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDeactivate = (i: any) => {
    setDeactivateTarget(i);
  };
  const handleReactivate = (i: any) => {
    toggleActiveMutation.mutate({ id: i.id, newActive: true });
  };
  const handleArchive = (i: any) => {
    setArchiveTarget(i);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Interpreters</h1>
          <p className="text-muted-foreground">
            {showInactive ? `All interpreters in your agency` : `Active interpreters in your agency`}
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <AddInterpreterDialog onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ["agency-interpreters"] });
              queryClient.invalidateQueries({ queryKey: ["agency-invitations"] });
            }} />
            <InviteUserDialog
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ["agency-interpreters"] });
                queryClient.invalidateQueries({ queryKey: ["agency-invitations"] });
              }}
              trigger={
                <Button variant="outline" size="sm">
                  <UserPlus2 className="mr-1 h-4 w-4" />
                  Invite Other Role
                </Button>
              }
            />
            <BulkInviteDialog
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ["agency-interpreters"] });
                queryClient.invalidateQueries({ queryKey: ["agency-invitations"] });
              }}
              trigger={
                <Button variant="outline" size="sm">
                  <Upload className="mr-1 h-4 w-4" />
                  Bulk Import
                </Button>
              }
            />
          </div>
        )}
      </div>

      {isAdmin && (
        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active">Active ({activeCount})</TabsTrigger>
            <TabsTrigger value="invitations">
              Invitations ({pendingInvitations.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            {isAdmin && (
              <div className="flex items-center gap-2 mb-4">
                <Switch
                  id="show-inactive"
                  checked={showInactive}
                  onCheckedChange={setShowInactive}
                />
                <Label htmlFor="show-inactive" className="text-sm text-muted-foreground cursor-pointer">
                  Show inactive interpreters {showInactive && inactiveCount > 0 ? `(${inactiveCount} inactive)` : ""}
                </Label>
              </div>
            )}
            <InterpreterTable
              interpreters={interpreters}
              isLoading={isLoading}
              regionsEnabled={regionsEnabled}
              regionsByInterpreter={regionsByInterpreter}
              onSelect={setSelectedInterpreter}
              isAdmin={isAdmin}
              onDeactivate={handleDeactivate}
              onReactivate={handleReactivate}
              onArchive={handleArchive}
            />
          </TabsContent>

          <TabsContent value="invitations">
            <InvitationsPanel invitations={invitations} />
          </TabsContent>
        </Tabs>
      )}

      {!isAdmin && (
        <InterpreterTable
          interpreters={interpreters}
          isLoading={isLoading}
          regionsEnabled={regionsEnabled}
          regionsByInterpreter={regionsByInterpreter}
          onSelect={setSelectedInterpreter}
        />
      )}

      {selectedInterpreter && (
        <InterpreterDetailDialog
          interpreter={selectedInterpreter}
          open={!!selectedInterpreter}
          onOpenChange={(open) => !open && setSelectedInterpreter(null)}
          regionsEnabled={regionsEnabled}
          regions={regions}
          assignedRegionIds={regionIdsByInterpreter[selectedInterpreter.id] ?? []}
          isAdmin={isAdmin}
        />
      )}

      {/* Deactivate Confirmation */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Interpreter</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deactivateTarget?.first_name} {deactivateTarget?.last_name}</strong> will be deactivated.
              They will no longer appear in assignment dropdowns or be able to claim jobs.
              {lifecycleApptCount > 0 && (
                <span className="block mt-2 font-medium text-destructive">
                  ⚠️ This interpreter currently has {lifecycleApptCount} active appointment{lifecycleApptCount !== 1 ? "s" : ""}. These will NOT be automatically cancelled — you should reassign them first.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deactivateTarget && toggleActiveMutation.mutate({ id: deactivateTarget.id, newActive: false })}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive/Remove Confirmation */}
      <AlertDialog open={!!archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Interpreter from Agency</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{archiveTarget?.first_name} {archiveTarget?.last_name}</strong> from your agency.
              They will no longer appear in lists or be available for assignments.
              All historical appointments and records will be preserved.
              {lifecycleApptCount > 0 && (
                <span className="block mt-2 font-medium text-destructive">
                  ⚠️ This interpreter currently has {lifecycleApptCount} active appointment{lifecycleApptCount !== 1 ? "s" : ""}. These will NOT be automatically cancelled.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archiveTarget && archiveMutation.mutate(archiveTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={archiveMutation.isPending}
            >
              {archiveMutation.isPending ? "Removing..." : "Remove from Agency"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InterpreterTable({
  interpreters,
  isLoading,
  regionsEnabled,
  regionsByInterpreter,
  onSelect,
  isAdmin,
  onDeactivate,
  onReactivate,
  onArchive,
}: {
  interpreters: any[];
  isLoading: boolean;
  regionsEnabled: boolean;
  regionsByInterpreter: Record<string, string[]>;
  onSelect: (i: any) => void;
  isAdmin?: boolean;
  onDeactivate?: (i: any) => void;
  onReactivate?: (i: any) => void;
  onArchive?: (i: any) => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!search) return interpreters;
    const q = search.toLowerCase();
    return interpreters.filter((i: any) =>
      `${i.first_name} ${i.last_name}`.toLowerCase().includes(q) ||
      i.email?.toLowerCase().includes(q)
    );
  }, [interpreters, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page on search change
  useEffect(() => setPage(0), [search]);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input placeholder="Search interpreters..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                {regionsEnabled && <TableHead>Regions</TableHead>}
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead className="w-36 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton columns={regionsEnabled ? (isAdmin ? 6 : 5) : (isAdmin ? 5 : 4)} rows={5} />
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={regionsEnabled ? (isAdmin ? 6 : 5) : (isAdmin ? 5 : 4)} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <Users className="h-10 w-10 text-muted-foreground/40" />
                      <p className="text-sm font-medium text-foreground">{search ? "No interpreters match your search" : "No interpreters yet"}</p>
                      <p className="text-xs text-muted-foreground max-w-xs">
                        {search ? "Try a different search term." : "Invite interpreters to your agency so you can assign them to appointments."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginated.map((i: any) => (
                <TableRow
                  key={i.id}
                  className={cn("cursor-pointer hover:bg-muted/50", !i.is_active && "opacity-60")}
                  onClick={() => onSelect(i)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">{i.first_name?.[0]}{i.last_name?.[0]}</AvatarFallback>
                      </Avatar>
                      <button className="font-medium text-primary hover:underline text-left" onClick={(e) => { e.stopPropagation(); onSelect(i); }}>
                        {i.first_name} {i.last_name}
                      </button>
                      {i.admin_confirms && (
                        <Badge variant="outline" className="text-xs gap-1 ml-2 border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400">
                          <ShieldCheck className="h-3 w-3" />
                          AC
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{i.email}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{i.phone ?? "—"}</TableCell>
                  {regionsEnabled && (
                    <TableCell>
                      {(regionsByInterpreter[i.id] ?? []).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {regionsByInterpreter[i.id].map((name) => (
                            <Badge key={name} variant="outline" className="text-xs">{name}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell><Badge variant={i.is_active ? "default" : "secondary"}>{i.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onSelect(i); }}>
                          <Eye className="h-3.5 w-3.5 mr-1" />Details
                        </Button>
                        {i.is_active ? (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onDeactivate?.(i); }} title="Deactivate">
                            <UserX className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onReactivate?.(i); }} title="Reactivate">
                            <UserCheck className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); onArchive?.(i); }} title="Remove from agency">
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" />Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              Next<ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function InvitationsPanel({ invitations }: { invitations: any[] }) {
  const queryClient = useQueryClient();

  const resendMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { mode: "resend", invitation_id: invitationId, email: "_", role: "interpreter" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Invitation resent successfully");
      queryClient.invalidateQueries({ queryKey: ["agency-invitations"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const revokeMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { mode: "revoke", invitation_id: invitationId, email: "_", role: "interpreter" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Invitation revoked");
      queryClient.invalidateQueries({ queryKey: ["agency-invitations"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const getStatusInfo = (inv: any) => {
    if (inv.status === "accepted") {
      return { label: "Accepted", variant: "default" as const, icon: CheckCircle2 };
    }
    if (inv.status === "revoked") {
      return { label: "Revoked", variant: "outline" as const, icon: Ban };
    }
    const expired = inv.expires_at && isPast(new Date(inv.expires_at));
    if (expired) {
      return { label: "Expired", variant: "destructive" as const, icon: XCircle };
    }
    return { label: "Pending", variant: "secondary" as const, icon: Clock };
  };

  const canResend = (inv: any) => {
    return inv.status !== "accepted" && inv.status !== "revoked";
  };

  const canRevoke = (inv: any) => {
    return inv.status === "pending" && !(inv.expires_at && isPast(new Date(inv.expires_at)));
  };

  if (invitations.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="flex flex-col items-center gap-2">
            <Mail className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">No invitations sent yet</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Invite interpreters, schedulers, or requesters to join your agency.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map((inv: any) => {
              const status = getStatusInfo(inv);
              const StatusIcon = status.icon;
              return (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">
                    {inv.first_name || inv.last_name
                      ? `${inv.first_name || ""} ${inv.last_name || ""}`.trim()
                      : "—"}
                  </TableCell>
                  <TableCell>{inv.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs capitalize">{inv.role || "interpreter"}</Badge>
                  </TableCell>
                  <TableCell>{inv.phone || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={status.variant} className="gap-1">
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {inv.expires_at
                      ? isPast(new Date(inv.expires_at))
                        ? "Expired"
                        : formatDistanceToNow(new Date(inv.expires_at), { addSuffix: true })
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {canResend(inv) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resendMutation.mutate(inv.id)}
                          disabled={resendMutation.isPending}
                        >
                          <RefreshCw className="mr-1 h-3 w-3" />
                          Resend
                        </Button>
                      )}
                      {canRevoke(inv) && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => revokeMutation.mutate(inv.id)}
                          disabled={revokeMutation.isPending}
                        >
                          <Ban className="mr-1 h-3 w-3" />
                          Revoke
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function InterpreterDetailDialog({
  interpreter,
  open,
  onOpenChange,
  regionsEnabled,
  regions,
  assignedRegionIds,
  isAdmin,
}: {
  interpreter: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regionsEnabled: boolean;
  regions: any[];
  assignedRegionIds: string[];
  isAdmin: boolean;
}) {
  const { assign, unassign } = useInterpreterRegionMutations();
  const { profile } = useAuth();
  const qc = useQueryClient();

  // --- Local state for interpreter status (tracks live value) ---
  const [localIsActive, setLocalIsActive] = useState(interpreter.is_active);
  useEffect(() => { setLocalIsActive(interpreter.is_active); }, [interpreter.is_active]);

  // --- Admin Notes ---
  const { data: noteRecord } = useQuery({
    queryKey: ["interpreter-notes", interpreter.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interpreter_notes" as any)
        .select("*")
        .eq("interpreter_id", interpreter.id)
        .eq("agency_id", profile!.agency_id!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: isAdmin && !!profile?.agency_id,
  });

  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);

  useEffect(() => {
    setNotes(noteRecord?.notes ?? "");
    setNotesDirty(false);
  }, [noteRecord]);

  const saveNotes = useMutation({
    mutationFn: async (text: string) => {
      if (noteRecord) {
        const { error } = await supabase
          .from("interpreter_notes" as any)
          .update({ notes: text } as any)
          .eq("id", noteRecord.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("interpreter_notes" as any)
          .insert({ interpreter_id: interpreter.id, agency_id: profile!.agency_id!, notes: text } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setNotesDirty(false);
      qc.invalidateQueries({ queryKey: ["interpreter-notes", interpreter.id] });
      toast.success("Notes saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleNotesBlur = useCallback(() => {
    if (notesDirty) saveNotes.mutate(notes);
  }, [notesDirty, notes]);

  // --- Lifecycle mutations ---
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  // Fetch active appointment count for this interpreter
  const { data: activeApptCount = 0 } = useQuery({
    queryKey: ["interpreter-active-appts", interpreter.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("interpreter_id", interpreter.id)
        .eq("is_deleted", false)
        .in("status", ["interpreter_assigned", "interpreter_assigned_last_minute", "interpreter_confirmed", "reassignment_needed", "in_progress", "requested", "requested_last_minute"] as any[]);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: isAdmin,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (newActive: boolean) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: newActive })
        .eq("id", interpreter.id);
      if (error) throw error;
    },
    onSuccess: (_, newActive) => {
      setLocalIsActive(newActive);
      qc.invalidateQueries({ queryKey: ["agency-interpreters"] });
      toast.success(newActive ? "Interpreter reactivated" : "Interpreter deactivated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: profile?.id ?? null,
          is_active: false,
        })
        .eq("id", interpreter.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency-interpreters"] });
      toast.success("Interpreter removed from agency");
      setArchiveOpen(false);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleRegion = (regionId: string) => {
    if (assignedRegionIds.includes(regionId)) {
      unassign.mutate({ interpreterId: interpreter.id, regionId });
    } else {
      assign.mutate({ interpreterId: interpreter.id, regionId });
    }
    setTimeout(() => {
      qc.invalidateQueries({ queryKey: ["all-interpreter-regions"] });
    }, 300);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o && notesDirty) saveNotes.mutate(notes); onOpenChange(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback>{interpreter.first_name?.[0]}{interpreter.last_name?.[0]}</AvatarFallback>
              </Avatar>
              <div>
                <div>{interpreter.first_name} {interpreter.last_name}</div>
                <Badge variant={localIsActive ? "default" : "secondary"} className="mt-1 text-xs">
                  {localIsActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{interpreter.email || "—"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{interpreter.phone || "—"}</span>
            </div>
          </div>

          {regionsEnabled && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Assigned Regions
                </Label>
                {regions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No regions created yet. Go to the Regions page to add regions.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {regions.map((r: any) => (
                      <label key={r.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer">
                        <Checkbox
                          checked={assignedRegionIds.includes(r.id)}
                          onCheckedChange={() => toggleRegion(r.id)}
                          disabled={!isAdmin}
                        />
                        <div>
                          <span className="text-sm font-medium">{r.name}</span>
                          {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                {!isAdmin && (
                  <p className="text-xs text-muted-foreground">Only admins can change region assignments.</p>
                )}
              </div>
            </>
          )}

          {isAdmin && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      Admin Confirms
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      When enabled, admin can assign and confirm this interpreter in one step, skipping the accept/reject flow
                    </p>
                  </div>
                  <Switch
                    checked={interpreter.admin_confirms ?? false}
                    onCheckedChange={async (checked) => {
                      const { error } = await supabase
                        .from("profiles")
                        .update({ admin_confirms: checked } as any)
                        .eq("id", interpreter.id);
                      if (error) {
                        toast.error(error.message);
                      } else {
                        toast.success(checked ? "Admin Confirms enabled" : "Admin Confirms disabled");
                        qc.invalidateQueries({ queryKey: ["agency-interpreters"] });
                      }
                    }}
                  />
                </div>
              </div>

              <Separator />
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <StickyNote className="h-4 w-4" />
                  Admin Notes
                </Label>
                <Textarea
                  value={notes}
                  onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
                  onBlur={handleNotesBlur}
                  placeholder="Private notes about this interpreter (only visible to admins)..."
                  className="min-h-[80px] text-sm"
                />
                <p className="text-xs text-muted-foreground">Auto-saves when you click away or close the dialog.</p>
              </div>

              <Separator />
              <div className="space-y-3">
                <Label className="text-sm font-medium">Lifecycle Management</Label>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    {localIsActive ? (
                      <UserX className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <UserCheck className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{localIsActive ? "Deactivate interpreter" : "Reactivate interpreter"}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (localIsActive && activeApptCount > 0) {
                        setDeactivateOpen(true);
                      } else {
                        toggleActiveMutation.mutate(!localIsActive);
                      }
                    }}
                    disabled={toggleActiveMutation.isPending}
                  >
                    {localIsActive ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {localIsActive
                    ? "Deactivated interpreters will not appear in assignment lists but their history is preserved."
                    : "Reactivating will make this interpreter available for new assignments again."}
                </p>

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Archive className="h-4 w-4 text-destructive" />
                    <span>Remove from agency</span>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setArchiveOpen(true)}
                  >
                    Remove
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Permanently removes this interpreter from your agency. Historical records and appointments are preserved.
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Interpreter from Agency</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{interpreter.first_name} {interpreter.last_name}</strong> from your agency.
              They will no longer appear in lists or be available for assignments.
              All historical appointments and records will be preserved.
              {activeApptCount > 0 && (
                <span className="block mt-2 font-medium text-destructive">
                  ⚠️ This interpreter currently has {activeApptCount} active appointment{activeApptCount !== 1 ? "s" : ""}. These will NOT be automatically cancelled.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archiveMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={archiveMutation.isPending}
            >
              {archiveMutation.isPending ? "Removing..." : "Remove from Agency"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Interpreter</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{interpreter.first_name} {interpreter.last_name}</strong> will be deactivated.
              They will no longer appear in assignment dropdowns or be able to claim jobs.
              {activeApptCount > 0 && (
                <span className="block mt-2 font-medium text-destructive">
                  ⚠️ This interpreter currently has {activeApptCount} active appointment{activeApptCount !== 1 ? "s" : ""}. These will NOT be automatically cancelled — you should reassign them first.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { toggleActiveMutation.mutate(false); setDeactivateOpen(false); }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
