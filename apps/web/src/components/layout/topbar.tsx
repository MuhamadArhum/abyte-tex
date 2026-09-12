"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { LogOut, Menu } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
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
    </header>
  );
}
