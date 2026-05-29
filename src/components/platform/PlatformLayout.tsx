import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { PlatformSidebar } from "./PlatformSidebar";
import { Shield, Headphones, X } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSupportSession } from "@/hooks/useSupportSession";
import { usePlatformAction } from "@/hooks/usePlatformData";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

export function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { activeSession } = useSupportSession();
  const action = usePlatformAction();

  const endSession = () => {
    if (!activeSession) return;
    action.mutate({ action: 'support.end', session_id: activeSession.id });
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <PlatformSidebar />
        <div className="flex-1 flex flex-col">
          {/* Support Mode Banner */}
          {activeSession && (
            <div className="flex items-center gap-3 px-4 py-2 bg-amber-500/15 border-b border-amber-500/30">
              <Headphones className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Support Mode Active
              </span>
              <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300 text-xs">
                {activeSession.agency_name}
              </Badge>
              <span className="text-xs text-amber-600/80 dark:text-amber-400/60 hidden sm:inline">
                {formatDistanceToNow(new Date(activeSession.started_at), { addSuffix: true })}
                {" · "}{activeSession.reason}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 text-amber-700 hover:text-amber-900 hover:bg-amber-500/20"
                onClick={endSession}
                disabled={action.isPending}
              >
                <X className="h-3 w-3 mr-1" /> End Session
              </Button>
            </div>
          )}

          <header className="h-14 flex items-center border-b border-border bg-background px-4 gap-4">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-primary">Platform Console</span>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 p-6 bg-muted/30 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
