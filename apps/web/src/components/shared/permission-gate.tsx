"use client";

import { useAuthStore } from "@/store/auth-store";
import { ShieldAlert } from "lucide-react";
import type { Action, Resource } from "@abytetex/types";

/**
 * Client-side convenience gate only — the API enforces the real boundary
 * (PermissionsGuard / PlatformAdminGuard) regardless of what this renders.
 * This just avoids showing a broken/empty page when someone navigates
 * directly to a URL their role can't use.
 */
export function PermissionGate({
  resource,
  action,
  platformOnly,
  children,
}: {
  resource?: Resource;
  action?: Action;
  platformOnly?: boolean;
  children: React.ReactNode;
}) {
  const isPlatformAdmin = useAuthStore((s) => s.session?.isPlatformAdmin ?? false);
  const can = useAuthStore((s) => s.can);

  const allowed = platformOnly ? isPlatformAdmin : resource && action ? can(resource, action) : true;

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm">You don&apos;t have access to this page.</p>
      </div>
    );
  }

  return <>{children}</>;
}
