"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Bell, LogOut, Menu } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "@/features/notifications/hooks";

function initials(firstName?: string, lastName?: string) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const clear = useAuthStore((s) => s.clear);

  const logoutMutation = useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSettled: () => {
      clear();
      router.push("/login");
    },
  });

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick}>
        <Menu className="h-5 w-5" />
      </Button>
      <div />
      <div className="flex items-center gap-1">
        <NotificationsBell />
        <DropdownMenu>
        <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost" }), "gap-2 px-2")}>
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs">{initials(session?.firstName, session?.lastName)}</AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium sm:inline">
            {session?.firstName} {session?.lastName}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <p className="text-sm font-medium">
              {session?.firstName} {session?.lastName}
            </p>
            <p className="text-xs font-normal text-muted-foreground">{session?.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => logoutMutation.mutate()}>
            <LogOut className="h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function NotificationsBell() {
  const { data } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const notifications = data?.data ?? [];
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}>
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </Badge>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0 text-sm font-medium">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.preventDefault(); markAllRead.mutate(); }}
            >
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
          )}
          {notifications.map((n) => (
            <DropdownMenuItem
              key={n.id}
              className={cn("flex flex-col items-start gap-0.5 whitespace-normal", !n.isRead && "bg-accent/50")}
              onClick={() => !n.isRead && markRead.mutate(n.id)}
            >
              <p className="text-sm font-medium">{n.title}</p>
              <p className="text-xs text-muted-foreground">{n.message}</p>
              <p className="text-[10px] text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
