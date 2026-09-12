"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAuthStore } from "@/store/auth-store";
import { Action, Resource } from "@abytetex/types";
import { useRoles, useSetRolePermissions } from "@/features/roles/hooks";
import { PermissionMatrix } from "@/features/roles/permission-matrix";
import type { Role } from "@/features/roles/types";
import { PermissionGate } from "@/components/shared/permission-gate";

export default function RolesPage() {
  return (
    <PermissionGate resource={Resource.ROLE} action={Action.VIEW}>
      <RolesPageContent />
    </PermissionGate>
  );
}

function RolesPageContent() {
  const can = useAuthStore((s) => s.can);
  const { data, isLoading } = useRoles();
  const [selected, setSelected] = useState<Role | null>(null);
  const updateMutation = useSetRolePermissions(selected?.id ?? "");

  const canEdit = can(Resource.ROLE, Action.UPDATE);

  const columns: Column<Role>[] = [
    { header: "Role", cell: (r) => <span className="font-medium">{r.name}</span> },
    { header: "Code", cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.code}</span> },
    { header: "Users", cell: (r) => r._count?.users ?? 0 },
    { header: "Permissions granted", cell: (r) => <Badge variant="secondary">{r.permissions.length}</Badge> },
  ];

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        description="Fine-tune what each role can do (SRS §4.1–§4.2). The Company Owner role always has full access and can't be changed."
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(r) => r.id}
        onRowClick={setSelected}
      />

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="flex w-full flex-col gap-0 p-4 sm:max-w-3xl">
          <SheetHeader className="px-1">
            <SheetTitle>{selected?.name}</SheetTitle>
            <SheetDescription>
              {selected?.code === "COMPANY_OWNER"
                ? "This role always has full access and cannot be modified."
                : "Check or uncheck cells to grant or revoke access. Changes apply immediately to every user with this role."}
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <PermissionMatrix
              key={selected.id}
              role={selected}
              readOnly={!canEdit || selected.code === "COMPANY_OWNER"}
              isSaving={updateMutation.isPending}
              onSave={(permissions) => updateMutation.mutate(permissions)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
