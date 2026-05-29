import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, Users } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export function JoinRequestsPanel() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["join-requests", profile?.agency_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("join_requests" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!profile?.agency_id,
  });

  const approve = useMutation({
    mutationFn: async (request: any) => {
      const { data, error } = await supabase.functions.invoke("manage-join-request", {
        body: {
          mode: "approve",
          request_id: request.id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast.success("Join request approved");
      qc.invalidateQueries({ queryKey: ["join-requests"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reject = useMutation({
    mutationFn: async (requestId: string) => {
      const { data, error } = await supabase.functions.invoke("manage-join-request", {
        body: {
          mode: "reject",
          request_id: requestId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast.success("Join request rejected");
      qc.invalidateQueries({ queryKey: ["join-requests"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const pendingRequests = requests.filter((r: any) => r.status === "pending");

  if (requests.length === 0 && !isLoading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Join Requests
          {pendingRequests.length > 0 && (
            <Badge variant="secondary" className="ml-2">{pendingRequests.length} pending</Badge>
          )}
        </CardTitle>
        <CardDescription>Review and approve requests from users who want to join your agency</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((req: any) => (
              <TableRow key={req.id}>
                <TableCell className="font-medium">
                  {req.first_name || req.last_name
                    ? `${req.first_name || ""} ${req.last_name || ""}`.trim()
                    : "—"}
                </TableCell>
                <TableCell>{req.email}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize text-xs">{req.requested_role}</Badge>
                </TableCell>
                <TableCell>
                  {req.status === "pending" && (
                    <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>
                  )}
                  {req.status === "approved" && (
                    <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />Approved</Badge>
                  )}
                  {req.status === "rejected" && (
                    <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                </TableCell>
                <TableCell className="text-right">
                  {req.status === "pending" && (
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        onClick={() => approve.mutate(req)}
                        disabled={approve.isPending}
                      >
                        <CheckCircle2 className="mr-1 h-3 w-3" />Approve
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => reject.mutate(req.id)}
                        disabled={reject.isPending}
                      >
                        <XCircle className="mr-1 h-3 w-3" />Reject
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
