import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useCustomers, useCustomerMutations } from "@/hooks/useAgencyData";
import { useBillingRates } from "@/hooks/useBillingData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Pencil, Download, Copy, Archive, Eye, Building2, ChevronLeft, ChevronRight } from "lucide-react";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PAGE_SIZE = 25;

interface CustomerFormData {
  name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  billing_email: string;
  notes: string;
  is_active: boolean;
}

const emptyForm: CustomerFormData = {
  name: "", contact_name: "", contact_email: "", contact_phone: "",
  billing_email: "", notes: "", is_active: true,
};

export default function Customers() {
  const { data: customers = [], isLoading } = useCustomers();
  const { data: billingRates = [] } = useBillingRates();
  const { create, update, remove } = useCustomerMutations();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerFormData>(emptyForm);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [archiveTarget, setArchiveTarget] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  // Get impact data for archive target
  const { data: archiveImpact } = useQuery({
    queryKey: ["customer-archive-impact", archiveTarget],
    queryFn: async () => {
      if (!archiveTarget) return { appointments: 0, requestors: 0 };
      const [apptRes, reqRes] = await Promise.all([
        supabase.from("appointments").select("id", { count: "exact", head: true })
          .eq("customer_id", archiveTarget).eq("is_deleted", false)
          .in("status", ["requested", "requested_last_minute", "interpreter_assigned", "interpreter_assigned_last_minute", "interpreter_confirmed", "reassignment_needed", "in_progress"] as any[]),
        supabase.from("customer_requestors").select("id", { count: "exact", head: true })
          .eq("customer_id", archiveTarget).eq("is_active", true),
      ]);
      return { appointments: apptRes.count ?? 0, requestors: reqRes.count ?? 0 };
    },
    enabled: !!archiveTarget,
  });

  const filtered = customers.filter((c: any) => {
    if (!showInactive && c.is_active === false) return false;
    return c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.contact_email?.toLowerCase().includes(search.toLowerCase());
  });

  // Build a map of customer_id → currently effective billing rate
  const todayStr = new Date().toISOString().split("T")[0];
  const customerRateMap = new Map<string, any>();
  billingRates.forEach((r: any) => {
    if (!r.customer_id) return;
    if (r.effective_start_date && r.effective_start_date > todayStr) return;
    if (r.effective_end_date && r.effective_end_date < todayStr) return;
    if (!customerRateMap.has(r.customer_id)) customerRateMap.set(r.customer_id, r);
  });

  const openCreate = () => { setForm(emptyForm); setEditId(null); setOpen(true); };
  const openEdit = (c: any) => {
    setForm({
      name: c.name,
      contact_name: c.contact_name ?? "",
      contact_email: c.contact_email ?? "",
      contact_phone: c.contact_phone ?? "",
      billing_email: c.billing_email ?? "",
      notes: c.notes ?? "",
      is_active: c.is_active !== false,
    });
    setEditId(c.id);
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editId) {
      update.mutate({ id: editId, ...form }, { onSuccess: () => setOpen(false) });
    } else {
      create.mutate(form, { onSuccess: () => setOpen(false) });
    }
  };

  const handleArchive = () => {
    if (archiveTarget) {
      remove.mutate(archiveTarget);
      setArchiveTarget(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const inactiveCount = customers.filter((c: any) => c.is_active === false).length;

  const exportCSV = () => {
    const headers = ["#", "Name", "Contact", "Email", "Phone", "Bundle", "Status"];
    const rows = filtered.map((c: any, i: number) => [
      String(i + 1).padStart(4, "0"), c.name, c.contact_name ?? "",
      c.contact_email ?? "", c.contact_phone ?? "",
      customerRateMap.has(c.id) ? customerRateMap.get(c.id).name : "Standard",
      c.is_active !== false ? "Active" : "Inactive",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "customers.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const copyTable = () => {
    const headers = ["#", "Name", "Contact", "Email", "Phone", "Bundle"];
    const rows = filtered.map((c: any, i: number) => [
      String(i + 1).padStart(4, "0"), c.name, c.contact_name ?? "",
      c.contact_email ?? "", c.contact_phone ?? "",
      customerRateMap.has(c.id) ? customerRateMap.get(c.id).name : "Standard",
    ]);
    const text = [headers.join("\t"), ...rows.map((r) => r.join("\t"))].join("\n");
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const setC = (k: keyof CustomerFormData, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground">Manage requesting organizations</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Customer</Button>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyTable}><Copy className="mr-1 h-4 w-4" />Copy</Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="mr-1 h-4 w-4" />CSV</Button>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="show-inactive-customers" checked={showInactive} onCheckedChange={setShowInactive} />
            <Label htmlFor="show-inactive-customers" className="text-sm text-muted-foreground cursor-pointer">
              Show inactive {showInactive && inactiveCount > 0 ? `(${inactiveCount})` : ""}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>Customer Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Billing Email</TableHead>
                <TableHead>Bundle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton columns={7} rows={5} />
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <Building2 className="h-10 w-10 text-muted-foreground/40" />
                      <p className="text-sm font-medium text-foreground">
                        {search ? "No customers match your search" : "No customers yet"}
                      </p>
                      <p className="text-xs text-muted-foreground max-w-xs">
                        {search
                          ? "Try a different search term."
                          : "Add your first customer organization to start scheduling interpreter appointments."}
                      </p>
                      {!search && (
                        <Button size="sm" className="mt-2" onClick={openCreate}>
                          <Plus className="mr-1 h-3.5 w-3.5" />Add Your First Customer
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginated.map((c: any, idx: number) => {
                const customRate = customerRateMap.get(c.id);
                return (
                  <TableRow key={c.id} className="group">
                    <TableCell className="font-mono text-muted-foreground text-xs">{String(page * PAGE_SIZE + idx + 1).padStart(4, "0")}</TableCell>
                    <TableCell>
                      <button
                        className="font-medium text-primary hover:underline text-left"
                        onClick={() => navigate(`/customers/${c.id}`)}
                      >
                        {c.name}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.contact_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.billing_email}</TableCell>
                    <TableCell>
                      {customRate ? (
                        <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                          {customRate.name}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Standard</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.is_active !== false ? "default" : "secondary"} className="text-xs">
                        {c.is_active !== false ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="outline" size="sm" onClick={() => navigate(`/customers/${c.id}`)}>
                          <Eye className="h-3.5 w-3.5 mr-1" />Details
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(c); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); setArchiveTarget(c.id); }}>
                          <Archive className="h-3.5 w-3.5" />
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

      {/* Pagination */}
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

      {/* Archive Confirmation */}
      <AlertDialog open={!!archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Customer</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive this customer and remove them from active lists.
              All historical appointments, billing records, and locations will be preserved.
              This action can be reversed by an administrator.
              {archiveImpact && (archiveImpact.appointments > 0 || archiveImpact.requestors > 0) && (
                <span className="block mt-2 font-medium text-destructive">
                  ⚠️ This customer has{archiveImpact.appointments > 0 ? ` ${archiveImpact.appointments} active appointment${archiveImpact.appointments !== 1 ? "s" : ""}` : ""}
                  {archiveImpact.appointments > 0 && archiveImpact.requestors > 0 ? " and" : ""}
                  {archiveImpact.requestors > 0 ? ` ${archiveImpact.requestors} linked requestor${archiveImpact.requestors !== 1 ? "s" : ""}` : ""}.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Archive Customer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Customer Form Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Customer" : "New Customer"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Organization Name *</Label>
              <Input id="name" value={form.name} onChange={(e) => setC("name", e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contact_name">Contact Name</Label>
                <Input id="contact_name" value={form.contact_name} onChange={(e) => setC("contact_name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_phone">Contact Phone</Label>
                <Input id="contact_phone" value={form.contact_phone} onChange={(e) => setC("contact_phone", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contact_email">Contact Email</Label>
                <Input id="contact_email" type="email" value={form.contact_email} onChange={(e) => setC("contact_email", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billing_email">Billing Email</Label>
                <Input id="billing_email" type="email" value={form.billing_email} onChange={(e) => setC("billing_email", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={form.notes} onChange={(e) => setC("notes", e.target.value)} />
            </div>
            {editId && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label htmlFor="is_active_toggle" className="text-sm font-medium">Active Status</Label>
                  <p className="text-xs text-muted-foreground">Inactive customers won't appear in default lists</p>
                </div>
                <Switch
                  id="is_active_toggle"
                  checked={form.is_active}
                  onCheckedChange={(checked) => setC("is_active", checked)}
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {editId ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
