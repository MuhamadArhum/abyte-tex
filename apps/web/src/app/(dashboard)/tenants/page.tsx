"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useCreateTenant, useTenants, useUpdateTenantStatus } from "@/features/tenants/hooks";
import type { CreateTenantInput, PlatformTenant, TenantStatus } from "@/features/tenants/types";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PermissionGate } from "@/components/shared/permission-gate";
import { Loader2, MoreHorizontal, Plus, Search } from "lucide-react";

const STATUS_OPTIONS: TenantStatus[] = ["TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED"];

export default function TenantsPage() {
  return (
    <PermissionGate platformOnly>
      <TenantsPageContent />
    </PermissionGate>
  );
}

function TenantsPageContent() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const { data, isLoading } = useTenants(page, debouncedSearch);
  const createMutation = useCreateTenant();
  const statusMutation = useUpdateTenantStatus();

  const [sheetOpen, setSheetOpen] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateTenantInput>();

  function onSubmit(values: CreateTenantInput) {
    createMutation.mutate(values, {
      onSuccess: () => {
        setSheetOpen(false);
        reset();
      },
    });
  }

  const columns: Column<PlatformTenant>[] = [
    { header: "Company", cell: (t) => <span className="font-medium">{t.name}</span> },
    { header: "Slug", cell: (t) => <span className="font-mono text-xs text-muted-foreground">{t.slug}</span> },
    { header: "Currency", cell: (t) => t.currency },
    { header: "Status", cell: (t) => <StatusBadge status={t.status} /> },
    { header: "Created", cell: (t) => new Date(t.createdAt).toLocaleDateString() },
    {
      header: "",
      className: "w-10",
      cell: (t) => (
        <DropdownMenu>
          <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-8 w-8")}>
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {STATUS_OPTIONS.filter((s) => s !== t.status).map((s) => (
              <DropdownMenuItem key={s} onClick={() => statusMutation.mutate({ id: t.id, status: s })}>
                Set {s.charAt(0) + s.slice(1).toLowerCase()}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Tenants"
        description="Provision and manage AbyteTex tenant businesses."
        actions={
          <Button onClick={() => setSheetOpen(true)}>
            <Plus className="h-4 w-4" /> New Tenant
          </Button>
        }
      />

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by company name or slug…"
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} rowKey={(t) => t.id} emptyMessage="No tenants yet." />
      <PaginationBar meta={data?.meta} onPageChange={setPage} />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col gap-0 p-4 sm:max-w-md">
          <SheetHeader className="px-1">
            <SheetTitle>Provision New Tenant</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-1 pb-4">
              <div className="space-y-1.5">
                <Label htmlFor="companyName">Company name *</Label>
                <Input id="companyName" {...register("companyName", { required: true })} />
                {errors.companyName && <p className="text-xs text-destructive">Required</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slug">Slug *</Label>
                <Input id="slug" placeholder="abc-textile" {...register("slug", { required: true, pattern: /^[a-z0-9-]+$/ })} />
                {errors.slug && <p className="text-xs text-destructive">Lowercase letters, numbers, and hyphens only</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ownerFirstName">Owner first name *</Label>
                  <Input id="ownerFirstName" {...register("ownerFirstName", { required: true })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ownerLastName">Owner last name *</Label>
                  <Input id="ownerLastName" {...register("ownerLastName", { required: true })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ownerEmail">Owner email *</Label>
                <Input id="ownerEmail" type="email" {...register("ownerEmail", { required: true })} />
                {errors.ownerEmail && <p className="text-xs text-destructive">Required</p>}
              </div>
              <p className="text-xs text-muted-foreground">
                The owner will receive an email with a link to set their password and sign in as Company Owner.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create tenant
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
