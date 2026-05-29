import { useState } from "react";
import { useRegions, useRegionMutations, useRegionCounts, useInterpreterRegionMutations } from "@/hooks/useRegionsData";
import { useAgencyInterpreters } from "@/hooks/useAgencyData";
import { useAgencySettings } from "@/hooks/useAgencySettings";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Users, MapPin, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

export default function Regions() {
  const { profile, isDemoMode } = useAuth();
  const { regionsEnabled } = useAgencySettings();
  const { data: regions = [], isLoading } = useRegions();
  const { data: counts } = useRegionCounts();
  const { create, update, remove } = useRegionMutations();
  const { data: interpreters = [] } = useAgencyInterpreters();
  const { assign, unassign } = useInterpreterRegionMutations();
  const qc = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignRegionId, setAssignRegionId] = useState<string | null>(null);

  // Fetch interpreter assignments for the selected region
  const { data: regionInterpreters = [] } = useQuery({
    queryKey: ["region-interpreters", assignRegionId],
    queryFn: async () => {
      if (!assignRegionId) return [];
      const { data, error } = await supabase
        .from("interpreter_regions")
        .select("interpreter_id")
        .eq("region_id", assignRegionId);
      if (error) throw error;
      return data.map((r) => r.interpreter_id);
    },
    enabled: !isDemoMode && !!assignRegionId,
  });

  const openCreate = () => {
    setEditId(null);
    setName("");
    setDescription("");
    setFormOpen(true);
  };

  const openEdit = (r: any) => {
    setEditId(r.id);
    setName(r.name);
    setDescription(r.description ?? "");
    setFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editId) {
      update.mutate({ id: editId, name, description }, { onSuccess: () => setFormOpen(false) });
    } else {
      create.mutate({ name, description }, { onSuccess: () => setFormOpen(false) });
    }
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    const ic = counts?.interpreters[deleteId] ?? 0;
    const lc = counts?.locations[deleteId] ?? 0;
    if (ic > 0 || lc > 0) return; // shouldn't happen, button disabled
    remove.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
  };

  const openAssign = (regionId: string) => {
    setAssignRegionId(regionId);
    setAssignOpen(true);
  };

  const toggleInterpreter = (interpreterId: string) => {
    if (!assignRegionId) return;
    if (regionInterpreters.includes(interpreterId)) {
      unassign.mutate({ interpreterId, regionId: assignRegionId });
    } else {
      assign.mutate({ interpreterId, regionId: assignRegionId });
    }
    // Optimistic: refetch
    setTimeout(() => {
      qc.invalidateQueries({ queryKey: ["region-interpreters", assignRegionId] });
    }, 300);
  };

  if (!regionsEnabled) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Regions</h1>
          <p className="text-muted-foreground">Geographic region management for interpreters and locations</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <MapPin className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground mb-2">Regions are currently disabled for your agency.</p>
            <p className="text-sm text-muted-foreground">Enable them in <strong>Settings → Agency Settings</strong> to manage geographic regions.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Regions</h1>
          <p className="text-muted-foreground">Manage geographic regions, assign interpreters and filter jobs by area</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Region</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Interpreters</TableHead>
                <TableHead className="text-center">Locations</TableHead>
                <TableHead className="w-36 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground">Loading regions...</p>
                  </div>
                </TableCell></TableRow>
              ) : regions.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <MapPin className="h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-foreground">No regions yet</p>
                    <p className="text-xs text-muted-foreground max-w-xs">Create geographic regions to organize interpreters and filter jobs by area.</p>
                    <Button size="sm" className="mt-2" onClick={openCreate}><Plus className="mr-1 h-3.5 w-3.5" />Create First Region</Button>
                  </div>
                </TableCell></TableRow>
              ) : regions.map((r) => {
                const ic = counts?.interpreters[r.id] ?? 0;
                const lc = counts?.locations[r.id] ?? 0;
                const hasAssignments = ic > 0 || lc > 0;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.description || "—"}</TableCell>
                    <TableCell className="text-center">
                      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => openAssign(r.id)}>
                        <Users className="h-3.5 w-3.5" />
                        <span>{ic}</span>
                      </Button>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{lc}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => setDeleteId(r.id)}
                          disabled={hasAssignments}
                          title={hasAssignments ? "Remove all interpreters and locations first" : "Delete"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Region" : "New Region"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. North Metro" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description of region boundaries" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {editId ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Region</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this region? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign Interpreters Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Interpreters to Region</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {interpreters.length === 0 ? (
              <p className="text-sm text-muted-foreground">No interpreters in your agency.</p>
            ) : interpreters.map((interp: any) => (
              <label key={interp.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer">
                <Checkbox
                  checked={regionInterpreters.includes(interp.id)}
                  onCheckedChange={() => toggleInterpreter(interp.id)}
                />
                <span className="text-sm font-medium">{interp.first_name} {interp.last_name}</span>
                <span className="text-xs text-muted-foreground">{interp.email}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
