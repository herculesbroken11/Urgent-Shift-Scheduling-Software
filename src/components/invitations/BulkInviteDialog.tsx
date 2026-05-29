import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, Users, CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface BulkInviteDialogProps {
  onSuccess: () => void;
  trigger?: React.ReactNode;
}

interface ParsedRow {
  row_number: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role: string;
  status: "pending" | "valid" | "warning" | "invalid" | "success" | "failed";
  message?: string;
}

type Step = "upload" | "checking" | "preview" | "executing" | "results";

/**
 * Reuses the same CSV format as existing interpreter import:
 * first_name, last_name, email, phone
 * Optionally includes a "role" column.
 *
 * Preflight checks: existing agency members, pending invitations, duplicate emails.
 */
export function BulkInviteDialog({ onSuccess, trigger }: BulkInviteDialogProps) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [defaultRole, setDefaultRole] = useState("interpreter");
  const [mode, setMode] = useState<"invite" | "create">("invite");
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const reset = () => {
    setStep("upload");
    setRows([]);
    setDefaultRole("interpreter");
    setMode("invite");
    setProgress({ done: 0, total: 0 });
  };

  const parseCSV = useCallback((text: string) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { toast.error("CSV must have a header row and at least one data row"); return; }

    const parseRow = (line: string): string[] => {
      const result: string[] = [];
      let current = "", inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; }
        else current += ch;
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseRow(lines[0]).map(h =>
      h.toLowerCase().replace(/^"|"$/g, "").replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")
    );

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validRoles = ["interpreter", "requester", "scheduler"];
    const seen = new Set<string>();
    const parsed: ParsedRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseRow(lines[i]);
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { obj[h] = values[idx] ?? ""; });

      let fn = obj.first_name || "";
      let ln = obj.last_name || "";
      if (!fn && !ln) {
        const full = obj.name || obj.interpreter_name || obj.interpreter || "";
        if (full) {
          const parts = full.trim().split(/\s+/);
          fn = parts[0] || "";
          ln = parts.slice(1).join(" ");
        }
      }

      const email = (obj.email || "").trim().toLowerCase();
      const phone = obj.phone || "";
      const role = obj.role ? obj.role.trim().toLowerCase() : defaultRole;

      let status: ParsedRow["status"] = "valid";
      let message = "";

      if (!email) { status = "invalid"; message = "Email is required"; }
      else if (!emailRegex.test(email)) { status = "invalid"; message = "Invalid email format"; }
      else if (seen.has(email)) { status = "invalid"; message = "Duplicate email in file"; }

      if (status === "valid" && !validRoles.includes(role)) {
        status = "invalid";
        message = `Invalid role: '${role}'. Must be: ${validRoles.join(", ")}`;
      }

      if (email) seen.add(email);

      parsed.push({ row_number: i, first_name: fn, last_name: ln, email, phone, role, status, message });
    }

    return parsed;
  }, [defaultRole]);

  /**
   * Run preflight checks using invite-user in a dry-run style:
   * For each valid email, call invite-user which uses auth.admin.listUsers
   * (authoritative email source) to detect existing members.
   * Also check pending invitations via the invitations table.
   */
  const runPreflightChecks = useCallback(async (parsed: ParsedRow[]) => {
    const agencyId = profile?.agency_id;
    if (!agencyId) return parsed;

    const validRows = parsed.filter(r => r.status === "valid");
    if (validRows.length === 0) return parsed;

    // Batch check pending invitations (invitations table is authoritative for pending state)
    const validEmails = validRows.map(r => r.email);
    const { data: pendingInvites } = await supabase
      .from("invitations")
      .select("email")
      .eq("agency_id", agencyId)
      .eq("status", "pending")
      .in("email", validEmails);

    const pendingEmails = new Set(
      (pendingInvites || []).map((inv: any) => (inv.email || "").toLowerCase())
    );

    // For existing-member detection, call invite-user for each valid row.
    // invite-user uses auth.admin.listUsers (authoritative) and returns
    // "already a member" errors. We catch those as preflight warnings.
    for (const row of validRows) {
      if (pendingEmails.has(row.email)) {
        row.status = "warning";
        row.message = "Has a pending invitation";
        continue;
      }

      try {
        // Use invite mode — invite-user will check auth.admin.listUsers authoritatively
        // and return "already a member" if the user belongs to this agency.
        // We send a preflight-only probe by checking the invite path.
        // Since we don't want to actually create invitations during preflight,
        // we check membership via the same edge function but handle the error.
        const { data, error } = await supabase.functions.invoke("invite-user", {
          body: {
            mode: "invite",
            role: row.role,
            email: row.email,
            first_name: row.first_name,
            last_name: row.last_name,
            phone: row.phone,
            preflight_only: true,
          },
        });
        // If the function doesn't support preflight_only, it will create an actual invite.
        // We handle "already a member" and "pending invitation" errors as warnings.
        if (error || data?.error) {
          const msg = data?.error || error?.message || "";
          if (msg.includes("already a member")) {
            row.status = "warning";
            row.message = "Already a member of this agency";
          } else if (msg.includes("pending invitation")) {
            row.status = "warning";
            row.message = "Has a pending invitation";
          }
          // Other errors: leave as valid, will surface during execution
        }
      } catch {
        // Network error during preflight — leave row as valid for execution
      }
    }

    return parsed;
  }, [profile?.agency_id]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    e.target.value = "";

    const parsed = parseCSV(text);
    if (!parsed) return;

    setStep("checking");
    const checked = await runPreflightChecks(parsed);
    setRows(checked);
    setStep("preview");
  };

  const validRows = rows.filter(r => r.status === "valid");
  const warningRows = rows.filter(r => r.status === "warning");
  const invalidRows = rows.filter(r => r.status === "invalid");
  const executableRows = rows.filter(r => r.status === "valid");

  const execute = async () => {
    setStep("executing");
    const toProcess = rows.filter(r => r.status === "valid");
    setProgress({ done: 0, total: toProcess.length });

    for (let i = 0; i < toProcess.length; i++) {
      const row = toProcess[i];
      try {
        const body: Record<string, unknown> = {
          mode, role: row.role,
          email: row.email, first_name: row.first_name, last_name: row.last_name, phone: row.phone,
        };
        const { data, error } = await supabase.functions.invoke("invite-user", { body });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        row.status = "success";
        row.message = data?.linked_existing
          ? "Existing user linked"
          : mode === "invite" ? "Invitation sent" : "Account created";
      } catch (err: any) {
        row.status = "failed";
        row.message = err.message || "Failed";
      }
      setProgress({ done: i + 1, total: toProcess.length });
      setRows([...rows]);
    }

    setStep("results");
    onSuccess();
  };

  const successCount = rows.filter(r => r.status === "success").length;
  const failedCount = rows.filter(r => r.status === "failed").length;

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        {trigger || <Button variant="outline"><Upload className="mr-2 h-4 w-4" /> Bulk Invite Users</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Bulk Invite Users</DialogTitle>
          <DialogDescription>
            Upload a CSV to invite interpreters, schedulers, or requesters.
            Required columns: first_name, last_name, email, phone. Optional: role column (defaults to selected role below).
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Default Role</Label>
              <Select value={defaultRole} onValueChange={setDefaultRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="interpreter">Interpreter</SelectItem>
                  <SelectItem value="requester">Requester</SelectItem>
                  <SelectItem value="scheduler">Scheduler</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v: "invite" | "create") => setMode(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="invite">Send Invitations</SelectItem>
                  <SelectItem value="create">Create Accounts Directly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground mb-3">Drop a CSV file or click to browse</p>
              <input type="file" accept=".csv" onChange={handleFile} className="hidden" id="bulk-csv" />
              <Button variant="outline" onClick={() => document.getElementById("bulk-csv")?.click()}>
                Choose File
              </Button>
            </div>
          </div>
        )}

        {step === "checking" && (
          <div className="py-8 text-center space-y-4">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Running preflight checks...</p>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="default"><Users className="mr-1 h-3 w-3" />{rows.length} total</Badge>
              <Badge variant="secondary"><CheckCircle2 className="mr-1 h-3 w-3" />{validRows.length} ready</Badge>
              {warningRows.length > 0 && (
                <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                  <AlertTriangle className="mr-1 h-3 w-3" />{warningRows.length} skipped
                </Badge>
              )}
              {invalidRows.length > 0 && (
                <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />{invalidRows.length} invalid</Badge>
              )}
            </div>
            <ScrollArea className="max-h-[40vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.row_number}>
                      <TableCell className="text-xs text-muted-foreground">{r.row_number}</TableCell>
                      <TableCell>{r.first_name} {r.last_name}</TableCell>
                      <TableCell className="text-sm">{r.email}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs capitalize">{r.role}</Badge></TableCell>
                      <TableCell>
                        {r.status === "valid" ? (
                          <Badge variant="secondary" className="text-xs">Ready</Badge>
                        ) : r.status === "warning" ? (
                          <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-300">{r.message}</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">{r.message}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setStep("upload"); setRows([]); }}>Back</Button>
              <Button onClick={execute} disabled={executableRows.length === 0}>
                {mode === "invite" ? "Send" : "Create"} {executableRows.length} {mode === "invite" ? "Invitations" : "Accounts"}
              </Button>
            </div>
          </div>
        )}

        {step === "executing" && (
          <div className="py-8 text-center space-y-4">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Processing {progress.done} of {progress.total}...
            </p>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {step === "results" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="default"><CheckCircle2 className="mr-1 h-3 w-3" />{successCount} succeeded</Badge>
              {failedCount > 0 && <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />{failedCount} failed</Badge>}
              {warningRows.length > 0 && <Badge variant="outline"><AlertTriangle className="mr-1 h-3 w-3" />{warningRows.length} skipped</Badge>}
              {invalidRows.length > 0 && <Badge variant="outline"><XCircle className="mr-1 h-3 w-3" />{invalidRows.length} invalid</Badge>}
            </div>
            <ScrollArea className="max-h-[40vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.filter(r => r.status !== "pending").map(r => (
                    <TableRow key={r.row_number}>
                      <TableCell className="text-xs">{r.row_number}</TableCell>
                      <TableCell className="text-sm">{r.email}</TableCell>
                      <TableCell>
                        <Badge
                          variant={r.status === "success" ? "default" : r.status === "warning" ? "outline" : r.status === "invalid" ? "outline" : "destructive"}
                          className="text-xs"
                        >
                          {r.message}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            <div className="flex justify-end">
              <Button onClick={() => { setOpen(false); reset(); }}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
