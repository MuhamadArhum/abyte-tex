"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuthStore } from "@/store/auth-store";
import { Action, Resource } from "@abytetex/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useInviteUser, useUpdateUser, useUsers } from "@/features/users/hooks";
import { UserForm, type UserFormValues } from "@/features/users/user-form";
import type { UserListItem } from "@/features/users/types";
import { PermissionGate } from "@/components/shared/permission-gate";
import { Plus, Search } from "lucide-react";

export default function UsersPage() {
  return (
    <PermissionGate resource={Resource.USER} action={Action.VIEW}>
      <UsersPageContent />
    </PermissionGate>
  );
}

function UsersPageContent() {
  const can = useAuthStore((s) => s.can);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const { data, isLoading } = useUsers(page, debouncedSearch);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<UserListItem | null>(null);

  const inviteMutation = useInviteUser();
  const updateMutation = useUpdateUser(editing?.id ?? "");

  function handleSubmit(values: UserFormValues) {
    if (editing) {
      updateMutation.mutate(values, { onSuccess: () => setSheetOpen(false) });
    } else {
      inviteMutation.mutate(
        { email: values.email!, firstName: values.firstName, lastName: values.lastName, phone: values.phone, roleIds: values.roleIds, factoryIds: values.factoryIds },
        { onSuccess: () => setSheetOpen(false) },
      );
    }
  }

  const columns: Column<UserListItem>[] = [
    {
      header: "Name",
      cell: (u) => (
        <div>
          <p className="font-medium">
            {u.firstName} {u.lastName}
          </p>
          <p className="text-xs text-muted-foreground">{u.email}</p>
        </div>
      ),
    },
    {
      header: "Roles",
      cell: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.roles.map((r) => (
            <Badge key={r.role.id} variant="secondary">
              {r.role.name}
            </Badge>
          ))}
        </div>
      ),
    },
    { header: "Status", cell: (u) => <StatusBadge status={u.status} /> },
    { header: "Last login", cell: (u) => (u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never") },
  ];

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage who has access to your workspace and what they can do."
        actions={
          can(Resource.USER, Action.CREATE) ? (
            <Button
              onClick={() => {
                setEditing(null);
                setSheetOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Invite User
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email…"
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(u) => u.id}
        onRowClick={
          can(Resource.USER, Action.UPDATE)
            ? (u) => {
                setEditing(u);
                setSheetOpen(true);
              }
            : undefined
        }
        emptyMessage="No users yet."
      />
      <PaginationBar meta={data?.meta} onPageChange={setPage} />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-md">
          <SheetHeader className="px-1">
            <SheetTitle>{editing ? "Edit User" : "Invite User"}</SheetTitle>
          </SheetHeader>
          <UserForm
            key={editing?.id ?? "new"}
            isEdit={!!editing}
            defaultValues={
              editing
                ? {
                    firstName: editing.firstName,
                    lastName: editing.lastName,
                    phone: editing.phone ?? undefined,
                    status: editing.status,
                    roleIds: editing.roles.map((r) => r.role.id),
                    factoryIds: editing.factoryAccess.map((f) => f.factory.id),
                  }
                : undefined
            }
            onSubmit={handleSubmit}
            isSubmitting={inviteMutation.isPending || updateMutation.isPending}
            submitLabel={editing ? "Save changes" : "Send invitation"}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
