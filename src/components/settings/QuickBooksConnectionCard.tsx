import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Link2, Unlink, CheckCircle2, XCircle, AlertTriangle, Loader2, Cloud } from "lucide-react";
import { useQboConnection } from "@/hooks/useQboConnection";
import { useNavigate } from "react-router-dom";

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
    connected: { variant: "default", icon: CheckCircle2 },
    disconnected: { variant: "secondary", icon: Unlink },
    expired: { variant: "destructive", icon: AlertTriangle },
    error: { variant: "destructive", icon: XCircle },
  };
  const c = config[status] || config.disconnected;
  return (
    <Badge variant={c.variant} className="gap-1">
      <c.icon className="h-3 w-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

export function QuickBooksConnectionCard() {
  const { connection, isLoading, disconnect, initiateOAuth } = useQboConnection();
  const navigate = useNavigate();

  const status = connection?.connection_status || "disconnected";
  const isConnected = status === "connected";

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>QuickBooks Online</CardTitle>
              <CardDescription>
                {isConnected
                  ? `Connected to ${connection?.company_name || "QuickBooks"}`
                  : "Not connected"}
              </CardDescription>
            </div>
          </div>
          <StatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isConnected && (
          <>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Company:</span>
                <p className="font-medium">{connection?.company_name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Last Synced:</span>
                <p className="font-medium">
                  {connection?.last_sync_at
                    ? new Date(connection.last_sync_at).toLocaleString()
                    : "Never"}
                </p>
              </div>
            </div>
            <Separator />
          </>
        )}

        <div className="flex gap-2 flex-wrap">
          {!isConnected && (
            <Button
              onClick={() => initiateOAuth.mutate()}
              disabled={initiateOAuth.isPending}
            >
              {initiateOAuth.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4 mr-2" />
              )}
              Connect QuickBooks
            </Button>
          )}

          {isConnected && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={disconnect.isPending}>
                  {disconnect.isPending ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Unlink className="h-3 w-3 mr-1" />
                  )}
                  Disconnect QuickBooks
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect QuickBooks?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will clear stored tokens and stop all automatic syncing.
                    Previously synced data in QuickBooks will not be affected.
                    This action will be logged in the audit trail.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => disconnect.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Disconnect
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/billing-report")}
          >
            Manage Integration Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}