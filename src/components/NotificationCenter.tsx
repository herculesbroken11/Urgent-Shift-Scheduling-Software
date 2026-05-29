import { Bell, Check, CheckCheck, Info, AlertTriangle, CheckCircle2, XCircle, MessageSquare } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useNotifications } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useState, forwardRef } from "react";
import { useAuth } from "@/contexts/AuthContext";

const typeIcons: Record<string, React.ElementType> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  new_message: MessageSquare,
};

const typeColors: Record<string, string> = {
  info: "text-blue-500",
  success: "text-green-500",
  warning: "text-amber-500",
  error: "text-destructive",
  new_message: "text-primary",
};

export const NotificationCenter = forwardRef<HTMLElement>(function NotificationCenter(_props, _ref) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const resolveRoute = (n: any): string | null => {
    const id = n.related_entity_id;
    const type = n.related_entity_type;
    if (!type) return null;
    if (type === "conversation" && id) return `/messages?thread=${id}`;
    if (type === "invoice" && id) return `/invoices?invoice=${id}`;
    if (type === "appointment" && id) {
      // Route to the role-appropriate appointment view
      if (hasRole("interpreter") && !hasRole("agency_admin") && !hasRole("scheduler")) {
        return `/my-schedule?appointment=${id}`;
      }
      if (hasRole("requester") && !hasRole("agency_admin") && !hasRole("scheduler")) {
        return `/my-requests?appointment=${id}`;
      }
      return `/appointments?appointment=${id}`;
    }
    return null;
  };

  const handleNotificationClick = (n: any) => {
    if (!n.is_read) markAsRead.mutate(n.id);
    const route = resolveRoute(n);
    if (route) {
      setOpen(false);
      navigate(route);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center" variant="destructive">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => markAllAsRead.mutate()}>
              <CheckCheck className="h-3 w-3 mr-1" /> Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-80">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No notifications yet</div>
          ) : (
            notifications.map((n) => {
              const Icon = typeIcons[n.type] || Info;
              return (
                <div
                  key={n.id}
                  className={cn(
                    "flex gap-3 px-4 py-3 border-b last:border-0 cursor-pointer hover:bg-muted/50 transition-colors",
                    !n.is_read && "bg-accent/30"
                  )}
                  onClick={() => handleNotificationClick(n)}
                >
                  <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", typeColors[n.type])} />
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm leading-tight", !n.is_read && "font-medium")}>{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {!n.is_read && <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                </div>
              );
            })
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
});
