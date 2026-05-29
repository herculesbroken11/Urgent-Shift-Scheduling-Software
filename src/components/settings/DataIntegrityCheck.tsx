import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface DiagnosticResult {
  orphanedInvitations: any[];
  rolesWithoutProfile: any[];
  inactiveWithRoles: any[];
  profilesWithoutRoles: any[];
  activeApptsInactiveInterpreter: any[];
  activeApptsInactiveCustomer: any[];
  activeApptsInactiveLocation: any[];
}

export function DataIntegrityCheck() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runCheck = async () => {
    if (!profile?.agency_id) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Orphaned invitations: pending but user already exists in agency
      const { data: pendingInvites } = await supabase
        .from("invitations")
        .select("id, email, role, status, created_at, expires_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      const orphanedInvitations: any[] = [];
      for (const inv of pendingInvites || []) {
        // Check if a user with this email already has a role in this agency
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, email, is_active")
          .ilike("email", inv.email);
        if (profiles && profiles.length > 0) {
          const userId = profiles[0].id;
          const { data: roles } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", userId);
          if (roles && roles.length > 0) {
            orphanedInvitations.push({
              ...inv,
              existing_user_id: userId,
              existing_roles: roles.map((r: any) => r.role),
              issue: "User already exists with roles but invitation still pending",
            });
          }
        }
      }

      // 2. Profiles in this agency without any user_roles
      const { data: agencyProfiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, is_active, is_deleted")
        .eq("agency_id", profile.agency_id)
        .eq("is_deleted", false);

      const profilesWithoutRoles: any[] = [];
      for (const p of agencyProfiles || []) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", p.id);
        if (!roles || roles.length === 0) {
          profilesWithoutRoles.push(p);
        }
      }

      // 3. User roles pointing to inactive/deleted profiles
      const { data: allRoles } = await supabase
        .from("user_roles")
        .select("user_id, role");

      const inactiveWithRoles: any[] = [];
      const rolesWithoutProfile: any[] = [];
      const checked = new Set<string>();
      for (const r of allRoles || []) {
        if (checked.has(r.user_id)) continue;
        checked.add(r.user_id);
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, email, is_active, is_deleted")
          .eq("id", r.user_id)
          .maybeSingle();
        if (!prof) {
          rolesWithoutProfile.push({ user_id: r.user_id, role: r.role });
        } else if (prof.is_deleted) {
          inactiveWithRoles.push({ ...prof, role: r.role, issue: "Profile is deleted but still has active roles" });
        }
      }

      // 4. Active appointments with inactive interpreters
      const { data: inactiveIntAppts } = await supabase
        .from("appointments")
        .select("id, title, scheduled_start, interpreter_id, interpreter:profiles!appointments_interpreter_id_fkey(first_name, last_name, is_active)")
        .eq("is_deleted", false)
        .in("status", ["requested", "requested_last_minute", "interpreter_assigned", "interpreter_assigned_last_minute", "interpreter_confirmed", "reassignment_needed", "in_progress"] as any[])
        .not("interpreter_id", "is", null);
      const activeApptsInactiveInterpreter = (inactiveIntAppts ?? []).filter(
        (a: any) => a.interpreter && a.interpreter.is_active === false
      );

      // 5. Active appointments with inactive customers
      const { data: inactiveCustAppts } = await supabase
        .from("appointments")
        .select("id, title, scheduled_start, customer_id, customers(name, is_active)")
        .eq("is_deleted", false)
        .in("status", ["requested", "requested_last_minute", "interpreter_assigned", "interpreter_assigned_last_minute", "interpreter_confirmed", "reassignment_needed", "in_progress"] as any[])
        .not("customer_id", "is", null);
      const activeApptsInactiveCustomer = (inactiveCustAppts ?? []).filter(
        (a: any) => a.customers && a.customers.is_active === false
      );

      // 6. Active appointments with inactive locations
      const { data: inactiveLocAppts } = await supabase
        .from("appointments")
        .select("id, title, scheduled_start, location_id, locations(name, is_active)")
        .eq("is_deleted", false)
        .in("status", ["requested", "requested_last_minute", "interpreter_assigned", "interpreter_assigned_last_minute", "interpreter_confirmed", "reassignment_needed", "in_progress"] as any[])
        .not("location_id", "is", null);
      const activeApptsInactiveLocation = (inactiveLocAppts ?? []).filter(
        (a: any) => a.locations && a.locations.is_active === false
      );

      setResult({
        orphanedInvitations, rolesWithoutProfile, inactiveWithRoles, profilesWithoutRoles,
        activeApptsInactiveInterpreter, activeApptsInactiveCustomer, activeApptsInactiveLocation,
      });
    } catch (err: any) {
      setError(err.message || "Failed to run diagnostics");
    } finally {
      setLoading(false);
    }
  };

  const totalIssues = result
    ? result.orphanedInvitations.length + result.rolesWithoutProfile.length +
      result.inactiveWithRoles.length + result.profilesWithoutRoles.length +
      result.activeApptsInactiveInterpreter.length + result.activeApptsInactiveCustomer.length +
      result.activeApptsInactiveLocation.length
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Data Integrity Check
        </CardTitle>
        <CardDescription>
          Scan for orphaned users, stuck invitations, and inconsistent role assignments.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={runCheck} disabled={loading}>
          {loading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running...</>
          ) : (
            <><RefreshCw className="mr-2 h-4 w-4" />Run Diagnostic</>
          )}
        </Button>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <div className="space-y-4">
            {totalIssues === 0 ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>All Clear</AlertTitle>
                <AlertDescription>No data integrity issues found.</AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{totalIssues} issue{totalIssues !== 1 ? "s" : ""} found</AlertTitle>
                <AlertDescription>Review the details below.</AlertDescription>
              </Alert>
            )}

            {result.orphanedInvitations.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Badge variant="destructive">{result.orphanedInvitations.length}</Badge>
                  Orphaned Invitations
                </h4>
                <p className="text-xs text-muted-foreground">Pending invitations where the user already exists in the agency.</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Existing Roles</TableHead>
                      <TableHead>Issue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.orphanedInvitations.map((inv: any) => (
                      <TableRow key={inv.id}>
                        <TableCell className="text-sm">{inv.email}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{inv.role}</Badge></TableCell>
                        <TableCell>{inv.existing_roles?.join(", ")}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{inv.issue}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {result.profilesWithoutRoles.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Badge variant="secondary">{result.profilesWithoutRoles.length}</Badge>
                  Profiles Without Roles
                </h4>
                <p className="text-xs text-muted-foreground">Users in the agency who have no role assigned.</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Active</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.profilesWithoutRoles.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm">{p.first_name} {p.last_name}</TableCell>
                        <TableCell className="text-sm">{p.email}</TableCell>
                        <TableCell><Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Yes" : "No"}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {result.rolesWithoutProfile.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Badge variant="destructive">{result.rolesWithoutProfile.length}</Badge>
                  Roles Without Profile
                </h4>
                <p className="text-xs text-muted-foreground">user_roles entries with no matching profile record.</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User ID</TableHead>
                      <TableHead>Role</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rolesWithoutProfile.map((r: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-mono">{r.user_id}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{r.role}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {result.inactiveWithRoles.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Badge variant="secondary">{result.inactiveWithRoles.length}</Badge>
                  Deleted Profiles With Active Roles
                </h4>
                <p className="text-xs text-muted-foreground">Profiles marked as deleted that still have role assignments.</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.inactiveWithRoles.map((p: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{p.first_name} {p.last_name}</TableCell>
                        <TableCell className="text-sm">{p.email}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{p.role}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Active Appointments with Inactive Entities */}
            {(result.activeApptsInactiveInterpreter.length > 0 ||
              result.activeApptsInactiveCustomer.length > 0 ||
              result.activeApptsInactiveLocation.length > 0) && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Badge variant="destructive">
                    {result.activeApptsInactiveInterpreter.length +
                      result.activeApptsInactiveCustomer.length +
                      result.activeApptsInactiveLocation.length}
                  </Badge>
                  Active Appointments with Inactive Entities
                </h4>
                <p className="text-xs text-muted-foreground">
                  These active appointments reference interpreters, customers, or locations that are currently inactive.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Appointment</TableHead>
                      <TableHead>Issue</TableHead>
                      <TableHead>Entity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.activeApptsInactiveInterpreter.map((a: any) => (
                      <TableRow key={`int-${a.id}`}>
                        <TableCell className="text-sm">{a.title || a.id?.slice(0, 8)}</TableCell>
                        <TableCell className="text-xs">Inactive interpreter</TableCell>
                        <TableCell className="text-sm">{a.interpreter?.first_name} {a.interpreter?.last_name}</TableCell>
                      </TableRow>
                    ))}
                    {result.activeApptsInactiveCustomer.map((a: any) => (
                      <TableRow key={`cust-${a.id}`}>
                        <TableCell className="text-sm">{a.title || a.id?.slice(0, 8)}</TableCell>
                        <TableCell className="text-xs">Inactive customer</TableCell>
                        <TableCell className="text-sm">{a.customers?.name}</TableCell>
                      </TableRow>
                    ))}
                    {result.activeApptsInactiveLocation.map((a: any) => (
                      <TableRow key={`loc-${a.id}`}>
                        <TableCell className="text-sm">{a.title || a.id?.slice(0, 8)}</TableCell>
                        <TableCell className="text-xs">Inactive location</TableCell>
                        <TableCell className="text-sm">{a.locations?.name}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
