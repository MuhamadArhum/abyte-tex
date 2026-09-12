"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { NAV_SECTIONS } from "./nav-config";

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const can = useAuthStore((s) => s.can);
  const isPlatformAdmin = useAuthStore((s) => s.session?.isPlatformAdmin ?? false);

  return (
    <nav className={cn("flex h-full w-64 flex-col gap-1 overflow-y-auto border-r bg-sidebar px-3 py-4", className)}>
      <div className="mb-4 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
          AT
        </div>
        <span className="text-sm font-semibold">AbyteTex</span>
      </div>

      {NAV_SECTIONS.map((section) => {
        const visibleItems = section.items.filter((item) => {
          if (item.platformOnly) return isPlatformAdmin;
          if (isPlatformAdmin) return false; // platform admins don't see tenant nav items
          if (!item.requires) return true;
          return can(item.requires.resource, item.requires.action);
        });
        if (visibleItems.length === 0) return null;

        return (
          <div key={section.label || "root"} className="mb-2">
            {section.label && (
              <p className="px-2 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {section.label}
              </p>
            )}
            {visibleItems.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
